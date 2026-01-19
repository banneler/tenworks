import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    formatCurrency, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs,
    setupGlobalSearch 
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

document.addEventListener("DOMContentLoaded", async () => {
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    await setupUserMenuAndAuth(supabase, { currentUser: user });
    await setupGlobalSearch(supabase, user);

    let state = {
        projects: [],
        currentProject: null,
        tasks: [],
        logs: [],
        files: [],
        projectContacts: []
    };

    // 1. Load List
    async function loadProjects() {
        const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (error) console.error(error);
        state.projects = data || [];
        renderList();
    }

    function renderList() {
        const listEl = document.getElementById('project-list');
        const filter = document.getElementById('project-search').value.toLowerCase();
        listEl.innerHTML = '';

        state.projects
            .filter(p => p.name.toLowerCase().includes(filter))
            .forEach(p => {
                const el = document.createElement('div');
                el.className = 'record-item';
                if (state.currentProject && state.currentProject.id === p.id) el.classList.add('active');
                
                let statusColor = '#888';
                if (p.status === 'In Progress') statusColor = 'var(--primary-blue)';
                if (p.status === 'Completed') statusColor = '#4CAF50';

                el.innerHTML = `
                    <div class="record-info">
                        <div class="record-name">${p.name}</div>
                        <div class="record-meta" style="color:${statusColor}">${p.status}</div>
                    </div>
                    <div class="record-amount">${formatCurrency(p.project_value)}</div>
                `;
                el.onclick = () => loadDetail(p.id);
                listEl.appendChild(el);
            });
    }

    document.getElementById('project-search').addEventListener('input', renderList);

    // 2. Load Detail
    async function loadDetail(id) {
        // Fetch Project, Tasks, Logs, Files, Contacts in parallel
        const [projRes, taskRes, logRes, contactRes] = await Promise.all([
            supabase.from('projects').select('*, deals_tw(id, deal_name)').eq('id', id).single(),
            supabase.from('project_tasks').select('*').eq('project_id', id),
            supabase.from('project_notes').select('*').eq('project_id', id).order('created_at', { ascending: false }),
            supabase.from('project_contacts').select('*, contacts(first_name, last_name, email)').eq('project_id', id)
        ]);

        state.currentProject = projRes.data;
        state.tasks = taskRes.data || [];
        state.logs = logRes.data || [];
        state.projectContacts = contactRes.data || [];

        renderDetail();
        renderList(); // Update active state
    }

    function renderDetail() {
        document.querySelector('.empty-state').classList.add('hidden');
        document.getElementById('detail-content').classList.remove('hidden');

        const p = state.currentProject;
        document.getElementById('detail-name').textContent = p.name;
        document.getElementById('detail-status').textContent = p.status;
        document.getElementById('detail-dates').textContent = `${dayjs(p.start_date).format('MMM D')} - ${dayjs(p.end_date).format('MMM D')}`;
        document.getElementById('detail-value').textContent = formatCurrency(p.project_value);
        document.getElementById('detail-scope').value = p.description || ''; // Assuming 'description' field exists or we use notes

        // KPIs
        const totalEst = state.tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
        const totalAct = state.tasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0);
        const progress = totalEst > 0 ? Math.round((totalAct / totalEst) * 100) : 0;

        document.getElementById('kpi-est-hours').textContent = totalEst;
        document.getElementById('kpi-act-hours').textContent = totalAct;
        document.getElementById('kpi-progress').textContent = `${progress}%`;

        // Load Tabs
        renderContacts();
        renderLogs();
        // Trigger specific tab render if active
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        if(activeTab === 'timeline') renderMiniGantt();
    }

    // 3. Sub-Renderers
    function renderContacts() {
        const list = document.getElementById('project-contacts-list');
        list.innerHTML = state.projectContacts.map(c => `
            <div style="display:flex; justify-content:space-between; padding:8px; background:var(--bg-medium); margin-bottom:5px; border-radius:4px;">
                <div>
                    <div style="font-weight:600;">${c.contacts.first_name} ${c.contacts.last_name}</div>
                    <div style="font-size:0.8rem; color:var(--text-dim);">${c.role || 'Stakeholder'}</div>
                </div>
                <div style="font-size:0.8rem;">${c.contacts.email || ''}</div>
            </div>
        `).join('');
    }

    function renderLogs() {
        const list = document.getElementById('log-feed');
        list.innerHTML = state.logs.map(l => `
            <div class="log-entry">
                <div class="log-meta">
                    <span class="log-initials">${l.author_name || 'SYS'}</span>
                    <span>${dayjs(l.created_at).format('MMM D, h:mm A')}</span>
                </div>
                <div style="color:var(--text-bright); font-size:0.9rem;">${l.content}</div>
            </div>
        `).join('');
    }

    function renderMiniGantt() {
        // Simplified version of the main Schedule Gantt
        // Just creates bars for this project's tasks
        const container = document.getElementById('project-gantt-container');
        const header = document.getElementById('mini-gantt-header');
        const body = document.getElementById('mini-gantt-body');
        
        // Setup Date Range (Start of project to End of project)
        const start = dayjs(state.currentProject.start_date).subtract(2, 'day');
        const end = dayjs(state.currentProject.end_date).add(5, 'day');
        const totalDays = end.diff(start, 'day');
        const dayWidth = 40;

        header.innerHTML = '';
        body.innerHTML = '';
        header.style.width = `${totalDays * dayWidth}px`;
        body.style.width = `${totalDays * dayWidth}px`;

        for(let i=0; i<totalDays; i++) {
            const d = start.add(i, 'day');
            const cell = document.createElement('div');
            cell.style.width = `${dayWidth}px`;
            cell.style.borderRight = '1px solid var(--border-color)';
            cell.style.fontSize = '0.7rem';
            cell.style.textAlign = 'center';
            cell.style.paddingTop = '5px';
            cell.textContent = d.format('D');
            header.appendChild(cell);
        }

        // Render Tasks
        state.tasks.forEach((t, index) => {
            const tStart = dayjs(t.start_date);
            const tEnd = dayjs(t.end_date);
            const offset = tStart.diff(start, 'day');
            const duration = tEnd.diff(tStart, 'day') + 1;

            const bar = document.createElement('div');
            bar.style.position = 'absolute';
            bar.style.left = `${offset * dayWidth}px`;
            bar.style.top = `${index * 30 + 10}px`;
            bar.style.width = `${duration * dayWidth}px`;
            bar.style.height = '20px';
            bar.style.background = 'var(--primary-blue)';
            bar.style.borderRadius = '4px';
            bar.style.fontSize = '0.7rem';
            bar.style.paddingLeft = '5px';
            bar.style.color = 'white';
            bar.style.whiteSpace = 'nowrap';
            bar.textContent = t.name;
            
            body.appendChild(bar);
        });
    }

    // 4. Interaction Handlers
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            if(btn.dataset.tab === 'timeline') renderMiniGantt();
        });
    });

    document.getElementById('btn-add-log').addEventListener('click', async () => {
        const input = document.getElementById('new-log-input');
        const content = input.value;
        if(!content) return;

        const initials = user.email.substring(0,2).toUpperCase(); // Simple initials logic
        
        await supabase.from('project_notes').insert({
            project_id: state.currentProject.id,
            content,
            author_name: initials
        });
        input.value = '';
        loadDetail(state.currentProject.id); // Refresh
    });

    // 5. Initial Load
    loadProjects();
});
