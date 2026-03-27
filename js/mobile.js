import { SUPABASE_URL, SUPABASE_ANON_KEY, hideGlobalLoader } from './shared_constants.js';

console.log("Mobile JS starting...");

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

let state = {
    user: null,
    profile: null,
    talentRecord: null,
    isLeader: false,
    tasks: [],
    assignments: [],
    projects: [],
    team: [],
    availability: []
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM loaded, initializing mobile app...");
    // Register SW for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed:', err));
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    console.log("Session fetched:", sessionData);
    if (sessionError) {
        hideGlobalLoader();
        console.error("Session Error:", sessionError);
        alert("Session error: " + sessionError.message);
        return;
    }
    
    const session = sessionData?.session;
    if (!session || !session.user) {
        console.log("No valid session, redirecting to index.html");
        window.location.href = 'index.html';
        return;
    }
    state.user = session.user;
    console.log("User authenticated:", state.user.email);

    document.getElementById('mobile-user-menu').addEventListener('click', async () => {
        if(confirm('Log out?')) {
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        }
    });

    // Bottom Nav listener
    document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.dataset.target;
            document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            document.getElementById('leader-tab-dash').classList.add('hidden');
            document.getElementById('leader-tab-tasks').classList.add('hidden');
            document.getElementById('leader-tab-team').classList.add('hidden');
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

    await loadData();
});

async function loadData() {
    console.log("Starting loadData...");
    // We removed the hardcoded loader from HTML, so we don't need to manipulate it here.
    document.getElementById('view-laborer').classList.add('hidden');
    document.getElementById('view-leader').classList.add('hidden');

    try {
        // 1. Determine Role
        // In TenWorks, we check if the user is a manager by looking at the auth metadata or falling back to a default.
        // If there is no user_profiles table, we can assume they are a manager for now, or check a different table.
        // For now, let's assume if they are logged in, they might be a manager if their email matches an admin list, 
        // or we just default to true for testing the leader view.
        state.isLeader = true; // Temporary fallback if user_profiles doesn't exist

        const { data: talent, error: talentErr } = await supabase.from('shop_talent').select('*').eq('active', true);
        if (talentErr) {
            console.error("Talent Error:", talentErr);
            throw talentErr;
        }
        state.team = talent || [];
        
        const fullName = state.user?.user_metadata?.full_name || '';
        state.talentRecord = state.team.find(t => t.name.toLowerCase() === fullName.toLowerCase());

        // 2. Fetch Tasks & Assignments for Today
        const todayStr = dayjs().format('YYYY-MM-DD');
        console.log("Fetching tasks for today:", todayStr);
        
        const [assignRes, tasksRes, projRes, availRes] = await Promise.all([
            supabase.from('task_assignments').select('*'), // Fetch all to calculate weekly load
            supabase.from('project_tasks').select('*'),
            supabase.from('projects').select('*'),
            supabase.from('talent_availability').select('*')
        ]);

        if (assignRes.error) { console.error("Assign Error:", assignRes.error); throw assignRes.error; }
        if (tasksRes.error) { console.error("Tasks Error:", tasksRes.error); throw tasksRes.error; }
        if (projRes.error) { console.error("Proj Error:", projRes.error); throw projRes.error; }
        if (availRes.error) { console.error("Avail Error:", availRes.error); throw availRes.error; }

        state.assignments = assignRes.data || [];
        state.tasks = tasksRes.data || [];
        state.projects = projRes.data || [];
        state.availability = availRes.data || [];
        
        console.log(`Loaded ${state.assignments.length} assignments, ${state.tasks.length} tasks, ${state.projects.length} projects`);

    } catch (error) {
        hideGlobalLoader();
        console.error("Error loading data:", error);
        alert("Failed to load data: " + error.message);
    } finally {
        console.log("loadData complete");
        hideGlobalLoader();
    }

    if (state.isLeader) {
        console.log("Rendering Leader View");
        document.getElementById('view-leader').classList.remove('hidden');
        document.getElementById('view-leader').style.display = 'block';
        document.getElementById('mobile-bottom-nav').classList.remove('hidden');
        document.getElementById('mobile-bottom-nav').style.display = 'flex';
        renderLeaderView();
    } else {
        console.log("Rendering Laborer View");
        document.getElementById('view-laborer').classList.remove('hidden');
        document.getElementById('view-laborer').style.display = 'block';
        renderLaborerView();
    }
}

function getTaskDetails(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return null;
    const project = state.projects.find(p => p.id === task.project_id);
    return { task, project };
}

// --- LABORER VIEW ---
function renderLaborerView() {
    const list = document.getElementById('laborer-tasks-list');
    if (!state.talentRecord) {
        list.innerHTML = '<p style="color:var(--text-dim);">Your user profile is not linked to a shop floor record.</p>';
        return;
    }

    const todayStr = dayjs().format('YYYY-MM-DD');
    const myAssignments = state.assignments.filter(a => a.talent_id === state.talentRecord.id && a.assigned_date === todayStr);

    if (myAssignments.length === 0) {
        list.innerHTML = '<p style="color:var(--text-dim);">No tasks assigned for today.</p>';
        return;
    }

    list.innerHTML = myAssignments.map(a => {
        const details = getTaskDetails(a.task_id);
        if (!details) return '';
        const { task, project } = details;
        
        return `
            <div class="mobile-card">
                <div class="mobile-card-title">${task.name}</div>
                <div class="mobile-card-subtitle">${project ? project.name : 'Unknown Project'}</div>
                <div class="mobile-card-meta">
                    <span>Allocated: ${a.hours}h</span>
                    <span style="color: ${task.status === 'Completed' ? 'var(--success-green)' : 'var(--text-bright)'}">${task.status || 'Pending'}</span>
                </div>
                <div class="mobile-card-actions">
                    <button class="mobile-btn mobile-btn-secondary" onclick="window.openLogTimeModal(${task.id})">Log Time</button>
                    ${task.status === 'Pending' ? `<button class="mobile-btn mobile-btn-primary" onclick="window.updateTaskStatus(${task.id}, 'In Progress')">Start</button>` : ''}
                    ${task.status === 'In Progress' ? `<button class="mobile-btn mobile-btn-success" onclick="window.updateTaskStatus(${task.id}, 'Completed')">Complete</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// --- LEADER VIEW ---
function renderLeaderView() {
    renderLeaderDashboard();
    
    const tasksList = document.getElementById('leader-tasks-list');
    const teamList = document.getElementById('leader-team-list');

    const todayStr = dayjs().format('YYYY-MM-DD');
    const todayAssignments = state.assignments.filter(a => a.assigned_date === todayStr);

    // Render Tasks
    if (todayAssignments.length === 0) {
        tasksList.innerHTML = '<p style="color:var(--text-dim);">No tasks scheduled for today.</p>';
    } else {
        tasksList.innerHTML = todayAssignments.map(a => {
            const details = getTaskDetails(a.task_id);
            if (!details) return '';
            const { task, project } = details;
            const person = state.team.find(t => t.id === a.talent_id);
            
            return `
                <div class="mobile-card">
                    <div class="mobile-card-title">${task.name}</div>
                    <div class="mobile-card-subtitle">${project ? project.name : 'Unknown'}</div>
                    <div class="mobile-card-meta">
                        <span><i class="fas fa-user"></i> ${person ? person.name : 'Unassigned'}</span>
                        <span>${task.status || 'Pending'}</span>
                    </div>
                    <div class="mobile-card-actions">
                        <button class="mobile-btn mobile-btn-secondary" onclick="window.openReassignModal(${a.id}, ${task.id})">Reassign</button>
                        <button class="mobile-btn mobile-btn-primary" onclick="window.openLeaderUpdateModal(${task.id})">Update</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Render Team
    const todayStrTeam = dayjs().format('YYYY-MM-DD');
    const todayAssignmentsTeam = state.assignments.filter(a => a.assigned_date === todayStrTeam);

    teamList.innerHTML = state.team.map(t => {
        const personAssignments = todayAssignmentsTeam.filter(a => a.talent_id === t.id);
        
        // Ensure we parse hours correctly, treating null/undefined as 0
        const totalHours = personAssignments.reduce((sum, a) => {
            const h = parseFloat(a.hours);
            return sum + (isNaN(h) ? 0 : h);
        }, 0);
        
        let statusHtml = '<span style="color:var(--text-dim);">Idle</span>';
        if (totalHours > 0) {
            // Check if any of their tasks are "In Progress"
            const activeTask = personAssignments.find(a => {
                const task = state.tasks.find(tsk => tsk.id === a.task_id);
                return task && task.status === 'In Progress';
            });

            if (activeTask) {
                const task = state.tasks.find(tsk => tsk.id === activeTask.task_id);
                const project = state.projects.find(p => p.id === task.project_id);
                const projName = project ? project.name : 'Unknown';
                statusHtml = `<span style="color:var(--primary-blue); font-weight:600;"><i class="fas fa-cog fa-spin"></i> ${projName} - ${task.name}</span>`;
            } else {
                statusHtml = `<span style="color:var(--text-bright);">${totalHours}h Assigned</span>`;
            }
        }
        
        return `
            <div class="mobile-team-member" style="display:flex; flex-direction:column; align-items:flex-start; gap:4px;">
                <div class="mobile-team-name">${t.name}</div>
                <div class="mobile-team-status" style="font-size:0.85rem;">${statusHtml}</div>
            </div>
        `;
    }).join('');
}

function renderLeaderDashboard() {
    // 1. Metrics
    const activeProjects = state.projects.filter(p => p.status !== 'Completed');
    const overdueProjects = activeProjects.filter(p => p.end_date && dayjs(p.end_date).isBefore(dayjs(), 'day'));
    
    document.getElementById('mobile-metric-active').textContent = activeProjects.length;
    document.getElementById('mobile-metric-overdue').textContent = overdueProjects.length;

    // Capacity (This Week)
    const DEFAULT_HOURS_PER_WEEK = 40;
    const weekStart = dayjs().startOf('week').format('YYYY-MM-DD');
    const weekEnd = dayjs().startOf('week').add(6, 'day').format('YYYY-MM-DD');

    const totalCapacity = state.team.reduce((sum, t) => sum + (Number(t.hours_per_week) || DEFAULT_HOURS_PER_WEEK), 0);
    const weekAssignments = state.assignments.filter(a => a.assigned_date >= weekStart && a.assigned_date <= weekEnd);
    const totalLoad = weekAssignments.reduce((sum, a) => sum + (Number(a.hours) || 0), 0);

    const pct = totalCapacity > 0 ? Math.round((totalLoad / totalCapacity) * 100) : 0;
    const barPct = Math.min(pct, 100);

    document.getElementById('mobile-metric-load').textContent = `${pct}%`;
    const loadBar = document.getElementById('mobile-metric-load-bar');
    if (loadBar) {
        loadBar.style.width = `${barPct}%`;
        loadBar.style.backgroundColor = pct > 100 ? 'var(--danger-red)' : (pct > 85 ? 'var(--warning-yellow)' : 'var(--primary-blue)');
    }

    // 2. PTO List
    const todayStr = dayjs().format('YYYY-MM-DD');
    const upcomingPTO = state.availability
        .filter(a => a.status === 'PTO' && a.date >= todayStr)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const ptoList = document.getElementById('leader-pto-list');
    if (upcomingPTO.length === 0) {
        ptoList.innerHTML = '<p style="color:var(--text-dim); font-size:0.85rem;">No upcoming time off.</p>';
    } else {
        ptoList.innerHTML = upcomingPTO.map(pto => {
            const person = state.team.find(t => t.id === pto.talent_id);
            const isToday = pto.date === todayStr;
            return `
                <div class="mobile-card" style="padding: 10px 15px; margin-bottom: 10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:600;">${person ? person.name : 'Unknown'}</span>
                        <span style="${isToday ? 'color:var(--danger-red); font-weight:600;' : 'color:var(--text-dim);'}">${dayjs(pto.date).format('MMM D')}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 3. Overdue Projects List
    const overdueList = document.getElementById('leader-overdue-list');
    if (overdueProjects.length === 0) {
        overdueList.innerHTML = '<p style="color:var(--text-dim); font-size:0.85rem;">No overdue projects.</p>';
    } else {
        overdueList.innerHTML = overdueProjects.sort((a, b) => new Date(a.end_date) - new Date(b.end_date)).map(p => `
            <div class="mobile-card" style="padding: 10px 15px; margin-bottom: 10px; border-left: 3px solid var(--danger-red);">
                <div class="mobile-card-title" style="font-size:1rem;">${p.name}</div>
                <div class="mobile-card-meta" style="margin-bottom:0;">
                    <span>Due: ${dayjs(p.end_date).format('MMM D')}</span>
                    <span>${p.status || 'Active'}</span>
                </div>
            </div>
        `).join('');
    }
}

// --- ACTIONS ---
window.openLogTimeModal = (taskId) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const modal = document.getElementById('mobile-modal-backdrop');
    document.getElementById('mobile-modal-title').textContent = 'Log Time';
    document.getElementById('mobile-modal-body').innerHTML = `
        <p style="margin-bottom:10px; font-size:0.9rem; color:var(--text-dim);">Task: ${task.name}</p>
        <label style="display:block; margin-bottom:5px;">Actual Hours</label>
        <input type="number" id="mobile-actual-hours" class="mobile-input" step="0.25" min="0" value="${task.actual_hours || 0}">
    `;
    
    document.getElementById('mobile-modal-actions').innerHTML = `
        <button class="mobile-btn mobile-btn-secondary" id="btn-cancel-modal">Cancel</button>
        <button class="mobile-btn mobile-btn-primary" id="btn-save-modal">Save</button>
    `;

    modal.classList.remove('hidden');

    document.getElementById('btn-cancel-modal').onclick = () => modal.classList.add('hidden');
    document.getElementById('btn-save-modal').onclick = async () => {
        const hours = parseFloat(document.getElementById('mobile-actual-hours').value) || 0;
        const { error } = await supabase.from('project_tasks').update({ actual_hours: hours }).eq('id', taskId);
        if (error) {
            alert('Error saving hours: ' + error.message);
        } else {
            modal.classList.add('hidden');
            await loadData(); // refresh
        }
    };
};

window.updateTaskStatus = async (taskId, newStatus) => {
    if(confirm(`Mark this task as ${newStatus}?`)) {
        const { error } = await supabase.from('project_tasks').update({ status: newStatus }).eq('id', taskId);
        if (error) {
            alert('Error: ' + error.message);
        } else {
            await loadData();
        }
    }
};

window.openReassignModal = (assignmentId, taskId) => {
    const task = state.tasks.find(t => t.id === taskId);
    const assignment = state.assignments.find(a => a.id === assignmentId);
    if (!task || !assignment) return;

    const options = state.team.map(t => `<option value="${t.id}" ${t.id === assignment.talent_id ? 'selected' : ''}>${t.name}</option>`).join('');

    const modal = document.getElementById('mobile-modal-backdrop');
    document.getElementById('mobile-modal-title').textContent = 'Reassign Task';
    document.getElementById('mobile-modal-body').innerHTML = `
        <p style="margin-bottom:10px; font-size:0.9rem; color:var(--text-dim);">${task.name}</p>
        <label style="display:block; margin-bottom:5px;">Assign To</label>
        <select id="mobile-reassign-talent" class="mobile-input">
            ${options}
        </select>
    `;
    
    document.getElementById('mobile-modal-actions').innerHTML = `
        <button class="mobile-btn mobile-btn-secondary" id="btn-cancel-modal">Cancel</button>
        <button class="mobile-btn mobile-btn-primary" id="btn-save-modal">Save</button>
    `;

    modal.classList.remove('hidden');

    document.getElementById('btn-cancel-modal').onclick = () => modal.classList.add('hidden');
    document.getElementById('btn-save-modal').onclick = async () => {
        const newTalentId = document.getElementById('mobile-reassign-talent').value;
        const { error } = await supabase.from('task_assignments').update({ talent_id: newTalentId }).eq('id', assignmentId);
        if (error) {
            alert('Error: ' + error.message);
        } else {
            modal.classList.add('hidden');
            await loadData();
        }
    };
};

window.openLeaderUpdateModal = (taskId) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const modal = document.getElementById('mobile-modal-backdrop');
    document.getElementById('mobile-modal-title').textContent = 'Update Task';
    document.getElementById('mobile-modal-body').innerHTML = `
        <p style="margin-bottom:10px; font-size:0.9rem; color:var(--text-dim);">${task.name}</p>
        <label style="display:block; margin-bottom:5px;">Status</label>
        <select id="mobile-update-status" class="mobile-input">
            <option value="Pending" ${task.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
            <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
        </select>
        <label style="display:block; margin-bottom:5px; margin-top:10px;">Actual Hours</label>
        <input type="number" id="mobile-update-hours" class="mobile-input" step="0.25" min="0" value="${task.actual_hours || 0}">
    `;
    
    document.getElementById('mobile-modal-actions').innerHTML = `
        <button class="mobile-btn mobile-btn-secondary" id="btn-cancel-modal">Cancel</button>
        <button class="mobile-btn mobile-btn-primary" id="btn-save-modal">Save</button>
    `;

    modal.classList.remove('hidden');

    document.getElementById('btn-cancel-modal').onclick = () => modal.classList.add('hidden');
    document.getElementById('btn-save-modal').onclick = async () => {
        const status = document.getElementById('mobile-update-status').value;
        const hours = parseFloat(document.getElementById('mobile-update-hours').value) || 0;
        const { error } = await supabase.from('project_tasks').update({ status, actual_hours: hours }).eq('id', taskId);
        if (error) {
            alert('Error: ' + error.message);
        } else {
            modal.classList.add('hidden');
            await loadData();
        }
    };
};