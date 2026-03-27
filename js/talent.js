import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs,
    setupGlobalSearch,
    runWhenNavReady,
    hideGlobalLoader
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

document.addEventListener("DOMContentLoaded", async () => {
    runWhenNavReady(async () => {
        try {
    // ------------------------------------------------------------------------
    // 1. INITIALIZATION
    // ------------------------------------------------------------------------
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { hideGlobalLoader(); window.location.href = 'index.html'; return; }
    await setupUserMenuAndAuth(supabase, { currentUser: user });
    await setupGlobalSearch(supabase, user);

    // ------------------------------------------------------------------------
    // 2. STATE
    // ------------------------------------------------------------------------
    const STALE_AFTER_MS = 2 * 60 * 1000;
    let state = {
        talent: [],
        trades: [],
        skills: [],
        availability: [],
        assignments: [],
        activeTasks: [],
        unassignedTasks: [],
        internalProjectID: null,
        // Default timeline starts at today (forward-looking by default).
        viewDate: dayjs().startOf('day'),
        daysToShow: 30,
        filterTradeId: null,
        filterProjectId: null,
        filterProjectName: null,
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

    const TRADE_COLORS = { 1: '#546E7A', 2: '#1E88E5', 3: '#D4AF37', 4: '#8D6E63', 5: '#66BB6A', 6: '#7E57C2' };
    const DEFAULT_HOURS_PER_WEEK = 40;
    function getTradeColor(id) { return TRADE_COLORS[id] || 'var(--primary-gold)'; }

    // ------------------------------------------------------------------------
    // 3. LISTENERS
    // ------------------------------------------------------------------------
    const prevBtn = document.getElementById('prev-week-btn');
    const nextBtn = document.getElementById('next-week-btn');
    const filterEl = document.getElementById('trade-filter');
    const internalBtn = document.getElementById('btn-internal-task');

    if (prevBtn) prevBtn.addEventListener('click', () => { state.viewDate = state.viewDate.subtract(7, 'day'); renderMatrix(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { state.viewDate = state.viewDate.add(7, 'day'); renderMatrix(); });
    if (filterEl) filterEl.addEventListener('change', (e) => { state.filterTradeId = e.target.value ? parseInt(e.target.value) : null; renderMatrix(); });
    if (internalBtn) internalBtn.addEventListener('click', openInternalTaskModal);
    document.getElementById('btn-capacity-report')?.addEventListener('click', openCapacityReportModal);

    const talentRefreshBtn = document.getElementById('talent-refresh-btn');
    const doTalentRefresh = async () => {
        if (talentRefreshBtn) { talentRefreshBtn.disabled = true; talentRefreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refresh'; }
        await loadTalentData();
        if (talentRefreshBtn) { talentRefreshBtn.disabled = false; talentRefreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh'; }
    };
    if (talentRefreshBtn) talentRefreshBtn.addEventListener('click', doTalentRefresh);
    document.getElementById('staleness-refresh-btn')?.addEventListener('click', doTalentRefresh);

    window.addEventListener('focus', checkStaleness);
    setInterval(checkStaleness, 30000);

    supabase.channel('talent-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, () => loadTalentData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => loadTalentData())
        .subscribe();

    const gridCanvas = document.getElementById('matrix-grid-canvas');
    const sidebarList = document.getElementById('matrix-resource-list');
    const dateHeader = document.getElementById('matrix-date-header');
    
    if (gridCanvas && sidebarList && dateHeader) {
        gridCanvas.addEventListener('scroll', () => {
            dateHeader.scrollLeft = gridCanvas.scrollLeft;
            sidebarList.scrollTop = gridCanvas.scrollTop;
        });
    }

    // ------------------------------------------------------------------------
    // 4. DATA FETCHING (project_tasks + task_assignments = real-time vs Schedule/Projects)
    // ------------------------------------------------------------------------
    async function loadTalentData() {
        console.log("Loading Talent Matrix Data...");
        
        let { data: internalProj } = await supabase.from('projects').select('id').eq('name', 'Shop Infrastructure').single();
        if (!internalProj) {
            const { data: newProj } = await supabase.from('projects').insert({ name: 'Shop Infrastructure', status: 'Internal', project_value: 0 }).select().single();
            state.internalProjectID = newProj?.id;
        } else {
            state.internalProjectID = internalProj.id;
        }

        const [talentRes, tradeRes, skillRes, availRes, assignRes, activeRes] = await Promise.all([
            supabase.from('shop_talent').select('*').eq('active', true).order('name'),
            supabase.from('shop_trades').select('*').order('name'),
            supabase.from('talent_skills').select('*'),
            supabase.from('talent_availability').select('*'),
            supabase.from('task_assignments').select(`*, project_tasks (id, name, trade_id, estimated_hours, projects(name))`),
            supabase.from('project_tasks').select('*, projects(name), shop_trades(name)').neq('status', 'Completed') 
        ]);

        state.talent = talentRes.data || [];
        state.trades = tradeRes.data || [];
        state.skills = skillRes.data || [];
        state.availability = availRes.data || [];
        state.assignments = assignRes.data || [];
        state.activeTasks = activeRes.data || [];

        state.lastLoadedAt = Date.now();
        hideStalenessBanner();
        recalcStagingLane(); 
        populateFilterDropdown();
        renderMatrix();
    }

    function recalcStagingLane() {
        const tasksSource = state.filterProjectId
            ? state.activeTasks.filter(t => t.project_id == state.filterProjectId)
            : state.activeTasks;
        state.unassignedTasks = tasksSource.filter(task => {
            const daysBooked = state.assignments.filter(a => a.task_id === task.id).length;
            const hoursBooked = daysBooked * 8;
            const remaining = (task.estimated_hours || 0) - hoursBooked;

            task.remaining_hours = remaining > 0 ? remaining : 0;
            task.hours_booked = hoursBooked;

            return remaining > 0;
        }).sort((a, b) => dayjs(a.start_date).diff(dayjs(b.start_date)));

        renderStagingLane();
    }

    function populateFilterDropdown() {
        const sel = document.getElementById('trade-filter');
        if(!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">ALL FUNCTIONS</option>';
        state.trades.forEach(trade => {
            sel.innerHTML += `<option value="${trade.id}">${trade.name.toUpperCase()}</option>`;
        });
        if(currentVal) sel.value = currentVal;
    }

    // ------------------------------------------------------------------------
    // 5. RENDER STAGING LANE
    // ------------------------------------------------------------------------
    function renderStagingLane() {
        const list = document.getElementById('unassigned-pool-list');
        const count = document.getElementById('pool-count');
        const filterChip = document.getElementById('staging-project-filter-chip');
        if (!list) return;

        list.innerHTML = '';
        count.textContent = `${state.unassignedTasks.length} Pending`;

        if (filterChip) {
            if (state.filterProjectId && state.filterProjectName) {
                filterChip.style.display = 'flex';
                filterChip.innerHTML = `<span class="talent-filter-label">Showing:</span> <span class="talent-filter-value">${state.filterProjectName}</span> <a href="talent.html" id="staging-clear-filter" class="talent-filter-clear-link">Clear</a>`;
                const clearBtn = document.getElementById('staging-clear-filter');
                if (clearBtn) clearBtn.addEventListener('click', (e) => { e.preventDefault(); state.filterProjectId = null; state.filterProjectName = null; history.replaceState({}, '', 'talent.html'); recalcStagingLane(); renderMatrix(); });
            } else {
                filterChip.style.display = 'none';
                filterChip.innerHTML = '';
            }
        }

        state.unassignedTasks.forEach(task => {
            const card = document.createElement('div');
            card.className = 'pool-card';
            card.draggable = true;

            const color = getTradeColor(task.trade_id);
            card.style.borderTopColor = color;

            const total = task.estimated_hours || 8;
            const booked = task.hours_booked || 0;
            const remaining = task.remaining_hours;
            const percent = Math.min((booked / total) * 100, 100);
            const s = dayjs(task.start_date).format('MMM D');
            const projectId = task.project_id;
            const scheduleUrl = projectId ? `schedule.html?project_id=${projectId}` : 'schedule.html';
            const projectsUrl = projectId ? `projects.html` : 'projects.html';

            card.innerHTML = `
                <div>
                    <div class="talent-pool-card-header">
                        <span class="talent-pool-trade" style="color:${color};">
                            ${task.shop_trades?.name || 'Task'}
                        </span>
                        <span class="talent-pool-hours-pill">
                            ${booked} / ${total} hrs
                        </span>
                    </div>
                    <div class="talent-pool-task-name">${task.name}</div>
                    <div class="talent-pool-project-name">${task.projects?.name}</div>
                </div>
                <div class="talent-pool-footer">
                    <div class="talent-pool-progress-wrap">
                        <div style="width:${percent}%; height:100%; background:${color};"></div>
                    </div>
                    <div class="talent-pool-meta-row">
                        <span class="talent-pool-date"><i class="far fa-calendar"></i> ${s}</span>
                        <span class="talent-pool-remaining" style="color:${color};">${remaining}h left</span>
                        <a href="${scheduleUrl}" class="staging-link talent-pool-schedule-link" title="View on Schedule" onclick="event.stopPropagation();">Schedule</a>
                    </div>
                </div>
            `;
            card.addEventListener('dragstart', (e) => handleDragStart(e, task, { mode: 'copy' }));
            card.addEventListener('dragend', handleDragEnd);
            list.appendChild(card);
        });
    }

    // ------------------------------------------------------------------------
    // 6. RENDER MATRIX (HORIZONTAL TIME BLOCKS)
    // ------------------------------------------------------------------------
    function renderMatrix() {
        let visibleTalent = state.talent;
        if (state.filterTradeId) {
            const skilledTalentIds = state.skills.filter(s => s.trade_id === state.filterTradeId).map(s => s.talent_id);
            visibleTalent = state.talent.filter(t => skilledTalentIds.includes(t.id));
        }

        const endViewDate = state.viewDate.add(state.daysToShow - 1, 'day');
        document.getElementById('current-week-label').textContent = `${state.viewDate.format('MMM D')} - ${endViewDate.format('MMM D')}`;

        const containerEl = document.getElementById('matrix-grid-canvas');
        const containerHeight = containerEl ? containerEl.clientHeight : 600;
        const totalRows = visibleTalent.length || 1;
        let calculatedHeight = Math.floor((containerHeight - 20) / totalRows); 
        if (calculatedHeight < 60) calculatedHeight = 60; 
        const rowHeightStyle = `${calculatedHeight}px`;

        const dateHeaderEl = document.getElementById('matrix-date-header');
        let headerHtml = '';
        const colWidth = 140; // Wider columns for horizontal stacking

        for(let i = 0; i < state.daysToShow; i++) {
            const d = state.viewDate.add(i, 'day');
            const dateStr = d.format('YYYY-MM-DD');
            const isWeekend = d.day() === 0 || d.day() === 6;
            const isToday = d.isSame(dayjs(), 'day');

            // Find Booked Hours based on chip size logic
            // Assuming 1 chip = min(est_hours, 8)
            let bookedHours = 0;
            state.assignments.forEach(a => {
                if (a.assigned_date === dateStr) {
                    const t = state.activeTasks.find(task => task.id === a.task_id);
                    if(t) bookedHours += Math.min(t.estimated_hours || 8, 8);
                }
            });

            // This is "Total Shop Load" for that day across ALL visible people
            // But we want "Load vs Capacity" for the header
            // Let's sum up individual capacities
            const visibleIds = visibleTalent.map(t => t.id);
            const ptoCount = state.availability.filter(a => a.date === dateStr && a.status === 'PTO' && visibleIds.includes(a.talent_id)).length;
            const totalCapacityHours = (visibleTalent.length - ptoCount) * 8;
            
            // Filter bookings to ONLY visible people
            const visibleBookings = state.assignments.filter(a => a.assigned_date === dateStr && visibleIds.includes(a.talent_id));
            let visibleLoadHours = 0;
            visibleBookings.forEach(a => {
                const t = a.project_tasks || state.activeTasks.find(task => task.id === a.task_id);
                if(t) visibleLoadHours += Math.min(t.estimated_hours || 8, 8);
            });

            const metricClass = visibleLoadHours > totalCapacityHours
                ? 'talent-header-metric-over'
                : (visibleLoadHours > 0 && visibleLoadHours >= totalCapacityHours * 0.9 ? 'talent-header-metric-warn' : (visibleLoadHours > 0 ? 'talent-header-metric-good' : ''));

            headerHtml += `
                <div class="talent-header-cell ${isWeekend ? 'talent-header-weekend' : ''} ${isToday ? 'talent-header-today' : ''}" style="min-width:${colWidth}px; width:${colWidth}px;">
                    <div class="talent-header-day ${isToday ? 'talent-header-day-today' : ''}">${d.format('DD')}</div>
                    <div class="talent-header-weekday">${d.format('ddd')}</div>
                    <div class="talent-header-metric ${metricClass}">
                        ${visibleLoadHours}h / ${totalCapacityHours}h
                    </div>
                </div>`;
        }
        dateHeaderEl.innerHTML = headerHtml;

        const resList = document.getElementById('matrix-resource-list');
        const gridCanvas = document.getElementById('matrix-grid-canvas');
        resList.innerHTML = '';
        gridCanvas.innerHTML = '';

        visibleTalent.forEach((person) => {
            const rowBg = 'rgba(255,255,255,0.02)';
            const sidebarItem = document.createElement('div');
            sidebarItem.className = 'talent-row-item'; 
            sidebarItem.dataset.talentId = person.id;
            sidebarItem.style.height = rowHeightStyle;
            sidebarItem.style.backgroundColor = rowBg;
            sidebarItem.style.display = 'flex';
            sidebarItem.style.alignItems = 'center';
            sidebarItem.style.padding = '0 15px';
            sidebarItem.style.borderBottom = '1px solid var(--border-color)';
            sidebarItem.style.transition = 'opacity 0.2s';
            
            const personSkills = state.skills.filter(s => s.talent_id === person.id).map(s => {
                const t = state.trades.find(tr => tr.id === s.trade_id); return t ? t.name : '';
            }).join(', ');

            sidebarItem.innerHTML = `
                <div class="talent-avatar-pill">${getInitials(person.name)}</div>
                <div class="talent-person-meta">
                    <div class="talent-name-clickable talent-name-strong">${person.name}</div>
                    <div class="talent-skills-summary">${personSkills || 'No Skills'}</div>
                </div>`;
            sidebarItem.querySelector('.talent-name-clickable').addEventListener('click', () => openSkillsModal(person));
            resList.appendChild(sidebarItem);

            const gridRow = document.createElement('div');
            gridRow.className = 'matrix-grid-row';
            gridRow.dataset.talentId = person.id;
            gridRow.style.height = rowHeightStyle;
            gridRow.style.backgroundColor = rowBg;
            gridRow.style.borderBottom = '1px solid var(--border-color)';
            gridRow.style.transition = 'opacity 0.2s, background 0.2s';

            for(let i = 0; i < state.daysToShow; i++) {
                const d = state.viewDate.add(i, 'day');
                const dateStr = d.format('YYYY-MM-DD');
                const isWeekend = d.day() === 0 || d.day() === 6;

                const avail = state.availability.find(a => a.talent_id === person.id && a.date === dateStr);
                let dailyAssignments = state.assignments.filter(a => a.talent_id === person.id && a.assigned_date === dateStr);
                if (state.filterProjectId) {
                    dailyAssignments = dailyAssignments.filter(a => {
                        const t = state.activeTasks.find(task => task.id === a.task_id);
                        return t && t.project_id == state.filterProjectId;
                    });
                }

                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.date = dateStr;
                cell.dataset.talentId = person.id;
                
                cell.style.minWidth = `${colWidth}px`;
                cell.style.width = `${colWidth}px`;
                cell.style.height = '100%';
                cell.style.borderRight = '1px solid var(--border-color)';
                cell.style.cursor = 'pointer';
                cell.style.display = 'flex';
                cell.style.flexDirection = 'row'; // HORIZONTAL STACKING
                cell.style.alignItems = 'center'; // Center vertically
                cell.style.padding = '4px'; 
                cell.style.gap = '2px';
                cell.style.transition = 'background 0.2s';
                
                if (isWeekend) cell.style.backgroundColor = 'rgba(255, 50, 50, 0.08)';

                if (avail && avail.status === 'PTO') {
                    cell.style.background = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.02) 10px, rgba(255,255,255,0.02) 20px)';
                    cell.style.justifyContent = 'center';
                    cell.innerHTML = '<i class="fas fa-plane talent-pto-icon"></i>';
                } else if (dailyAssignments.length > 0) {
                    
                    // Render Chips horizontally based on hours
                    dailyAssignments.forEach(assign => {
                        const task = assign.project_tasks;
                        const tradeColor = getTradeColor(task.trade_id);
                        
                        // Calculate width based on hours (Cap at 8)
                        const hours = Math.min(task.estimated_hours || 8, 8);
                        const widthPercent = (hours / 8) * 100;

                        const chip = document.createElement('div');
                        chip.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                        chip.style.borderLeft = `3px solid ${tradeColor}`;
                        chip.style.color = 'white';
                        chip.style.fontSize = '0.65rem';
                        chip.style.height = '80%'; // Takes up most of the row height
                        chip.style.width = `${widthPercent}%`; // Proportional Width
                        chip.style.flexShrink = '0'; // Don't shrink below width
                        chip.style.borderRadius = '2px';
                        chip.style.overflow = 'hidden';
                        chip.style.display = 'flex';
                        chip.style.flexDirection = 'column';
                        chip.style.justifyContent = 'center';
                        chip.style.padding = '0 4px';
                        chip.style.cursor = 'grab';
                        chip.draggable = true;
                        
                        // Inner Content
                        chip.innerHTML = `
                            <div class="talent-chip-hours" style="color:${tradeColor};">${hours}h</div>
                            <div class="talent-chip-name">${task.name}</div>
                        `;
                        chip.title = `${task.projects?.name} - ${task.name} (${hours} hrs)`;
                        chip.addEventListener('dragstart', (e) => handleDragStart(e, task, {
                            mode: 'move',
                            sourceTalentId: person.id,
                            sourceDate: dateStr
                        }));
                        chip.addEventListener('click', (e) => {
                            e.stopPropagation();
                            openAssignedChipDetailModal(person, dateStr, assign, avail);
                        });
                        chip.addEventListener('dragend', handleDragEnd);
                        
                        cell.appendChild(chip);
                    });
                }

                cell.addEventListener('mouseenter', () => { if(dailyAssignments.length === 0 && !avail) cell.style.backgroundColor = 'var(--bg-medium)'; });
                cell.addEventListener('mouseleave', () => { if(dailyAssignments.length === 0 && !avail) cell.style.backgroundColor = isWeekend ? 'rgba(255, 50, 50, 0.08)' : 'transparent'; });
                cell.addEventListener('click', () => handleCellClick(person, dateStr, avail, dailyAssignments[0]));
                cell.addEventListener('dragover', handleDragOver);
                cell.addEventListener('dragenter', handleDragEnter);
                cell.addEventListener('dragleave', handleDragLeave);
                cell.addEventListener('drop', (e) => handleDrop(e, person, dateStr));

                gridRow.appendChild(cell);
            }
            gridCanvas.appendChild(gridRow);
        });
    }

    // ------------------------------------------------------------------------
    // 7. DRAG AND DROP (OPTIMIZED & OPTIMISTIC)
    // ------------------------------------------------------------------------
    let draggingPayload = null;

    function handleDragStart(e, task, options = {}) {
        draggingPayload = {
            task,
            mode: options.mode || 'copy',
            sourceTalentId: options.sourceTalentId ?? null,
            sourceDate: options.sourceDate ?? null
        };
        e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: task.id }));
        e.dataTransfer.effectAllowed = draggingPayload.mode === 'move' ? 'move' : 'copy';
        const matchingTalentIds = state.skills.filter(s => s.trade_id === task.trade_id).map(s => s.talent_id);
        document.querySelectorAll('.talent-row-item').forEach(item => {
            const tId = parseInt(item.dataset.talentId);
            if (matchingTalentIds.includes(tId)) item.classList.add('talent-row-highlight');
            else item.classList.add('talent-row-dimmed');
        });
    }

    function handleDragEnd(e) {
        draggingPayload = null;
        document.querySelectorAll('.talent-row-item').forEach(item => item.classList.remove('talent-row-highlight', 'talent-row-dimmed'));
        document.querySelectorAll('.grid-cell').forEach(cell => cell.classList.remove('grid-cell-droppable'));
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = draggingPayload?.mode === 'move' ? 'move' : 'copy';
    }
    function handleDragEnter(e) { e.preventDefault(); if (e.target.classList.contains('grid-cell')) e.target.classList.add('grid-cell-droppable'); }
    function handleDragLeave(e) { if (e.target.classList.contains('grid-cell')) e.target.classList.remove('grid-cell-droppable'); }

    async function handleDrop(e, person, dateStr) {
        e.preventDefault();
        e.target.classList.remove('grid-cell-droppable');
        if (!draggingPayload?.task) return;
        const { task: draggingTask, mode, sourceTalentId, sourceDate } = draggingPayload;

        // No-op for dropping moved chip into the same cell.
        if (mode === 'move' && sourceTalentId === person.id && sourceDate === dateStr) {
            draggingPayload = null;
            return;
        }

        const hasSkill = state.skills.some(s => s.talent_id === person.id && s.trade_id === draggingTask.trade_id);
        if (!hasSkill && !confirm(`${person.name} is not tagged for this trade. Assign anyway?`)) return;

        // --- OPTIMISTIC UI UPDATE START ---
        // 1. Create a fake assignment object mimicking DB structure
        const optimisticAssignment = {
            task_id: draggingTask.id,
            talent_id: person.id,
            assigned_date: dateStr,
            project_tasks: draggingTask // Nested object for renderer
        };

        // 2. Push/update local state
        if (mode === 'move' && sourceTalentId != null && sourceDate) {
            state.assignments = state.assignments.filter(a =>
                !(a.task_id === draggingTask.id && a.talent_id === sourceTalentId && a.assigned_date === sourceDate)
            );
        }
        const alreadyAssignedHere = state.assignments.some(a =>
            a.task_id === draggingTask.id && a.talent_id === person.id && a.assigned_date === dateStr
        );
        if (!alreadyAssignedHere) {
            state.assignments.push(optimisticAssignment);
        }

        // 3. Remove from pool (visually) if it was the last chunk (simple logic: just refresh pool)
        // We trigger re-renders immediately
        renderMatrix();
        recalcStagingLane(); // Updates pool visuals
        // --- OPTIMISTIC UI UPDATE END ---

        // 4. PERFORM DATABASE OPERATIONS
        let error = null;
        if (mode === 'move' && sourceTalentId != null && sourceDate) {
            const { error: deleteError } = await supabase
                .from('task_assignments')
                .delete()
                .match({ task_id: draggingTask.id, talent_id: sourceTalentId, assigned_date: sourceDate });
            if (deleteError) error = deleteError;
        }
        if (!error) {
            const { error: upsertError } = await supabase.from('task_assignments').upsert({
                task_id: draggingTask.id,
                talent_id: person.id,
                assigned_date: dateStr
            }, { onConflict: 'task_id, talent_id, assigned_date' });
            if (upsertError) error = upsertError;
        }

        if (!error) {
            await supabase.from('talent_availability').delete().match({ talent_id: person.id, date: dateStr });
            if (!draggingTask.assigned_talent_id) {
                await supabase.from('project_tasks').update({ assigned_talent_id: person.id }).eq('id', draggingTask.id);
            }
            // Background sync to ensure consistency (DB is source of truth)
            setTimeout(() => loadTalentData(), 500); 
        } else {
            console.error("Drop Error:", error);
            alert("Could not schedule task.");
            // Rollback via source-of-truth refresh.
            await loadTalentData();
        }
        draggingPayload = null;
    }

    // ------------------------------------------------------------------------
    // 8. INTERNAL TASK MODAL
    // ------------------------------------------------------------------------
    function openInternalTaskModal() {
        const tradeOptions = state.trades.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        showModal('Create Internal Task', `
            <div class="talent-modal-intro">
                Schedule maintenance, shop cleanup, or internal projects.
            </div>
            <div class="form-grid talent-modal-grid-two">
                <div><label>Category</label><select id="int-task-trade" class="form-control talent-modal-dark-select">${tradeOptions}</select></div>
                <div><label>Name</label><input type="text" id="int-task-name" class="form-control" placeholder="e.g. Machine Maintenance"></div>
                <div><label>Start Date</label><input type="date" id="int-task-start" class="form-control" value="${dayjs().format('YYYY-MM-DD')}"></div>
                <div><label>Duration (Hours)</label><input type="number" id="int-task-hours" class="form-control" value="8"></div>
            </div>
            <button id="btn-save-internal" class="btn-primary talent-modal-full-btn">Add to Schedule</button>
        `, async () => {});

        setTimeout(() => {
            const saveBtn = document.getElementById('btn-save-internal');
            if(saveBtn) saveBtn.onclick = async () => {
                const name = document.getElementById('int-task-name').value;
                const tradeId = document.getElementById('int-task-trade').value;
                const start = document.getElementById('int-task-start').value;
                const hours = parseInt(document.getElementById('int-task-hours').value) || 8;
                if (!name) return;
                await supabase.from('project_tasks').insert({
                    project_id: state.internalProjectID,
                    trade_id: tradeId,
                    name: name,
                    start_date: start,
                    end_date: start,
                    estimated_hours: hours,
                    status: 'Pending'
                });
                hideModal(); loadTalentData();
            };
        }, 100);
    }

    // ------------------------------------------------------------------------
    // 9. ASSIGNMENT MODAL & HELPERS
    // ------------------------------------------------------------------------
    function getInitials(name) { return name ? name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : 'TW'; }
    
    function openSkillsModal(person) { 
        const currentSkillIds = state.skills.filter(s => s.talent_id === person.id).map(s => s.trade_id);
        const checkboxes = state.trades.map(trade => {
            const isChecked = currentSkillIds.includes(trade.id);
            return `<div class="talent-skill-item"><input type="checkbox" id="skill-${trade.id}" value="${trade.id}" ${isChecked ? 'checked' : ''} class="talent-skill-checkbox"><label for="skill-${trade.id}" class="talent-skill-label">${trade.name}</label></div>`;
        }).join('');
        showModal(`Manage Skills: ${person.name}`, `<div class="talent-modal-intro talent-modal-intro-lg">Select capabilities.</div><div id="skills-checklist-container" class="talent-skills-grid">${checkboxes}</div>`, async () => {
            const container = document.getElementById('skills-checklist-container');
            const selectedTradeIds = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));
            await supabase.from('talent_skills').delete().eq('talent_id', person.id);
            if(selectedTradeIds.length > 0) await supabase.from('talent_skills').insert(selectedTradeIds.map(tid => ({ talent_id: person.id, trade_id: tid })));
            loadTalentData(); return true; 
        });
    }

    function handleCellClick(person, dateStr, avail, currentAssignment) {
        const d = dayjs(dateStr);
        const viableTasks = state.activeTasks.filter(t => {
            const active = (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)));
            if(state.filterTradeId) return active && t.trade_id === state.filterTradeId;
            return active;
        });
        const currentTask = currentAssignment
            ? (currentAssignment.project_tasks || state.activeTasks.find(t => t.id === currentAssignment.task_id))
            : null;
        const mergedTasks = [...viableTasks];
        if (currentTask && !mergedTasks.some(t => t.id === currentTask.id)) {
            mergedTasks.unshift(currentTask);
        }
        const assignedTaskId = currentAssignment ? currentAssignment.task_id : '';
        const taskOptions = mergedTasks.map(t => `<option value="${t.id}" ${assignedTaskId == t.id ? 'selected' : ''}>${t.projects?.name || 'Project'} - ${t.name}</option>`).join('');
        const isPTO = avail && avail.status === 'PTO';

        showModal(`Schedule: ${person.name}`, `
            <div class="talent-schedule-modal-header"><h4 class="talent-schedule-modal-date">${dayjs(dateStr).format('dddd, MMM D, YYYY')}</h4></div>
            <div class="talent-schedule-modal-grid">
                <div class="talent-schedule-panel">
                    <label class="talent-schedule-label">Assign Task (Range)</label>
                    <div class="talent-schedule-range-row"><input type="date" id="assign-start" class="form-control talent-modal-flex-input" value="${dateStr}"><input type="date" id="assign-end" class="form-control talent-modal-flex-input" value="${dateStr}"></div>
                    ${mergedTasks.length > 0 ? `<select id="assign-task-select" class="form-control talent-modal-dark-select talent-schedule-select"><option value="">-- No Assignment --</option>${taskOptions}</select><button id="btn-save-assign" class="btn-primary talent-modal-full-btn">Save Allocation</button>` : `<div class="talent-modal-empty">No tasks found.</div>`}
                </div>
                <div class="talent-schedule-panel">
                    <label class="talent-schedule-label">PTO Range</label>
                    <div class="talent-schedule-range-row"><input type="date" id="pto-start-date" class="form-control talent-modal-flex-input" value="${dateStr}"><input type="date" id="pto-end-date" class="form-control talent-modal-flex-input" value="${dateStr}"></div>
                    <div class="talent-schedule-toggle-row"><button id="btn-mark-avail" class="talent-schedule-toggle-btn ${!isPTO ? 'talent-schedule-toggle-avail' : ''}">Clear</button><button id="btn-mark-pto" class="talent-schedule-toggle-btn ${isPTO ? 'talent-schedule-toggle-pto' : ''}">Mark PTO</button></div>
                </div>
            </div>
        `, async () => {});

        setTimeout(() => {
            const assignBtn = document.getElementById('btn-save-assign');
            const ptoBtn = document.getElementById('btn-mark-pto');
            const availBtn = document.getElementById('btn-mark-avail');

            if(assignBtn) assignBtn.onclick = async () => {
                const taskId = document.getElementById('assign-task-select').value;
                const start = dayjs(document.getElementById('assign-start').value);
                const end = dayjs(document.getElementById('assign-end').value);
                const diff = end.diff(start, 'day');
                await supabase.from('task_assignments').delete().eq('talent_id', person.id).gte('assigned_date', start.format('YYYY-MM-DD')).lte('assigned_date', end.format('YYYY-MM-DD'));
                if (taskId) {
                    const inserts = [];
                    for(let i=0; i<=diff; i++) {
                        const day = start.add(i, 'day');
                        if(day.day() !== 0 && day.day() !== 6) inserts.push({ task_id: parseInt(taskId), talent_id: person.id, assigned_date: day.format('YYYY-MM-DD') });
                    }
                    if(inserts.length > 0) {
                        await supabase.from('task_assignments').insert(inserts);
                        await supabase.from('talent_availability').delete().eq('talent_id', person.id).gte('date', start.format('YYYY-MM-DD')).lte('date', end.format('YYYY-MM-DD'));
                    }
                }
                hideModal(); loadTalentData();
            };

            if(ptoBtn) ptoBtn.onclick = async () => {
                const start = dayjs(document.getElementById('pto-start-date').value);
                const end = dayjs(document.getElementById('pto-end-date').value);
                const diff = end.diff(start, 'day');
                const upsertData = [];
                for(let i=0; i<=diff; i++) upsertData.push({ talent_id: person.id, date: start.add(i, 'day').format('YYYY-MM-DD'), status: 'PTO' });
                await supabase.from('talent_availability').upsert(upsertData, { onConflict: 'talent_id, date' });
                await supabase.from('task_assignments').delete().eq('talent_id', person.id).gte('assigned_date', start.format('YYYY-MM-DD')).lte('assigned_date', end.format('YYYY-MM-DD'));
                hideModal(); loadTalentData();
            };

            if(availBtn) availBtn.onclick = async () => {
                await supabase.from('talent_availability').delete().eq('talent_id', person.id).gte('date', document.getElementById('pto-start-date').value).lte('date', document.getElementById('pto-end-date').value);
                hideModal(); loadTalentData();
            };
        }, 100);
    }

    function openAssignedChipDetailModal(person, dateStr, assignment, avail) {
        const task = assignment?.project_tasks || state.activeTasks.find(t => t.id === assignment?.task_id);
        if (!task) {
            handleCellClick(person, dateStr, avail, assignment);
            return;
        }
        const projectName = task.projects?.name || 'Project';
        const scheduleUrl = task.project_id ? `schedule.html?project_id=${task.project_id}` : 'schedule.html';
        const projectsUrl = task.project_id ? 'projects.html' : 'projects.html';
        const startLabel = task.start_date ? dayjs(task.start_date).format('MMM D, YYYY') : '—';
        const endLabel = task.end_date ? dayjs(task.end_date).format('MMM D, YYYY') : '—';
        const assignedLabel = dayjs(dateStr).format('ddd, MMM D, YYYY');
        showModal(`Assignment: ${person.name}`, `
            <div class="talent-modal-intro talent-modal-intro-lg">Assigned task details</div>
            <div class="talent-schedule-panel" style="margin-bottom:12px;">
                <label class="talent-schedule-label">Project</label>
                <div>${projectName}</div>
                <label class="talent-schedule-label" style="margin-top:10px;">Task</label>
                <div>${task.name}</div>
                <label class="talent-schedule-label" style="margin-top:10px;">Assigned day</label>
                <div>${assignedLabel}</div>
                <label class="talent-schedule-label" style="margin-top:10px;">Task window</label>
                <div>${startLabel} to ${endLabel}</div>
                <label class="talent-schedule-label" style="margin-top:10px;">Estimated hours</label>
                <div>${task.estimated_hours ?? 0}h</div>
            </div>
            <div class="talent-schedule-toggle-row">
                <a href="${scheduleUrl}" class="btn-secondary talent-modal-flex-input" style="text-align:center; text-decoration:none;">Open in Schedule</a>
                <a href="${projectsUrl}" class="btn-secondary talent-modal-flex-input" style="text-align:center; text-decoration:none;">Open in Projects</a>
            </div>
            <div class="talent-schedule-toggle-row" style="margin-top:8px;">
                <button id="btn-edit-chip-assign" class="btn-primary talent-modal-flex-input">Edit Assignment</button>
                <button id="btn-remove-chip-assign" class="btn-secondary talent-modal-flex-input">Remove This Day</button>
            </div>
        `, async () => {});

        setTimeout(() => {
            document.getElementById('btn-edit-chip-assign')?.addEventListener('click', () => {
                hideModal();
                handleCellClick(person, dateStr, avail, assignment);
            });
            document.getElementById('btn-remove-chip-assign')?.addEventListener('click', async () => {
                await supabase.from('task_assignments').delete().match({
                    task_id: assignment.task_id,
                    talent_id: person.id,
                    assigned_date: dateStr
                });
                hideModal();
                loadTalentData();
            });
        }, 50);
    }

    function openCapacityReportModal() {
        const viewStart = state.viewDate.startOf('week');
        const weeks = [];
        for (let i = 0; i < 5; i++) {
            const weekStart = viewStart.add(i * 7, 'day');
            weeks.push({ start: weekStart.format('YYYY-MM-DD'), label: 'Week of ' + weekStart.format('MMM D') });
        }
        const capacityByPerson = {};
        state.talent.forEach(p => {
            capacityByPerson[p.id] = Number(p.hours_per_week) || DEFAULT_HOURS_PER_WEEK;
        });
        const loadByPersonWeek = {};
        state.assignments.forEach(a => {
            const parsedHours = Number(a.hours);
            const hrs = Number.isFinite(parsedHours) && parsedHours >= 0 ? parsedHours : 0;
            const d = dayjs(a.assigned_date);
            const weekKey = d.startOf('week').format('YYYY-MM-DD');
            const key = `${a.talent_id}|${weekKey}`;
            loadByPersonWeek[key] = (loadByPersonWeek[key] || 0) + hrs;
        });
        const rows = [];
        let overloadCount = 0;
        state.talent.forEach(p => {
            const cap = capacityByPerson[p.id] || DEFAULT_HOURS_PER_WEEK;
            weeks.forEach(w => {
                const key = `${p.id}|${w.start}`;
                const booked = loadByPersonWeek[key] || 0;
                const pct = cap > 0 ? Math.round((booked / cap) * 100) : 0;
                const over = booked > cap;
                if (over) overloadCount++;
                rows.push({ name: p.name, weekLabel: w.label, booked, cap, pct, over });
            });
        });
        const overloadPeople = new Set(rows.filter(r => r.over).map(r => r.name)).size;
        const tableRows = rows.map(r =>
            `<tr class="${r.over ? 'talent-capacity-row-over' : ''}">
                <td>${r.name}</td><td>${r.weekLabel}</td><td>${r.booked}h</td><td>${r.cap}h</td>
                <td class="${r.over ? 'talent-capacity-pct-over' : ''}">${r.pct}%</td>
                <td>${r.over ? '<span class="talent-capacity-over-text">Over</span>' : '—'}</td>
            </tr>`
        ).join('');
        showModal('Capacity report (visible range)', `
            <p class="talent-capacity-intro">Booked vs capacity by person and week. Capacity = ${DEFAULT_HOURS_PER_WEEK}h/week default (or <code>hours_per_week</code> on talent).</p>
            ${overloadPeople > 0 ? `<p class="talent-capacity-over-summary">${overloadPeople} person(s) over capacity in this range.</p>` : ''}
            <div class="talent-capacity-table-wrap">
                <table class="bom-table talent-capacity-table">
                    <thead><tr><th>Person</th><th>Week of</th><th>Booked</th><th>Capacity</th><th>%</th><th>Status</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        `, () => {});
    }

    await loadTalentData();

    const params = new URLSearchParams(window.location.search);
    const projectIdParam = params.get('project_id');
    if (projectIdParam) {
        const id = parseInt(projectIdParam, 10) || projectIdParam;
        state.filterProjectId = id;
        const first = state.activeTasks.find(t => t.project_id == id);
        state.filterProjectName = first?.projects?.name || 'Project';
        history.replaceState({}, '', 'talent.html');
        recalcStagingLane();
        renderMatrix();
    }
        } finally {
            hideGlobalLoader();
        }
    }); // runWhenNavReady
});
