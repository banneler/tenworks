import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    setupModalListeners,
    showModal,
    hideModal,
    setupUserMenuAndAuth,
    loadSVGs,
    setupGlobalSearch,
    runWhenNavReady,
    hideGlobalLoader,
    showToast
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        isManager: false,
        task_assignments: [],
        project_tasks: [],
        projects: [],
        shop_talent: [],
        talent_availability: []
    };

    const prodTasksList = document.getElementById("production-tasks-list");
    const ptoList = document.getElementById("pto-list");
    const overdueList = document.getElementById("overdue-projects-list");
    const staleList = document.getElementById("stale-projects-list");
    const refreshBtn = document.getElementById("shop-refresh-btn");

    async function loadAllData() {
        if (!state.currentUser) {
            hideGlobalLoader();
            return;
        }

        if (prodTasksList) prodTasksList.innerHTML = '<p class="my-tasks-empty text-sm" style="color: var(--text-medium); padding: 1rem;">Loading tasks...</p>';
        
        try {
            const [assignmentsRes, tasksRes, projectsRes, talentRes, availRes] = await Promise.all([
                supabase.from('task_assignments').select('*'),
                supabase.from('project_tasks').select('*'),
                supabase.from('projects').select('*'),
                supabase.from('shop_talent').select('*').eq('active', true),
                supabase.from('talent_availability').select('*')
            ]);

            state.task_assignments = assignmentsRes.data || [];
            state.project_tasks = tasksRes.data || [];
            state.projects = projectsRes.data || [];
            state.shop_talent = talentRes.data || [];
            state.talent_availability = availRes.data || [];

        } catch (error) {
            console.error("Error loading shop data:", error);
            showToast("Failed to load shop data", "error");
        } finally {
            hideGlobalLoader();
        }
        
        renderDashboard();
    }

    function renderDashboard() {
        renderProductionTasks();
        renderPTO();
        renderOverdueProjects();
        renderStaleProjects();
        renderMetrics();
    }

    function getAssignmentBookedHours(assignment) {
        const explicit = Number(assignment?.hours);
        if (Number.isFinite(explicit) && explicit > 0) return explicit;

        const task = state.project_tasks.find(t => String(t.id) === String(assignment?.task_id));
        const est = Number(task?.estimated_hours);
        const normalized = Number.isFinite(est) && est > 0 ? est : 8;
        if (task) return Math.min(normalized, 8);
        return 0;
    }

    function renderMetrics() {
        const activeProjects = state.projects.filter(p => p.status !== 'Completed');
        const overdueProjects = activeProjects.filter(p => p.end_date && dayjs(p.end_date).isBefore(dayjs(), 'day'));
        
        const oneWeekAgo = dayjs().subtract(7, 'day');
        const staleProjects = activeProjects.filter(p => !p.client_summary_updated_at || dayjs(p.client_summary_updated_at).isBefore(oneWeekAgo));

        document.getElementById('metric-active-projects').textContent = activeProjects.length;
        document.getElementById('metric-overdue').textContent = overdueProjects.length;
        document.getElementById('metric-stale').textContent = staleProjects.length;

        // Capacity
        const DEFAULT_HOURS_PER_WEEK = 40;
        const weekStart = dayjs().startOf('week');
        const weekEnd = weekStart.add(6, 'day');
        const weekStartStr = weekStart.format('YYYY-MM-DD');
        const weekEndStr = weekEnd.format('YYYY-MM-DD');

        const totalCapacity = state.shop_talent.reduce((sum, t) => sum + (Number(t.hours_per_week) || DEFAULT_HOURS_PER_WEEK), 0);
        const weekAssignments = state.task_assignments.filter(a => {
            const assigned = dayjs(String(a?.assigned_date || '').slice(0, 10));
            return assigned.isValid() && !assigned.isBefore(weekStart, 'day') && !assigned.isAfter(weekEnd, 'day');
        });
        const totalLoad = weekAssignments.reduce((sum, a) => sum + getAssignmentBookedHours(a), 0);

        const pct = totalCapacity > 0 ? Math.round((totalLoad / totalCapacity) * 100) : 0;
        const barPct = totalCapacity > 0 ? Math.min((totalLoad / totalCapacity) * 100, 100) : 0;

        document.getElementById('metric-capacity').textContent = `${pct}%`;
        const capBar = document.getElementById('metric-capacity-bar');
        if (capBar) {
            capBar.style.width = `${barPct}%`;
            capBar.style.backgroundColor = pct > 100 ? 'var(--danger-red)' : (pct > 85 ? 'var(--warning-yellow)' : 'var(--primary-blue)');
        }
    }

    function renderProductionTasks() {
        if (!prodTasksList) return;
        prodTasksList.innerHTML = "";
        
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const todayStr = startOfToday.toISOString().split('T')[0];
        
        // Try to match current user to shop_talent by name
        const currentUserFullName = state.currentUser?.user_metadata?.full_name || '';
        const matchingTalent = state.shop_talent.find(t => t.name.toLowerCase() === currentUserFullName.toLowerCase());
        
        let todayAssignments = [];
        if (matchingTalent) {
            todayAssignments = state.task_assignments.filter(a => a.talent_id === matchingTalent.id && a.assigned_date === todayStr);
        } else {
            // Fallback: show all for today if user is manager, or none if not matched
            if (state.isManager) {
                todayAssignments = state.task_assignments.filter(a => a.assigned_date === todayStr);
            }
        }

        if (todayAssignments.length > 0) {
            todayAssignments.forEach(assignment => {
                const task = state.project_tasks.find(t => t.id === assignment.task_id);
                if (!task) return;
                const project = state.projects.find(p => p.id === task.project_id);
                const projectName = project ? project.name : 'Unknown Project';
                const talent = state.shop_talent.find(t => t.id === assignment.talent_id);
                const talentName = talent ? talent.name : '';
                
                const item = document.createElement("div");
                item.className = `task-item`;
                item.innerHTML = `
                    <div class="task-due">${assignment.hours}h</div>
                    <div class="task-content">
                        <div class="task-linked"><a href="projects.html?id=${task.project_id}" class="contact-name-link">${projectName}</a> ${state.isManager ? `(${talentName})` : ''}</div>
                        <div class="task-description">${task.name} <span style="color:var(--text-dim); font-size:0.8rem;">- ${task.status || 'Pending'}</span></div>
                    </div>
                    <div class="task-actions">
                        <a href="schedule.html?project_id=${task.project_id}" class="btn-secondary btn-icon-only" title="View Schedule"><i class="fa-solid fa-calendar"></i></a>
                    </div>
                `;
                prodTasksList.appendChild(item);
            });
        } else {
            prodTasksList.innerHTML = '<p class="my-tasks-empty text-sm" style="color: var(--text-medium); padding: 1rem;">No shop tasks assigned for today.</p>';
        }
    }

    function renderPTO() {
        if (!ptoList) return;
        ptoList.innerHTML = "";

        const todayStr = dayjs().format('YYYY-MM-DD');
        const upcomingPTO = state.talent_availability
            .filter(a => a.status === 'PTO' && a.date >= todayStr)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (upcomingPTO.length > 0) {
            upcomingPTO.forEach(pto => {
                const talent = state.shop_talent.find(t => t.id === pto.talent_id);
                const talentName = talent ? talent.name : 'Unknown';
                const isToday = pto.date === todayStr;
                
                const item = document.createElement("div");
                item.className = `task-item ${isToday ? 'past-due' : ''}`;
                item.innerHTML = `
                    <div class="task-due" style="${isToday ? 'color: var(--danger-red);' : ''}">${dayjs(pto.date).format('MMM D')}</div>
                    <div class="task-content">
                        <div class="task-linked">${talentName}</div>
                        <div class="task-description">Time Off (PTO)</div>
                    </div>
                    <div class="task-actions">
                        <a href="talent.html" class="btn-secondary btn-icon-only" title="View Talent Matrix"><i class="fa-solid fa-users"></i></a>
                    </div>
                `;
                ptoList.appendChild(item);
            });
        } else {
            ptoList.innerHTML = '<p class="my-tasks-empty text-sm" style="color: var(--text-medium); padding: 1rem;">No upcoming time off scheduled.</p>';
        }
    }

    function renderOverdueProjects() {
        if (!overdueList) return;
        overdueList.innerHTML = "";

        const overdueProjects = state.projects
            .filter(p => p.status !== 'Completed' && p.end_date && dayjs(p.end_date).isBefore(dayjs(), 'day'))
            .sort((a, b) => new Date(a.end_date) - new Date(b.end_date));

        if (overdueProjects.length > 0) {
            overdueProjects.forEach(project => {
                const item = document.createElement("div");
                item.className = `task-item past-due`;
                item.innerHTML = `
                    <div class="task-due">${dayjs(project.end_date).format('MMM D')}</div>
                    <div class="task-content">
                        <div class="task-linked"><a href="projects.html?id=${project.id}" class="contact-name-link">${project.name}</a></div>
                        <div class="task-description">Status: ${project.status || 'Active'}</div>
                    </div>
                    <div class="task-actions">
                        <a href="schedule.html?project_id=${project.id}" class="btn-secondary btn-icon-only" title="View Schedule"><i class="fa-solid fa-calendar"></i></a>
                    </div>
                `;
                overdueList.appendChild(item);
            });
        } else {
            overdueList.innerHTML = '<p class="my-tasks-empty text-sm" style="color: var(--text-medium); padding: 1rem;">No overdue projects.</p>';
        }
    }

    function renderStaleProjects() {
        if (!staleList) return;
        staleList.innerHTML = "";

        const oneWeekAgo = dayjs().subtract(7, 'day');
        const staleProjects = state.projects
            .filter(p => p.status !== 'Completed' && (!p.client_summary_updated_at || dayjs(p.client_summary_updated_at).isBefore(oneWeekAgo)))
            .sort((a, b) => {
                const dateA = a.client_summary_updated_at ? new Date(a.client_summary_updated_at) : new Date(0);
                const dateB = b.client_summary_updated_at ? new Date(b.client_summary_updated_at) : new Date(0);
                return dateA - dateB;
            });

        if (staleProjects.length > 0) {
            staleProjects.forEach(project => {
                const lastUpdated = project.client_summary_updated_at 
                    ? dayjs(project.client_summary_updated_at).format('MMM D') 
                    : 'Never';
                
                const item = document.createElement("div");
                item.className = `task-item`;
                item.innerHTML = `
                    <div class="task-due" style="color: var(--warning-yellow);">${lastUpdated}</div>
                    <div class="task-content">
                        <div class="task-linked"><a href="projects.html?id=${project.id}" class="contact-name-link">${project.name}</a></div>
                        <div class="task-description">Needs client summary update</div>
                    </div>
                    <div class="task-actions">
                        <a href="projects.html?id=${project.id}" class="btn-secondary btn-icon-only" title="Update Project"><i class="fa-solid fa-pen"></i></a>
                    </div>
                `;
                staleList.appendChild(item);
            });
        } else {
            staleList.innerHTML = '<p class="my-tasks-empty text-sm" style="color: var(--text-medium); padding: 1rem;">All active projects have recent updates.</p>';
        }
    }

    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
            await loadAllData();
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        });
    }

    // --- Initialization ---
    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = 'index.html';
            return;
        }
        state.currentUser = session.user;
        
        try {
            // Temporary fallback if user_profiles doesn't exist
            state.isManager = true; 
        } catch (e) {
            console.warn("Could not fetch user profile role:", e);
        }

        runWhenNavReady(() => {
            setupUserMenuAndAuth(supabase);
            loadSVGs();
            setupGlobalSearch(supabase, state.currentUser);
            setupModalListeners();
        });

        await loadAllData();
    }

    init();
});