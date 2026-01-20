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
    3: '#D4AF37', // Fabrication (Gold)
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

    // Start Matrix Auto-Scroll
    startAutoScroll();
});

// --- CLOCK ---
function updateClock() {
    const now = dayjs();
    document.getElementById('clock-time').textContent = now.format('HH:mm');
    document.getElementById('clock-date').textContent = now.format('ddd, MMM D');
}

// --- DATA FETCHING ---
async function fetchData() {
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

// --- RENDER METRICS ---
function renderMetrics() {
    document.getElementById('metric-active-projects').textContent = state.projects.length;
    
    const todayStr = dayjs().format('YYYY-MM-DD');
    const tasksDue = state.tasks.filter(t => t.end_date === todayStr).length;
    document.getElementById('metric-tasks-today').textContent = tasksDue;

    // Capacity: Assigned vs Total
    const totalTalent = state.talent.length;
    const assignedTalent = new Set(state.assignments.map(a => a.talent_id)).size;
    const loadPct = totalTalent > 0 ? Math.round((assignedTalent / totalTalent) * 100) : 0;
    document.getElementById('metric-shop-load').textContent = `${loadPct}%`;
}

// --- RENDER GANTT (WITH SWIMLANES & FINISH LINES) ---
function renderGantt() {
    const container = document.getElementById('tv-gantt-wrapper');
    container.innerHTML = '';

    const canvas = document.createElement('div');
    canvas.style.position = 'relative';
    canvas.style.height = '100%';
    canvas.style.overflow = 'hidden'; 
    
    // Config
    const daysToShow = 21; 
    const dayWidth = (container.clientWidth / daysToShow); 
    const start = dayjs().subtract(2, 'day'); // Show slight history

    // 1. Draw Grid Background
    const bg = document.createElement('div');
    bg.style.position = 'absolute'; bg.style.top = 0; bg.style.left = 0; bg.style.width = '100%'; bg.style.height = '100%'; bg.style.display = 'flex';
    
    for(let i=0; i<daysToShow; i++) {
        const d = start.add(i, 'day');
        const col = document.createElement('div');
        col.style.flex = 1; col.style.borderRight = '1px solid rgba(255,255,255,0.05)';
        col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.alignItems = 'center'; col.style.paddingTop = '5px';
        col.innerHTML = `<span style="color:#666; font-size:0.7rem;">${d.format('dd')}</span><span style="color:#aaa; font-weight:bold; font-size:0.9rem;">${d.format('D')}</span>`;
        if(d.day() === 0 || d.day() === 6) col.style.background = 'rgba(255,255,255,0.02)';
        if(d.isSame(dayjs(), 'day')) col.style.background = 'rgba(179, 140, 98, 0.15)'; 
        bg.appendChild(col);
    }
    canvas.appendChild(bg);

    // 2. Render Projects & Tasks (With Packing)
    const visibleProjects = state.projects.slice(0, 5); // Max 5 projects to fit vertically
    let currentY = 40; // Start below header area

    visibleProjects.forEach(proj => {
        // Filter tasks for this project that are in view
        const pTasks = state.tasks.filter(t => t.project_id === proj.id && 
            dayjs(t.end_date).isAfter(start) && 
            dayjs(t.start_date).isBefore(start.add(daysToShow, 'day'))
        );

        // Pack tasks into lanes (Prevent Overlap)
        const lanes = packTasks(pTasks);
        const rowHeight = Math.max(50, lanes.length * 35 + 20); 

        // Project Label
        const label = document.createElement('div');
        label.textContent = proj.name;
        label.style.position = 'absolute';
        label.style.top = `${currentY}px`;
        label.style.left = '10px';
        label.style.zIndex = 10;
        label.style.color = 'var(--primary-blue)';
        label.style.fontWeight = '800';
        label.style.fontSize = '1.1rem';
        label.style.textShadow = '0 2px 4px black';
        canvas.appendChild(label);

        // Finish Line (If in view)
        if(proj.end_date) {
            const finishDate = dayjs(proj.end_date);
            const diff = finishDate.diff(start, 'day');
            if(diff >= 0 && diff < daysToShow) {
                const line = document.createElement('div');
                line.className = 'gantt-finish-line';
                line.style.left = `${diff * dayWidth}px`;
                line.style.top = `${currentY}px`;
                line.style.height = `${rowHeight}px`;
                
                const flag = document.createElement('div');
                flag.className = 'gantt-finish-flag';
                flag.innerHTML = '<i class="fas fa-flag-checkered"></i>';
                line.appendChild(flag);
                canvas.appendChild(line);
            }
        }

        // Render Bars
        pTasks.forEach(task => {
            const tStart = dayjs(task.start_date);
            const tEnd = dayjs(task.end_date);
            const diff = tStart.diff(start, 'day');
            const dur = tEnd.diff(tStart, 'day') + 1;
            
            const bar = document.createElement('div');
            bar.style.position = 'absolute';
            bar.style.top = `${currentY + 25 + (task.laneIndex * 32)}px`; // Stack based on lane
            bar.style.left = `${Math.max(0, diff * dayWidth)}px`;
            bar.style.width = `${Math.max(10, dur * dayWidth)}px`;
            bar.style.height = '26px';
            bar.style.background = TRADE_COLORS[task.trade_id] || '#555';
            bar.style.borderRadius = '3px';
            bar.style.boxShadow = '0 2px 5px rgba(0,0,0,0.8)';
            bar.style.border = '1px solid rgba(255,255,255,0.2)';
            bar.style.zIndex = 5;
            
            bar.innerHTML = `<span style="padding-left:5px; color:white; font-size:0.75rem; font-weight:600; line-height:26px; white-space:nowrap;">${task.name}</span>`;
            canvas.appendChild(bar);
        });

        currentY += rowHeight + 10; // Margin between projects
    });

    container.appendChild(canvas);
}

// Helper: Basic Swimlane Packer
function packTasks(tasks) {
    const sorted = [...tasks].sort((a,b) => dayjs(a.start_date).diff(dayjs(b.start_date)));
    const lanes = []; 
    sorted.forEach(task => {
        let placed = false;
        for(let i=0; i<lanes.length; i++) {
            // If this lane's last task ends before current task starts
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

// --- RENDER MATRIX ---
function renderMatrix() {
    const list = document.getElementById('tv-matrix-list');
    list.innerHTML = '';

    state.talent.forEach(person => {
        const assign = state.assignments.find(a => a.talent_id === person.id);
        const row = document.createElement('div');
        row.className = 'matrix-row';
        
        let statusHtml = '';
        if (assign) {
            const t = assign.project_tasks;
            const tradeColor = TRADE_COLORS[t.trade_id] || '#fff';
            statusHtml = `
                <div class="matrix-task" style="border-left: 4px solid ${tradeColor}">
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t.projects?.name} - ${t.name}</span>
                    <span style="color:${tradeColor}; font-weight:800; font-size:0.8rem; margin-left:10px;">ON TASK</span>
                </div>
            `;
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

// --- HOT LIST ---
function renderHotList() {
    const container = document.getElementById('hot-list-content');
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

// --- AUTO SCROLL MATRIX ---
function startAutoScroll() {
    const scroller = document.getElementById('tv-matrix-scroller');
    const list = document.getElementById('tv-matrix-list');
    let scrollPos = 0;
    let direction = 1; // 1 = down, -1 = up
    let pause = 0;

    setInterval(() => {
        if(list.clientHeight <= scroller.clientHeight) return; // No scroll needed
        if(pause > 0) { pause--; return; }

        scrollPos += (0.5 * direction); // Slow scroll
        scroller.scrollTop = scrollPos;

        // Hit bottom
        if (scrollPos >= (list.clientHeight - scroller.clientHeight)) {
            direction = -1;
            pause = 200; // Pause at bottom for ~3 seconds
        }
        // Hit top
        if (scrollPos <= 0) {
            direction = 1;
            pause = 200; // Pause at top
        }
    }, 16); // ~60fps
}
