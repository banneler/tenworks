import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs,
    setupGlobalSearch
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

document.addEventListener("DOMContentLoaded", async () => {
    // ------------------------------------------------------------------------
    // 1. INITIALIZATION & AUTH
    // ------------------------------------------------------------------------
    await loadSVGs(); 
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    await setupUserMenuAndAuth(supabase, { currentUser: user });
    await setupGlobalSearch(supabase, user);

    // ------------------------------------------------------------------------
    // 2. GLOBAL STATE
    // ------------------------------------------------------------------------
    let state = {
        talent: [],         
        trades: [],         
        skills: [],         
        availability: [],   
        assignments: [],    
        activeTasks: [],    
        unassignedTasks: [], 
        internalProjectID: null, 
        viewDate: dayjs(),  
        daysToShow: 30,
        filterTradeId: null 
    };

    const TRADE_COLORS = { 1: '#546E7A', 2: '#1E88E5', 3: '#D4AF37', 4: '#8D6E63', 5: '#66BB6A', 6: '#7E57C2' };
    function getTradeColor(id) { return TRADE_COLORS[id] || 'var(--primary-gold)'; }

    // ------------------------------------------------------------------------
    // 3. LISTENERS & SYNC
    // ------------------------------------------------------------------------
    const prevBtn = document.getElementById('prev-week-btn');
    const nextBtn = document.getElementById('next-week-btn');
    const filterEl = document.getElementById('trade-filter');
    const internalBtn = document.getElementById('btn-internal-task');

    if (prevBtn) prevBtn.addEventListener('click', () => { state.viewDate = state.viewDate.subtract(7, 'day'); renderMatrix(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { state.viewDate = state.viewDate.add(7, 'day'); renderMatrix(); });
    if (filterEl) filterEl.addEventListener('change', (e) => { state.filterTradeId = e.target.value ? parseInt(e.target.value) : null; renderMatrix(); });
    if (internalBtn) internalBtn.addEventListener('click', openInternalTaskModal);

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
    // 4. DATA FETCHING (BURN DOWN LOGIC)
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

        recalcStagingLane(); // Separated for re-use in optimistic UI
        populateFilterDropdown();
        renderMatrix();
    }

    function recalcStagingLane() {
        state.unassignedTasks = state.activeTasks.filter(task => {
            const daysBooked = state.assignments.filter(a => a.task_id === task.id).length;
            const hoursBooked = daysBooked * 8; 
            const remaining = (task.estimated_hours || 0) - hoursBooked;
            
            task.remaining_hours = remaining > 0 ? remaining : 0;
            task.hours_booked = hoursBooked;

            return remaining > 0;
        }).sort((a,b) => dayjs(a.start_date).diff(dayjs(b.start_date)));
        
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
        if(!list) return;

        list.innerHTML = '';
        count.textContent = `${state.unassignedTasks.length} Pending`;

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
            
            card.innerHTML = `
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <span style="font-size:0.7rem; color:${color}; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">
                            ${task.shop_trades?.name || 'Task'}
                        </span>
                        <span style="font-size:0.65rem; color:var(--text-dim); background:rgba(255,255,255,0.1); padding:2px 4px; border-radius:3px;">
                            ${booked} / ${total} hrs
                        </span>
                    </div>
                    <div style="font-weight:700; color:var(--text-bright); line-height:1.2; font-size:0.95rem;">${task.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-dim); margin-top:3px;">${task.projects?.name}</div>
                </div>
                
                <div style="margin-top:auto;">
                    <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; margin-bottom:8px;">
                        <div style="width:${percent}%; height:100%; background:${color};"></div>
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-bright); display:flex; justify-content:space-between; border-top:1px solid rgba(255,255,255,0.1); padding-top:5px;">
                        <span><i class="far fa-calendar"></i> ${s}</span>
                        <span style="color:${color}; font-weight:bold;">${remaining}h left</span>
                    </div>
                </div>
            `;

            card.addEventListener('dragstart', (e) => handleDragStart(e, task));
            card.addEventListener('dragend', handleDragEnd);

            list.appendChild(card);
        });
    }

    // ------------------------------------------------------------------------
    // 6. RENDER MATRIX (SEGMENTED DAY CHIPS)
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
        if (calculatedHeight < 60) calculatedHeight = 60; // Slightly taller for stacked chips
        const rowHeightStyle = `${calculatedHeight}px`;

        // HEADER
        const dateHeaderEl = document.getElementById('matrix-date-header');
        let headerHtml = '';
        const colWidth = 120; 

        for(let i = 0; i < state.daysToShow; i++) {
            const d = state.viewDate.add(i, 'day');
            const dateStr = d.format('YYYY-MM-DD');
            const isWeekend = d.day() === 0 || d.day() === 6;
            const isToday = d.isSame(dayjs(), 'day');

            const bookings = state.assignments.filter(a => a.assigned_date === dateStr).length;
            const visibleIds = visibleTalent.map(t => t.id);
            const ptoCount = state.availability.filter(a => a.date === dateStr && a.status === 'PTO' && visibleIds.includes(a.talent_id)).length;
            const capacity = visibleTalent.length - ptoCount;

            let metricColor = 'var(--text-dim)';
            if (bookings > capacity) metricColor = '#ff4444'; 
            else if (bookings === capacity && capacity > 0) metricColor = 'var(--warning-yellow)'; 
            else if (bookings < capacity) metricColor = '#4CAF50';

            const bgStyle = isWeekend ? 'background:rgba(255, 50, 50, 0.08);' : '';
            const borderStyle = isToday ? 'border-bottom: 2px solid var(--primary-gold);' : '';
            const textColor = isToday ? 'color:var(--primary-gold);' : 'color:var(--text-bright);';

            headerHtml += `
                <div style="min-width:${colWidth}px; width:${colWidth}px; border-right:1px solid var(--border-color); padding:10px; text-align:center; display:flex; flex-direction:column; justify-content:center; ${bgStyle} ${borderStyle}">
                    <div style="font-size:1.4rem; font-family:'Rajdhani', sans-serif; font-weight:700; ${textColor}">${d.format('DD')}</div>
                    <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-dim); letter-spacing:1px;">${d.format('ddd')}</div>
                    <div style="font-size:0.65rem; color:${metricColor}; font-weight:bold; margin-top:5px; background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:4px;">
                        BOOKED: ${bookings} / ${capacity}
                    </div>
                </div>`;
        }
        dateHeaderEl.innerHTML = headerHtml;

        // GRID
        const resList = document.getElementById('matrix-resource-list');
        const gridCanvas = document.getElementById('matrix-grid-canvas');
        resList.innerHTML = '';
        gridCanvas.innerHTML = '';

        visibleTalent.forEach((person) => {
            const rowBg = 'rgba(255,255,255,0.02)';
            
            // SIDEBAR
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
                <div style="width:30px; height:30px; min-width:30px; background:var(--bg-medium); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold; margin-right:10px; border:1px solid var(--border-color);">${getInitials(person.name)}</div>
                <div style="overflow:hidden; width:100%;">
                    <div class="talent-name-clickable" style="font-weight:600; font-size:0.9rem; color:var(--text-bright); white-space:nowrap; cursor:pointer;">${person.name}</div>
                    <div style="font-size:0.7rem; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${personSkills || 'No Skills'}</div>
                </div>`;
            sidebarItem.querySelector('.talent-name-clickable').addEventListener('click', () => openSkillsModal(person));
            resList.appendChild(sidebarItem);

            // GRID ROW
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
                
                // --- SEGMENTED LOGIC: Find ALL assignments for this day ---
                const dailyAssignments = state.assignments.filter(a => a.talent_id === person.id && a.assigned_date === dateStr);

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
                cell.style.flexDirection = 'column'; // Vertical Stacking
                cell.style.padding = '2px'; // Gap for chips
                cell.style.gap = '2px';
                cell.style.transition = 'background 0.2s';
                
                if (isWeekend) cell.style.backgroundColor = 'rgba(255, 50, 50, 0.08)';

                if (avail && avail.status === 'PTO') {
                    // PTO takes over whole cell
                    cell.style.background = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.02) 10px, rgba(255,255,255,0.02) 20px)';
                    cell.style.alignItems = 'center';
                    cell.style.justifyContent = 'center';
                    cell.innerHTML = '<i class="fas fa-plane" style="color:var(--text-dim);"></i>';
                } else if (dailyAssignments.length > 0) {
                    // RENDER CHIPS
                    dailyAssignments.forEach(assign => {
                        const task = assign.project_tasks;
                        const tradeColor = getTradeColor(task.trade_id);
                        
                        const chip = document.createElement('div');
                        chip.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                        chip.style.borderLeft = `3px solid ${tradeColor}`;
                        chip.style.color = 'white';
                        chip.style.fontSize = '0.65rem';
                        chip.style.padding = '2px 4px';
                        chip.style.borderRadius = '0 2px 2px 0';
                        chip.style.whiteSpace = 'nowrap';
                        chip.style.overflow = 'hidden';
                        chip.style.textOverflow = 'ellipsis';
                        chip.style.flex = '1'; // Share height equally
                        chip.innerText = task.name;
                        chip.title = `${task.projects?.name} - ${task.name}`;
                        
                        cell.appendChild(chip);
                    });
                }

                // Interactions
                cell.addEventListener('mouseenter', () => { if(dailyAssignments.length === 0 && !avail) cell.style.backgroundColor = 'var(--bg-medium)'; });
                cell.addEventListener('mouseleave', () => { if(dailyAssignments.length === 0 && !avail) cell.style.backgroundColor = isWeekend ? 'rgba(255, 50, 50, 0.08)' : 'transparent'; });
                // Pass the FIRST assignment for modal context, or null
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
    // 7. DRAG AND DROP (OPTIMISTIC UI UPDATE)
    // ------------------------------------------------------------------------
    let draggingTask = null;

    function handleDragStart(e, task) {
        draggingTask = task;
        e.dataTransfer.setData('text/plain', JSON.stringify(task));
        e.dataTransfer.effectAllowed = 'copy';
        
        const matchingTalentIds = state.skills.filter(s => s.trade_id === task.trade_id).map(s => s.talent_id);
        document.querySelectorAll('.talent-row-item').forEach(item => {
            const tId = parseInt(item.dataset.talentId);
            if (matchingTalentIds.includes(tId)) item.classList.add('talent-row-highlight');
            else item.classList.add('talent-row-dimmed');
        });
    }

    function handleDragEnd(e) {
        draggingTask = null;
        document.querySelectorAll('.talent-row-item').forEach(item => item.classList.remove('talent-row-highlight', 'talent-row-dimmed'));
        document.querySelectorAll('.grid-cell').forEach(cell => cell.classList.remove('grid-cell-droppable'));
    }

    function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    function handleDragEnter(e) { e.preventDefault(); if (e.target.classList.contains('grid-cell')) e.target.classList.add('grid-cell-droppable'); }
    function handleDragLeave(e) { if (e.target.classList.contains('grid-cell')) e.target.classList.remove('grid-cell-droppable'); }

    async function handleDrop(e, person, dateStr) {
        e.preventDefault();
        e.target.classList.remove('grid-cell-droppable');
        if (!draggingTask) return;

        const hasSkill = state.skills.some(s => s.talent_id === person.id && s.trade_id === draggingTask.trade_id);
        if (!hasSkill && !confirm(`${person.name} is not tagged for this trade. Assign anyway?`)) return;

        // 1. DATABASE WRITE
        const { error } = await supabase.from('task_assignments').upsert({
            task_id: draggingTask.id,
            talent_id: person.id,
            assigned_date: dateStr
        }, { onConflict: 'task_id, talent_id, assigned_date' });

        if (!error) {
            // 2. OPTIMISTIC UPDATE (INSTANT VISUALS)
            // Push to local state immediately
            state.assignments.push({
                task_id: draggingTask.id,
                talent_id: person.id,
                assigned_date: dateStr,
                project_tasks: draggingTask // Attach metadata for renderer
            });

            // Update local pool logic
            // Note: This is purely visual until the background reload confirms it
            recalcStagingLane(); // Updates bottom pool
            renderMatrix(); // Updates grid chips

            // 3. CLEANUP & SYNC
            await supabase.from('talent_availability').delete().match({ talent_id: person.id, date: dateStr });
            if (!draggingTask.assigned_talent_id) {
                await supabase.from('project_tasks').update({ assigned_talent_id: person.id }).eq('id', draggingTask.id);
            }
            
            // Background reload to ensure consistency
            setTimeout(() => loadTalentData(), 500); 
        } else {
            console.error("Drop Error:", error);
            alert("Could not schedule task. It may already be assigned for this person/day.");
        }
    }

    // ------------------------------------------------------------------------
    // 8. INTERNAL TASK MODAL
    // ------------------------------------------------------------------------
    function openInternalTaskModal() {
        const tradeOptions = state.trades.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        showModal('Create Internal Task', `
            <div style="margin-bottom:15px; color:var(--text-dim); font-size:0.9rem;">
                Schedule maintenance, shop cleanup, or internal projects.
            </div>
            <div class="form-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <div><label>Category</label><select id="int-task-trade" class="form-control" style="background:var(--bg-dark); color:white; padding:8px;">${tradeOptions}</select></div>
                <div><label>Name</label><input type="text" id="int-task-name" class="form-control" placeholder="e.g. Machine Maintenance"></div>
                <div><label>Start Date</label><input type="date" id="int-task-start" class="form-control" value="${dayjs().format('YYYY-MM-DD')}"></div>
                <div><label>Duration (Hours)</label><input type="number" id="int-task-hours" class="form-control" value="8"></div>
            </div>
            <button id="btn-save-internal" class="btn-primary" style="width:100%; margin-top:20px;">Add to Schedule</button>
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
            return `<div style="display:flex; align-items:center; background:var(--bg-medium); padding:10px; border-radius:6px; border:1px solid var(--border-color);"><input type="checkbox" id="skill-${trade.id}" value="${trade.id}" ${isChecked ? 'checked' : ''} style="margin-right:10px; transform:scale(1.2);"><label for="skill-${trade.id}" style="color:var(--text-bright); cursor:pointer;">${trade.name}</label></div>`;
        }).join('');
        showModal(`Manage Skills: ${person.name}`, `<div style="margin-bottom:20px; color:var(--text-dim); font-size:0.9rem;">Select capabilities.</div><div id="skills-checklist-container" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; max-height:300px; overflow-y:auto;">${checkboxes}</div>`, async () => {
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
        const assignedTaskId = currentAssignment ? currentAssignment.task_id : '';
        const taskOptions = viableTasks.map(t => `<option value="${t.id}" ${assignedTaskId == t.id ? 'selected' : ''}>${t.projects?.name} - ${t.name}</option>`).join('');
        const isPTO = avail && avail.status === 'PTO';

        showModal(`Schedule: ${person.name}`, `
            <div style="text-align:center; margin-bottom:20px;"><h4 style="color:var(--primary-gold); font-size:1.1rem; margin-bottom:5px;">${dayjs(dateStr).format('dddd, MMM D, YYYY')}</h4></div>
            <div style="display:grid; grid-template-columns: 1fr; gap:20px;">
                <div style="background:var(--bg-dark); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                    <label style="display:block; color:var(--text-bright); margin-bottom:10px; font-weight:600;">Assign Task</label>
                    <div style="display:flex; gap:10px; margin-bottom:10px;"><input type="date" id="assign-start" class="form-control" value="${dateStr}" style="flex:1;"><input type="date" id="assign-end" class="form-control" value="${dateStr}" style="flex:1;"></div>
                    ${viableTasks.length > 0 ? `<select id="assign-task-select" class="form-control" style="width:100%; padding:10px; background:var(--bg-medium); color:white; border:1px solid var(--border-color); margin-bottom:15px;"><option value="">-- No Assignment --</option>${taskOptions}</select><button id="btn-save-assign" class="btn-primary" style="width:100%;">Save Allocation</button>` : `<div style="text-align:center; color:var(--text-dim); padding:10px;">No tasks found.</div>`}
                </div>
                <div style="background:var(--bg-dark); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                    <label style="display:block; color:var(--text-bright); margin-bottom:10px; font-weight:600;">PTO Range</label>
                    <div style="display:flex; gap:10px; margin-bottom:15px;"><input type="date" id="pto-start-date" class="form-control" value="${dateStr}" style="flex:1;"><input type="date" id="pto-end-date" class="form-control" value="${dateStr}" style="flex:1;"></div>
                    <div style="display:flex; gap:10px;"><button id="btn-mark-avail" style="flex:1; padding:10px; background:${!isPTO ? 'rgba(76,175,80,0.2)' : 'transparent'}; border:1px solid var(--border-color); color:white; border-radius:6px;">Clear</button><button id="btn-mark-pto" style="flex:1; padding:10px; background:${isPTO ? 'rgba(244,67,54,0.2)' : 'transparent'}; border:1px solid var(--border-color); color:white; border-radius:6px;">Mark PTO</button></div>
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

    loadTalentData();
});
