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
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    await setupUserMenuAndAuth(supabase, { currentUser: user });

    let state = {
        talent: [],
        availability: [],
        assignments: [],
        viewDate: dayjs(), // Start date of view
        daysToShow: 14
    };

    // --- CONTROLS ---
    document.getElementById('prev-week-btn').addEventListener('click', () => { state.viewDate = state.viewDate.subtract(7, 'day'); renderMatrix(); });
    document.getElementById('next-week-btn').addEventListener('click', () => { state.viewDate = state.viewDate.add(7, 'day'); renderMatrix(); });

    // --- LOAD DATA ---
    async function loadTalentData() {
        console.log("Loading Talent Matrix...");
        const [talentRes, availRes, tasksRes] = await Promise.all([
            supabase.from('shop_talent').select('*').order('name'),
            supabase.from('talent_availability').select('*'),
            supabase.from('project_tasks').select('*, projects(name)').not('assigned_talent_id', 'is', null)
        ]);

        state.talent = talentRes.data || [];
        state.availability = availRes.data || [];
        state.assignments = tasksRes.data || [];

        renderMatrix();
    }

    // --- RENDER ---
    function renderMatrix() {
        // 1. Update Label
        document.getElementById('current-week-label').textContent = `${state.viewDate.format('MMM D')} - ${state.viewDate.add(state.daysToShow, 'day').format('MMM D')}`;

        // 2. Render Header (Dates)
        const dateHeader = document.getElementById('matrix-date-header');
        let headerHtml = '';
        const colWidth = 100; // px

        for(let i=0; i<state.daysToShow; i++) {
            const d = state.viewDate.add(i, 'day');
            const isWeekend = d.day() === 0 || d.day() === 6;
            const isToday = d.isSame(dayjs(), 'day');
            headerHtml += `
                <div style="min-width:${colWidth}px; width:${colWidth}px; border-right:1px solid var(--border-color); padding:10px; text-align:center; background:${isWeekend ? 'rgba(0,0,0,0.2)' : 'transparent'}; ${isToday ? 'color:var(--primary-blue); font-weight:bold;' : ''}">
                    <div style="font-size:1.2rem; font-family:'Rajdhani'">${d.format('DD')}</div>
                    <div style="font-size:0.7rem; color:var(--text-dim)">${d.format('ddd')}</div>
                </div>
            `;
        }
        dateHeader.innerHTML = headerHtml;

        // 3. Render Rows (Talent)
        const resList = document.getElementById('matrix-resource-list');
        const gridCanvas = document.getElementById('matrix-grid-canvas');
        
        resList.innerHTML = '';
        gridCanvas.innerHTML = '';

        state.talent.forEach(person => {
            // Sidebar Item
            const rowEl = document.createElement('div');
            rowEl.style.height = '50px';
            rowEl.style.borderBottom = '1px solid var(--border-color)';
            rowEl.style.padding = '0 15px';
            rowEl.style.display = 'flex';
            rowEl.style.alignItems = 'center';
            rowEl.innerHTML = `
                <div class="talent-avatar">${getInitials(person.name)}</div>
                <div>
                    <div style="font-weight:600; font-size:0.9rem;">${person.name}</div>
                    <div style="font-size:0.7rem; color:var(--text-dim);">${person.role}</div>
                </div>
            `;
            resList.appendChild(rowEl);

            // Grid Row
            const gridRow = document.createElement('div');
            gridRow.style.display = 'flex';
            gridRow.style.height = '50px';

            for(let i=0; i<state.daysToShow; i++) {
                const d = state.viewDate.add(i, 'day');
                const dateStr = d.format('YYYY-MM-DD');
                
                // Check Status
                // A. Availability (PTO)
                const avail = state.availability.find(a => a.talent_id === person.id && a.date === dateStr);
                // B. Assignment (Task)
                const task = state.assignments.find(t => t.assigned_talent_id === person.id && 
                    (d.isSame(dayjs(t.start_date)) || d.isAfter(dayjs(t.start_date))) && 
                    (d.isSame(dayjs(t.end_date)) || d.isBefore(dayjs(t.end_date)))
                );

                const cell = document.createElement('div');
                cell.className = 'talent-grid-cell';
                cell.style.minWidth = `${colWidth}px`;
                cell.style.width = `${colWidth}px`;

                if (avail && avail.status === 'PTO') {
                    cell.classList.add('status-pto');
                    cell.innerHTML = '<i class="fas fa-plane"></i> PTO';
                } else if (task) {
                    cell.classList.add('status-assigned');
                    cell.innerHTML = `<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:0 5px;">${task.projects?.name || 'Job'}</span>`;
                    cell.title = `${task.name} (${task.projects?.name})`;
                } else {
                    // Empty / Available
                    cell.innerHTML = '';
                }

                // Click Event -> Toggle PTO or View Details
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
            alert(`Assigned: ${task.name}\nProject: ${task.projects?.name}\nDates: ${task.start_date} to ${task.end_date}`);
            return;
        }

        const isPTO = avail && avail.status === 'PTO';
        
        showModal(`${person.name} - ${dateStr}`, `
            <p>Set status for ${dayjs(dateStr).format('MMMM D, YYYY')}:</p>
            <div style="display:flex; gap:10px; margin-top:15px;">
                <button id="set-avail" class="btn-toggle" style="flex:1; border:1px solid var(--border-color); padding:10px; ${!isPTO ? 'background:var(--primary-blue); color:white;' : ''}">Available</button>
                <button id="set-pto" class="btn-toggle" style="flex:1; border:1px solid var(--border-color); padding:10px; ${isPTO ? 'background:#d9534f; color:white;' : ''}">PTO / Out</button>
            </div>
        `, async () => {
            // Confirm logic handled by buttons mostly, but this is the "Close" hook
        });

        // Bind buttons inside modal
        setTimeout(() => {
            document.getElementById('set-avail').onclick = async () => {
                // Delete availability record (Back to default)
                await supabase.from('talent_availability').delete().match({ talent_id: person.id, date: dateStr });
                hideModal();
                loadTalentData();
            };
            document.getElementById('set-pto').onclick = async () => {
                // Upsert PTO record
                await supabase.from('talent_availability').upsert({ talent_id: person.id, date: dateStr, status: 'PTO' });
                hideModal();
                loadTalentData();
            };
        }, 50);
    }

    loadTalentData();
});
