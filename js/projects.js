import { 
    supabase, 
    formatCurrency, 
    formatSimpleDate, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs,
    setupGlobalSearch
} from './shared_constants.js';

// Initialize DayJS plugin if needed (ensure the library is loaded in HTML)
// dayjs.extend(window.dayjs_plugin_duration); 

document.addEventListener("DOMContentLoaded", async () => {
    // --- INIT ---
    await loadSVGs();
    await setupUserMenuAndAuth(supabase, { currentUser: (await supabase.auth.getUser()).data.user });
    await setupGlobalSearch(supabase, (await supabase.auth.getUser()).data.user);

    // --- STATE ---
    let state = {
        projects: [],
        milestones: []
    };

    // --- DATA LOADING ---
    async function loadProjects() {
        const { data: projects, error } = await supabase
            .from('projects')
            .select(`*, deals_tw(deal_name, amount)`)
            .order('start_date', { ascending: true });
        
        if (error) {
            console.error('Error loading projects:', error);
            return;
        }

        state.projects = projects || [];
        
        // Also load milestones for the Gantt
        const { data: milestones } = await supabase.from('project_milestones').select('*');
        state.milestones = milestones || [];

        renderProjectCards();
        renderMasterGantt();
        updateMetrics();
    }

    // --- RENDER: PROJECT CARDS ---
    function renderProjectCards() {
        const resourceList = document.getElementById('gantt-resource-list');
        resourceList.innerHTML = '';

        state.projects.forEach(project => {
            // Determine Health Color based on budget vs actual
            // (Mock logic: if actual hours > 80% of budget, turn yellow)
            const burnRate = project.labor_budget_hours ? (project.actual_labor_hours / project.labor_budget_hours) : 0;
            let statusColor = 'var(--text-dim)';
            if (project.status === 'Installation') statusColor = 'var(--primary-blue)';
            if (project.status === 'Completed') statusColor = '#4CAF50';

            const card = document.createElement('div');
            card.className = 'resource-row'; // Reusing your sidebar CSS class
            card.style.height = '60px'; // Match grid height
            card.innerHTML = `
                <div style="display:flex; flex-direction:column; justify-content:center;">
                    <div class="resource-name" style="font-size: 0.9rem;">${project.name}</div>
                    <div class="resource-role" style="color: ${statusColor};">${project.status}</div>
                </div>
            `;
            resourceList.appendChild(card);
        });
    }

    // --- RENDER: MASTER GANTT ---
    function renderMasterGantt() {
        const gridCanvas = document.getElementById('gantt-grid-canvas');
        const dateHeader = document.getElementById('gantt-date-header');
        
        // 1. Setup Timeline (Next 30 Days)
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
        const totalWidth = daysToRender * 100;
        dateHeader.style.width = `${totalWidth}px`; 
        gridCanvas.style.width = `${totalWidth}px`;

        // 2. Render Project Bars
        gridCanvas.innerHTML = '';
        
        state.projects.forEach((project, index) => {
            // Find milestones for this project
            const projectMilestones = state.milestones.filter(m => m.project_id === project.id);
            
            if (projectMilestones.length === 0) {
                // If no granular milestones, show one big bar for the project duration
                if (project.start_date && project.end_date) {
                    renderBar(project.name, project.start_date, project.end_date, index, 'project');
                }
            } else {
                // Render individual milestones
                projectMilestones.forEach(m => {
                    renderBar(m.name, m.start_date, m.end_date, index, 'milestone');
                });
            }
        });

        function renderBar(label, startStr, endStr, rowIndex, type) {
            const start = dayjs(startStr);
            const end = dayjs(endStr);
            const gridStart = startDate;
            
            // Calculate Position
            const diffDays = start.diff(gridStart, 'day');
            const durationDays = end.diff(start, 'day') + 1; // +1 to include end date

            // Skip if outside view
            if (diffDays + durationDays < 0) return; 

            const left = diffDays * 100;
            const width = durationDays * 100;
            const top = (rowIndex * 60) + 15; // Centered in the 60px row

            const bar = document.createElement('div');
            bar.className = 'gantt-task-bar';
            bar.style.left = `${left}px`;
            bar.style.width = `${width - 10}px`;
            bar.style.top = `${top}px`;
            
            // Style based on type
            if (type === 'milestone') {
                bar.style.backgroundColor = 'rgba(179, 140, 98, 0.4)'; // Darker gold for milestones
            }

            bar.innerHTML = `<span class="gantt-task-info">${label}</span>`;
            gridCanvas.appendChild(bar);
        }
    }

    // --- METRICS ---
    function updateMetrics() {
        // Calculate MTD Revenue (Mock logic for now - active projects value)
        const totalValue = state.projects.reduce((acc, p) => acc + (p.project_value || 0), 0);
        const mtdEl = document.getElementById('mtd-revenue');
        if(mtdEl) mtdEl.textContent = formatCurrency(totalValue);
        
        // Calculate Load (Active Projects Count vs Capacity of say 10)
        const activeCount = state.projects.filter(p => p.status !== 'Completed').length;
        const capacity = 10; 
        const loadPercent = Math.min((activeCount / capacity) * 100, 100);
        
        const loadFill = document.querySelector('.progress-bar-fill');
        if(loadFill) loadFill.style.width = `${loadPercent}%`;
    }

    // --- LAUNCH PROJECT MODAL ---
    const launchBtn = document.getElementById('launch-new-project-btn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            // 1. Fetch Closed Won Deals that don't have projects yet
            // Note: In a real app, you'd do a "not in" query, but let's just fetch all Closed Won for now
            const { data: deals } = await supabase
                .from('deals_tw')
                .select('*')
                .eq('stage', 'Closed Won');

            if (!deals || deals.length === 0) {
                alert("No 'Closed Won' deals found to launch!");
                return;
            }

            const dealOptions = deals.map(d => `<option value="${d.id}" data-amount="${d.amount || 0}" data-name="${d.deal_name}">${d.deal_name} (${formatCurrency(d.amount)})</option>`).join('');

            showModal('Launch Production', `
                <div class="form-group">
                    <label>Select Deal to Launch:</label>
                    <select id="modal-project-deal" class="form-control" style="background: var(--bg-dark); color: white; border: 1px solid var(--border-color); padding: 8px;">
                        ${dealOptions}
                    </select>
                </div>
                <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label>Start Date:</label>
                        <input type="date" id="modal-project-start" class="form-control" value="${dayjs().format('YYYY-MM-DD')}">
                    </div>
                    <div>
                        <label>Est. Delivery:</label>
                        <input type="date" id="modal-project-end" class="form-control" value="${dayjs().add(30, 'day').format('YYYY-MM-DD')}">
                    </div>
                    <div>
                        <label>Labor Hours Budget:</label>
                        <input type="number" id="modal-project-hours" class="form-control" placeholder="e.g. 120">
                    </div>
                    <div>
                        <label>Material Budget:</label>
                        <input type="number" id="modal-project-material" class="form-control" placeholder="e.g. 5000">
                    </div>
                </div>
            `, async () => {
                // SAVE LOGIC
                const dealSelect = document.getElementById('modal-project-deal');
                const dealId = dealSelect.value;
                const dealName = dealSelect.options[dealSelect.selectedIndex].dataset.name;
                const dealAmount = dealSelect.options[dealSelect.selectedIndex].dataset.amount;
                
                const startDate = document.getElementById('modal-project-start').value;
                const endDate = document.getElementById('modal-project-end').value;
                const hours = document.getElementById('modal-project-hours').value;
                const materials = document.getElementById('modal-project-material').value;

                // Insert Project
                const { data, error } = await
