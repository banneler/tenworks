import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    formatCurrency, 
    showModal, 
    setupUserMenuAndAuth, 
    loadSVGs, 
    setupGlobalSearch 
} from './shared_constants.js';

// --- 1. INITIALIZE SUPABASE CLIENT ---
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

document.addEventListener("DOMContentLoaded", async () => {
    // --- 2. AUTH & UI SETUP ---
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    await setupUserMenuAndAuth(supabase, { currentUser: user });
    await setupGlobalSearch(supabase, user);

    // --- 3. STATE MANAGEMENT ---
    let state = {
        trades: [],
        projects: [],
        tasks: []
    };

    // --- 4. DATA LOADING ---
    async function loadShopData() {
        console.log("Loading Shop Data...");
        
        // A. Load Trades (Y-Axis)
        const { data: trades, error: tradeError } = await supabase
            .from('shop_trades')
            .select('*')
            .order('id');
        
        if (tradeError) console.error("Trade Error:", tradeError);
        state.trades = trades || [];

        // B. Load Tasks (Gantt Bars)
        const { data: tasks, error: taskError } = await supabase
            .from('project_tasks')
            .select(`*, projects(name, project_value)`);

        if (taskError) console.error("Task Error:", taskError);
        state.tasks = tasks || [];

        // C. Load Projects (For Launch List & Metrics)
        const { data: projects } = await supabase.from('projects').select('*');
        state.projects = projects || [];

        renderGantt();
        updateMetrics();
    }

    // --- 5. RENDER FUNCTIONS ---
    function renderGantt() {
        const resourceList = document.getElementById('gantt-resource-list');
        const gridCanvas = document.getElementById('gantt-grid-canvas');
        const dateHeader = document.getElementById('gantt-date-header');

        // A. Render Sidebar (Rows)
        resourceList.innerHTML = '';
        state.trades.forEach(trade => {
            const row = document.createElement('div');
            row.className = 'resource-row';
            row.innerHTML = `
                <div class="resource-name">${trade.name}</div>
                <div class="resource-role">$${trade.default_hourly_rate}/hr</div>
            `;
            resourceList.appendChild(row);
        });

        // B. Render Timeline (Next 30 Days)
        let dateHtml = '';
        const startDate = dayjs().startOf('week'); 
        const daysToRender = 30; // 1 month view
        const dayWidth = 100; // px
        
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
        
        // Sync Widths
        const totalWidth = daysToRender * dayWidth;
        dateHeader.style.width = `${totalWidth}px`;
        gridCanvas.style.width = `${totalWidth}px`;

        // C. Render Tasks (Bars)
        gridCanvas.innerHTML = '';
        state.tasks.forEach(task => {
            // Find Row Index (Vertical)
            const tradeIndex = state.trades.findIndex(t => t.id === task.trade_id);
            if (tradeIndex === -1) return;

            // Find Position (Horizontal)
            const start = dayjs(task.start_date);
            const end = dayjs(task.end_date);
            const diff = start.diff(startDate, 'day');
            const duration = end.diff(start, 'day') + 1;

            if (diff + duration < 0) return; // Task is in past

            // Create Bar
            const bar = document.createElement('div');
            bar.className = 'gantt-task-bar';
            
            // CSS Math: 70px row height -> Top = (Index * 70) + 15 (padding)
            bar.style.top = `${(tradeIndex * 70) + 15}px`; 
            bar.style.left = `${diff * dayWidth}px`;
            bar.style.width = `${(duration * dayWidth) - 10}px`; // Gap

            // Burn Logic
            const percentUsed = task.estimated_hours > 0 ? (task.actual_hours / task.estimated_hours) : 0;
            const burnColor = percentUsed > 1 ? '#ff4444' : 'var(--warning-yellow)'; // Red if over budget

            bar.innerHTML = `
                <span class="gantt-task-info">${task.projects?.name || 'Project'}</span>
                <div class="burn-line" style="width: ${Math.min(percentUsed * 100, 100)}%; background: ${burnColor}; box-shadow: 0 0 5px ${burnColor};"></div>
            `;
            
            // Simple Tooltip
            bar.title = `${task.name}\nEst: ${task.estimated_hours}h | Act: ${task.actual_hours}h`;

            gridCanvas.appendChild(bar);
        });
    }

    function updateMetrics() {
        const activeProjects = state.projects.filter(p => p.status !== 'Completed');
        const totalRev = activeProjects.reduce((acc, p) => acc + (p.project_value || 0), 0);
        
        // Load Calculation: Active Tasks vs Total Trade Capacity
        // Mock logic: If we have > 5 tasks active today, we are at 100%
        const today = dayjs();
        const activeTaskCount = state.tasks.filter(t => 
            dayjs(t.start_date).isBefore(today) && dayjs(t.end_date).isAfter(today)
        ).length;
        const load = Math.min((activeTaskCount / 5) * 100, 100);

        // Update DOM
        const revenueEl = document.getElementById('metrics-revenue');
        const countEl = document.getElementById('metrics-count');
        const loadBar = document.getElementById('metrics-load-bar');
        const loadText = document.getElementById('metrics-load-text');

        if(revenueEl) revenueEl.textContent = formatCurrency(totalRev);
        if(countEl) countEl.textContent = activeProjects.length;
        if(loadBar) loadBar.style.width = `${load}%`;
        if(loadText) loadText.textContent = `${Math.round(load)}%`;
    }

    // --- 6. LAUNCH PROJECT MODAL ---
    const launchBtn = document.getElementById('launch-new-project-btn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            // Get Closed Won Deals
            const { data: deals } = await supabase
                .from('deals_tw')
                .select('*')
                .eq('stage', 'Closed Won');

            if (!deals || deals.length === 0) {
                alert("No 'Closed Won' deals available to launch.");
                return;
            }

            const options = deals.map(d => `<option value="${d.id}" data-name="${d.deal_name}" data-amt="${d.amount}">${d.deal_name} (${formatCurrency(d.amount)})</option>`).join('');

            showModal('Launch Fabrication Project', `
                <div class="form-group">
                    <label>Select Deal:</label>
                    <select id="launch-deal-id" class="form-control" style="background:var(--bg-dark); color:white; padding:10px; border:1px solid var(--border-color);">${options}</select>
                </div>
                <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div><label>Start Date:</label><input type="date" id="launch-start" class="form-control" value="${dayjs().format('YYYY-MM-DD')}"></div>
                    <div><label>Target Delivery:</label><input type="date" id="launch-end" class="form-control" value="${dayjs().add(4, 'week').format('YYYY-MM-DD')}"></div>
                </div>
                <p style="color:var(--text-dim); font-size:0.85rem; margin-top:10px;">
                    <i class="fas fa-magic" style="color:var(--primary-blue);"></i> Auto-Schedule: Creating PM, CAD, Fab, and Install tasks.
                </p>
            `, async () => {
                const select = document.getElementById('launch-deal-id');
                const dealId = select.value;
                const name = select.options[select.selectedIndex].dataset.name;
                const amt = select.options[select.selectedIndex].dataset.amt;
                const start = document.getElementById('launch-start').value;
                const end = document.getElementById('launch-end').value;

                // 1. Create Project
                const { data: proj, error } = await supabase.from('projects').insert([{
                    deal_id: dealId, name: name, start_date: start, end_date: end, project_value: amt
                }]).select();

                if (error) { alert('Error: ' + error.message); return; }
                const pid = proj[0].id;

                // 2. Auto-Generate Tasks (Waterfall)
                const s = dayjs(start);
                const tasks = [
                    { project_id: pid, trade_id: state.trades[0]?.id || 1, name: 'Kickoff', start_date: start, end_date: s.add(2,'day').format('YYYY-MM-DD'), estimated_hours: 5 },
                    { project_id: pid, trade_id: state.trades[1]?.id || 2, name: 'Drawings', start_date: s.add(3,'day').format('YYYY-MM-DD'), end_date: s.add(7,'day').format('YYYY-MM-DD'), estimated_hours: 15 },
                    { project_id: pid, trade_id: state.trades[2]?.id || 3, name: 'Fabrication', start_date: s.add(8,'day').format('YYYY-MM-DD'), end_date: s.add(20,'day').format('YYYY-MM-DD'), estimated_hours: 60 },
                    { project_id: pid, trade_id: state.trades[4]?.id || 5, name: 'Install', start_date: s.add(21,'day').format('YYYY-MM-DD'), end_date: end, estimated_hours: 10 }
                ];

                await supabase.from('project_tasks').insert(tasks);
                await loadShopData(); // Refresh Gantt
            });
        });
    }

    // Go!
    loadShopData();
});
