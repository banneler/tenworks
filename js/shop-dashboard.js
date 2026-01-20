import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    loadSVGs
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

const TRADE_COLORS = {
    1: '#546E7A', // Kickoff
    2: '#1E88E5', // Design
    3: '#D4AF37', // Fabrication
    4: '#8D6E63', // Wood
    5: '#66BB6A', // Install
    6: '#7E57C2'  // Finish
};

let state = {
    projects: [],
    tasks: [],
    assignments: [],
    talent: [],
    trades: []
};

document.addEventListener("DOMContentLoaded", async () => {
    await loadSVGs();
    updateClock();
    setInterval(updateClock, 1000); 
    
    await fetchData(); 
    
    // Auto-Refresh Data every 5 minutes
    setInterval(async () => {
        const icon = document.getElementById('refresh-icon');
        if(icon) icon.style.opacity = '1';
        await fetchData();
        if(icon) setTimeout(() => icon.style.opacity = '0.3', 2000);
    }, 300000);

    startAutoScroll();
});

function updateClock() {
    const now = dayjs();
    document.getElementById('clock-time').textContent = now.format('HH:mm');
    document.getElementById('clock-date').textContent = now.format('ddd, MMM D');
}

async function fetchData() {
    console.log("Refreshing Shop Data...");
    const today = dayjs().format('YYYY-MM-DD');

    const [projRes, taskRes, assignRes, talentRes, tradeRes] = await Promise.all([
        supabase.from('projects').select('*').neq('status', 'Completed').order('end_date'),
        supabase.from('project_tasks').select('*, projects(name)').neq('status', 'Completed'),
        supabase.from('task_assignments').select('*, project_tasks(name, projects(name), trade_id)').eq('assigned_date', today),
        supabase.from('shop_talent').select('*').eq('active', true).order('name'),
        supabase.from('shop_trades').select('*')
    ]);

    state.projects = projRes.data || [];
    state.tasks = taskRes.data || [];
    state.assignments = assignRes.data || [];
    state.talent = talentRes.data || [];
    state.trades = tradeRes.data || [];

    renderMetrics();
    renderGantt();
    renderMatrix();
    renderHotList();
}

function renderMetrics() {
    document.getElementById('metric-active-projects').textContent = state.projects.length;
    
    const todayStr = dayjs().format('YYYY-MM-DD');
    const tasksDue = state.tasks.filter(t => t.end_date === todayStr).length;
    document.getElementById('metric-tasks-today').textContent = tasksDue;

    const totalTalent = state.talent.length;
    const assignedTalent = new Set(state.assignments.map(a => a.talent_id)).size;
    const loadPct = totalTalent > 0 ? Math.round((assignedTalent / totalTalent) * 100) : 0;
    document.getElementById('metric-shop-load').textContent = `${loadPct}%`;
}

// --- GANTT RENDERER (FIXED LAYOUT) ---
function renderGantt() {
    const sidebar = document.getElementById('gantt-sidebar-content');
    const header = document.getElementById('gantt-header');
    const body = document.getElementById('gantt-body');
    
    if(!sidebar || !header || !body) return;

    sidebar.innerHTML = '';
    header.innerHTML = '';
    body.innerHTML = '';

    // Config
    const daysToShow = 21; 
    const containerWidth = body.parentElement.clientWidth;
    const dayWidth = containerWidth / daysToShow;
    const start = dayjs().subtract(2, 'day'); 

    // 1. Render Header Grid
    for(let i=0; i<daysToShow; i++) {
        const d = start.add(i, 'day');
        const col = document.createElement('div');
        col.style.width = `${dayWidth}px`;
        col.style.borderRight = '1px solid rgba(255,255,255,0.05)';
        col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.alignItems = 'center'; col.style.justifyContent = 'center';
        col.innerHTML = `<span style="color:#666; font-size:0.7rem;">${d.format('dd')}</span><span style="color:#aaa; font-weight:bold; font-size:0.9rem;">${d.format('D')}</span>`;
        if(d.day() === 0 || d.day() === 6) col.style.background = 'rgba(255,255,255,0.02)';
        if(d.isSame(dayjs(), 'day')) col.style.background = 'rgba(179, 140, 98, 0.15)'; 
        header.appendChild(col);
    }

    // 2. Render Rows with DYNAMIC HEIGHT
    const visibleProjects = state.projects.slice(0, 8); // Allow more projects if they fit
    let currentY = 0; // Accumulator for vertical position

    visibleProjects.forEach((proj) => {
        // Find tasks for this project in view
        const pTasks = state.tasks.filter(t => t.project_id === proj.id && 
            dayjs(t.end_date).isAfter(start) && 
            dayjs(t.start_date).isBefore(start.add(daysToShow, 'day'))
        );

        // Pack tasks to determine lanes
        const lanes = packTasks(pTasks);
        
        // --- HEIGHT CALCULATION FIX ---
        // Base height is 60px. Add 30px for every extra swimlane.
        // If 0 or 1 lane: 60px. If 2 lanes: 90px. etc.
        const laneCount = Math.max(1, lanes.length);
        const rowHeight = 60 + ((laneCount - 1) * 35); 

        // A. Sidebar Row
        const sbRow = document.createElement('div');
        sbRow.className = 'tv-row';
        sbRow.style.height = `${rowHeight}px`; // APPLY DYNAMIC HEIGHT
        
        let statusColor = '#888';
        if(proj.status === 'In Progress') statusColor = 'var(--primary-blue)';
        if(proj.status === 'On Hold') statusColor = '#ff9800';

        sbRow.innerHTML = `
            <div class="tv-row-header">${proj.name}</div>
            <div class="tv-row-sub" style="color:${statusColor}">${proj.status}</div>
        `;
        sidebar.appendChild(sbRow);

        // B. Timeline Row Container
        const tlRow = document.createElement('div');
        tlRow.style.position = 'absolute';
        tlRow.style.top = `${currentY}px`; // USE ACCUMULATED Y POSITION
        tlRow.style.left = 0; 
        tlRow.style.width = '100%'; 
        tlRow.style.height = `${rowHeight}px`; // APPLY DYNAMIC HEIGHT
        tlRow.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        // Add Day Columns (Background Grid)
        const gridBg = document.createElement('div');
        gridBg.style.display = 'flex'; gridBg.style.height = '100%';
        for(let i=0; i<daysToShow; i++) {
            const d = start.add(i, 'day');
            const cell = document.createElement('div');
            cell.style.flex = 1; cell.style.borderRight = '1px solid rgba(255,255,255,0.05)';
            if(d.day() === 0 || d.day() === 6) cell.style.background = 'rgba(255,255,255,0.02)';
            if(d.isSame(dayjs(), 'day')) cell.style.background = 'rgba(179, 140, 98, 0.1)'; 
            gridBg.appendChild(cell);
        }
        tlRow.appendChild(gridBg);

        // C. Render Bars
        pTasks.forEach(task => {
            const tStart = dayjs(task.start_date);
            const tEnd = dayjs(task.end_date);
            const diff = tStart.diff(start, 'day');
            const dur = tEnd.diff(tStart, 'day') + 1;
            
            const bar = document.createElement('div');
            bar.className = 'gantt-task-bar'; 
            bar.style.position = 'absolute';
            
            // Stack based on lane index
            const barHeight = 28;
            const topOffset = 15 + (task.laneIndex * (barHeight + 5)); 
            
            bar.style.top = `${topOffset}px`;
            bar.style.left = `${Math.max(0, diff * dayWidth)}px`;
            bar.style.width = `${Math.max(10, (dur * dayWidth) - 10)}px`;
            bar.style.height = `${barHeight}px`;
            bar.style.backgroundColor = TRADE_COLORS[task.trade_id] || '#555';
            bar.style.zIndex = 5;
            bar.style.fontSize = '0.75rem';

            // Burn Rate
            const percent = task.estimated_hours ? (task.actual_hours / task.estimated_hours) : 0;
            const burnColor = percent > 1 ? '#ff4444' : 'rgba(255,255,255,0.8)';
            const burnWidth = Math.min(percent * 100, 100);

            bar.innerHTML = `
                <div class="burn-line" style="width:${burnWidth}%; background:${burnColor}; box-shadow:0 0 5px ${burnColor};"></div>
                <span class="gantt-task-info" style="padding-left:8px;">${task.name}</span>
            `;
            tlRow.appendChild(bar);
        });

        // D. Finish Line
        if(proj.end_date) {
            const finishDate = dayjs(proj.end_date);
            const diff = finishDate.diff(start, 'day');
            if(diff >= 0 && diff < daysToShow) {
                const line = document.createElement('div');
                line.className = 'gantt-finish-line'; 
                line.style.left = `${diff * dayWidth}px`;
                
                const flag = document.createElement('div');
                flag.className = 'gantt-finish-flag';
                flag.innerHTML = '<i class="fas fa-flag-checkered"></i>';
                line.appendChild(flag);
                tlRow.appendChild(line);
            }
        }

        body.appendChild(tlRow);
        
        // INCREMENT Y FOR NEXT ROW
        currentY += rowHeight; 
    });
}

function packTasks(tasks) {
    const sorted = [...tasks].sort((a,b) => dayjs(a.start_date).diff(dayjs(b.start_date)));
    const lanes = []; 
    sorted.forEach(task => {
        let placed = false;
        for(let i=0; i<lanes.length; i++) {
            if (dayjs(lanes[i]).isBefore(dayjs(task.start_date))) {
                task.laneIndex = i;
                lanes[i] = task.end_date;
                placed = true;
                break;
            }
        }
        if(!placed) {
            task.laneIndex = lanes.length;
            lanes.push(task.end_date);
        }
    });
    return lanes; 
}

function renderMatrix() {
    const list = document.getElementById('tv-matrix-list');
    if(!list) return;
    list.innerHTML = '';

    state.talent.forEach(person => {
        const assignments = state.assignments.filter(a => a.talent_id === person.id);
        const row = document.createElement('div');
        row.className = 'matrix-row';
        
        let statusHtml = '';
        if (assignments.length > 0) {
            // Show all assignments in a flex row
            const items = assignments.map(a => {
                const t = a.project_tasks;
                const tradeColor = TRADE_COLORS[t.trade_id] || '#fff';
                return `
                    <div class="matrix-task" style="border-left: 3px solid ${tradeColor}; margin-right:10px; flex:1;">
                        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t.projects?.name} - ${t.name}</span>
                    </div>
                `;
            }).join('');
            statusHtml = `<div style="display:flex; flex:1; overflow:hidden;">${items}</div>`;
        } else {
            statusHtml = `
                <div class="matrix-task unassigned">
                    <span><i>Available</i></span>
                </div>
            `;
        }

        row.innerHTML = `
            <div class="matrix-avatar">${person.name.substring(0,2).toUpperCase()}</div>
            <div class="matrix-name">${person.name}</div>
            ${statusHtml}
        `;
        list.appendChild(row);
    });
}

function renderHotList() {
    const container = document.getElementById('hot-list-content');
    if(!container) return;
    const today = dayjs();
    const hotTasks = state.tasks.filter(t => {
        const end = dayjs(t.end_date);
        return (end.isBefore(today, 'day') || end.isSame(today, 'day'));
    }).sort((a,b) => dayjs(a.end_date).diff(dayjs(b.end_date)));

    if(hotTasks.length === 0) {
        container.innerHTML = '<span style="color:#4CAF50;"><i class="fas fa-check-circle"></i> ALL SYSTEMS GO. NO OVERDUE ITEMS.</span>';
    } else {
        const items = hotTasks.map(t => {
            const isOverdue = dayjs(t.end_date).isBefore(today, 'day');
            const color = isOverdue ? '#ff5252' : '#ffb74d';
            return `<span style="margin-right:40px;"><i class="fas fa-exclamation-triangle" style="color:${color}"></i> ${t.projects?.name}: ${t.name} (${t.end_date})</span>`;
        }).join('');
        container.innerHTML = `<marquee scrollamount="5">${items}</marquee>`;
    }
}

function startAutoScroll() {
    const scroller = document.getElementById('tv-matrix-scroller');
    const list = document.getElementById('tv-matrix-list');
    if(!scroller || !list) return;

    let scrollPos = 0;
    let direction = 1; 
    let pause = 0;

    setInterval(() => {
        if(list.clientHeight <= scroller.clientHeight) return; 
        if(pause > 0) { pause--; return; }

        scrollPos += (0.5 * direction);
        scroller.scrollTop = scrollPos;

        if (scrollPos >= (list.clientHeight - scroller.clientHeight)) {
            direction = -1;
            pause = 200; 
        }
        if (scrollPos <= 0) {
            direction = 1;
            pause = 200; 
        }
    }, 16); 
}
