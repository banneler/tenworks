import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    formatCurrency, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs, 
    setupGlobalSearch,
    runWhenNavReady,
    hideGlobalLoader,
    showToast
} from './shared_constants.js';
import { openSharedProjectLaunchModal } from './project_launch_shared.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;
const TIMELINE_DAY_WIDTH = 100;

document.addEventListener("DOMContentLoaded", async () => {
    runWhenNavReady(async () => {
        try {
    // ------------------------------------------------------------------------
    // 1. INITIALIZATION & AUTHENTICATION
    // ------------------------------------------------------------------------
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        hideGlobalLoader();
        window.location.href = 'index.html';
        return;
    }

    await setupUserMenuAndAuth(supabase, { currentUser: user });
    await setupGlobalSearch(supabase, user);

    // ------------------------------------------------------------------------
    // 2. CENTRAL STATE MANAGEMENT
    // ------------------------------------------------------------------------
    const STALE_AFTER_MS = 2 * 60 * 1000; // 2 min
    let state = {
        currentView: 'resource', // Options: 'resource', 'project', 'machine'
        trades: [],
        projects: [],
        tasks: [],
        machines: [], // NEW: Machine Data
        availability: [], 
        isDragging: false,
        dragTask: null,
        dragEl: null,
        dragStartX: 0,
        dragStartLeft: 0,
        hasMoved: false,
        // Filters
        showCompleted: false,
        sortBy: 'start_date',
        filterOverdue: false,
        talent: [],
        assignments: [],
        timelineStartDate: dayjs().subtract(5, 'day').startOf('day'),
        timelineDays: 60,
        timelineStepDays: 14,
        lastLoadedAt: null
    };

    function showStalenessBanner() {
        const el = document.getElementById('data-staleness-banner');
        if (el) { el.style.display = 'flex'; el.classList.remove('hidden'); }
    }
    function hideStalenessBanner() {
        const el = document.getElementById('data-staleness-banner');
        if (el) { el.style.display = 'none'; el.classList.add('hidden'); }
    }
    function checkStaleness() {
        if (state.lastLoadedAt != null && (Date.now() - state.lastLoadedAt) > STALE_AFTER_MS) showStalenessBanner();
    }

    // ------------------------------------------------------------------------
    // 3. HELPERS (BUSINESS DAYS & COLORS)
    // ------------------------------------------------------------------------
    
    function addBusinessDays(date, daysToAdd) {
        let d = dayjs(date);
        let added = 0;
        if (daysToAdd === 0) return d;
        
        while (added < daysToAdd) {
            d = d.add(1, 'day');
            if (d.day() !== 0 && d.day() !== 6) {
                added++;
            }
        }
        return d;
    }

    const TRADE_COLORS = {
        1: '#546E7A', 2: '#1E88E5', 3: '#D4AF37', 
        4: '#8D6E63', 5: '#66BB6A', 6: '#7E57C2' 
    };

    function getProjectColor(id) {
        const colors = ['#37474F', '#00695C', '#BF360C', '#4A148C', '#0D47A1', '#827717'];
        return colors[id % colors.length];
    }

    function getTradeColor(id) {
        return TRADE_COLORS[id] || 'var(--primary-gold)'; 
    }

    function packTasks(tasks) {
        const sorted = [...tasks].sort((a,b) => dayjs(a.start_date).diff(dayjs(b.start_date)));
        const lanes = []; 
        sorted.forEach(task => {
            let placed = false;
            for(let i=0; i<lanes.length; i++) {
                if (dayjs(lanes[i]).isBefore(dayjs(task.start_date))) {
                    task.laneIndex = i;
                    lanes[i] = task.end_date;
                    placed = true;
                    break;
                }
            }
            if(!placed) {
                task.laneIndex = lanes.length;
                lanes.push(task.end_date);
            }
        });
        return lanes.length; 
    }

    function checkAvailabilityConflict(taskId, newStartDate, newEndDate) {
        const task = state.tasks.find(t => t.id === taskId);
        if (!task || !task.assigned_talent_id) return null; 

        const start = dayjs(newStartDate);
        const end = dayjs(newEndDate);
        const days = end.diff(start, 'day') + 1;
        
        for (let i = 0; i < days; i++) {
            const checkDate = start.add(i, 'day').format('YYYY-MM-DD');
            const conflict = state.availability.find(a => 
                a.talent_id === task.assigned_talent_id && 
                a.date === checkDate && 
                a.status === 'PTO'
            );
            if (conflict) return { date: checkDate, talentId: task.assigned_talent_id };
        }
        return null;
    }

    // ------------------------------------------------------------------------
    // 4. VIEW CONTROL
    // ------------------------------------------------------------------------
    const btnResource = document.getElementById('view-resource-btn');
    const btnProject = document.getElementById('view-project-btn');
    const btnMachine = document.getElementById('view-machine-btn'); // NEW BUTTON
    const prevRangeBtn = document.getElementById('schedule-prev-range-btn');
    const nextRangeBtn = document.getElementById('schedule-next-range-btn');
    const todayRangeBtn = document.getElementById('schedule-today-btn');
    const startDateInput = document.getElementById('schedule-start-date');
    const rangeLabelEl = document.getElementById('schedule-range-label');
    const viewHelpEl = document.getElementById('schedule-view-help');
    const sortSelect = document.getElementById('gantt-sort');
    const completedToggle = document.getElementById('gantt-show-completed');
    const filterControls = document.getElementById('project-filter-controls');

    if (btnResource) btnResource.addEventListener('click', () => switchView('resource'));
    if (btnProject) btnProject.addEventListener('click', () => switchView('project'));
    if (btnMachine) btnMachine.addEventListener('click', () => switchView('machine'));
    if (prevRangeBtn) prevRangeBtn.addEventListener('click', () => {
        state.timelineStartDate = state.timelineStartDate.subtract(state.timelineStepDays, 'day');
        renderGantt();
    });
    if (nextRangeBtn) nextRangeBtn.addEventListener('click', () => {
        state.timelineStartDate = state.timelineStartDate.add(state.timelineStepDays, 'day');
        renderGantt();
    });
    if (todayRangeBtn) todayRangeBtn.addEventListener('click', () => {
        state.timelineStartDate = dayjs().subtract(5, 'day').startOf('day');
        renderGantt();
    });
    if (startDateInput) startDateInput.addEventListener('change', (e) => {
        const selected = dayjs(e.target.value);
        if (selected.isValid()) {
            state.timelineStartDate = selected.startOf('day');
            renderGantt();
        }
    });

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            state.sortBy = e.target.value;
            renderGantt();
        });
    }

    if (completedToggle) {
        completedToggle.addEventListener('change', (e) => {
            state.showCompleted = e.target.checked;
            renderGantt();
        });
    }

    // Keep left resource rows and top date header aligned with timeline scrolling.
    const timelineWrapperEl = document.querySelector('.gantt-timeline-wrapper');
    const resourceListEl = document.getElementById('gantt-resource-list');
    const dateHeaderEl = document.getElementById('gantt-date-header');
    const gridCanvasEl = document.getElementById('gantt-grid-canvas');
    if (timelineWrapperEl && resourceListEl && dateHeaderEl && gridCanvasEl) {
        timelineWrapperEl.addEventListener('scroll', () => {
            // Keep panes aligned, but clamp only to real content bounds.
            const headerHeight = dateHeaderEl.offsetHeight || 50;
            const visibleGridHeight = Math.max(0, timelineWrapperEl.clientHeight - headerHeight);
            const maxTimelineByGrid = Math.max(0, gridCanvasEl.scrollHeight - visibleGridHeight);
            const maxResourceScroll = Math.max(0, resourceListEl.scrollHeight - resourceListEl.clientHeight);

            // Use the tighter non-zero bound when available; otherwise use whichever exists.
            const hardMax =
                maxResourceScroll > 0 && maxTimelineByGrid > 0
                    ? Math.min(maxResourceScroll, maxTimelineByGrid)
                    : Math.max(maxResourceScroll, maxTimelineByGrid);

            const clampedTop = hardMax > 0 ? Math.min(timelineWrapperEl.scrollTop, hardMax) : timelineWrapperEl.scrollTop;
            if (clampedTop !== timelineWrapperEl.scrollTop) timelineWrapperEl.scrollTop = clampedTop;
            resourceListEl.scrollTop = clampedTop;
            dateHeaderEl.scrollLeft = timelineWrapperEl.scrollLeft;
        });
    }

    function switchView(view) {
        state.currentView = view;
        
        // Reset all buttons
        [btnResource, btnProject, btnMachine].forEach(btn => {
            if(btn) {
                btn.classList.remove('active');
                btn.style.background = 'transparent';
                btn.style.color = 'var(--text-dim)';
            }
        });

        // Set Active Button
        const activeBtn = view === 'resource' ? btnResource : (view === 'project' ? btnProject : btnMachine);
        if(activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.background = 'var(--primary-blue)';
            activeBtn.style.color = 'white';
        }

        // Toggle Filter Controls (Only useful for Project View)
        if(filterControls) {
            filterControls.style.display = view === 'project' ? 'flex' : 'none';
        }

        updateViewHelp();

        renderGantt();
    }

    function focusProjectRow(projectId, taskId = null) {
        const projectIdStr = String(projectId);
        const projectTasks = state.tasks.filter(t => String(t.project_id) === projectIdStr);
        const taskMatch = taskId != null
            ? projectTasks.find(t => String(t.id) === String(taskId))
            : null;
        const startAnchor = taskMatch?.start_date || projectTasks
            .map(t => t.start_date)
            .filter(Boolean)
            .sort((a, b) => dayjs(a).diff(dayjs(b)))[0];

        if (startAnchor) {
            const leadDays = Math.max(5, Math.floor(state.timelineDays * 0.2));
            state.timelineStartDate = dayjs(startAnchor).subtract(leadDays, 'day').startOf('day');
        }

        switchView('project');

        setTimeout(() => {
            const row = document.getElementById(`project-row-${projectIdStr}`);
            const rowBg = document.getElementById(`project-grid-row-${projectIdStr}`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('schedule-project-hero');
                setTimeout(() => row.classList.remove('schedule-project-hero'), 2200);
            }
            if (rowBg) {
                rowBg.classList.add('schedule-project-hero-grid');
                setTimeout(() => rowBg.classList.remove('schedule-project-hero-grid'), 2200);
            }

            if (timelineWrapperEl && startAnchor) {
                const dayOffset = dayjs(startAnchor).startOf('day').diff(state.timelineStartDate, 'day');
                const targetLeft = Math.max(
                    0,
                    (dayOffset * TIMELINE_DAY_WIDTH) - Math.floor(timelineWrapperEl.clientWidth * 0.35)
                );
                timelineWrapperEl.scrollTo({ left: targetLeft, behavior: 'smooth' });
            }
        }, 140);
    }

    function updateViewHelp() {
        if (!viewHelpEl) return;
        if (state.currentView === 'project') {
            viewHelpEl.textContent = 'Project Timelines: click a project name to manage CRDD and steps. Drag bars to shift task dates. Click any task bar to edit and assign a machine.';
            return;
        }
        if (state.currentView === 'machine') {
            viewHelpEl.textContent = 'Machines: rows show only machine-assigned tasks. To assign one, click its task bar in any view and set "Assign Machine" in the task editor.';
            return;
        }
        viewHelpEl.textContent = 'Shop Resources: rows group tasks by trade. Drag bars left/right to reschedule. Click any task bar to open the editor and set "Assign Machine".';
    }

    // ------------------------------------------------------------------------
    // 5. DATA LOADING (shared project_tasks with Projects Gantt — single source of truth)
    // ------------------------------------------------------------------------
    async function loadShopData() {
        console.log("Loading Ten Works Production Data...");
        
        const [tradesRes, tasksRes, projectsRes, availRes, machinesRes, talentRes, assignRes] = await Promise.all([
            supabase.from('shop_trades').select('*').order('id'),
            supabase.from('project_tasks').select(`*, projects(name), shop_trades(name)`),
            supabase.from('projects').select('*').order('start_date'),
            supabase.from('talent_availability').select('*'),
            supabase.from('shop_machines').select('*').order('name'),
            supabase.from('shop_talent').select('id, hours_per_week').eq('active', true),
            supabase.from('task_assignments').select('task_id, talent_id, assigned_date, hours')
        ]);

        if (tradesRes.error) console.error("Error loading data:", tradesRes.error);

        state.trades = tradesRes.data || [];
        state.tasks = tasksRes.data || [];
        state.projects = projectsRes.data || [];
        state.availability = availRes.data || [];
        state.machines = machinesRes.data || [];
        state.talent = talentRes.data || [];
        state.assignments = assignRes.data || [];

        renderGantt();
        updateMetrics();
    }

    // ------------------------------------------------------------------------
    // 6. RENDER ENGINE
    // ------------------------------------------------------------------------
    function renderGantt() {
        const resourceList = document.getElementById('gantt-resource-list');
        const gridCanvas = document.getElementById('gantt-grid-canvas');
        const dateHeader = document.getElementById('gantt-date-header');

        if (!resourceList || !gridCanvas || !dateHeader) return;

        // A. TIMELINE HEADER
        let dateHtml = '';
        const startDate = state.timelineStartDate.startOf('day');
        const daysToRender = state.timelineDays;
        const dayWidth = TIMELINE_DAY_WIDTH;
        const endDate = startDate.add(daysToRender - 1, 'day');
        if (rangeLabelEl) rangeLabelEl.textContent = `${startDate.format('MMM D, YYYY')} - ${endDate.format('MMM D, YYYY')}`;
        if (startDateInput) startDateInput.value = startDate.format('YYYY-MM-DD');

        for (let i = 0; i < daysToRender; i++) {
            const current = startDate.add(i, 'day');
            const isWeekend = current.day() === 0 || current.day() === 6;
            const isToday = current.isSame(dayjs(), 'day');

            dateHtml += `
                <div class="date-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}">
                    <span class="schedule-date-day">${current.format('DD')}</span>
                    <span>${current.format('ddd')}</span>
                </div>
            `;
        }
        dateHeader.innerHTML = dateHtml;
        const totalWidth = daysToRender * dayWidth;
        dateHeader.style.width = `${totalWidth}px`;
        dateHeader.style.backgroundSize = `${dayWidth}px 100%`;
        dateHeader.style.backgroundPosition = `${dayWidth - 1}px 0`;
        gridCanvas.style.width = `${totalWidth}px`;
        
        gridCanvas.style.backgroundImage = 'linear-gradient(90deg, var(--border-color) 1px, transparent 1px)';
        gridCanvas.style.backgroundSize = `${dayWidth}px 100%`;
        gridCanvas.style.backgroundPosition = `${dayWidth - 1}px 0`; 

        // B. DETERMINE ROWS
        resourceList.innerHTML = '';
        gridCanvas.innerHTML = '';

        let rows = [];
        if (state.currentView === 'resource') {
            rows = state.trades;
        } else if (state.currentView === 'machine') {
            rows = state.machines;
        } else {
            // Project View
            const today = dayjs().format('YYYY-MM-DD');
            // Project View Specific Logic
            const today = dayjs().format('YYYY-MM-DD');
            const endPlus14 = dayjs().add(14, 'day').format('YYYY-MM-DD');

            // At Risk Logic:
            // 1. Has an overdue task
            // 2. OR: Has a task that should have started by now but is still 'Pending'
            // 3. OR: Has a task that should have started by now but has no assigned talent
            const atRiskTaskProjectIds = new Set(state.tasks.filter(t => {
                if (t.status === 'Completed') return false;
                const isOverdue = t.end_date && t.end_date < today;
                const isUnstarted = t.start_date && t.start_date <= today && t.status === 'Pending';
                const isUnassigned = t.start_date && t.start_date <= today && !t.assigned_talent_id;
                return isOverdue || isUnstarted || isUnassigned;
            }).map(t => t.project_id));

            const overdueProjectIds = new Set(
                state.projects.filter(p => p.status !== 'Completed' && p.end_date && p.end_date < today).map(p => p.id)
            );

            const atRiskProjectIds = new Set(
                state.projects.filter(p => p.status !== 'Completed' && p.end_date && p.end_date >= today && p.end_date <= endPlus14 && atRiskTaskProjectIds.has(p.id)).map(p => p.id)
            );

            rows = state.projects.filter(p => {
                if (state.showCompleted) return true;
                if (p.status === 'Completed') return false;
                if (state.filterOverdue) return overdueProjectIds.has(p.id) || atRiskTaskProjectIds.has(p.id);
                return true;
            });

            // Sort Projects
            rows.sort((a, b) => {
                const dateA = dayjs(a[state.sortBy] || '2099-01-01');
                const dateB = dayjs(b[state.sortBy] || '2099-01-01');
                return dateA.diff(dateB);
            });
        }

        let currentY = 0; 

        rows.forEach((rowItem, index) => {
            // FILTER TASKS FOR THIS ROW
            const rowTasks = state.tasks.filter(t => {
                if (state.currentView === 'resource') return t.trade_id === rowItem.id;
                if (state.currentView === 'machine') return t.assigned_machine_id === rowItem.id; // Filter by Machine ID
                else return t.project_id === rowItem.id;
            });

            const numLanes = packTasks(rowTasks);
            const barHeight = 26;
            const barMargin = 6;
            const rowPadding = 20;
            const calculatedHeight = Math.max(70, (numLanes * (barHeight + barMargin)) + rowPadding);

            const isOdd = index % 2 === 1;
            const rowBackground = isOdd ? 'rgba(255, 255, 255, 0.025)' : 'transparent'; 

            // 1. Sidebar Cell
            const rowEl = document.createElement('div');
            rowEl.className = 'resource-row';
            rowEl.style.height = `${calculatedHeight}px`; 
            rowEl.style.backgroundColor = rowBackground; 
            
            if (state.currentView === 'resource') {
                rowEl.innerHTML = `<div class="resource-name">${rowItem.name}</div><div class="resource-role">$${rowItem.default_hourly_rate}/hr</div>`;
            } else if (state.currentView === 'machine') {
                // Machine Sidebar
                const statusClass = rowItem.status === 'Operational' ? 'schedule-status-operational' : 'schedule-status-down';
                rowEl.innerHTML = `<div class="resource-name">${rowItem.name}</div><div class="resource-role ${statusClass}">${rowItem.status}</div>`;
            } else {
                // Project Sidebar
                const projectOverdue = overdueProjectIds.has(rowItem.id);
                const projectAtRisk = !projectOverdue && atRiskProjectIds.has(rowItem.id);
                const badge = projectOverdue
                    ? ' <span class="schedule-project-badge schedule-project-badge-overdue">Overdue</span>'
                    : (projectAtRisk ? ' <span class="schedule-project-badge schedule-project-badge-risk">At risk</span>' : '');
                rowEl.id = 'project-row-' + rowItem.id;
                let statusClass = 'schedule-status-default';
                if (rowItem.status === 'In Progress') statusClass = 'schedule-status-inprogress';
                if (rowItem.status === 'Completed') statusClass = 'schedule-status-operational';

                rowEl.innerHTML = `
                    <div class="resource-name schedule-project-link" title="Manage Project">
                        ${rowItem.name}${badge} <i class="fas fa-pencil-alt schedule-project-edit-icon"></i>
                    </div>
                    <div class="resource-role ${statusClass}">${rowItem.status}</div>
                `;
                rowEl.querySelector('.resource-name').addEventListener('click', () => openProjectModal(rowItem));
            }
            resourceList.appendChild(rowEl);

            // 2. Grid Row Background
            const rowBg = document.createElement('div');
            rowBg.style.position = 'absolute';
            rowBg.style.top = `${currentY}px`;
            rowBg.style.left = '0';
            rowBg.style.width = '100%';
            rowBg.style.height = `${calculatedHeight}px`;
            rowBg.style.backgroundColor = rowBackground;
            rowBg.style.borderBottom = '1px solid var(--border-color)';
            rowBg.style.zIndex = '0';
            rowBg.style.cursor = 'pointer';
            rowBg.title = 'Click to schedule a pending task here';
            if (state.currentView === 'project') {
                rowBg.id = 'project-grid-row-' + rowItem.id;
            }
            
            rowBg.addEventListener('click', (e) => {
                if (e.target !== rowBg) return;
                const clickX = e.offsetX;
                const clickedCol = Math.floor(clickX / dayWidth);
                const clickedDate = startDate.add(clickedCol, 'day').format('YYYY-MM-DD');
                openAssignPendingTaskModal(rowItem, clickedDate);
            });

            gridCanvas.appendChild(rowBg);

            // 3. Project Target Completion Line (Project View Only)
            let targetPixel = null; 
            if (state.currentView === 'project' && rowItem.end_date) {
                const targetDate = dayjs(rowItem.end_date);
                const targetDiff = targetDate.diff(startDate, 'day');
                
                if (targetDiff >= 0 && targetDiff < daysToRender) {
                    targetPixel = (targetDiff + 1) * dayWidth; 

                    const targetCell = document.createElement('div');
                    targetCell.style.position = 'absolute';
                    targetCell.style.top = `${currentY}px`;
                    targetCell.style.left = `${targetDiff * dayWidth}px`; 
                    targetCell.style.width = `${dayWidth}px`;
                    targetCell.style.height = `${calculatedHeight}px`;
                    
                    targetCell.style.background = 'repeating-linear-gradient(45deg, rgba(212, 175, 55, 0.1), rgba(212, 175, 55, 0.1) 10px, rgba(212, 175, 55, 0.05) 10px, rgba(212, 175, 55, 0.05) 20px)';
                    targetCell.style.borderRight = '3px solid var(--primary-gold)'; 
                    targetCell.style.zIndex = '0'; 
                    targetCell.title = `Target Completion: ${targetDate.format('MMM D')}`;
                    
                    const flag = document.createElement('div');
                    flag.innerHTML = '<i class="fas fa-flag-checkered"></i>';
                    flag.style.position = 'absolute';
                    flag.style.bottom = '5px'; 
                    flag.style.right = '5px';
                    flag.style.color = 'var(--primary-gold)';
                    flag.style.fontSize = '24px'; 
                    flag.style.opacity = '0.8';
                    
                    targetCell.appendChild(flag);
                    gridCanvas.appendChild(targetCell);
                }
            }

            // 4. Render Task Bars
            rowTasks.forEach(task => {
                const start = dayjs(task.start_date);
                const end = dayjs(task.end_date);
                const diff = start.diff(startDate, 'day');
                const duration = end.diff(start, 'day') + 1;

                if (diff + duration < 0) return;

                const bar = document.createElement('div');
                bar.className = 'gantt-task-bar';
                const assignedMachine = state.machines.find(m => m.id === task.assigned_machine_id);
                
                const laneOffset = (task.laneIndex || 0) * (barHeight + barMargin);
                const barLeft = diff * dayWidth;
                const barWidth = (duration * dayWidth) - 10;

                bar.style.top = `${currentY + 10 + laneOffset}px`; 
                bar.style.left = `${barLeft}px`;
                bar.style.width = `${barWidth}px`;
                bar.style.height = `${barHeight}px`;
                bar.style.fontSize = '0.7rem';
                bar.style.cursor = 'grab';

                // --- COLOR LOGIC ---
                const baseColor = state.currentView === 'project' ? getTradeColor(task.trade_id) : getProjectColor(task.project_id);
                
                // --- OVERRUN / MACHINE CONFLICT LOGIC ---
                // If in Project View, check against CRDD
                if (state.currentView === 'project' && targetPixel !== null && (barLeft + barWidth) > targetPixel) {
                    const safeWidth = Math.max(0, targetPixel - barLeft);
                    const safePercent = (safeWidth / barWidth) * 100;
                    bar.style.background = `linear-gradient(90deg, ${baseColor} ${safePercent}%, #ff4444 ${safePercent}%)`;
                    bar.style.border = '1px solid #ff4444'; 
                } else {
                    bar.style.backgroundColor = baseColor;
                    bar.style.backgroundImage = 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(0,0,0,0.1))';
                    bar.style.border = '1px solid rgba(255,255,255,0.15)';
                }

                const percent = task.estimated_hours ? (task.actual_hours / task.estimated_hours) : 0;
                const burnColor = percent > 1 ? '#ff4444' : 'rgba(255,255,255,0.5)';
                
                // Label Logic: In Resource/Machine view, show Project Name. In Project view, show Task Name/Trade.
                const label = (state.currentView === 'resource' || state.currentView === 'machine') ? task.projects?.name : task.shop_trades?.name;
                const machineLabel = assignedMachine ? assignedMachine.name : 'No Machine';

                bar.innerHTML = `
                    <span class="gantt-task-info schedule-task-label">${label || task.name} • <span class="schedule-task-machine-pill">${machineLabel}</span></span>
                    <div class="burn-line" style="width: ${Math.min(percent * 100, 100)}%; background: ${burnColor}; box-shadow: 0 0 5px ${burnColor}; pointer-events:none;"></div>
                `;
                bar.title = `${task.name}\nMachine: ${machineLabel}\nClick bar to edit / assign machine`;
                bar.addEventListener('mousedown', (e) => handleDragStart(e, task, bar));
                gridCanvas.appendChild(bar);
            });

            currentY += calculatedHeight;
        });
        
        gridCanvas.style.height = `${currentY}px`;
    }

    // ------------------------------------------------------------------------
    // 7. PHYSICS ENGINE (Drag & Drop)
    // ------------------------------------------------------------------------
    
    function openAssignPendingTaskModal(rowItem, clickedDate) {
        let candidateTasks = state.tasks.filter(t => t.status !== 'Completed');
        
        if (state.currentView === 'resource') {
            candidateTasks = candidateTasks.filter(t => t.trade_id === rowItem.id);
        } else if (state.currentView === 'machine') {
            candidateTasks = candidateTasks.filter(t => !t.assigned_machine_id || t.assigned_machine_id === rowItem.id);
        } else if (state.currentView === 'project') {
            candidateTasks = candidateTasks.filter(t => t.project_id === rowItem.id);
        }
        
        candidateTasks.sort((a, b) => {
            const pA = a.projects?.name || '';
            const pB = b.projects?.name || '';
            if (pA !== pB) return pA.localeCompare(pB);
            return a.name.localeCompare(b.name);
        });

        if (candidateTasks.length === 0) {
            showModal('No Tasks', '<p style="color:var(--text-medium);">There are no pending tasks available for this selection.</p>', null, true, '<button id="modal-cancel-btn" class="btn-primary">Close</button>');
            return;
        }

        const optionsHtml = candidateTasks.map(t => {
            const projName = t.projects?.name || 'Unknown Project';
            const dateStr = t.start_date ? ` (Currently: ${dayjs(t.start_date).format('MMM D')})` : ' (Unscheduled)';
            return `<option value="${t.id}">${projName} - ${t.name}${dateStr}</option>`;
        }).join('');

        let title = 'Assign Task';
        if (state.currentView === 'resource') title = `Schedule Task for ${rowItem.name}`;
        if (state.currentView === 'machine') title = `Assign Task to ${rowItem.name}`;
        if (state.currentView === 'project') title = `Schedule Task for ${rowItem.name}`;

        showModal(title, `
            <div style="margin-bottom: 15px; color: var(--text-medium); font-size: 0.9rem;">
                Select a task to schedule starting on <strong>${dayjs(clickedDate).format('MMM D, YYYY')}</strong>.
            </div>
            <div class="schedule-modal-field">
                <label>Select Task</label>
                <select id="quick-assign-task" class="form-control schedule-modal-dark-select">
                    ${optionsHtml}
                </select>
            </div>
        `, async () => {}, true, '<button id="modal-confirm-btn" class="btn-primary">Assign Task</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>');

        setTimeout(() => {
            const confirmBtn = document.getElementById('modal-confirm-btn');
            if (confirmBtn) {
                confirmBtn.onclick = async () => {
                    const taskId = document.getElementById('quick-assign-task').value;
                    if (!taskId) return;

                    const task = state.tasks.find(t => t.id == taskId);
                    if (!task) return;

                    const currentStart = task.start_date ? dayjs(task.start_date) : dayjs(clickedDate);
                    const currentEnd = task.end_date ? dayjs(task.end_date) : dayjs(clickedDate);
                    const durationDays = Math.max(0, currentEnd.diff(currentStart, 'day'));
                    
                    const newStart = dayjs(clickedDate).format('YYYY-MM-DD');
                    const newEnd = dayjs(clickedDate).add(durationDays, 'day').format('YYYY-MM-DD');

                    const updates = {
                        start_date: newStart,
                        end_date: newEnd
                    };

                    if (state.currentView === 'machine') {
                        updates.assigned_machine_id = rowItem.id;
                    }

                    const { error } = await supabase.from('project_tasks').update(updates).eq('id', taskId);
                    if (error) {
                        showToast('Error assigning task: ' + error.message, 'error');
                    } else {
                        showToast('Task scheduled successfully.', 'success');
                        hideModal();
                        loadShopData();
                    }
                };
            }
        }, 100);
    }

    function handleDragStart(e, task, element) {
        if (e.button !== 0) return; 

        state.isDragging = true;
        state.dragTask = task;
        state.dragEl = element;
        state.dragStartX = e.clientX;
        state.dragStartLeft = parseInt(element.style.left || 0);
        state.hasMoved = false;

        element.style.cursor = 'grabbing';
        element.style.zIndex = 1000;
        element.style.transition = 'none'; 

        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    }

    function handleDragMove(e) {
        if (!state.isDragging) return;
        const deltaX = e.clientX - state.dragStartX;
        if (Math.abs(deltaX) > 5) state.hasMoved = true;
        state.dragEl.style.left = `${state.dragStartLeft + deltaX}px`;
    }

    async function handleDragEnd(e) {
        if (!state.isDragging) return;

        state.isDragging = false;
        state.dragEl.style.cursor = 'grab';
        state.dragEl.style.zIndex = '';
        state.dragEl.style.transition = 'all 0.2s'; 
        
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);

        if (!state.hasMoved) {
            state.dragEl.style.left = `${state.dragStartLeft}px`; 
            openTaskModal(state.dragTask);
            return;
        }

        const currentLeft = parseInt(state.dragEl.style.left || 0);
        const snapLeft = Math.round(currentLeft / 100) * 100; 
        state.dragEl.style.left = `${snapLeft}px`; 

        const pixelShift = snapLeft - state.dragStartLeft;
        const dayShift = Math.round(pixelShift / 100);

        if (dayShift !== 0) {
            console.log(`Shifting task ${state.dragTask.name} by ${dayShift} days.`);

            const oldStart = state.dragTask.start_date;
            const newStart = dayjs(state.dragTask.start_date).add(dayShift, 'day').format('YYYY-MM-DD');
            const newEnd = dayjs(state.dragTask.end_date).add(dayShift, 'day').format('YYYY-MM-DD');

            const conflict = checkAvailabilityConflict(state.dragTask.id, newStart, newEnd);
            if (conflict) {
                const confirmMove = confirm(`WARNING: The assigned staff member is marked as PTO on ${conflict.date}.\n\nDo you still want to move this task?`);
                if (!confirmMove) {
                    state.dragEl.style.left = `${state.dragStartLeft}px`;
                    return; 
                }
            }

            state.dragTask.start_date = newStart;
            state.dragTask.end_date = newEnd;

            const { error } = await supabase.from('project_tasks')
                .update({ start_date: newStart, end_date: newEnd })
                .eq('id', state.dragTask.id);

            if (error) {
                console.error("Move failed, reverting...", error);
                state.dragTask.start_date = oldStart; 
                loadShopData(); 
                return;
            }

            // Move dependent children automatically
            const { data: children } = await supabase.from('project_tasks').select('*').eq('dependency_task_id', state.dragTask.id);
            if (children && children.length > 0) {
                const updatePromises = children.map(child => {
                    const cStart = dayjs(child.start_date).add(dayShift, 'day').format('YYYY-MM-DD');
                    const cEnd = dayjs(child.end_date).add(dayShift, 'day').format('YYYY-MM-DD');
                    return supabase.from('project_tasks').update({ start_date: cStart, end_date: cEnd }).eq('id', child.id);
                });
                await Promise.all(updatePromises);
            }
            loadShopData();
        }
    }

    // ------------------------------------------------------------------------
    // 8. PROJECT MANAGER MODAL
    // ------------------------------------------------------------------------
    function openProjectModal(project) {
        const tradeOptions = state.trades.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        const machineOptions = `<option value="">-- Unassigned --</option>${state.machines.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}`;
        
        showModal(`Manage: ${project.name}`, `
            <div class="schedule-modal-section">
                <label class="schedule-modal-sub-label">Customer Requested Due Date (CRDD)</label>
                <div class="schedule-modal-inline-row">
                    <input type="date" id="edit-proj-target" class="form-control schedule-modal-flex-input" value="${project.end_date || ''}">
                    <button id="btn-update-target" class="btn-primary schedule-modal-secondary-btn">Update Date</button>
                </div>
            </div>

            <div>
                <h4 class="schedule-modal-title"><i class="fas fa-plus-circle schedule-modal-title-icon"></i> Add New Step</h4>
                <div class="form-grid schedule-modal-grid-tight">
                    <div>
                        <label>Trade Function</label>
                        <select id="new-task-trade" class="form-control schedule-modal-dark-select">${tradeOptions}</select>
                    </div>
                    <div>
                        <label>Task Name</label>
                        <input type="text" id="new-task-name" class="form-control" placeholder="e.g. Polishing">
                    </div>
                    <div>
                        <label>Start Date</label>
                        <input type="date" id="new-task-start" class="form-control" value="${dayjs().format('YYYY-MM-DD')}">
                    </div>
                    <div>
                        <label>Duration (Biz Days)</label>
                        <input type="number" id="new-task-days" class="form-control" value="3">
                    </div>
                    <div>
                        <label>Assign Machine (Optional)</label>
                        <select id="new-task-machine" class="form-control schedule-modal-dark-select">${machineOptions}</select>
                    </div>
                </div>
                <button id="btn-add-step" class="btn-primary schedule-modal-full-btn">Insert Step</button>
            </div>
        `, async () => {});

        setTimeout(() => {
            const btnUpdate = document.getElementById('btn-update-target');
            if (btnUpdate) btnUpdate.onclick = async () => {
                const newDate = document.getElementById('edit-proj-target').value;
                await supabase.from('projects').update({ end_date: newDate }).eq('id', project.id);
                hideModal(); loadShopData();
            };

            const btnAdd = document.getElementById('btn-add-step');
            if (btnAdd) btnAdd.onclick = async () => {
                const tradeId = document.getElementById('new-task-trade').value;
                const name = document.getElementById('new-task-name').value;
                const startVal = document.getElementById('new-task-start').value;
                const daysVal = parseInt(document.getElementById('new-task-days').value) || 1;
                const machineId = document.getElementById('new-task-machine')?.value || null;
                
                if (!name) return;
                
                const start = dayjs(startVal);
                const end = addBusinessDays(start, daysVal > 0 ? daysVal - 1 : 0);

                await supabase.from('project_tasks').insert({
                    project_id: project.id, trade_id: tradeId, name: name,
                    start_date: start.format('YYYY-MM-DD'), end_date: end.format('YYYY-MM-DD'),
                    estimated_hours: daysVal * 8, status: 'Pending',
                    assigned_machine_id: machineId || null
                });
                hideModal(); loadShopData();
            };
        }, 100);
    }

    // ------------------------------------------------------------------------
    // 9. EDIT TASK MODAL
    // ------------------------------------------------------------------------
    function openTaskModal(task) {
        const s = dayjs(task.start_date);
        const e = dayjs(task.end_date);
        const dur = e.diff(s, 'day') + 1; 

        // Build Machine Options for Assignment
        let machineOptions = `<option value="">-- None --</option>`;
        state.machines.forEach(m => {
            const selected = task.assigned_machine_id === m.id ? 'selected' : '';
            machineOptions += `<option value="${m.id}" ${selected}>${m.name}</option>`;
        });

        // Build Dependency Options (Tasks in same project)
        const projectTasks = state.tasks.filter(t => t.project_id === task.project_id && t.id !== task.id);
        let dependencyOptions = `<option value="">-- None --</option>`;
        projectTasks.forEach(t => {
            const selected = task.dependency_task_id === t.id ? 'selected' : '';
            dependencyOptions += `<option value="${t.id}" ${selected}>${t.name}</option>`;
        });

        showModal(`Edit Task / Machine: ${task.name}`, `
            <div class="schedule-modal-sub-label" style="margin-bottom:10px;">Machine assignment is saved with this task and appears in Machine view.</div>
            <div class="form-grid schedule-modal-grid-wide">
                <div>
                    <label>Status</label>
                    <select id="edit-status" class="form-control schedule-modal-dark-select">
                        <option value="Pending" ${task.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                        <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </div>
                <div>
                    <label>Actual Hours (Burn)</label>
                    <input type="number" id="edit-actual" class="form-control" min="0" step="0.25" value="${task.actual_hours ?? ''}">
                </div>
                <div>
                    <label>Start Date</label>
                    <input type="date" id="edit-start" class="form-control" value="${task.start_date}">
                </div>
                <div>
                    <label>Duration (Days)</label>
                    <input type="number" id="edit-duration" class="form-control" value="${dur}">
                </div>
                <div>
                    <label class="schedule-modal-highlight-label">Assign Machine</label>
                    <select id="edit-machine" class="form-control schedule-modal-dark-select">
                        ${machineOptions}
                    </select>
                </div>
                <div>
                    <label>Depends On</label>
                    <select id="edit-dependency" class="form-control schedule-modal-dark-select">
                        ${dependencyOptions}
                    </select>
                </div>
                <div class="schedule-modal-grid-span">
                    <label class="schedule-modal-sub-label">Calculated End Date: <span id="calc-end-date" class="schedule-modal-end-date">${task.end_date}</span></label>
                    <input type="hidden" id="edit-end" value="${task.end_date}"> 
                </div>
            </div>
            <div class="schedule-modal-actions">
                <button id="delete-task-btn" class="schedule-delete-btn">Delete Task</button>
                <button id="save-task-btn" class="btn-primary">Save Changes</button>
            </div>
        `, async () => {});

        setTimeout(() => {
            const startInput = document.getElementById('edit-start');
            const durInput = document.getElementById('edit-duration');
            const endInput = document.getElementById('edit-end');
            const endDisplay = document.getElementById('calc-end-date');

            function updateEnd() {
                const s = dayjs(startInput.value);
                const d = parseInt(durInput.value) || 1;
                const finalDate = addBusinessDays(s, d > 0 ? d - 1 : 0);
                const fmt = finalDate.format('YYYY-MM-DD');
                endInput.value = fmt;
                endDisplay.textContent = fmt;
            }
            startInput.addEventListener('change', updateEnd);
            durInput.addEventListener('change', updateEnd);

            const saveBtn = document.getElementById('save-task-btn');
            if (saveBtn) saveBtn.onclick = async () => {
                const newStatus = document.getElementById('edit-status').value;
                const newActual = parseFloat(document.getElementById('edit-actual').value) || 0;
                const newStart = document.getElementById('edit-start').value;
                const newEnd = document.getElementById('edit-end').value;
                const newMachine = document.getElementById('edit-machine').value || null;
                const newDependency = document.getElementById('edit-dependency').value || null;

                const { error } = await supabase.from('project_tasks').update({
                    status: newStatus,
                    actual_hours: newActual, 
                    start_date: newStart, 
                    end_date: newEnd,
                    assigned_machine_id: newMachine,
                    dependency_task_id: newDependency
                }).eq('id', task.id);

                if (error) {
                    alert('Error: ' + error.message);
                } else {
                    if (newStatus === 'Completed') {
                        const { data: siblingTasks } = await supabase.from('project_tasks').select('status').eq('project_id', task.project_id);
                        if (siblingTasks && siblingTasks.every(t => t.status === 'Completed')) {
                            const { data: proj } = await supabase.from('projects').select('status').eq('id', task.project_id).single();
                            if (proj && proj.status !== 'Completed') {
                                // PRE-FLIGHT CLOSEOUT CHECKS
                                const { data: bomData } = await supabase.from('project_bom').select('status').eq('project_id', task.project_id);
                                const unpulledBom = (bomData || []).filter(b => b.status !== 'Pulled');
                                
                                if (unpulledBom.length > 0) {
                                    alert(`Cannot complete project: ${unpulledBom.length} BOM items are not marked as 'Pulled'. Please update BOM in Projects view.`);
                                } else {
                                    const { data: notesData } = await supabase.from('project_notes').select('id').eq('project_id', task.project_id).limit(1);
                                    const hasNotes = notesData && notesData.length > 0;
                                    
                                    const confirmMessage = hasNotes 
                                        ? "All tasks are completed and BOM is pulled. Do you want to mark the entire project as Completed?" 
                                        : "Warning: No portal updates/notes have been added to this project. All tasks are completed. Mark project as Completed anyway?";

                                    if (confirm(confirmMessage)) {
                                        await supabase.from('projects').update({ status: 'Completed' }).eq('id', task.project_id);
                                    }
                                }
                            }
                        }
                    }
                    hideModal(); 
                    loadShopData(); 
                }
            };

            const delBtn = document.getElementById('delete-task-btn');
            if(delBtn) delBtn.onclick = async () => {
                if(confirm("Are you sure you want to delete this task?")) {
                    await supabase.from('project_tasks').delete().eq('id', task.id);
                    hideModal();
                    loadShopData();
                }
            };
        }, 100);
    }

    const DEFAULT_HOURS_PER_WEEK = 40;

    function updateMetrics() {
        const getAssignmentBookedHours = (assignment) => {
            const explicit = Number(assignment?.hours);
            if (Number.isFinite(explicit) && explicit > 0) return explicit;

            const task = state.tasks.find(t => String(t.id) === String(assignment?.task_id));
            const est = Number(task?.estimated_hours);
            const normalized = Number.isFinite(est) && est > 0 ? est : 8;
            if (task) return Math.min(normalized, 8);
            return 0;
        };
        const activeProjects = state.projects.filter(p => p.status !== 'Completed');
        const totalRev = activeProjects.reduce((acc, p) => acc + (p.project_value || 0), 0);

        const revenueEl = document.getElementById('metrics-revenue');
        const countEl = document.getElementById('metrics-count');
        const loadBar = document.getElementById('metrics-load-bar');
        const loadText = document.getElementById('metrics-load-text');

        if (revenueEl) revenueEl.textContent = formatCurrency(totalRev);
        if (countEl) countEl.textContent = activeProjects.length;

        const weekStart = dayjs().startOf('week');
        const weekEnd = weekStart.add(6, 'day');
        const totalCapacity = (state.talent || []).reduce((sum, t) => sum + (Number(t.hours_per_week) || DEFAULT_HOURS_PER_WEEK), 0);
        const weekAssignments = (state.assignments || []).filter(a => {
            const assigned = dayjs(String(a?.assigned_date || '').slice(0, 10));
            return assigned.isValid() && !assigned.isBefore(weekStart, 'day') && !assigned.isAfter(weekEnd, 'day');
        });
        const totalLoad = weekAssignments.reduce((sum, a) => sum + getAssignmentBookedHours(a), 0);

        const pct = totalCapacity > 0 ? Math.round((totalLoad / totalCapacity) * 100) : 0;
        const barPct = totalCapacity > 0 ? Math.min((totalLoad / totalCapacity) * 100, 150) : 0;

        if (loadBar) {
            loadBar.style.width = `${barPct}%`;
            loadBar.style.backgroundColor = pct > 100 ? 'var(--danger-red)' : (pct > 85 ? 'var(--warning-yellow)' : 'var(--primary-blue)');
        }
        if (loadText) loadText.textContent = `${pct}%`;
    }

    // ------------------------------------------------------------------------
    // 10. MISSION PLANNER (UNCHANGED)
    // ------------------------------------------------------------------------
    const refreshBtn = document.getElementById('schedule-refresh-btn');
    const doRefresh = async () => {
        if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refresh'; }
        await loadShopData();
        if (refreshBtn) { refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh'; refreshBtn.disabled = false; }
    };
    if (refreshBtn) refreshBtn.addEventListener('click', doRefresh);
    const stalenessRefreshBtn = document.getElementById('staleness-refresh-btn');
    if (stalenessRefreshBtn) stalenessRefreshBtn.addEventListener('click', doRefresh);

    window.addEventListener('focus', checkStaleness);
    setInterval(checkStaleness, 30000);

    supabase.channel('schedule-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, () => loadShopData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => loadShopData())
        .subscribe();

    const launchBtn = document.getElementById('launch-new-project-btn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            await openSharedProjectLaunchModal({
                supabase,
                dayjs,
                addBusinessDays,
                showModal,
                showToast,
                formatCurrency,
                trades: state.trades,
                onSuccess: async () => {
                    await loadShopData();
                }
            });
        });
    }
    
    // START
    updateViewHelp();
    await loadShopData();

    const params = new URLSearchParams(window.location.search);
    const projectIdParam = params.get('project_id');
    const taskIdParam = params.get('task_id');
    const filterOverdue = params.get('filter') === 'overdue';
    if (filterOverdue) {
        state.filterOverdue = true;
        switchView('project');
        history.replaceState({}, '', window.location.pathname + '?filter=overdue');
    }
    if (projectIdParam) {
        focusProjectRow(projectIdParam, taskIdParam);
        if (!filterOverdue) history.replaceState({}, '', window.location.pathname);
    }
    if (taskIdParam) {
        setTimeout(() => {
            const deepLinkedTask = state.tasks.find(t => String(t.id) === String(taskIdParam));
            if (deepLinkedTask) openTaskModal(deepLinkedTask);
        }, 220);
    }
        } finally {
            hideGlobalLoader();
        }
    }); // runWhenNavReady
});
