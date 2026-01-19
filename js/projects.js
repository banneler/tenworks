import { setupUserMenuAndAuth, loadSVGs, setupGlobalSearch } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    await loadSVGs();
    
    // --- Mock Data for the Pro Model View ---
    // In production, this comes from your 'projects' and 'project_tasks' tables
    const resources = [
        { id: 1, name: "Shop Team A", role: "Fabrication" },
        { id: 2, name: "CNC Waterjet", role: "Machine" },
        { id: 3, name: "Install Crew 1", role: "Field" },
        { id: 4, name: "Finishing Booth", role: "Station" }
    ];

    const tasks = [
        { id: 101, resourceId: 1, name: "Project: Helix Stair - Stringer Weld", start: "2023-10-23", days: 4, progress: 0.7 },
        { id: 102, resourceId: 2, name: "Project: Helix Stair - Treads Cut", start: "2023-10-25", days: 2, progress: 0.2 },
        { id: 103, resourceId: 1, name: "Project: Loft Railing - Prep", start: "2023-10-27", days: 3, progress: 0.0 },
        { id: 104, resourceId: 4, name: "Project: Helix Stair - Powder Coat", start: "2023-10-28", days: 2, progress: 0.0 },
    ];

    // --- Render Functions ---
    
    function renderGantt() {
        const resourceList = document.getElementById('gantt-resource-list');
        const gridCanvas = document.getElementById('gantt-grid-canvas');
        const dateHeader = document.getElementById('gantt-date-header');
        
        // 1. Render Sidebar Resources
        resourceList.innerHTML = resources.map(res => `
            <div class="resource-row">
                <div class="resource-name">${res.name}</div>
                <div class="resource-role">${res.role}</div>
            </div>
        `).join('');

        // 2. Render Timeline Header (Next 14 Days)
        let dateHtml = '';
        const startDate = dayjs().startOf('week'); // Start on Sunday/Monday
        for(let i=0; i<14; i++) {
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
        // Set canvas width explicitly to match dates
        dateHeader.style.width = `${14 * 100}px`; 
        gridCanvas.style.width = `${14 * 100}px`;

        // 3. Render Tasks
        // We use absolute positioning based on the 100px column width
        gridCanvas.innerHTML = '';
        tasks.forEach(task => {
            const start = dayjs(task.start);
            const diff = start.diff(startDate, 'day'); // Days from start of grid
            
            // 100px per day width
            const left = diff * 100;
            const width = task.days * 100;
            
            // 60px row height
            // Find resource index to calculate top position
            const resIndex = resources.findIndex(r => r.id === task.resourceId);
            const top = (resIndex * 60) + 10; 

            const el = document.createElement('div');
            el.className = 'gantt-task-bar';
            el.style.left = `${left}px`;
            el.style.width = `${width - 10}px`; // -10 for gap
            el.style.top = `${top}px`;
            
            // Calculate Burn Color
            // If actual progress > expected progress (based on date), turn RED
            const burnColor = task.progress > 0.8 ? '#ff4444' : 'var(--warning-yellow)';

            el.innerHTML = `
                <span class="gantt-task-info">${task.name}</span>
                <div class="burn-line" style="width: ${task.progress * 100}%; background: ${burnColor}"></div>
            `;
            
            gridCanvas.appendChild(el);
        });
    }

    renderGantt();
});
