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
    
    // Auth Check
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
        viewDate: dayjs(),  
        daysToShow: 30,
        filterTradeId: null 
    };

    // ------------------------------------------------------------------------
    // 3. LISTENERS & SYNC
    // ------------------------------------------------------------------------
    const prevBtn = document.getElementById('prev-week-btn');
    const nextBtn = document.getElementById('next-week-btn');
    const filterEl = document.getElementById('trade-filter');

    if (prevBtn) prevBtn.addEventListener('click', () => { state.viewDate = state.viewDate.subtract(7, 'day'); renderMatrix(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { state.viewDate = state.viewDate.add(7, 'day'); renderMatrix(); });
    
    if (filterEl) {
        filterEl.addEventListener('change', (e) => {
            state.filterTradeId = e.target.value ? parseInt(e.target.value) : null;
            renderMatrix(); 
        });
    }

    // Sync Engine
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
    // 4. DATA FETCHING
    // ------------------------------------------------------------------------
    async function loadTalentData() {
        console.log("Loading Talent Matrix Data...");
        
        const [talentRes, tradeRes, skillRes, availRes, assignRes, activeRes] = await Promise.all([
            supabase.from('shop_talent').select('*').eq('active', true).order('name'),
            supabase.from('shop_trades').select('*').order('name'),
            supabase.from('talent_skills').select('*'),
            supabase.from('talent_availability').select('*'),
            supabase.from('project_tasks').select('*, projects(name)').not('assigned_talent_id', 'is', null),
            supabase.from('project_tasks').select('*, projects(name)').in('status', ['Pending', 'In Progress'])
        ]);

        state.talent = talentRes.data || [];
        state.trades = tradeRes.data || [];
        state.skills = skillRes.data || [];
        state.availability = availRes.data || [];
        state.assignments = assignRes.data || [];
        state.activeTasks = activeRes.data || [];

        populateFilterDropdown();
        renderMatrix();
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
    // 5. RENDER ENGINE
    // ------------------------------------------------------------------------
    function renderMatrix() {
        // A. FILTER LOGIC
        let visibleTalent = state.talent;
        if (state.filterTradeId) {
            const skilledTalentIds = state.skills
                .filter(s => s.trade_id === state.filterTradeId)
                .map(s => s.talent_id);
            visibleTalent = state.talent.filter(t => skilledTalentIds.includes(t.id));
        }

        // B. Header Date
        const endViewDate = state.viewDate.add(state.daysToShow - 1, 'day');
        document.getElementById('current-week-label').textContent = `${state.viewDate.format('MMM D')} - ${endViewDate.format('MMM D')}`;

        // C. Dynamic Row Height
        const containerEl = document.getElementById('matrix-grid-canvas');
        const containerHeight = containerEl ? containerEl.clientHeight : 600;
        const totalRows = visibleTalent.length || 1;
        let calculatedHeight = Math.floor((containerHeight - 20) / totalRows); 
        if (calculatedHeight < 50) calculatedHeight = 50; 
        const rowHeightStyle = `${calculatedHeight}px`;

        // D. Render Header Columns
        const dateHeaderEl = document.getElementById('matrix-date-header');
        let headerHtml = '';
        const colWidth = 120; 

        for(let i = 0; i < state.daysToShow; i++) {
            const d = state.viewDate.add(i, 'day');
            const dateStr = d.format('YYYY-MM-DD');
            const isWeekend = d.day() === 0 || d.day() === 6;
            const isToday = d.isSame(dayjs(), 'day');

            // Metric Calculations
            let dailyDemand = 0;
            if (state.filterTradeId) {
                dailyDemand = state.activeTasks.filter(t => {
                    const active = (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && 
                                   (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)));
                    return active && t.trade_id === state.filterTradeId;
                }).length;
            } else {
                dailyDemand = state.activeTasks.filter(t => {
                    return (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && 
                           (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)));
                }).length;
            }

            const visibleIds = visibleTalent.map(t => t.id);
            const effectivePto = state.availability.filter(a => 
                a.date === dateStr && 
                a.status === 'PTO' && 
                visibleIds.includes(a.talent_id)
            ).length;

            const capacity = visibleTalent.length - effectivePto;
            const isShort = dailyDemand > capacity;
            
            let metricColor = 'var(--text-dim)';
            if (isShort) metricColor = '#ff4444'; 
            else if (dailyDemand === capacity) metricColor = 'var(--warning-yellow)'; 
            else if (dailyDemand < capacity) metricColor = '#4CAF50';

            const bgStyle = isWeekend ? 'background:rgba(255, 50, 50, 0.08);' : '';
            const borderStyle = isShort ? 'border-bottom: 3px solid #ff4444;' : (isToday ? 'border-bottom: 2px solid var(--primary-gold);' : '');
            const textColor = isToday ? 'color:var(--primary-gold);' : 'color:var(--text-bright);';

            headerHtml += `
                <div style="min-width:${colWidth}px; width:${colWidth}px; border-right:1px solid var(--border-color); padding:10px; text-align:center; display:flex; flex-direction:column; justify-content:center; ${bgStyle} ${borderStyle}">
                    <div style="font-size:1.4rem; font-family:'Rajdhani', sans-serif; font-weight:700; ${textColor}">${d.format('DD')}</div>
                    <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-dim); letter-spacing:1px;">${d.format('ddd')}</div>
                    <div style="font-size:0.65rem; color:${metricColor}; font-weight:bold; margin-top:5px; background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:4px;">
                        REQ: ${dailyDemand} / CAP: ${capacity}
                    </div>
                </div>
            `;
        }
        dateHeaderEl.innerHTML = headerHtml;

        // E. Render Rows
        const resList = document.getElementById('matrix-resource-list');
        const gridCanvas = document.getElementById('matrix-grid-canvas');
        resList.innerHTML = '';
        gridCanvas.innerHTML = '';

        visibleTalent.forEach((person) => {
            const rowBg = 'rgba(255,255,255,0.02)';

            // Sidebar (Name)
            const sidebarItem = document.createElement('div');
            sidebarItem.style.height = rowHeightStyle;
            sidebarItem.style.backgroundColor = rowBg;
            sidebarItem.style.display = 'flex';
            sidebarItem.style.alignItems = 'center';
            sidebarItem.style.padding = '0 15px';
            sidebarItem.style.borderBottom = '1px solid var(--border-color)';
            
            const personSkills = state.skills
                .filter(s => s.talent_id === person.id)
                .map(s => {
                    const t = state.trades.find(tr => tr.id === s.trade_id);
                    return t ? t.name : '';
                }).join(', ');

            sidebarItem.innerHTML = `
                <div style="width:30px; height:30px; min-width:30px; background:var(--bg-medium); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold; margin-right:10px; border:1px solid var(--border-color);">
                    ${getInitials(person.name)}
                </div>
                <div style="overflow:hidden; width:100%;">
                    <div class="talent-name-clickable" style="font-weight:600; font-size:0.9rem; color:var(--text-bright); white-space:nowrap; cursor:pointer;">${person.name}</div>
                    <div style="font-size:0.7rem; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${personSkills || 'No Skills'}</div>
                </div>
            `;
            
            sidebarItem.querySelector('.talent-name-clickable').addEventListener('click', () => openSkillsModal(person));
            resList.appendChild(sidebarItem);

            // Grid Cells
            const gridRow = document.createElement('div');
            gridRow.className = 'matrix-grid-row';
            gridRow.style.height = rowHeightStyle;
            gridRow.style.backgroundColor = rowBg;
            gridRow.style.borderBottom = '1px solid var(--border-color)';

            for(let i = 0; i < state.daysToShow; i++) {
                const d = state.viewDate.add(i, 'day');
                const dateStr = d.format('YYYY-MM-DD');
                const isWeekend = d.day() === 0 || d.day() === 6;

                const avail = state.availability.find(a => a.talent_id === person.id && a.date === dateStr);
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
                
                if (isWeekend) cell.style.backgroundColor = 'rgba(255, 50, 50, 0.08)';

                if (avail && avail.status === 'PTO') {
                    cell.style.background = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.02) 10px, rgba(255,255,255,0.02) 20px)';
                    cell.innerHTML = '<i class="fas fa-plane" style="color:var(--text-dim);"></i>';
                } else if (task) {
                    cell.style.backgroundColor = 'rgba(33, 150, 243, 0.15)'; 
                    cell.style.borderLeft = '3px solid var(--primary-blue)';
                    cell.style.color = 'white';
                    cell.innerHTML = `<div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0 5px;">${task.projects?.name}</div>`;
                    cell.title = `${task.name} (${task.projects?.name})`;
                }

                cell.addEventListener('mouseenter', () => { if(!task && !avail) cell.style.backgroundColor = 'var(--bg-medium)'; });
                cell.addEventListener('mouseleave', () => { if(!task && !avail) cell.style.backgroundColor = isWeekend ? 'rgba(255, 50, 50, 0.08)' : 'transparent'; });
                cell.addEventListener('click', () => handleCellClick(person, dateStr, avail, task));
                gridRow.appendChild(cell);
            }
            gridCanvas.appendChild(gridRow);
        });
    }

    function getInitials(name) { return name ? name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : 'TW'; }

    // ------------------------------------------------------------------------
    // 6. SKILLS MODAL (FIXED LAYOUT)
    // ------------------------------------------------------------------------
    function openSkillsModal(person) {
        const currentSkillIds = state.skills
            .filter(s => s.talent_id === person.id)
            .map(s => s.trade_id);

        const checkboxes = state.trades.map(trade => {
            const isChecked = currentSkillIds.includes(trade.id);
            // Explicit sizing and flex behavior
            return `
                <div style="display:flex; align-items:center; background:var(--bg-medium); padding:10px; border-radius:6px; border:1px solid var(--border-color); box-sizing:border-box; width:100%;">
                    <input type="checkbox" id="skill-${trade.id}" value="${trade.id}" ${isChecked ? 'checked' : ''} style="margin-right:10px; transform:scale(1.2);">
                    <label for="skill-${trade.id}" style="color:var(--text-bright); cursor:pointer; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${trade.name}</label>
                </div>
            `;
        }).join('');

        showModal(`Manage Skills: ${person.name}`, `
            <div style="margin-bottom:20px; color:var(--text-dim); font-size:0.9rem;">
                Select functional capabilities. This updates "Capacity" calculations.
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; max-height:300px; overflow-y:auto; width:100%; box-sizing:border-box;">
                ${checkboxes}
            </div>
            <button id="btn-save-skills" class="btn-primary" style="width:100%; margin-top:20px;">Save Changes</button>
        `, async () => {});

        setTimeout(() => {
            const saveBtn = document.getElementById('btn-save-skills');
            if(saveBtn) {
                saveBtn.onclick = async () => {
                    const selectedTradeIds = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));
                    
                    await supabase.from('talent_skills').delete().eq('talent_id', person.id);
                    
                    if(selectedTradeIds.length > 0) {
                        const insertData = selectedTradeIds.map(tid => ({ talent_id: person.id, trade_id: tid }));
                        await supabase.from('talent_skills').insert(insertData);
                    }
                    
                    hideModal();
                    loadTalentData();
                };
            }
        }, 100);
    }

    // ------------------------------------------------------------------------
    // 7. ASSIGNMENT MODAL
    // ------------------------------------------------------------------------
    function handleCellClick(person, dateStr, avail, currentTask) {
        const d = dayjs(dateStr);
        
        const viableTasks = state.activeTasks.filter(t => {
            const active = (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && 
                           (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)));
            if(state.filterTradeId) return active && t.trade_id === state.filterTradeId;
            return active;
        });

        const taskOptions = viableTasks.map(t => 
            `<option value="${t.id}" ${currentTask && currentTask.id === t.id ? 'selected' : ''}>${t.projects?.name} - ${t.name}</option>`
        ).join('');
        
        const isPTO = avail && avail.status === 'PTO';

        showModal(`Schedule: ${person.name}`, `
            <div style="text-align:center; margin-bottom:20px;">
                <h4 style="color:var(--primary-gold); font-size:1.1rem; margin-bottom:5px;">${dayjs(dateStr).format('dddd, MMM D, YYYY')}</h4>
            </div>
            <div style="display:grid; grid-template-columns: 1fr; gap:20px;">
                <div style="background:var(--bg-dark); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                    <label style="display:block; color:var(--text-bright); margin-bottom:10px; font-weight:600;">Assign Task</label>
                    ${viableTasks.length > 0 ? `
                        <select id="assign-task-select" class="form-control" style="width:100%; padding:10px; background:var(--bg-medium); color:white; border:1px solid var(--border-color); margin-bottom:15px;">
                            <option value="">-- No Assignment --</option>${taskOptions}
                        </select>
                        <button id="btn-save-assign" class="btn-primary" style="width:100%;">Save</button>
                    ` : `<div style="text-align:center; color:var(--text-dim); padding:10px;">No tasks found for this trade/date.</div>`}
                </div>
                <div style="background:var(--bg-dark); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                    <label style="display:block; color:var(--text-bright); margin-bottom:10px; font-weight:600;">PTO Range</label>
                    <div style="display:flex; gap:10px; margin-bottom:15px;">
                        <input type="date" id="pto-start-date" class="form-control" value="${dateStr}" style="flex:1; padding:5px; background:var(--bg-medium); color:white; border:1px solid var(--border-color);">
                        <input type="date" id="pto-end-date" class="form-control" value="${dateStr}" style="flex:1; padding:5px; background:var(--bg-medium); color:white; border:1px solid var(--border-color);">
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button id="btn-mark-avail" style="flex:1; padding:10px; background:${!isPTO ? 'rgba(76,175,80,0.2)' : 'transparent'}; border:1px solid var(--border-color); color:white; border-radius:6px;">Clear</button>
                        <button id="btn-mark-pto" style="flex:1; padding:10px; background:${isPTO ? 'rgba(244,67,54,0.2)' : 'transparent'}; border:1px solid var(--border-color); color:white; border-radius:6px;">Mark PTO</button>
                    </div>
                </div>
            </div>
        `, async () => {});

        setTimeout(() => {
            const assignBtn = document.getElementById('btn-save-assign');
            const ptoBtn = document.getElementById('btn-mark-pto');
            const availBtn = document.getElementById('btn-mark-avail');

            if(assignBtn) assignBtn.onclick = async () => {
                const taskId = document.getElementById('assign-task-select').value;
                if (taskId) {
                    await supabase.from('project_tasks').update({ assigned_talent_id: person.id }).eq('id', taskId);
                    await supabase.from('talent_availability').delete().match({ talent_id: person.id, date: dateStr });
                } else if (currentTask) {
                    await supabase.from('project_tasks').update({ assigned_talent_id: null }).eq('id', currentTask.id);
                }
                hideModal(); loadTalentData();
            };

            if(ptoBtn) ptoBtn.onclick = async () => {
                const start = dayjs(document.getElementById('pto-start-date').value);
                const end = dayjs(document.getElementById('pto-end-date').value);
                const diff = end.diff(start, 'day');
                if (diff < 0) { alert("Invalid date range"); return; }
                const upsertData = [];
                for(let i=0; i<=diff; i++) upsertData.push({ talent_id: person.id, date: start.add(i, 'day').format('YYYY-MM-DD'), status: 'PTO' });
                await supabase.from('talent_availability').upsert(upsertData, { onConflict: 'talent_id, date' });
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
