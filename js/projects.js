import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    formatCurrency, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs, 
    setupGlobalSearch 
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

document.addEventListener("DOMContentLoaded", async () => {
    // --- INIT ---
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    await setupUserMenuAndAuth(supabase, { currentUser: user });
    await setupGlobalSearch(supabase, user);

    // --- STATE ---
    let state = {
        currentView: 'resource',
        trades: [],
        projects: [],
        tasks: [],
        isDragging: false,
        dragTask: null,
        dragStartX: 0,
        dragStartLeft: 0,
        dragEl: null
    };

    // --- VIEW TOGGLES ---
    const btnResource = document.getElementById('view-resource-btn');
    const btnProject = document.getElementById('view-project-btn');

    btnResource.addEventListener('click', () => switchView('resource'));
    btnProject.addEventListener('click', () => switchView('project'));

    function switchView(view) {
        state.currentView = view;
        if(view === 'resource') {
            btnResource.classList.add('active');
            btnResource.style.background = 'var(--primary-blue)';
            btnResource.style.color = 'white';
            btnProject.style.background = 'transparent';
            btnProject.style.color = 'var(--text-dim)';
        } else {
            btnProject.classList.add('active');
            btnProject.style.background = 'var(--primary-blue)';
            btnProject.style.color = 'white';
            btnResource.style.background = 'transparent';
            btnResource.style.color = 'var(--text-dim)';
        }
        renderGantt();
    }

    // --- DATA LOADING ---
    async function loadShopData() {
        console.log("Loading Shop Data...");
        
        const { data: trades } = await supabase.from('shop_trades').select('*').order('id');
        state.trades = trades || [];

        const { data: tasks } = await supabase.from('project_tasks').select(`*, projects(name), shop_trades(name)`);
        state.tasks = tasks || [];

        const { data: projects } = await supabase.from('projects').select('*').order('start_date');
        state.projects = projects || [];

        renderGantt();
        updateMetrics();
    }

    // --- RENDER ENGINE ---
    function renderGantt() {
        const resourceList = document.getElementById('gantt-resource-list');
        const gridCanvas = document.getElementById('gantt-grid-canvas');
        const dateHeader = document.getElementById('gantt-date-header');

        // 1. TIMELINE SETUP
        let dateHtml = '';
        const startDate = dayjs().subtract(5, 'day'); 
        const daysToRender = 45; // Increased range
        const dayWidth = 100;

        for (let i = 0; i < daysToRender; i++) {
            const current = startDate.add(i, 'day');
            const isWeekend = current.day() === 0 || current.day() === 6;
            const isToday = current.isSame(dayjs(), 'day');
            dateHtml += `
                <div class="date-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}">
                    <span style="font-weight:700;">${current.format('DD')}</span>
                    <span>${current.format('ddd')}</span>
                </div>
            `;
        }
        dateHeader.innerHTML = dateHtml;
        const totalWidth = daysToRender * dayWidth;
        dateHeader.style.width = `${totalWidth}px`;
        gridCanvas.style.width = `${totalWidth}px`;

        // 2. RENDER ROWS
        resourceList.innerHTML = '';
        gridCanvas.innerHTML = '';

        const rows = state.currentView === 'resource' ? state.trades : state.projects;

        rows.forEach((rowItem, index) => {
            // Sidebar Row
            const rowEl = document.createElement('div');
            rowEl.className = 'resource-row';
            
            if (state.currentView === 'resource') {
                rowEl.innerHTML = `
                    <div class="resource-name">${rowItem.name}</div>
                    <div class="resource-role">$${rowItem.default_hourly_rate}/hr</div>
                `;
            } else {
                let statusColor = '#888';
                if(rowItem.status === 'Fabrication') statusColor = 'var(--primary-blue)';
                if(rowItem.status === 'Installation') statusColor = 'var(--warning-yellow)';
                rowEl.innerHTML = `
                    <div class="resource-name">${rowItem.name}</div>
                    <div class="resource-role" style="color:${statusColor}">${rowItem.status}</div>
                `;
            }
            resourceList.appendChild(rowEl);

            // Filter Tasks
            const rowTasks = state.tasks.filter(t => {
                if (state.currentView === 'resource') return t.trade_id === rowItem.id;
                else return t.project_id === rowItem.id;
            });

            // Render Bars
            rowTasks.forEach(task => {
                const start = dayjs(task.start_date);
                const end = dayjs(task.end_date);
                const diff = start.diff(startDate, 'day');
                const duration = end.diff(start, 'day') + 1;

                if (diff + duration < 0) return;

                const bar = document.createElement('div');
                bar.className = 'gantt-task-bar';
                bar.style.top = `${(index * 70) + 15}px`; 
                bar.style.left = `${diff * dayWidth}px`;
                bar.style.width = `${(duration * dayWidth) - 10}px`;
                
                // Add styling cursor
                bar.style.cursor = 'grab';

                const percent = task.estimated_hours ? (task.actual_hours / task.estimated_hours) : 0;
                const burnColor = percent > 1 ? '#ff4444' : 'var(--warning-yellow)';
                const label = state.currentView === 'resource' ? task.projects?.name : task.shop_trades?.name;

                bar.innerHTML = `
                    <span class="gantt-task-info" style="pointer-events:none;">${label || task.name}</span>
                    <div class="burn-line" style="width: ${Math.min(percent * 100, 100)}%; background: ${burnColor}; box-shadow: 0 0 5px ${burnColor}; pointer-events:none;"></div>
                `;
                
                // MOUSE EVENTS FOR DRAG AND CLICK
                // We use mousedown to distinguish between a "Click" (Edit) and a "Drag" (Move)
                bar.addEventListener('mousedown', (e) => handleDragStart(e, task, bar));

                gridCanvas.appendChild(bar);
            });
        });
    }

    // --- DRAG AND DROP ENGINE ---
    function handleDragStart(e, task, element) {
        // Only left click
        if (e.button !== 0) return;

        state.isDragging = true;
        state.dragTask = task;
        state.dragEl = element;
        state.dragStartX = e.clientX;
        state.dragStartLeft = parseInt(element.style.left || 0);
        state.hasMoved = false; // Track if this was a click or a drag

        element.style.cursor = 'grabbing';
        element.style.zIndex = 1000; // Bring to front
        element.style.transition = 'none'; // Disable smooth transition for instant follow

        // Attach global listeners
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    }

    function handleDragMove(e) {
        if (!state.isDragging) return;
        
        const deltaX = e.clientX - state.dragStartX;
        
        // If moved more than 5 pixels, consider it a drag
        if (Math.abs(deltaX) > 5) state.hasMoved = true;

        // Visual Update Only
        state.dragEl.style.left = `${state.dragStartLeft + deltaX}px`;
    }

    async function handleDragEnd(e) {
        if (!state.isDragging) return;

        // Clean up
        state.isDragging = false;
        state.dragEl.style.cursor = 'grab';
        state.dragEl.style.zIndex = '';
        state.dragEl.style.transition = 'all 0.2s'; // Re-enable smoothing
        
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);

        // CHECK: Was this a Click or a Drag?
        if (!state.hasMoved) {
            // It was just a click -> Open Modal
            openTaskModal(state.dragTask);
            // Reset position just in case
            state.dragEl.style.left = `${state.dragStartLeft}px`;
            return;
        }

        // IT WAS A DRAG -> Calculate New Dates
        const currentLeft = parseInt(state.dragEl.style.left || 0);
        
        // Snap to Grid (100px)
        const snapLeft = Math.round(currentLeft / 100) * 100;
        state.dragEl.style.left = `${snapLeft}px`; // Visual Snap

        // Calculate Date Shift
        const pixelShift = snapLeft - state.dragStartLeft;
        const dayShift = Math.round(pixelShift / 100);

        if (dayShift !== 0) {
            // Apply Shift to Dates
            const newStart = dayjs(state.dragTask.start_date).add(dayShift, 'day').format('YYYY-MM-DD');
            const newEnd = dayjs(state.dragTask.end_date).add(dayShift, 'day').format('YYYY-MM-DD');

            console.log(`Shifting task ${state.dragTask.name} by ${dayShift} days.`);

            // DB Update
            const { error } = await supabase
                .from('project_tasks')
                .update({ start_date: newStart, end_date: newEnd })
                .eq('id', state.dragTask.id);

            if (error) {
                alert("Failed to move task: " + error.message);
                state.dragEl.style.left = `${state.dragStartLeft}px`; // Revert
            } else {
                // Update local state so we don't need full reload
                state.dragTask.start_date = newStart;
                state.dragTask.end_date = newEnd;
            }
        }
    }

    // --- INTERACTIVITY: EDIT MODAL ---
    function openTaskModal(task) {
        showModal(`Edit Task: ${task.name}`, `
            <div class="form-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <div>
                    <label>Status</label>
                    <select id="edit-status" class="form-control" style="background:var(--bg-dark); color:white; padding:8px;">
                        <option value="Pending" ${task.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                        <option value="Completed" ${task.status === 'Completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </div>
                <div>
                    <label>Actual Hours (Burn)</label>
                    <input type="number" id="edit-actual" class="form-control" value="${task.actual_hours}">
                </div>
                <div>
                    <label>Start Date</label>
                    <input type="date" id="edit-start" class="form-control" value="${task.start_date}">
                </div>
                <div>
                    <label>End Date</label>
                    <input type="date" id="edit-end" class="form-control" value="${task.end_date}">
                </div>
            </div>
            <div style="margin-top:15px; text-align:right;">
                <button id="delete-task-btn" style="background:#773030; color:white; border:none; padding:8px 12px; border-radius:4px; float:left;">Delete Task</button>
            </div>
        `, async () => {
            // SAVE LOGIC
            const newStatus = document.getElementById('edit-status').value;
            const newActual = document.getElementById('edit-actual').value;
            const newStart = document.getElementById('edit-start').value;
            const newEnd = document.getElementById('edit-end').value;

            const { error } = await supabase
                .from('project_tasks')
                .update({ 
                    status: newStatus, 
                    actual_hours: newActual,
                    start_date: newStart,
                    end_date: newEnd
                })
                .eq('id', task.id);

            if (error) alert('Error updating task: ' + error.message);
            else loadShopData();
        });

        // Attach Delete Listener after modal render
        setTimeout(() => {
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

    // --- METRICS & LAUNCH (Same as before) ---
    function updateMetrics() {
        const activeProjects = state.projects.filter(p => p.status !== 'Completed');
        const totalRev = activeProjects.reduce((acc, p) => acc + (p.project_value || 0), 0);
        
        const revenueEl = document.getElementById('metrics-revenue');
        const countEl = document.getElementById('metrics-count');
        const loadBar = document.getElementById('metrics-load-bar');
        const loadText = document.getElementById('metrics-load-text');
        
        if(revenueEl) revenueEl.textContent = formatCurrency(totalRev);
        if(countEl) countEl.textContent = activeProjects.length;

        const today = dayjs();
        const activeTasks = state.tasks.filter(t => dayjs(t.start_date).isBefore(today) && dayjs(t.end_date).isAfter(today)).length;
        const load = Math.min((activeTasks / 5) * 100, 100);
        
        if(loadBar) loadBar.style.width = `${load}%`;
        if(loadText) loadText.textContent = `${Math.round(load)}%`;
    }

    const launchBtn = document.getElementById('launch-new-project-btn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            const { data: deals } = await supabase.from('deals_tw').select('*').eq('stage', 'Closed Won');
            if (!deals || deals.length === 0) { alert("No 'Closed Won' deals!"); return; }

            const options = deals.map(d => `<option value="${d.id}" data-name="${d.deal_name}" data-amt="${d.amount}">${d.deal_name} (${formatCurrency(d.amount)})</option>`).join('');

            showModal('Launch Project', `
                <div class="form-group"><label>Select Deal:</label><select id="launch-deal" class="form-control" style="background:var(--bg-dark);color:white;padding:10px;">${options}</select></div>
                <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div><label>Start:</label><input type="date" id="launch-start" class="form-control" value="${dayjs().format('YYYY-MM-DD')}"></div>
                    <div><label>End:</label><input type="date" id="launch-end" class="form-control" value="${dayjs().add(30,'day').format('YYYY-MM-DD')}"></div>
                </div>
            `, async () => {
                const sel = document.getElementById('launch-deal');
                const start = document.getElementById('launch-start').value;
                const end = document.getElementById('launch-end').value;
                
                const { data: proj, error } = await supabase.from('projects').insert([{
                    deal_id: sel.value, name: sel.options[sel.selectedIndex].dataset.name, start_date: start, end_date: end, project_value: sel.options[sel.selectedIndex].dataset.amt
                }]).select();
                
                if(error) { alert(error.message); return; }
                const pid = proj[0].id;
                
                const s = dayjs(start);
                const tasks = [
                    { project_id: pid, trade_id: state.trades[0]?.id||1, name: 'Kickoff', start_date: start, end_date: s.add(2,'day').format('YYYY-MM-DD'), estimated_hours: 5 },
                    { project_id: pid, trade_id: state.trades[1]?.id||2, name: 'Design', start_date: s.add(3,'day').format('YYYY-MM-DD'), end_date: s.add(10,'day').format('YYYY-MM-DD'), estimated_hours: 20 },
                    { project_id: pid, trade_id: state.trades[2]?.id||3, name: 'Fab', start_date: s.add(11,'day').format('YYYY-MM-DD'), end_date: s.add(20,'day').format('YYYY-MM-DD'), estimated_hours: 60 },
                    { project_id: pid, trade_id: state.trades[4]?.id||5, name: 'Install', start_date: s.add(21,'day').format('YYYY-MM-DD'), end_date: end, estimated_hours: 15 }
                ];
                await supabase.from('project_tasks').insert(tasks);
                loadShopData();
            });
        });
    }

    loadShopData();
});
