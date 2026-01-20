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

    // Added estimated_hours to selection
    const [projRes, taskRes, assignRes, talentRes, tradeRes] = await Promise.all([
        supabase.from('projects').select('*').neq('status', 'Completed').order('end_date'),
        supabase.from('project_tasks').select('*, projects(name)').neq('status', 'Completed'),
        supabase.from('task_assignments').select('*, project_tasks(name, estimated_hours, projects(name), trade_id)').eq('assigned_date', today),
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

    // Load = Total Assigned Hours / Total Capacity (10 hours per person)
    const totalCapacity = state.talent.length * 10;
    let assignedHours = 0;
    state.assignments.forEach(a => {
        assignedHours += (a.project_tasks?.estimated_hours || 0);
    });
    
    const loadPct = totalCapacity > 0 ? Math.round((assignedHours / totalCapacity) * 100) : 0;
    document.getElementById('metric-shop-load').textContent = `${loadPct}%`;
}

// --- GANTT RENDERER ---
function renderGantt() {
    const sidebar = document.getElementById('gantt-sidebar-content');
    const header = document.getElementById('gantt-header');
    const body = document.getElementById('gantt-body');
    
    if(!sidebar || !header || !body) return;

    sidebar.innerHTML = '';
    header.innerHTML = '';
    body.innerHTML = '';

    const daysToShow = 21; 
    const containerWidth = body.parentElement.clientWidth;
    const dayWidth = containerWidth / daysToShow;
    const start = dayjs().subtract(2, 'day'); 

    // Header Grid
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

    // Projects
    const visibleProjects = state.projects.slice(0, 8); 
    let currentY = 0; 

    visibleProjects.forEach((proj) => {
        const pTasks = state.tasks.filter(t => t.project_id === proj.id && 
            dayjs(t.end_date).isAfter(start) && 
            dayjs(t.start_date).isBefore(start.add(daysToShow, 'day'))
        );

        const lanes = packTasks(pTasks);
        const laneCount = Math.max(1, lanes.length);
        const rowHeight = 60 + ((laneCount - 1) * 35); 

        // Sidebar Row
        const sbRow = document.createElement('div');
        sbRow.className = 'tv-row';
        sbRow.style.height = `${rowHeight}px`;
        
        let statusColor = '#888';
        if(proj.status === 'In Progress') statusColor = 'var(--primary-blue)';
        if(proj.status === 'On Hold') statusColor = '#ff9800';

        sbRow.innerHTML = `
            <div class="tv-row-header">${proj.name}</div>
            <div class="tv-row-sub" style="color:${statusColor}">${proj.status}</div>
        `;
        sidebar.appendChild(sbRow);

        // Timeline Row
        const tlRow = document.createElement('div');
        tlRow.style.position = 'absolute';
        tlRow.style.top = `${currentY}px`; 
        tlRow.style.left = 0; tlRow.style.width = '100%'; tlRow.style.height = `${rowHeight}px`;
        tlRow.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        // Day Columns
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

        // Bars
        pTasks.forEach(task => {
            const tStart = dayjs(task.start_date);
            const tEnd = dayjs(task.end_date);
            const diff = tStart.diff(start, 'day');
            const dur = tEnd.diff(tStart, 'day') + 1;
            
            const bar = document.createElement('div');
            bar.className = 'gantt-task-bar'; 
            bar.style.position = 'absolute';
            
            const barHeight = 28;
            const topOffset = 15 + (task.laneIndex * (barHeight + 5)); 
            
            bar.style.top = `${topOffset}px`;
            bar.style.left = `${Math.max(0, diff * dayWidth)}px`;
            bar.style.width = `${Math.max(10, (dur * dayWidth) - 10)}px`;
            bar.style.height = `${barHeight}px`;
            bar.style.backgroundColor = TRADE_COLORS[task.trade_id] || '#555';
            bar.style.zIndex = 5;
            bar.style.fontSize = '0.75rem';

            const percent = task.estimated_hours ? (task.actual_hours / task.estimated_hours) : 0;
            const burnColor = percent > 1 ? '#ff4444' : 'rgba(255,255,255,0.8)';
            const burnWidth = Math.min(percent * 100, 100);

            bar.innerHTML = `
                <div class="burn-line" style="width:${burnWidth}%; background:${burnColor}; box-shadow:0 0 5px ${burnColor};"></div>
                <span class="gantt-task-info" style="padding-left:8px;">${task.name}</span>
            `;
            tlRow.appendChild(bar);
        });

        // Finish Line
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

// --- RENDER MATRIX (SHIFT VIEW) ---
function renderMatrix() {
    const list = document.getElementById('tv-matrix-list');
    if(!list) return;
    list.innerHTML = '';

    state.talent.forEach(person => {
        const assignments = state.assignments.filter(a => a.talent_id === person.id);
        const row = document.createElement('div');
        row.className = 'matrix-row';
        
        let timelineHtml = `
            <div class="matrix-timeline-container">
                <div class="timeline-grid">
                    ${[...Array(6)].map((_,i) => `<div class="time-col"><div class="time-label">${(6 + (i*2))}</div></div>`).join('')}
                </div>
        `;

        if (assignments.length > 0) {
            // Stack blocks horizontally based on estimated hours
            // Total width = 12 hours (100%)
            // 1 hour = 8.33%
            
            assignments.forEach(a => {
                const t = a.project_tasks;
                const hours = t.estimated_hours || 2; // Default 2 hrs if missing
                const widthPct = (hours / 12) * 100;
                const tradeColor = TRADE_COLORS[t.trade_id] || '#555';
                
                timelineHtml += `
                    <div class="shift-block" style="width:${widthPct}%; background:${tradeColor};" title="${t.name} (${hours}h)">
                        ${t.projects?.name} - ${t.name}
                    </div>
                `;
            });
        } else {
            timelineHtml += `<div style="padding-left:10px; color:#555; z-index:2; font-style:italic; font-size:0.8rem; align-self:center;">Available</div>`;
        }

        timelineHtml += `</div>`; // Close container

        row.innerHTML = `
            <div class="matrix-avatar">${person.name.substring(0,2).toUpperCase()}</div>
            <div class="matrix-name">${person.name}</div>
            ${timelineHtml}
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
