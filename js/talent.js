import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs 
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

document.addEventListener("DOMContentLoaded", async () => {
    // --- 1. INIT & AUTH ---
    await loadSVGs(); // Should now populate #sidebar-logo-container if SVG logic matches
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    await setupUserMenuAndAuth(supabase, { currentUser: user });

    // --- 2. STATE ---
    let state = {
        talent: [],
        availability: [],
        assignments: [],
        activeTasks: [], // For the dropdown
        viewDate: dayjs(), 
        daysToShow: 14
    };

    // --- 3. CONTROLS ---
    document.getElementById('prev-week-btn').addEventListener('click', () => { state.viewDate = state.viewDate.subtract(7, 'day'); renderMatrix(); });
    document.getElementById('next-week-btn').addEventListener('click', () => { state.viewDate = state.viewDate.add(7, 'day'); renderMatrix(); });

    // --- 4. DATA LOADING ---
    async function loadTalentData() {
        console.log("Loading Talent Matrix...");
        
        const [talentRes, availRes, assignRes, activeRes] = await Promise.all([
            // 1. Staff
            supabase.from('shop_talent').select('*').order('name'),
            // 2. PTO/Sick
            supabase.from('talent_availability').select('*'),
            // 3. Existing Assignments (Tasks with a user assigned)
            supabase.from('project_tasks').select('*, projects(name)').not('assigned_talent_id', 'is', null),
            // 4. Active Tasks (For the "Assign" dropdown)
            supabase.from('project_tasks').select('*, projects(name)').in('status', ['Pending', 'In Progress'])
        ]);

        state.talent = talentRes.data || [];
        state.availability = availRes.data || [];
        state.assignments = assignRes.data || [];
        state.activeTasks = activeRes.data || [];

        renderMatrix();
    }

    // --- 5. RENDER ENGINE ---
    function renderMatrix() {
        // Label
        const endViewDate = state.viewDate.add(state.daysToShow - 1, 'day');
        document.getElementById('current-week-label').textContent = `${state.viewDate.format('MMM D')} - ${endViewDate.format('MMM D')}`;

        // HEADERS (Dates & Shortage Logic)
        const dateHeader = document.getElementById('matrix-date-header');
        let headerHtml = '';
        const colWidth = 120;

        for(let i=0; i<state.daysToShow; i++) {
            const d = state.viewDate.add(i, 'day');
            const dateStr = d.format('YYYY-MM-DD');
            const isWeekend = d.day() === 0 || d.day() === 6;
            const isToday = d.isSame(dayjs(), 'day');

            // --- SHORTAGE CALCULATION ---
            // 1. Count Total Available Staff (Total - PTO)
            const ptoCount = state.availability.filter(a => a.date === dateStr && a.status === 'PTO').length;
            const staffCount = state.talent.length - ptoCount;

            // 2. Count Active Tasks covering this date
            const taskDemand = state.activeTasks.filter(t => 
                (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && 
                (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)))
            ).length;

            const isShort = taskDemand > staffCount; // More tasks than people?
            const warningStyle = isShort ? 'border-bottom: 3px solid #ff4444;' : (isToday ? 'border-bottom: 2px solid var(--primary-gold);' : '');

            headerHtml += `
                <div style="min-width:${colWidth}px; width:${colWidth}px; border-right:1px solid var(--border-color); padding:10px; text-align:center; display:flex; flex-direction:column; justify-content:center; ${isWeekend?'background:rgba(255,255,255,0.03);':''} ${warningStyle}">
                    <div style="font-size:1.4rem; font-family:'Rajdhani', sans-serif; font-weight:700; ${isToday?'color:var(--primary-gold);':'color:var(--text-bright);'}">${d.format('DD')}</div>
                    <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-dim); letter-spacing:1px;">${d.format('ddd')}</div>
                    ${isShort ? '<div style="font-size:0.6rem; color:#ff4444; font-weight:bold;">SHORT</div>' : ''}
                </div>
            `;
        }
        dateHeader.innerHTML = headerHtml;

        // BODY (Rows)
        const resList = document.getElementById('matrix-resource-list');
        const gridCanvas = document.getElementById('matrix-grid-canvas');
        resList.innerHTML = '';
        gridCanvas.innerHTML = '';

        state.talent.forEach((person, index) => {
            const rowBg = index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';

            // Sidebar Name
            const rowEl = document.createElement('div');
            rowEl.className = 'talent-row';
            rowEl.style.backgroundColor = rowBg;
            rowEl.innerHTML = `
                <div class="talent-avatar">${getInitials(person.name)}</div>
                <div class="talent-info"><h4>${person.name}</h4><span>${person.role}</span></div>
            `;
            resList.appendChild(rowEl);

            // Grid Cells
            const gridRow = document.createElement('div');
            gridRow.style.display = 'flex';
            gridRow.style.height = '60px';
            gridRow.style.backgroundColor = rowBg;

            for(let i=0; i<state.daysToShow; i++) {
                const d = state.viewDate.add(i, 'day');
                const dateStr = d.format('YYYY-MM-DD');
                
                // Find data
                const avail = state.availability.find(a => a.talent_id === person.id && a.date === dateStr);
                const task = state.assignments.find(t => 
                    t.assigned_talent_id === person.id && 
                    (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && 
                    (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)))
                );

                const cell = document.createElement('div');
                cell.className = 'talent-grid-cell';
                cell.style.minWidth = `${colWidth}px`;
                cell.style.width = `${colWidth}px`;

                if (avail && avail.status === 'PTO') {
                    cell.classList.add('status-pto');
                    cell.innerHTML = '<i class="fas fa-plane" style="margin-right:5px;"></i> PTO';
                } else if (task) {
                    cell.classList.add('status-assigned');
                    cell.innerHTML = `<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.75rem;">${task.projects?.name}</span>`;
                    cell.title = `${task.name} (${task.projects?.name})`;
                }

                cell.addEventListener('click', () => handleCellClick(person, dateStr, avail, task));
                gridRow.appendChild(cell);
            }
            gridCanvas.appendChild(gridRow);
        });
    }

    function getInitials(name) { return name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase(); }

    // --- 6. INTERACTION (The Modal) ---
    function handleCellClick(person, dateStr, avail, task) {
        // Filter tasks active on this specific date
        const d = dayjs(dateStr);
        const dayTasks = state.activeTasks.filter(t => 
            (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && 
            (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)))
        );

        const taskOptions = dayTasks.map(t => 
            `<option value="${t.id}" ${task && task.id === t.id ? 'selected' : ''}>${t.name} - ${t.projects?.name}</option>`
        ).join('');

        const isPTO = avail && avail.status === 'PTO';

        showModal(`Schedule: ${person.name}`, `
            <div style="text-align:center; margin-bottom:20px;">
                <h4 style="color:var(--primary-gold);">${dayjs(dateStr).format('dddd, MMM D')}</h4>
            </div>

            <div style="background:var(--bg-dark); padding:15px; border-radius:8px; border:1px solid var(--border-color); margin-bottom:15px;">
                <label style="display:block; color:var(--text-dim); margin-bottom:5px; font-size:0.8rem;">ASSIGN TASK</label>
                <select id="assign-task-select" class="form-control" style="width:100%; padding:10px; background:var(--bg-medium); color:white; border:1px solid var(--border-color);">
                    <option value="">-- No Assignment --</option>
                    ${taskOptions}
                </select>
                <button id="btn-save-assign" class="btn-primary" style="width:100%; margin-top:10px;">Save Assignment</button>
            </div>

            <div style="background:var(--bg-dark); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                <label style="display:block; color:var(--text-dim); margin-bottom:5px; font-size:0.8rem;">AVAILABILITY</label>
                <div style="display:flex; gap:10px;">
                    <button id="btn-mark-avail" style="flex:1; padding:10px; border:1px solid var(--border-color); background:${!isPTO ? 'var(--primary-blue)' : 'transparent'}; color:white; border-radius:4px; cursor:pointer;">Available</button>
                    <button id="btn-mark-pto" style="flex:1; padding:10px; border:1px solid var(--border-color); background:${isPTO ? '#d32f2f' : 'transparent'}; color:white; border-radius:4px; cursor:pointer;">Mark PTO</button>
                </div>
            </div>
        `, async () => {});

        // BINDS
        setTimeout(() => {
            // Assign Task
            document.getElementById('btn-save-assign').onclick = async () => {
                const taskId = document.getElementById('assign-task-select').value;
                if(taskId) {
                    // Assign user to task
                    await supabase.from('project_tasks').update({ assigned_talent_id: person.id }).eq('id', taskId);
                    // Also clear PTO if setting task
                    await supabase.from('talent_availability').delete().match({ talent_id: person.id, date: dateStr });
                } else {
                    // Clear assignment (if current task exists)
                    if(task) await supabase.from('project_tasks').update({ assigned_talent_id: null }).eq('id', task.id);
                }
                hideModal(); loadTalentData();
            };

            // Set PTO
            document.getElementById('btn-mark-pto').onclick = async () => {
                await supabase.from('talent_availability').upsert({ talent_id: person.id, date: dateStr, status: 'PTO' });
                // If assigning PTO, clear task assignment for this day? (Complex logic, maybe warn user. Simple for now.)
                hideModal(); loadTalentData();
            };

            // Set Available
            document.getElementById('btn-mark-avail').onclick = async () => {
                await supabase.from('talent_availability').delete().match({ talent_id: person.id, date: dateStr });
                hideModal(); loadTalentData();
            };
        }, 100);
    }

    loadTalentData();
});
