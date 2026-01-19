import { supabase } from './shared_constants.js';

async function loadProjectData() {
    // Fetch Projects, Tasks, and Assignments in one go
    const { data: projects, error } = await supabase
        .from('projects')
        .select(`
            *,
            project_tasks (*, shop_trades(*))
        `);

    renderResourceGantt(projects);
}

function renderResourceGantt(projects) {
    const grid = document.getElementById('gantt-grid');
    grid.innerHTML = '';

    projects.forEach(project => {
        // Create a Project Row Group
        const projectRow = document.createElement('div');
        projectRow.className = 'gantt-project-group';
        
        project.project_tasks.forEach(task => {
            const taskBar = document.createElement('div');
            taskBar.className = `task-bar ${task.status.toLowerCase()}`;
            
            // Calculate width/position based on dates
            const startPos = calculateTimelinePosition(task.start_date);
            const durationWidth = calculateTimelineWidth(task.start_date, task.end_date);
            
            taskBar.style.left = `${startPos}px`;
            taskBar.style.width = `${durationWidth}px`;
            
            // Industrial Content
            taskBar.innerHTML = `
                <div class="task-inner">
                    <span class="task-name">${task.name}</span>
                    <span class="task-trade">${task.shop_trades.name}</span>
                    <div class="burn-indicator" style="width: ${(task.actual_hours / task.estimated_hours) * 100}%"></div>
                </div>
            `;

            // Dependency Logic Hook
            if (task.dependency_task_id) {
                drawDependencyLine(task.dependency_task_id, task.id);
            }

            grid.appendChild(taskBar);
        });
    });
}

// Revenue Realization Logic
async function updateRevenueRealization() {
    // Logic: Pull 'Completed' tasks * Trade Hourly Rate
    const { data: completedWork } = await supabase
        .from('project_tasks')
        .select('actual_hours, shop_trades(default_hourly_rate)')
        .eq('status', 'Completed');

    const total = completedWork.reduce((acc, task) => {
        return acc + (task.actual_hours * task.shop_trades.default_hourly_rate);
    }, 0);

    document.getElementById('mtd-revenue').textContent = formatCurrency(total);
}
