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
    // --- 1. INITIALIZATION ---
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    await setupUserMenuAndAuth(supabase, { currentUser: user });
    await setupGlobalSearch(supabase, user);

    // --- 2. STATE MANAGEMENT ---
    let state = {
        currentView: 'resource', // 'resource' | 'project'
        trades: [],
        projects: [],
        tasks: [],
        // Drag State
        isDragging: false,
        dragTask: null,
        dragStartX: 0,
        dragStartLeft: 0,
        dragEl: null,
        hasMoved: false
    };

    // --- 3. VIEW CONTROLS ---
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

    // --- 4. DATA LOADING ---
    async function loadShopData() {
        console.log("Loading Ten Works Production Data...");
        
        // Load Trades (Rows for Resource View)
        const { data: trades } = await supabase.from('shop_trades').select('*').order('id');
        state.trades = trades || [];

        // Load Tasks (The Bars) - Join with Projects and Trades for labels
        const { data: tasks } = await supabase.from('project_tasks').select(`*, projects(name), shop_trades(name)`);
        state.tasks = tasks || [];

        // Load Projects (Rows for Project View)
        const { data: projects } = await supabase.from('projects').select('*').order('start_date');
        state.projects = projects || [];

        renderGantt();
        updateMetrics();
    }

    // --- 5. RENDER ENGINE ---
    function renderGantt() {
        const resourceList = document.getElementById('gantt-resource-list');
        const gridCanvas = document.getElementById('gantt-grid-canvas');
        const dateHeader = document.getElementById('gantt-date-header');

        // A. TIMELINE SETUP
        let dateHtml = '';
        const startDate = dayjs().subtract(5, 'day'); // Show recent history
        const daysToRender = 45; // 6 week view
        const dayWidth = 100; // px per day

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

        // B. RENDER ROWS & BARS
        resourceList.innerHTML = '';
        gridCanvas.innerHTML = '';

        const rows = state.currentView === 'resource' ? state.trades : state.projects;

        rows.forEach((rowItem, index) => {
            // 1. Sidebar Row
            const rowEl = document.createElement('div');
            rowEl.className = 'resource-row';
            
            if (state.currentView === 'resource') {
                // Trade View
                rowEl.innerHTML = `
                    <div class="resource-name">${rowItem.name}</div>
                    <div class="resource-role">$${rowItem.default_hourly_rate}/hr</div>
                `;
            } else {
                // Project View
                let statusColor = '#888';
                if(rowItem.status === 'Fabrication') statusColor = 'var(--primary-blue)';
                if(rowItem.status === 'Installation') statusColor = 'var(--warning-yellow)';
                rowEl.innerHTML = `
                    <div class="resource-name">${rowItem.name}</div>
                    <div class="resource-role" style="color:${statusColor}">${rowItem.status}</div>
                `;
            }
            resourceList.appendChild(rowEl);

            // 2. Filter Tasks for this Row
            const rowTasks = state.tasks.filter(t => {
                if (state.currentView === 'resource') return t.trade_id === rowItem.id;
                else return t.project_id === rowItem.id;
            });

            // 3. Render Bars
            rowTasks.forEach(task => {
                const start = dayjs(task.start_date);
                const end = dayjs(task.end_date);
                const diff = start.diff(startDate, 'day');
                const duration = end.diff(start, 'day') + 1;

                // Skip off-screen tasks
                if (diff + duration < 0) return;

                const bar = document.createElement('div');
                bar.className = 'gantt-task-bar';
                // CSS Math: Row is 70px high. Top padding 15px.
                bar.style.top = `${(index * 70) + 15}px`; 
                bar.style.left = `${diff * dayWidth}px`;
                bar.style.width = `${(duration * dayWidth) - 10}px`; // -10px for gap
                bar.style.cursor = 'grab';

                // Burn Line Logic
                const percent = task.estimated_hours ? (task.actual_hours / task.estimated_hours) : 0;
                const burnColor = percent > 1 ? '#ff4444' : 'var(--warning-yellow)';
                
                // Label Logic
                const label = state.currentView === 'resource' 
                    ? task.projects?.name // Resource view shows Project Name
                    : task.shop_trades?.name; // Project view shows Trade Phase

                bar.innerHTML = `
                    <span class="gantt-task-info" style="pointer-events:none;">${label || task.name}</span>
                    <div class="burn-line" style="width: ${Math.min(percent * 100, 100)}%; background: ${burnColor}; box-shadow: 0 0 5px ${burnColor}; pointer-events:none;"></div>
                `;
                
                // Attach Physics Engine
                bar.addEventListener('mousedown', (e) => handleDragStart(e, task, bar));

                gridCanvas.appendChild(bar);
            });
        });
    }

    // --- 6. PHYSICS ENGINE (Drag & Cascade) ---
    function handleDragStart(e, task, element) {
        if (e.button !== 0) return; // Only Left Click

        state.isDragging = true;
        state.dragTask = task;
        state.dragEl = element;
        state.dragStartX = e.clientX;
        state.dragStartLeft = parseInt(element.style.left || 0);
        state.hasMoved = false;

        element.style.cursor = 'grabbing';
        element.style.zIndex = 1000;
        element.style.transition = 'none'; // Disable smoothing for instant drag

        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    }

    function handleDragMove(e) {
        if (!state.isDragging) return;
        
        const deltaX = e.clientX - state.dragStartX;
        if (Math.abs(deltaX) > 5) state.hasMoved = true; // threshold to detect drag vs click

        state.dragEl.style.left = `${state.dragStartLeft + deltaX}px`;
    }

    async function handleDragEnd(e) {
        if (!state.isDragging) return;

        // Cleanup
        state.isDragging = false;
        state.dragEl.style.cursor = 'grab';
        state.dragEl.style.zIndex = '';
        state.dragEl.style.transition = 'all 0.2s';
        
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);

        // A. Was it a click? -> Open Edit Modal
        if (!state.hasMoved) {
            state.dragEl.style.left = `${state.dragStartLeft}px`; // Reset slight bumps
            openTaskModal(state.dragTask);
            return;
        }

        // B. Was it a drag? -> Snap & Save
        const currentLeft = parseInt(state.dragEl.style.left || 0);
        const snapLeft = Math.round(currentLeft / 100) * 100; // Snap to 100px grid
        state.dragEl.style.left = `${snapLeft}px`; // Visual snap

        const pixelShift = snapLeft - state.dragStartLeft;
        const dayShift = Math.round(pixelShift / 100);

        if (dayShift !== 0) {
            // 1. Move the Parent Task
            const newStart = dayjs(state.dragTask.start_date).add(dayShift, 'day').format('YYYY-MM-DD');
            const newEnd = dayjs(state.dragTask.end_date).add(dayShift, 'day').format('YYYY-MM-DD');

            // Update UI State instantly (optimistic UI)
            state.dragTask.start_date = newStart;
            state.dragTask.end_date = newEnd;

            // Database Update
            await supabase.from('project_tasks').update({ start_date: newStart, end_date: newEnd }).eq('id', state.dragTask.id);

            // 2. THE DOMINO EFFECT (Cascade)
            const { data: children } = await supabase
                .from('project_tasks')
                .select('*')
                .eq('dependency_task_id', state.dragTask.id);

            if (children && children.length > 0) {
                console.log(`Cascading move to ${children.length} downstream tasks...`);
                for (let child of children) {
                    const cStart = dayjs(child.start_date).add(dayShift, 'day').format('YYYY-MM-DD');
                    const cEnd = dayjs(child.end_date).add(dayShift, 'day').format('YYYY-MM-DD');
                    
                    await supabase.from('project_tasks').update({ start_date: cStart, end_date: cEnd }).eq('id', child.id);
                }
                // Optional: Notify user
                // alert(`Schedule updated! Moved dependent tasks automatically.`);
            }

            // Reload to reflect all changes
            loadShopData();
        }
    }

    // --- 7. EDIT MODAL ---
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
                <button id="delete-task-btn" style="background:#773030; color:white; border:none; padding:8px 12px; border-radius:4px;">Delete Task</button>
            </div>
        `, async () => {
            // Save Changes
            const status = document.getElementById('edit-status').value;
            const actual = document.getElementById('edit-actual').value;
            const start = document.getElementById('edit-start').value;
            const end = document.getElementById('edit-end').value;

            const { error } = await supabase.from('project_tasks').update({ 
                status: status, actual_hours: actual, start_date: start, end_date: end 
            }).eq('id', task.id);

            if (error) alert(error.message);
            else loadShopData();
        });

        // Delete Logic
        setTimeout(() => {
            const delBtn = document.getElementById('delete-task-btn');
            if(delBtn) delBtn.onclick = async () => {
                if(confirm("Delete this task?")) {
                    await supabase.from('project_tasks').delete().eq('id', task.id);
                    hideModal();
                    loadShopData();
                }
            };
        }, 100);
    }

    // --- 8. METRICS ---
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
        const load = Math.min((activeTasks / 5) * 100, 100); // Assume capacity of 5 concurrent tasks
        
        if(loadBar) loadBar.style.width = `${load}%`;
        if(loadText) loadText.textContent = `${Math.round(load)}%`;
    }

    // --- 9. LAUNCH NEW PROJECT (Waterfall) ---
    const launchBtn = document.getElementById('launch-new-project-btn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            const { data: deals } = await supabase.from('deals_tw').select('*').eq('stage', 'Closed Won');
            if (!deals || deals.length === 0) { alert("No 'Closed Won' deals!"); return; }

            const options = deals.map(d => `<option value="${d.id}" data-name="${d.deal_name}" data-amt="${d.amount}">${d.deal_name} (${formatCurrency(d.amount)})</option>`).join('');

            showModal('Launch Production', `
                <div class="form-group"><label>Select Deal:</label><select id="launch-deal" class="form-control" style="background:var(--bg-dark);color:white;padding:10px;">${options}</select></div>
                <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div><label>Start:</label><input type="date" id="launch-start" class="form-control" value="${dayjs().format('YYYY-MM-DD')}"></div>
                    <div><label>Target Delivery:</label><input type="date" id="launch-end" class="form-control" value="${dayjs().add(30,'day').format('YYYY-MM-DD')}"></div>
                </div>
                <p style="margin-top:10px;color:var(--text-dim);font-size:0.8rem;">*Auto-creates dependency chain: Kickoff -> Design -> Fab -> Install</p>
            `, async () => {
                const sel = document.getElementById('launch-deal');
                const start = document.getElementById('launch-start').value;
                const end = document.getElementById('launch-end').value;
                const name = sel.options[sel.selectedIndex].dataset.name;
                const amt = sel.options[sel.selectedIndex].dataset.amt;

                // 1. Create Project
                const { data: proj, error } = await supabase.from('projects').insert([{
                    deal_id: sel.value, name: name, start_date: start, end_date: end, project_value: amt, status: 'Pre-Production'
                }]).select();

                if(error) { alert(error.message); return; }
                const pid = proj[0].id;
                const s = dayjs(start);

                // 2. CHAINED TASK CREATION (Waterfalls)
                // A. Kickoff
                const { data: t1 } = await supabase.from('project_tasks').insert({
                    project_id: pid, trade_id: state.trades[0]?.id||1, name: 'Kickoff & Plan', 
                    start_date: start, end_date: s.add(2,'day').format('YYYY-MM-DD'), estimated_hours: 5
                }).select();

                // B. Design (Depends on A)
                const { data: t2 } = await supabase.from('project_tasks').insert({
                    project_id: pid, trade_id: state.trades[1]?.id||2, name: 'CAD Drawings', 
                    start_date: s.add(3,'day').format('YYYY-MM-DD'), end_date: s.add(10,'day').format('YYYY-MM-DD'), estimated_hours: 20,
                    dependency_task_id: t1[0].id
                }).select();

                // C. Fab (Depends on B)
                const { data: t3 } = await supabase.from('project_tasks').insert({
                    project_id: pid, trade_id: state.trades[2]?.id||3, name: 'Fabrication', 
                    start_date: s.add(11,'day').format('YYYY-MM-DD'), end_date: s.add(25,'day').format('YYYY-MM-DD'), estimated_hours: 80,
                    dependency_task_id: t2[0].id
                }).select();

                // D. Install (Depends on C)
                await supabase.from('project_tasks').insert({
                    project_id: pid, trade_id: state.trades[4]?.id||5, name: 'Installation', 
                    start_date: s.add(26,'day').format('YYYY-MM-DD'), end_date: end, estimated_hours: 24,
                    dependency_task_id: t3[0].id
                });

                loadShopData();
            });
        });
    }

    // Go!
    loadShopData();
});
