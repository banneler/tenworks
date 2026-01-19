import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs 
} from './shared_constants.js';

// Initialize Supabase & Day.js
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

document.addEventListener("DOMContentLoaded", async () => {
    // --- 1. INITIALIZATION & AUTH ---
    await loadSVGs(); 
    
    // Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    
    await setupUserMenuAndAuth(supabase, { currentUser: user });

    // --- 2. GLOBAL STATE ---
    let state = {
        talent: [],         // Rows: Active Staff
        availability: [],   // PTO/Sick records
        assignments: [],    // Tasks currently assigned
        activeTasks: [],    // All pending work (for demand calculation)
        viewDate: dayjs(),  // Start date of the sliding window
        daysToShow: 14      // 2-Week Rolling Window
    };

    // --- 3. EVENT LISTENERS ---
    // Navigation Buttons
    const prevBtn = document.getElementById('prev-week-btn');
    const nextBtn = document.getElementById('next-week-btn');
    
    if (prevBtn) prevBtn.addEventListener('click', () => { 
        state.viewDate = state.viewDate.subtract(7, 'day'); 
        renderMatrix(); 
    });
    
    if (nextBtn) nextBtn.addEventListener('click', () => { 
        state.viewDate = state.viewDate.add(7, 'day'); 
        renderMatrix(); 
    });

    // --- 4. DATA FETCHING ---
    async function loadTalentData() {
        console.log("Loading Talent Matrix Data...");
        
        const [talentRes, availRes, assignRes, activeRes] = await Promise.all([
            // 1. Active Staff Only
            supabase.from('shop_talent')
                .select('*')
                .eq('active', true)
                .order('name'),
            
            // 2. PTO/Availability Records
            supabase.from('talent_availability').select('*'),
            
            // 3. Assigned Tasks (Joined with Project Name)
            supabase.from('project_tasks')
                .select('*, projects(name)')
                .not('assigned_talent_id', 'is', null),
                
            // 4. All Pending Work (For Demand Calculation)
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
        // A. Update Header Date Range
        const endViewDate = state.viewDate.add(state.daysToShow - 1, 'day');
        const labelEl = document.getElementById('current-week-label');
        if (labelEl) labelEl.textContent = `${state.viewDate.format('MMM D')} - ${endViewDate.format('MMM D')}`;

        // B. Render Column Headers (Dates + Shortage Warnings)
        const dateHeader = document.getElementById('matrix-date-header');
        if (!dateHeader) return;

        let headerHtml = '';
        const colWidth = 120; // Fixed cell width

        for(let i = 0; i < state.daysToShow; i++) {
            const d = state.viewDate.add(i, 'day');
            const dateStr = d.format('YYYY-MM-DD');
            const isWeekend = d.day() === 0 || d.day() === 6;
            const isToday = d.isSame(dayjs(), 'day');

            // --- SHORTAGE MATH ---
            // Capacity = Total Staff - People on PTO today
            const ptoToday = state.availability.filter(a => a.date === dateStr && a.status === 'PTO').length;
            const capacity = state.talent.length - ptoToday;

            // Demand = Active tasks intersecting this date
            const demand = state.activeTasks.filter(t => {
                const start = dayjs(t.start_date);
                const end = dayjs(t.end_date);
                return (d.isSame(start) || d.isAfter(start)) && (d.isSame(end) || d.isBefore(end));
            }).length;

            const isShort = demand > capacity;
            
            // NEW: Metric Color Logic (Red if short, Green if good, Yellow if tight)
            let metricColor = 'var(--text-dim)';
            if (isShort) metricColor = '#ff4444'; 
            else if (demand === capacity) metricColor = 'var(--warning-yellow)'; 
            else if (demand < capacity) metricColor = '#4CAF50';

            // Styling
            const borderStyle = isShort ? 'border-bottom: 3px solid #ff4444;' : (isToday ? 'border-bottom: 2px solid var(--primary-gold);' : '');
            const bgStyle = isWeekend ? 'background:rgba(255,255,255,0.03);' : '';
            const textColor = isToday ? 'color:var(--primary-gold);' : 'color:var(--text-bright);';

            // NEW: Always show the Load Requirement (Req / Cap)
            headerHtml += `
                <div style="min-width:${colWidth}px; width:${colWidth}px; border-right:1px solid var(--border-color); padding:10px; text-align:center; display:flex; flex-direction:column; justify-content:center; ${bgStyle} ${borderStyle}">
                    <div style="font-size:1.4rem; font-family:'Rajdhani', sans-serif; font-weight:700; ${textColor}">${d.format('DD')}</div>
                    <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-dim); letter-spacing:1px;">${d.format('ddd')}</div>
                    
                    <div style="font-size:0.65rem; color:${metricColor}; font-weight:bold; margin-top:5px; background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:4px;">
                        REQ: ${demand} / CAP: ${capacity}
                    </div>
                </div>
            `;
        }
        dateHeader.innerHTML = headerHtml;

        // C. Render The Grid (Rows & Cells)
        const resList = document.getElementById('matrix-resource-list'); // Sidebar
        const gridCanvas = document.getElementById('matrix-grid-canvas'); // Main Grid
        
        if (!resList || !gridCanvas) return;

        resList.innerHTML = '';
        gridCanvas.innerHTML = '';

        state.talent.forEach((person, index) => {
            const rowBg = index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';

            // 1. Sidebar Card
            const sidebarItem = document.createElement('div');
            sidebarItem.className = 'talent-row'; // Ensure CSS matches height
            sidebarItem.style.backgroundColor = rowBg;
            sidebarItem.style.height = '60px'; // Forced height for alignment
            sidebarItem.style.display = 'flex';
            sidebarItem.style.alignItems = 'center';
            sidebarItem.style.padding = '0 15px';
            sidebarItem.style.borderBottom = '1px solid var(--border-color)';
            
            sidebarItem.innerHTML = `
                <div style="width:32px; height:32px; background:var(--bg-medium); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:bold; margin-right:10px; border:1px solid var(--border-color);">
                    ${getInitials(person.name)}
                </div>
                <div>
                    <div style="font-weight:600; font-size:0.9rem; color:var(--text-bright);">${person.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-dim);">${person.role || 'Staff'}</div>
                </div>
            `;
            resList.appendChild(sidebarItem);

            // 2. Grid Row
            const gridRow = document.createElement('div');
            gridRow.style.display = 'flex';
            gridRow.style.height = '60px'; 
            gridRow.style.backgroundColor = rowBg;
            gridRow.style.borderBottom = '1px solid var(--border-color)';

            for(let i = 0; i < state.daysToShow; i++) {
                const d = state.viewDate.add(i, 'day');
                const dateStr = d.format('YYYY-MM-DD');
                
                // DATA LOOKUP
                // a. Check Availability
                const avail = state.availability.find(a => a.talent_id === person.id && a.date === dateStr);
                
                // b. Check Assignment (Does an assigned task overlap this specific day?)
                const task = state.assignments.find(t => 
                    t.assigned_talent_id === person.id && 
                    (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && 
                    (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)))
                );

                const cell = document.createElement('div');
                cell.style.minWidth = `${colWidth}px`;
                cell.style.width = `${colWidth}px`;
                cell.style.height = '100%';
                cell.style.borderRight = '1px solid var(--border-color)';
                cell.style.cursor = 'pointer';
                cell.style.display = 'flex';
                cell.style.alignItems = 'center';
                cell.style.justifyContent = 'center';
                cell.style.fontSize = '0.75rem';
                cell.style.transition = 'background 0.2s';
                
                // Weekend Dimming
                if (d.day() === 0 || d.day() === 6) cell.style.backgroundColor = 'rgba(255,255,255,0.015)';

                // Cell Content Logic
                if (avail && avail.status === 'PTO') {
                    // PTO Visuals
                    cell.style.background = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.02) 10px, rgba(255,255,255,0.02) 20px)';
                    cell.style.color = 'var(--text-dim)';
                    cell.innerHTML = '<i class="fas fa-plane" style="margin-right:5px;"></i> PTO';
                } else if (task) {
                    // Assigned Visuals
                    cell.style.backgroundColor = 'rgba(33, 150, 243, 0.15)'; // Blue tint
                    cell.style.borderLeft = '3px solid var(--primary-blue)';
                    cell.style.color = 'white';
                    cell.innerHTML = `
                        <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0 5px; max-width:100%;">
                            ${task.projects?.name || 'Project'}
                        </div>`;
                    cell.title = `${task.name} (${task.projects?.name})`;
                }

                // Hover Effect
                cell.addEventListener('mouseenter', () => { if(!task && !avail) cell.style.backgroundColor = 'var(--bg-medium)'; });
                cell.addEventListener('mouseleave', () => { if(!task && !avail) cell.style.backgroundColor = (d.day()===0||d.day()===6) ? 'rgba(255,255,255,0.015)' : 'transparent'; });

                // Click Action
                cell.addEventListener('click', () => handleCellClick(person, dateStr, avail, task));
                gridRow.appendChild(cell);
            }
            gridCanvas.appendChild(gridRow);
        });
    }

    function getInitials(name) { 
        if(!name) return 'TW';
        return name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase(); 
    }

    // --- 6. INTERACTIVITY (Modal Logic) ---
    function handleCellClick(person, dateStr, avail, currentTask) {
        // Find viable tasks for this specific date
        const d = dayjs(dateStr);
        
        // Filter: Task must overlap this date AND not be completed
        const viableTasks = state.activeTasks.filter(t => 
            (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && 
            (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)))
        );

        // Build Dropdown Options
        const taskOptions = viableTasks.map(t => 
            `<option value="${t.id}" ${currentTask && currentTask.id === t.id ? 'selected' : ''}>
                ${t.projects?.name} - ${t.name}
            </option>`
        ).join('');

        const isPTO = avail && avail.status === 'PTO';

        // NEW: Modal HTML with Date Range Picker for PTO
        showModal(`Schedule: ${person.name}`, `
            <div style="text-align:center; margin-bottom:20px;">
                <h4 style="color:var(--primary-gold); font-size:1.1rem; margin-bottom:5px;">${dayjs(dateStr).format('dddd, MMM D, YYYY')}</h4>
                <div style="font-size:0.8rem; color:var(--text-dim);">Manage assignments or availability</div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr; gap:20px;">
                <div style="background:var(--bg-dark); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                    <label style="display:block; color:var(--text-bright); margin-bottom:10px; font-weight:600;">
                        <i class="fas fa-tasks" style="color:var(--primary-blue); margin-right:8px;"></i> Assign Active Task
                    </label>
                    
                    ${viableTasks.length > 0 ? `
                        <select id="assign-task-select" class="form-control" style="width:100%; padding:10px; background:var(--bg-medium); color:white; border:1px solid var(--border-color); margin-bottom:15px;">
                            <option value="">-- No Assignment --</option>
                            ${taskOptions}
                        </select>
                        <button id="btn-save-assign" class="btn-primary" style="width:100%;">
                            ${currentTask ? 'Update Assignment' : 'Assign Task'}
                        </button>
                    ` : `
                        <div style="padding:15px; background:var(--bg-medium); color:var(--text-dim); border-radius:4px; font-size:0.9rem; text-align:center;">
                            No active tasks scheduled for this date range.
                        </div>
                    `}
                </div>

                <div style="background:var(--bg-dark); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                    <label style="display:block; color:var(--text-bright); margin-bottom:10px; font-weight:600;">
                        <i class="fas fa-user-clock" style="color:var(--warning-yellow); margin-right:8px;"></i> Exceptions (PTO/Sick)
                    </label>
                    
                    <div style="display:flex; gap:10px; margin-bottom:15px;">
                        <div style="flex:1;">
                            <label style="font-size:0.7rem; color:var(--text-dim);">From</label>
                            <input type="date" id="pto-start-date" class="form-control" value="${dateStr}" style="width:100%; padding:5px; background:var(--bg-medium); color:white; border:1px solid var(--border-color);">
                        </div>
                        <div style="flex:1;">
                            <label style="font-size:0.7rem; color:var(--text-dim);">To (Inclusive)</label>
                            <input type="date" id="pto-end-date" class="form-control" value="${dateStr}" style="width:100%; padding:5px; background:var(--bg-medium); color:white; border:1px solid var(--border-color);">
                        </div>
                    </div>

                    <div style="display:flex; gap:10px;">
                        <button id="btn-mark-avail" style="flex:1; padding:12px; border:1px solid var(--border-color); background:${!isPTO ? 'rgba(76, 175, 80, 0.2)' : 'transparent'}; color:${!isPTO ? '#4CAF50' : 'var(--text-dim)'}; border-radius:6px; cursor:pointer; transition:all 0.2s;">
                            <i class="fas fa-check"></i> Clear PTO
                        </button>
                        <button id="btn-mark-pto" style="flex:1; padding:12px; border:1px solid var(--border-color); background:${isPTO ? 'rgba(244, 67, 54, 0.2)' : 'transparent'}; color:${isPTO ? '#ff4444' : 'var(--text-dim)'}; border-radius:6px; cursor:pointer; transition:all 0.2s;">
                            <i class="fas fa-plane"></i> Mark Range PTO
                        </button>
                    </div>
                </div>
            </div>
        `, async () => {}); 

        // Bind Events (Delay to ensure DOM is ready)
        setTimeout(() => {
            const assignBtn = document.getElementById('btn-save-assign');
            const ptoBtn = document.getElementById('btn-mark-pto');
            const availBtn = document.getElementById('btn-mark-avail');

            // A. SAVE ASSIGNMENT
            if(assignBtn) {
                assignBtn.onclick = async () => {
                    const taskId = document.getElementById('assign-task-select').value;
                    
                    if (taskId) {
                        // 1. Assign Person to Task
                        const { error } = await supabase.from('project_tasks')
                            .update({ assigned_talent_id: person.id })
                            .eq('id', taskId);
                        
                        if (!error) {
                            // 2. Clear PTO if exists (Logic: You can't work if you are on PTO)
                            await supabase.from('talent_availability')
                                .delete()
                                .match({ talent_id: person.id, date: dateStr });
                        }
                    } else {
                        // Unassign
                        if (currentTask) {
                            await supabase.from('project_tasks')
                                .update({ assigned_talent_id: null })
                                .eq('id', currentTask.id);
                        }
                    }
                    hideModal();
                    loadTalentData();
                };
            }

            // B. MARK PTO (BULK LOGIC)
            if(ptoBtn) {
                ptoBtn.onclick = async () => {
                    const startVal = document.getElementById('pto-start-date').value;
                    const endVal = document.getElementById('pto-end-date').value;

                    if (!startVal || !endVal) { alert("Please select a date range."); return; }

                    const start = dayjs(startVal);
                    const end = dayjs(endVal);
                    const diff = end.diff(start, 'day');

                    if (diff < 0) { alert("End date cannot be before start date."); return; }

                    // Generate array of rows to upsert
                    const upsertData = [];
                    for(let i = 0; i <= diff; i++) {
                        const d = start.add(i, 'day').format('YYYY-MM-DD');
                        upsertData.push({
                            talent_id: person.id,
                            date: d,
                            status: 'PTO'
                        });
                    }

                    // Bulk Upsert
                    const { error } = await supabase.from('talent_availability')
                        .upsert(upsertData, { onConflict: 'talent_id, date' });

                    if (error) {
                        alert("Error saving PTO: " + error.message);
                    } else {
                        hideModal(); 
                        loadTalentData();
                    }
                };
            }

            // C. MARK AVAILABLE (Clear PTO Range)
            if(availBtn) {
                availBtn.onclick = async () => {
                     const startVal = document.getElementById('pto-start-date').value;
                     const endVal = document.getElementById('pto-end-date').value;

                    // Delete range logic involves checking the date column
                    // Supabase delete with multiple filters is tricky, simpler to loop or use 'in' if possible
                    // For simplicity and safety, we will just delete the range using >= and <= logic
                    
                    const { error } = await supabase.from('talent_availability')
                        .delete()
                        .eq('talent_id', person.id)
                        .gte('date', startVal)
                        .lte('date', endVal);

                    hideModal();
                    loadTalentData();
                };
            }
        }, 100);
    }

    // Start App
    loadTalentData();
});
