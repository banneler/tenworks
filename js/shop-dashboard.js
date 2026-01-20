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

// State
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
    setInterval(updateClock, 1000); // Clock tick
    
    await fetchData(); // Initial Load
    
    // Auto-Refresh Data every 5 minutes (300,000ms)
    setInterval(async () => {
        const icon = document.getElementById('refresh-icon');
        if(icon) icon.style.display = 'inline-block';
        await fetchData();
        if(icon) setTimeout(() => icon.style.display = 'none', 2000);
    }, 300000);
});

// --- CLOCK ---
function updateClock() {
    const now = dayjs();
    document.getElementById('clock-time').textContent = now.format('HH:mm:ss');
    document.getElementById('clock-date').textContent = now.format('dddd, MMM D, YYYY');
}

// --- DATA FETCHING ---
async function fetchData() {
    console.log("Refreshing Shop Dashboard...");
    
    const today = dayjs().format('YYYY-MM-DD');
    const nextMonth = dayjs().add(30, 'day').format('YYYY-MM-DD');

    const [projRes, taskRes, assignRes, talentRes, tradeRes] = await Promise.all([
        supabase.from('projects').select('*').neq('status', 'Completed').order('end_date'),
        supabase.from('project_tasks').select('*, projects(name)').neq('status', 'Completed'),
        supabase.from('task_assignments').select('*, project_tasks(name, projects(name), trade_id)').eq('assigned_date', today),
        supabase.from('shop_talent').select('*').eq('active', true),
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
    const activeProjs = state.projects.length;
    
    // Tasks Due Today
    const todayStr = dayjs().format('YYYY-MM-DD');
    const tasksDue = state.tasks.filter(t => t.end_date === todayStr).length;

    // Completed This Week (Mock calculation or fetch if needed, defaulting to 0 for now or calculating from assignments?)
    // Simplified: Just showing dummy data or calculating based on task updates would require history table.
    // Let's use Assignments Count as a proxy for "Shop Load"
    const totalTalent = state.talent.length;
    const assignedTalent = new Set(state.assignments.map(a => a.talent_id)).size;
    const loadPct = totalTalent > 0 ? Math.round((assignedTalent / totalTalent) * 100) : 0;

    document.getElementById('metric-active-projects').textContent = activeProjs;
    document.getElementById('metric-tasks-today').textContent = tasksDue;
    document.getElementById('metric-shop-load').textContent = `${loadPct}%`;
    // Completed placeholder (would need task_history)
    document.getElementById('metric-completed-week').textContent = '-'; 
}

// --- RENDER GANTT (Simplified for TV) ---
function renderGantt() {
    const container = document.getElementById('tv-gantt-wrapper');
    container.innerHTML = '';

    // Create Canvas
    const canvas = document.createElement('div');
    canvas.style.position = 'relative';
    canvas.style.height = '100%';
    canvas.style.overflow = 'hidden'; // Hide scrollbars for TV
    
    // Config
    const daysToShow = 21; // 3 Weeks view
    const dayWidth = (container.clientWidth / daysToShow); // Fit to screen width
    const start = dayjs().subtract(1, 'day'); // Start yesterday

    // 1. Draw Grid Background
    const bg = document.createElement('div');
    bg.style.position = 'absolute';
    bg.style.top = 0; bg.style.left = 0; bg.style.width = '100%'; bg.style.height = '100%';
    bg.style.display = 'flex';
    
    for(let i=0; i<daysToShow; i++) {
        const d = start.add(i, 'day');
        const col = document.createElement('div');
        col.style.flex = 1;
        col.style.borderRight = '1px solid #333';
        col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.alignItems = 'center';
        col.style.paddingTop = '5px';
        col.innerHTML = `
            <span style="color:#888; font-size:0.8rem;">${d.format('dd')}</span>
            <span style="color:white; font-weight:bold; font-size:1rem;">${d.format('D')}</span>
        `;
        if(d.day() === 0 || d.day() === 6) col.style.background = 'rgba(255,255,255,0.05)';
        if(d.isSame(dayjs(), 'day')) col.style.background = 'rgba(179, 140, 98, 0.1)'; // Highlight Today
        bg.appendChild(col);
    }
    canvas.appendChild(bg);

    // 2. Draw Projects
    // Filter to top 5-6 active projects to fit screen
    const visibleProjects = state.projects.slice(0, 6); 
    
    visibleProjects.forEach((proj, idx) => {
        const rowY = (idx * 60) + 60; // Offset from header
        
        // Project Label (Floating)
        const label = document.createElement('div');
        label.textContent = proj.name;
        label.style.position = 'absolute';
        label.style.top = `${rowY - 15}px`;
        label.style.left = '10px';
        label.style.zIndex = 10;
        label.style.color = 'var(--primary-blue)';
        label.style.fontWeight = 'bold';
        label.style.textShadow = '0 0 5px black';
        canvas.appendChild(label);

        // Render Tasks for this project
        const pTasks = state.tasks.filter(t => t.project_id === proj.id);
        pTasks.forEach(task => {
            const tStart = dayjs(task.start_date);
            const tEnd = dayjs(task.end_date);
            
            // Only render if in view
            if (tEnd.isBefore(start) || tStart.isAfter(start.add(daysToShow, 'day'))) return;

            const diff = tStart.diff(start, 'day');
            const dur = tEnd.diff(tStart, 'day') + 1;
            
            const bar = document.createElement('div');
            bar.style.position = 'absolute';
            bar.style.top = `${rowY + 5}px`;
            bar.style.left = `${Math.max(0, diff * dayWidth)}px`;
            bar.style.width = `${dur * dayWidth}px`;
            bar.style.height = '30px';
            bar.style.background = TRADE_COLORS[task.trade_id] || '#555';
            bar.style.borderRadius = '4px';
            bar.style.boxShadow = '0 2px 5px black';
            bar.style.opacity = 0.9;
            bar.textContent = task.name;
            bar.style.color = 'white';
            bar.style.fontSize = '0.8rem';
            bar.style.padding = '5px';
            bar.style.overflow = 'hidden';
            bar.style.whiteSpace = 'nowrap';
            
            canvas.appendChild(bar);
        });
    });

    container.appendChild(canvas);
}

// --- RENDER MATRIX (Simplified List) ---
function renderMatrix() {
    const list = document.getElementById('tv-matrix-list');
    list.innerHTML = '';

    state.talent.forEach(person => {
        // Find assignment for today
        const assign = state.assignments.find(a => a.talent_id === person.id);
        
        const row = document.createElement('div');
        row.className = 'matrix-row';
        
        let statusHtml = '';
        if (assign) {
            const t = assign.project_tasks;
            const tradeColor = TRADE_COLORS[t.trade_id] || '#fff';
            statusHtml = `
                <div class="matrix-task" style="border-left: 4px solid ${tradeColor}">
                    <span>${t.projects?.name} - ${t.name}</span>
                    <span style="color:${tradeColor}; font-weight:bold;">ASSIGNED</span>
                </div>
            `;
        } else {
            statusHtml = `
                <div class="matrix-task" style="opacity:0.5;">
                    <span><i>Unassigned / Available</i></span>
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

// --- RENDER HOT LIST ---
function renderHotList() {
    const container = document.getElementById('hot-list-content');
    container.innerHTML = '';

    const today = dayjs();
    // Filter tasks that are Active AND (End Date < Today OR End Date == Today)
    const hotTasks = state.tasks.filter(t => {
        const end = dayjs(t.end_date);
        return (end.isBefore(today, 'day') || end.isSame(today, 'day'));
    }).sort((a,b) => dayjs(a.end_date).diff(dayjs(b.end_date)));

    if(hotTasks.length === 0) {
        container.innerHTML = '<div style="color:#4CAF50; font-size:1.2rem;"><i class="fas fa-check-circle"></i> No urgent issues. Good job!</div>';
        return;
    }

    hotTasks.slice(0, 3).forEach(t => {
        const isOverdue = dayjs(t.end_date).isBefore(today, 'day');
        const color = isOverdue ? '#ff5252' : '#ffb74d'; // Red if overdue, Orange if due today
        const label = isOverdue ? 'OVERDUE' : 'DUE TODAY';

        const item = document.createElement('div');
        item.className = 'hot-item';
        item.innerHTML = `
            <span>${t.projects?.name} - ${t.name}</span>
            <span style="color:${color}; font-weight:bold;">${label}</span>
        `;
        container.appendChild(item);
    });
}
