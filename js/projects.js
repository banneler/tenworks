import { 
    supabase, 
    formatCurrency, 
    showModal, 
    setupUserMenuAndAuth, 
    loadSVGs,
    setupGlobalSearch
} from './shared_constants.js';

// Ensure DayJS is available
const dayjs = window.dayjs;

document.addEventListener("DOMContentLoaded", async () => {
    await loadSVGs();
    await setupUserMenuAndAuth(supabase, { currentUser: (await supabase.auth.getUser()).data.user });
    await setupGlobalSearch(supabase, (await supabase.auth.getUser()).data.user);

    // --- STATE ---
    let state = {
        trades: [],      // The Y-Axis (Resources)
        projects: [],    // The Context
        allTasks: []     // The Bars
    };

    // --- LOAD DATA ---
    async function loadShopData() {
        // 1. Get Trades (Rows)
        const { data: trades } = await supabase.from('shop_trades').select('*').order('id');
        state.trades = trades || [];

        // 2. Get Tasks (Bars) - linked to Projects
        const { data: tasks } = await supabase
            .from('project_tasks')
            .select(`*, projects(name)`) // Join project name for the bar label
            .order('start_date');
        state.allTasks = tasks || [];

        // 3. Get Projects (For Metrics)
        const { data: projects } = await supabase.from('projects').select('*');
        state.projects = projects || [];

        renderShopLoadGantt();
        updateShopMetrics();
    }

    // --- RENDER GANTT ---
    function renderShopLoadGantt() {
        const resourceList = document.getElementById('gantt-resource-list'); // Sidebar
        const gridCanvas = document.getElementById('gantt-grid-canvas');     // Grid
        const dateHeader = document.getElementById('gantt-date-header');     // Dates

        // A. Render Sidebar (Trades)
        resourceList.innerHTML = '';
        state.trades.forEach(trade => {
            const row = document.createElement('div');
            row.className = 'resource-row';
            row.style.height = '60px'; // Explicit height for alignment
            row.innerHTML = `
                <div style="display:flex; flex-direction:column; justify-content:center;">
                    <div class="resource-name">${trade.name}</div>
                    <div class="resource-role" style="font-size:0.7rem; color:var(--text-dim);">$${trade.default_hourly_rate}/hr</div>
                </div>
            `;
            resourceList.appendChild(row);
        });

        // B. Render Timeline Header (Next 30 Days)
        let dateHtml = '';
        const startDate = dayjs().startOf('week'); 
        const daysToRender = 30;
        
        for(let i=0; i < daysToRender; i++) {
            const current = startDate.add(i, 'day');
            const isWeekend = current.day() === 0 || current.day() === 6;
            dateHtml += `
                <div class="date-cell ${isWeekend ? 'weekend' : ''}">
                    <span style="font-weight:700;">${current.format('DD')}</span>
                    <span>${current.format('ddd')}</span>
                </div>
            `;
        }
        dateHeader.innerHTML = dateHtml;
        const totalWidth = daysToRender * 100; // 100px per day
        dateHeader.style.width = `${totalWidth}px`; 
        gridCanvas.style.width = `${totalWidth}px`;

        // C. Render Task Bars
        gridCanvas.innerHTML = '';
        state.allTasks.forEach(task => {
            // 1. Find Vertical Position (Which Trade Row?)
            const tradeIndex = state.trades.findIndex(t => t.id === task.trade_id);
            if (tradeIndex === -1) return; // Task has no valid trade

            // 2. Find Horizontal Position (Dates)
            const start = dayjs(task.start_date);
            const end = dayjs(task.end_date);
            const diffDays = start.diff(startDate, 'day');
            const durationDays = end.diff(start, 'day') + 1;

            if (diffDays + durationDays < 0) return; // Old task

            // 3. Create Bar
            const bar = document.createElement('div');
            bar.className = 'gantt-task-bar';
            
            // Positioning
            bar.style.top = `${(tradeIndex * 60) + 10}px`; // Centered in 60px row
            bar.style.left = `${diffDays * 100}px`;
            bar.style.width = `${(durationDays * 100) - 10}px`; // -10 gap
            
            // Style & Content
            // Calculate Burn (Actual / Est)
            const progress = task.estimated_hours ? (task.actual_hours / task.estimated_hours) : 0;
            const burnColor = progress > 1 ? '#ff4444' : 'var(--warning-yellow)';
            
            bar.innerHTML = `
                <span class="gantt-task-info" style="font-size:0.7rem;">${task.projects?.name || 'Unknown'}</span>
                <div class="burn-line" style="width: ${Math.min(progress * 100, 100)}%; background: ${burnColor};"></div>
            `;

            // Tooltip
            bar.title = `${task.name}: ${task.start_date} to ${task.end_date}`;

            gridCanvas.appendChild(bar);
        });
    }

    function updateShopMetrics() {
        // Simple Capacity Logic: How many tasks active today?
        const today = dayjs();
        const activeTasks = state.allTasks.filter(t => 
            dayjs(t.start_date).isBefore(today) && dayjs(t.end_date).isAfter(today)
        ).length;
        
        // Assume shop capacity is 5 concurrent large tasks
        const capacity = 5; 
        const load = Math.min((activeTasks / capacity) * 100, 100);
        
        const fill = document.querySelector('.progress-bar-fill');
        if(fill) fill.style.width = `${load}%`;
        
        const val = document.querySelector('.metric-card .value');
        if(val) val.textContent = `${Math.round(load)}% Load`;
    }

    // --- LAUNCH PROJECT WIZARD ---
    const launchBtn = document.getElementById('launch-new-project-btn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            // Get Closed Won Deals
            const { data: deals } = await supabase
                .from('deals_tw')
                .select('*')
                .eq('stage', 'Closed Won');

            if (!deals || deals.length === 0) {
                alert("No 'Closed Won' deals found!");
                return;
            }

            const dealOptions = deals.map(d => `<option value="${d.id}" data-amount="${d.amount || 0}" data-name="${d.deal_name}">${d.deal_name} (${formatCurrency(d.amount)})</option>`).join('');

            showModal('Launch Project Wizard', `
                <div class="form-group">
                    <label>Select Deal:</label>
                    <select id="wiz-deal" class="form-control" style="background:var(--bg-dark); color:white; border:1px solid var(--border-color); padding:8px;">
                        ${dealOptions}
                    </select>
                </div>
                <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div><label>Start Date:</label><input type="date" id="wiz-start" class="form-control" value="${dayjs().format('YYYY-MM-DD')}"></div>
                    <div><label>Est. Delivery:</label><input type="date" id="wiz-end" class="form-control" value="${dayjs().add(4, 'week').format('YYYY-MM-DD')}"></div>
                </div>
                <div style="margin-top:15px; padding:10px; background:rgba(179,140,98,0.1); border-left:3px solid var(--primary-blue);">
                    <small><strong>Auto-Scheduling:</strong> This will automatically generate tasks for PM, CAD, Fabrication, and Install based on the dates above.</small>
                </div>
            `, async () => {
                const dealSelect = document.getElementById('wiz-deal');
                const start = document.getElementById('wiz-start').value;
                const end = document.getElementById('wiz-end').value;
                const dealName = dealSelect.options[dealSelect.selectedIndex].dataset.name;
                const amount = dealSelect.options[dealSelect.selectedIndex].dataset.amount;

                // 1. Create Project
                const { data: projData, error } = await supabase.from('projects').insert([{
                    deal_id: dealSelect.value,
                    name: dealName,
                    start_date: start,
                    end_date: end,
                    project_value: amount
                }]).select();

                if (error) { alert(error.message); return; }
                const pid = projData[0].id;

                // 2. Auto-Generate Tasks linked to Trades
                // We estimate durations based on a standard 4-week flow
                const startDate = dayjs(start);
                
                const tasksToCreate = [
                    { 
                        project_id: pid, 
                        trade_id: state.trades.find(t => t.name.includes('Project'))?.id || 1, 
                        name: 'Kickoff & Planning',
                        start_date: start, 
                        end_date: startDate.add(2, 'day').format('YYYY-MM-DD'),
                        estimated_hours: 10
                    },
                    { 
                        project_id: pid, 
                        trade_id: state.trades.find(t => t.name.includes('CAD'))?.id || 2, 
                        name: 'Design & Drawings',
                        start_date: startDate.add(3, 'day').format('YYYY-MM-DD'), 
                        end_date: startDate.add(7, 'day').format('YYYY-MM-DD'),
                        estimated_hours: 20
                    },
                    { 
                        project_id: pid, 
                        trade_id: state.trades.find(t => t.name.includes('Fabrication'))?.id || 3, 
                        name: 'Primary Fabrication',
                        start_date: startDate.add(8, 'day').format('YYYY-MM-DD'), 
                        end_date: startDate.add(20, 'day').format('YYYY-MM-DD'),
                        estimated_hours: 80
                    },
                    { 
                        project_id: pid, 
                        trade_id: state.trades.find(t => t.name.includes('Installation'))?.id || 5, 
                        name: 'Site Install',
                        start_date: startDate.add(21, 'day').format('YYYY-MM-DD'), 
                        end_date: end,
                        estimated_hours: 16
                    }
                ];

                await supabase.from('project_tasks').insert(tasksToCreate);
                await loadShopData(); // Refresh Gantt
            });
        });
    }

    loadShopData();
});
