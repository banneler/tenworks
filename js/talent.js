import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs 
} from './shared_constants.js';

// Initialize Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

document.addEventListener("DOMContentLoaded", async () => {
    // --- 1. INITIALIZATION & AUTH ---
    await loadSVGs(); 
    
    // Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    
    // Setup User Menu (Profile, Logout, etc.)
    await setupUserMenuAndAuth(supabase, { currentUser: user });

    // --- 2. GLOBAL STATE ---
    let state = {
        talent: [],         // List of staff (shop_talent)
        availability: [],   // PTO records (talent_availability)
        assignments: [],    // Tasks currently assigned to someone
        activeTasks: [],    // All tasks needing attention (for demand calculation)
        viewDate: dayjs(),  // The start date of the matrix view
        daysToShow: 14      // Rolling window size
    };

    // --- 3. EVENT LISTENERS ---
    document.getElementById('prev-week-btn').addEventListener('click', () => { 
        state.viewDate = state.viewDate.subtract(7, 'day'); 
        renderMatrix(); 
    });
    
    document.getElementById('next-week-btn').addEventListener('click', () => { 
        state.viewDate = state.viewDate.add(7, 'day'); 
        renderMatrix(); 
    });

    // --- 4. DATA FETCHING ---
    async function loadTalentData() {
        console.log("Loading Talent Matrix Data...");
        
        // Fetch all required data in parallel
        const [talentRes, availRes, assignRes, activeRes] = await Promise.all([
            // 1. Staff Members (Rows)
            supabase.from('shop_talent').select('*').order('name'),
            
            // 2. Availability (PTO/Sick)
            supabase.from('talent_availability').select('*'),
            
            // 3. Existing Assignments (Tasks that have a person assigned)
            supabase.from('project_tasks')
                .select('*, projects(name)')
                .not('assigned_talent_id', 'is', null),
                
            // 4. Active Demand (All 'Pending' or 'In Progress' tasks)
            supabase.from('project_tasks')
                .select('*, projects(name)')
                .in('status', ['Pending', 'In Progress'])
        ]);

        if (talentRes.error) console.error("Error fetching talent:", talentRes.error);
        
        state.talent = talentRes.data || [];
        state.availability = availRes.data || [];
        state.assignments = assignRes.data || [];
        state.activeTasks = activeRes.data || [];

        renderMatrix();
    }

    // --- 5. RENDER ENGINE ---
    function renderMatrix() {
        // A. Update Date Label
        const endViewDate = state.viewDate.add(state.daysToShow - 1, 'day');
        document.getElementById('current-week-label').textContent = 
            `${state.viewDate.format('MMM D')} - ${endViewDate.format('MMM D')}`;

        // B. Render Headers (Dates & Shortage Logic)
        const dateHeader = document.getElementById('matrix-date-header');
        let headerHtml = '';
        const colWidth = 120; // Fixed width for alignment

        for(let i = 0; i < state.daysToShow; i++) {
            const d = state.viewDate.add(i, 'day');
            const dateStr = d.format('YYYY-MM-DD');
            const isWeekend = d.day() === 0 || d.day() === 6;
            const isToday = d.isSame(dayjs(), 'day');

            // --- SHORTAGE CALCULATION ---
            // 1. Capacity: Total Staff - PTO on this day
            const ptoCount = state.availability.filter(a => a.date === dateStr && a.status === 'PTO').length;
            const staffCapacity = state.talent.length - ptoCount;

            // 2. Demand: Count tasks active on this specific date
            const taskDemand = state.activeTasks.filter(t => {
                const start = dayjs(t.start_date);
                const end = dayjs(t.end_date);
                return (d.isSame(start) || d.isAfter(start)) && (d.isSame(end) || d.isBefore(end));
            }).length;

            // 3. Status
            const isShort = taskDemand > staffCapacity;
            
            // Styles
            const borderStyle = isShort ? 'border-bottom: 3px solid #ff4444;' : (isToday ? 'border-bottom: 2px solid var(--primary-gold);' : '');
            const bgStyle = isWeekend ? 'background:rgba(255,255,255,0.03);' : '';
            const textColor = isToday ? 'color:var(--primary-gold);' : 'color:var(--text-bright);';

            headerHtml += `
                <div style="min-width:${colWidth}px; width:${colWidth}px; border-right:1px solid var(--border-color); padding:10px; text-align:center; display:flex; flex-direction:column; justify-content:center; ${bgStyle} ${borderStyle}">
                    <div style="font-size:1.4rem; font-family:'Rajdhani', sans-serif; font-weight:700; ${textColor}">${d.format('DD')}</div>
                    <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-dim); letter-spacing:1px;">${d.format('ddd')}</div>
                    ${isShort ? '<div style="font-size:0.6rem; color:#ff4444; font-weight:bold; margin-top:2px;">SHORT</div>' : ''}
                </div>
            `;
        }
        dateHeader.innerHTML = headerHtml;

        // C. Render Body (Rows & Cells)
        const resList = document.getElementById('matrix-resource-list');
        const gridCanvas = document.getElementById('matrix-grid-canvas');
        resList.innerHTML = '';
        gridCanvas.innerHTML = '';

        state.talent.forEach((person, index) => {
            const rowBg = index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';

            // 1. Sidebar Name Card
            const rowEl = document.createElement('div');
            rowEl.className = 'talent-row';
            rowEl.style.backgroundColor = rowBg;
            rowEl.innerHTML = `
                <div class="talent-avatar">${getInitials(person.name)}</div>
                <div class="talent-info">
                    <h4>${person.name}</h4>
                    <span>${person.role || 'Staff'}</span>
                </div>
            `;
            resList.appendChild(rowEl);

            // 2. Grid Row
            const gridRow = document.createElement('div');
            gridRow.style.display = 'flex';
            gridRow.style.height = '60px'; // Must match .talent-row
            gridRow.style.backgroundColor = rowBg;

            for(let i = 0; i < state.daysToShow; i++) {
                const d = state.viewDate.add(i, 'day');
                const dateStr = d.format('YYYY-MM-DD');
                
                // Determine Cell State
                // a. Check Availability (PTO)
                const avail = state.availability.find(a => a.talent_id === person.id && a.date === dateStr);
                
                // b. Check Assignment (Is this person assigned to a task active on this day?)
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
                    // PTO Visuals (Striped)
                    cell.classList.add('status-pto');
                    cell.innerHTML = '<i class="fas fa-plane" style="margin-right:5px;"></i> PTO';
                } else if (task) {
                    // Assigned Visuals (Blue)
                    cell.classList.add('status-assigned');
                    cell.innerHTML = `
                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.75rem; font-weight:500;">
                            ${task.projects?.name || 'Project'}
                        </span>`;
                    cell.title = `${task.name} (${task.projects?.name})`;
                }

                // Click to Open Modal
                cell.addEventListener('click', () => handleCellClick(person, dateStr, avail, task));
                gridRow.appendChild(cell);
            }
            gridCanvas.appendChild(gridRow);
        });
    }

    // Helper: Initials for Avatar
    function getInitials(name) { 
        return name ? name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : 'TW'; 
    }

    // --- 6. INTERACTIVITY (The Modal) ---
    function handleCellClick(person, dateStr, avail, task) {
        // 1. Find Tasks Active on this Specific Date for the Dropdown
        const d = dayjs(dateStr);
        const dayTasks = state.activeTasks.filter(t => 
            (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && 
            (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)))
        );

        // Generate Options
        const taskOptions = dayTasks.map(t => 
            `<option value="${t.id}" ${task && task.id === t.id ? 'selected' : ''}>
                ${t.name} (${t.projects?.name})
            </option>`
        ).join('');

        const isPTO = avail && avail.status === 'PTO';

        // 2. Show Modal
        showModal(`Schedule: ${person.name}`, `
            <div style="text-align:center; margin-bottom:20px;">
                <h4 style="color:var(--primary-gold); font-size:1.1rem;">${dayjs(dateStr).format('dddd, MMM D, YYYY')}</h4>
            </div>

            <div style="background:var(--bg-dark); padding:15px; border-radius:8px; border:1px solid var(--border-color); margin-bottom:15px;">
                <label style="display:block; color:var(--text-dim); margin-bottom:8px; font-size:0.8rem; font-weight:bold;">ASSIGN TASK</label>
                <select id="assign-task-select" class="form-control" style="width:100%; padding:10px; background:var(--bg-medium); color:white; border:1px solid var(--border-color); margin-bottom:10px;">
                    <option value="">-- No Assignment --</option>
                    ${taskOptions}
                </select>
                <button id="btn-save-assign" class="btn-primary" style="width:100%;">Save Assignment</button>
                <p style="font-size:0.8rem; color:var(--text-dim); margin-top:8px; font-style:italic;">
                    *Assigning a task will set this user as the owner for the task's full duration.
                </p>
            </div>

            <div style="background:var(--bg-dark); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                <label style="display:block; color:var(--text-dim); margin-bottom:8px; font-size:0.8rem; font-weight:bold;">AVAILABILITY STATUS</label>
                <div style="display:flex; gap:10px;">
                    <button id="btn-mark-avail" style="flex:1; padding:10px; border:1px solid var(--border-color); background:${!isPTO ? 'var(--primary-blue)' : 'transparent'}; color:white; border-radius:4px; cursor:pointer; transition:all 0.2s;">
                        Available
                    </button>
                    <button id="btn-mark-pto" style="flex:1; padding:10px; border:1px solid var(--border-color); background:${isPTO ? '#d32f2f' : 'transparent'}; color:white; border-radius:4px; cursor:pointer; transition:all 0.2s;">
                        Mark PTO
                    </button>
                </div>
            </div>
        `, async () => {}); // No default Confirm action, we handle buttons manually below

        // 3. Bind Events (using timeout to ensure DOM Elements exist in Modal)
        setTimeout(() => {
            // A. Save Assignment
            const saveBtn = document.getElementById('btn-save-assign');
            if(saveBtn) {
                saveBtn.onclick = async () => {
                    const taskId = document.getElementById('assign-task-select').value;
                    
                    if (taskId) {
                        // Assign user to task
                        const { error } = await supabase.from('project_tasks')
                            .update({ assigned_talent_id: person.id })
                            .eq('id', taskId);
                        
                        if (!error) {
                            // If they are assigned work, ensure they aren't marked as PTO for this day
                            await supabase.from('talent_availability')
                                .delete()
                                .match({ talent_id: person.id, date: dateStr });
                        }
                    } else {
                        // Unassign (if a task was previously selected)
                        if (task) {
                            await supabase.from('project_tasks')
                                .update({ assigned_talent_id: null })
                                .eq('id', task.id);
                        }
                    }
                    hideModal();
                    loadTalentData(); // Refresh Grid
                };
            }

            // B. Mark PTO
            const ptoBtn = document.getElementById('btn-mark-pto');
            if(ptoBtn) {
                ptoBtn.onclick = async () => {
                    await supabase.from('talent_availability')
                        .upsert({ talent_id: person.id, date: dateStr, status: 'PTO' }, { onConflict: 'talent_id, date' });
                    hideModal(); 
                    loadTalentData();
                };
            }

            // C. Mark Available
            const availBtn = document.getElementById('btn-mark-avail');
            if(availBtn) {
                availBtn.onclick = async () => {
                    await supabase.from('talent_availability')
                        .delete()
                        .match({ talent_id: person.id, date: dateStr });
                    hideModal();
                    loadTalentData();
                };
            }
        }, 100);
    }

    // Start App
    loadTalentData();
});
