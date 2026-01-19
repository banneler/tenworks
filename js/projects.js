import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    formatCurrency, 
    showModal, 
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
        currentView: 'resource', // 'resource' or 'project'
        trades: [],
        projects: [],
        tasks: []
    };

    // --- VIEW TOGGLES ---
    const btnResource = document.getElementById('view-resource-btn');
    const btnProject = document.getElementById('view-project-btn');

    btnResource.addEventListener('click', () => switchView('resource'));
    btnProject.addEventListener('click', () => switchView('project'));

    function switchView(view) {
        state.currentView = view;
        // Update Buttons
        if(view === 'resource') {
            btnResource.style.background = 'var(--primary-blue)';
            btnResource.style.color = 'white';
            btnProject.style.background = 'transparent';
            btnProject.style.color = 'var(--text-dim)';
        } else {
            btnProject.style.background = 'var(--primary-blue)';
            btnProject.style.color = 'white';
            btnResource.style.background = 'transparent';
            btnResource.style.color = 'var(--text-dim)';
        }
        renderGantt(); // Re-render with new mode
    }

    // --- DATA LOADING ---
    async function loadShopData() {
        console.log("Loading Shop Data...");
        
        const { data: trades } = await supabase.from('shop_trades').select('*').order('id');
        state.trades = trades || [];

        const { data: tasks } = await supabase.from('project_tasks').select(`*, projects(name, project_value), shop_trades(name)`);
        state.tasks = tasks || [];

        const { data: projects } = await supabase.from('projects').select('*').order('start_date');
        state.projects = projects || [];

        renderGantt();
        updateMetrics();
    }

    // --- MAIN RENDER ENGINE ---
    function renderGantt() {
        const resourceList = document.getElementById('gantt-resource-list');
        const gridCanvas = document.getElementById('gantt-grid-canvas');
        const dateHeader = document.getElementById('gantt-date-header');

        // 1. SETUP TIMELINE (Shared)
        let dateHtml = '';
        // Start view 2 days ago so we can see recent history
        const startDate = dayjs().subtract(2, 'day'); 
        const daysToRender = 30;
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

        // 2. RENDER ROWS (Based on View Mode)
        resourceList.innerHTML = '';
        gridCanvas.innerHTML = '';

        const rows = state.currentView === 'resource' ? state.trades : state.projects;

        rows.forEach((rowItem, index) => {
            // A. Sidebar Row
            const rowEl = document.createElement('div');
            rowEl.className = 'resource-row';
            
            if (state.currentView === 'resource') {
                // Resource Mode: Show Trade Name
                rowEl.innerHTML = `
                    <div class="resource-name">${rowItem.name}</div>
                    <div class="resource-role">$${rowItem.default_hourly_rate}/hr</div>
                `;
            } else {
                // Project Mode: Show Project Name & Status
                let statusColor = '#888';
                if(rowItem.status === 'Fabrication') statusColor = 'var(--primary-blue)';
                if(rowItem.status === 'Installation') statusColor = 'var(--warning-yellow)';
                
                rowEl.innerHTML = `
                    <div class="resource-name">${rowItem.name}</div>
                    <div class="resource-role" style="color:${statusColor}">${rowItem.status}</div>
                `;
            }
            resourceList.appendChild(rowEl);

            // B. Render Bars for this Row
            // Filter tasks that belong to this row
            const rowTasks = state.tasks.filter(t => {
                if (state.currentView === 'resource') return t.trade_id === rowItem.id;
                else return t.project_id === rowItem.id;
            });

            rowTasks.forEach(task => {
                const start = dayjs(task.start_date);
                const end = dayjs(task.end_date);
                const diff = start.diff(startDate, 'day');
                const duration = end.diff(start, 'day') + 1;

                // Skip if entirely off-screen
                if (diff + duration < 0) return; 

                const bar = document.createElement('div');
                bar.className = 'gantt-task-bar';
                
                // Position
                bar.style.top = `${(index * 70) + 15}px`; 
                bar.style.left = `${diff * dayWidth}px`;
                bar.style.width = `${(duration * dayWidth) - 10}px`;

                // Color Logic
                // Resource View = Gold Bars
                // Project View = Color by Trade? Or different shades?
                // Let's keep it Gold for now, maybe add a specific class later
                
                const percent = task.estimated_hours ? (task.actual_hours / task.estimated_hours) : 0;
                const burnColor = percent > 1 ? '#ff4444' : 'var(--warning-yellow)';

                // Label Logic
                const label = state.currentView === 'resource' 
                    ? task.projects?.name // In Resource view, see Project Name
                    : task.shop_trades?.name; // In Project view, see Trade Name (e.g. "Design")

                bar.innerHTML = `
                    <span class="gantt-task-info">${label || task.name}</span>
                    <div class="burn-line" style="width: ${Math.min(percent * 100, 100)}%; background: ${burnColor}; box-shadow: 0 0 5px ${burnColor};"></div>
                `;
                
                // Tooltip
                bar.title = `${task.name}\n${task.start_date} - ${task.end_date}`;

                gridCanvas.appendChild(bar);
            });
        });
    }

    // --- METRICS ---
    function updateMetrics() {
        const activeProjects = state.projects.filter(p => p.status !== 'Completed');
        const totalRev = activeProjects.reduce((acc, p) => acc + (p.project_value || 0), 0);
        
        const revenueEl = document.getElementById('metrics-revenue');
        const countEl = document.getElementById('metrics-count');
        
        if(revenueEl) revenueEl.textContent = formatCurrency(totalRev);
        if(countEl) countEl.textContent = activeProjects.length;

        // Utilization: Active Tasks vs Capacity
        const today = dayjs();
        const activeTasks = state.tasks.filter(t => dayjs(t.start_date).isBefore(today) && dayjs(t.end_date).isAfter(today)).length;
        const load = Math.min((activeTasks / 5) * 100, 100);
        
        const loadBar = document.getElementById('metrics-load-bar');
        const loadText = document.getElementById('metrics-load-text');
        if(loadBar) loadBar.style.width = `${load}%`;
        if(loadText) loadText.textContent = `${Math.round(load)}%`;
    }

    // --- LAUNCH BUTTON (Your existing logic) ---
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
                
                // Auto-Generate Waterfall Tasks
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
