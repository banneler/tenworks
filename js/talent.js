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
    // --- AUTH & INIT ---
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    await setupUserMenuAndAuth(supabase, { currentUser: user });

    let state = {
        talent: [],
        availability: [],
        assignments: [],
        viewDate: dayjs(), 
        daysToShow: 14
    };

    // --- CONTROLS ---
    document.getElementById('prev-week-btn').addEventListener('click', () => { state.viewDate = state.viewDate.subtract(7, 'day'); renderMatrix(); });
    document.getElementById('next-week-btn').addEventListener('click', () => { state.viewDate = state.viewDate.add(7, 'day'); renderMatrix(); });

    // --- LOAD DATA ---
    async function loadTalentData() {
        console.log("Loading Talent Matrix...");
        
        // Parallel Fetch
        const [talentRes, availRes, tasksRes] = await Promise.all([
            supabase.from('shop_talent').select('*').order('name'),
            supabase.from('talent_availability').select('*'),
            // Only fetch tasks that are assigned to someone
            supabase.from('project_tasks').select('*, projects(name)').not('assigned_talent_id', 'is', null)
        ]);

        state.talent = talentRes.data || [];
        state.availability = availRes.data || [];
        state.assignments = tasksRes.data || [];

        renderMatrix();
    }

    // --- RENDER ENGINE ---
    function renderMatrix() {
        // 1. Update Date Label
        const endViewDate = state.viewDate.add(state.daysToShow - 1, 'day');
        document.getElementById('current-week-label').textContent = `${state.viewDate.format('MMM D')} - ${endViewDate.format('MMM D, YYYY')}`;

        // 2. Render Header (Dates)
        const dateHeader = document.getElementById('matrix-date-header');
        let headerHtml = '';
        const colWidth = 120; // Wider columns for readability

        for(let i=0; i<state.daysToShow; i++) {
            const d = state.viewDate.add(i, 'day');
            const isWeekend = d.day() === 0 || d.day() === 6;
            const isToday = d.isSame(dayjs(), 'day');
            
            // Apply Dark Mode styling logic directly
            const bgStyle = isWeekend ? 'background:rgba(255,255,255,0.03);' : '';
            const textStyle = isToday ? 'color:var(--primary-gold);' : 'color:var(--text-bright);';
            const borderStyle = isToday ? 'border-bottom: 2px solid var(--primary-gold);' : '';

            headerHtml += `
                <div style="min-width:${colWidth}px; width:${colWidth}px; border-right:1px solid var(--border-color); padding:10px; text-align:center; display:flex; flex-direction:column; justify-content:center; ${bgStyle} ${borderStyle}">
                    <div style="font-size:1.4rem; font-family:'Rajdhani', sans-serif; font-weight:700; ${textStyle}">${d.format('DD')}</div>
                    <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-dim); letter-spacing:1px;">${d.format('ddd')}</div>
                </div>
            `;
        }
        dateHeader.innerHTML = headerHtml;

        // 3. Render Body (Talent Rows)
        const resList = document.getElementById('matrix-resource-list');
        const gridCanvas = document.getElementById('matrix-grid-canvas');
        
        resList.innerHTML = '';
        gridCanvas.innerHTML = '';

        state.talent.forEach((person, index) => {
            // Zebra Striping
            const rowBg = index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';

            // A. Sidebar Card
            const rowEl = document.createElement('div');
            rowEl.className = 'talent-row';
            rowEl.style.backgroundColor = rowBg; 
            rowEl.innerHTML = `
                <div class="talent-avatar">${getInitials(person.name)}</div>
                <div class="talent-info">
                    <h4>${person.name}</h4>
                    <span>${person.role}</span>
                </div>
            `;
            resList.appendChild(rowEl);

            // B. Grid Row
            const gridRow = document.createElement('div');
            gridRow.style.display = 'flex';
            gridRow.style.height = '60px'; // Match CSS
            gridRow.style.backgroundColor = rowBg; 

            for(let i=0; i<state.daysToShow; i++) {
                const d = state.viewDate.add(i, 'day');
                const dateStr = d.format('YYYY-MM-DD');
                
                // Find Status
                const avail = state.availability.find(a => a.talent_id === person.id && a.date === dateStr);
                
                // Check Assignments (Is this person assigned to a task today?)
                const task = state.assignments.find(t => 
                    t.assigned_talent_id === person.id && 
                    (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && 
                    (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)))
                );

                const cell = document.createElement('div');
                cell.className = 'talent-grid-cell';
                cell.style.minWidth = `${colWidth}px`;
                cell.style.width = `${colWidth}px`;

                // Render Cell Content
                if (avail && avail.status === 'PTO') {
                    cell.classList.add('status-pto');
                    cell.innerHTML = '<i class="fas fa-umbrella-beach" style="margin-right:5px;"></i> OFF';
                } else if (task) {
                    cell.classList.add('status-assigned');
                    cell.innerHTML = `<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.7rem;">${task.projects?.name}</span>`;
                    cell.title = `Task: ${task.name}\nProject: ${task.projects?.name}`;
                }

                // Click to Edit
                cell.addEventListener('click', () => handleCellClick(person, dateStr, avail, task));
                gridRow.appendChild(cell);
            }
            gridCanvas.appendChild(gridRow);
        });
    }

    function getInitials(name) {
        return name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
    }

    // --- INTERACTION ---
    function handleCellClick(person, dateStr, avail, task) {
        if (task) {
            alert(`Task: ${task.name}\nProject: ${task.projects?.name}\nDates: ${task.start_date} -> ${task.end_date}`);
            return;
        }

        const isPTO = avail && avail.status === 'PTO';
        
        showModal(`Update Status: ${person.name}`, `
            <div style="text-align:center; margin-bottom:20px;">
                <h3 style="color:var(--text-bright); font-family:'Rajdhani'">${dayjs(dateStr).format('dddd, MMM D')}</h3>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <button id="set-avail" class="btn-toggle" style="padding:15px; border:1px solid var(--border-color); border-radius:8px; background:${!isPTO ? 'var(--primary-blue)' : 'transparent'}; color:white; cursor:pointer;">
                    <i class="fas fa-check-circle"></i> Available
                </button>
                <button id="set-pto" class="btn-toggle" style="padding:15px; border:1px solid var(--border-color); border-radius:8px; background:${isPTO ? '#d32f2f' : 'transparent'}; color:white; cursor:pointer;">
                    <i class="fas fa-plane"></i> Mark PTO
                </button>
            </div>
        `, async () => {
            // Modal close hook
        });

        setTimeout(() => {
            document.getElementById('set-avail').onclick = async () => {
                await supabase.from('talent_availability').delete().match({ talent_id: person.id, date: dateStr });
                hideModal();
                loadTalentData();
            };
            document.getElementById('set-pto').onclick = async () => {
                await supabase.from('talent_availability').upsert({ talent_id: person.id, date: dateStr, status: 'PTO' });
                hideModal();
                loadTalentData();
            };
        }, 50);
    }

    loadTalentData();
});
