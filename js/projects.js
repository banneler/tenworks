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

    // --- TRADE COLORS (Matches Schedule Page) ---
    const TRADE_COLORS = { 1: '#546E7A', 2: '#1E88E5', 3: '#D4AF37', 4: '#8D6E63', 5: '#66BB6A', 6: '#7E57C2' };
    function getTradeColor(id) { return TRADE_COLORS[id] || 'var(--primary-gold)'; }

    // 1. LIST LOADER
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

    // 2. DETAIL LOADER
    async function loadDetail(id) {
        // Safe fetch
        const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single();
        state.currentProject = proj;
        if (!proj) return;

        if (proj.deal_id) {
            const { data: deal } = await supabase.from('deals_tw').select('deal_name').eq('id', proj.deal_id).single();
            if (deal) state.currentProject.deal_name = deal.deal_name;
        }

        const [taskRes, logRes, contactRes, fileRes] = await Promise.all([
            supabase.from('project_tasks').select('*, shop_talent(name)').eq('project_id', id),
            supabase.from('project_notes').select('*').eq('project_id', id).order('created_at', { ascending: false }),
            supabase.from('project_contacts').select('*, contacts(first_name, last_name, email)').eq('project_id', id),
            supabase.storage.from('project_files').list(`${id}`) // LIST FILES
        ]);

        state.tasks = taskRes.data || [];
        state.logs = logRes.data || [];
        state.projectContacts = contactRes.data || [];
        state.files = fileRes.data || [];

        renderDetail();
        renderList();
    }

    function renderDetail() {
        if (!state.currentProject) return;
        document.querySelector('.empty-state').classList.add('hidden');
        document.getElementById('detail-content').classList.remove('hidden');

        const p = state.currentProject;
        document.getElementById('detail-name').textContent = p.name;
        document.getElementById('detail-status').textContent = p.status;
        document.getElementById('detail-dates').textContent = `${dayjs(p.start_date).format('MMM D')} - ${dayjs(p.end_date).format('MMM D')}`;
        document.getElementById('detail-value').textContent = formatCurrency(p.project_value);
        document.getElementById('detail-deal-name').textContent = p.deal_name ? `via ${p.deal_name}` : '';
        document.getElementById('detail-scope').value = p.description || '';

        // PROGRESS CALCULATION
        const totalEst = state.tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
        const totalAct = state.tasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0);
        const progress = totalEst > 0 ? Math.min(Math.round((totalAct / totalEst) * 100), 100) : 0;

        document.getElementById('kpi-est-hours').textContent = totalEst;
        document.getElementById('kpi-act-hours').textContent = totalAct;
        document.getElementById('kpi-progress').textContent = `${progress}%`;

        renderContacts();
        renderLogs();
        renderFiles();
        
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        if(activeTab === 'timeline') renderMiniGantt();
    }

    // 3. RENDERERS
    function renderContacts() {
        const list = document.getElementById('project-contacts-list');
        list.innerHTML = state.projectContacts.map(c => `
            <div style="display:flex; justify-content:space-between; padding:12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); margin-bottom:8px; border-radius:6px;">
                <div>
                    <div style="font-weight:600; color:var(--text-bright);">${c.contacts.first_name} ${c.contacts.last_name}</div>
                    <div style="font-size:0.8rem; color:var(--text-dim); text-transform:uppercase;">${c.role || 'Stakeholder'}</div>
                </div>
                <div style="font-size:0.8rem; color:var(--text-dim); align-self:center;">${c.contacts.email || ''}</div>
            </div>
        `).join('');
    }

    function renderLogs() {
        const list = document.getElementById('log-feed');
        list.innerHTML = state.logs.map(l => `
            <div class="log-entry-card">
                <div class="log-avatar">${l.author_name || 'TW'}</div>
                <div class="log-content-wrapper">
                    <div class="log-header">
                        <span>${dayjs(l.created_at).format('MMM D, h:mm A')}</span>
                    </div>
                    <div class="log-body">${l.content}</div>
                </div>
            </div>
        `).join('');
    }

    function renderFiles() {
        const list = document.getElementById('file-list');
        if(state.files.length === 0) {
            list.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:10px;">No drawings uploaded yet.</div>';
            return;
        }
        
        list.innerHTML = state.files.map(f => {
            const url = supabase.storage.from('project_files').getPublicUrl(`${state.currentProject.id}/${f.name}`).data.publicUrl;
            return `
                <div class="file-item-card">
                    <div class="file-icon-box"><i class="fas fa-file-alt"></i></div>
                    <div style="flex:1;">
                        <div style="color:var(--text-bright); font-weight:600;">${f.name}</div>
                        <div style="color:var(--text-dim); font-size:0.75rem;">${(f.metadata.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <a href="${url}" target="_blank" class="btn-text" style="color:var(--primary-blue);"><i class="fas fa-download"></i></a>
                </div>
            `;
        }).join('');
    }

    function renderMiniGantt() {
        const container = document.getElementById('project-gantt-container');
        const header = document.getElementById('mini-gantt-header');
        const body = document.getElementById('mini-gantt-body');
        
        if(!state.currentProject.start_date || !state.currentProject.end_date) {
            body.innerHTML = '<div style="padding:20px; color:var(--text-dim); text-align:center;">No dates set.</div>';
            return;
        }

        const start = dayjs(state.currentProject.start_date).subtract(2, 'day');
        const end = dayjs(state.currentProject.end_date).add(5, 'day');
        const totalDays = end.diff(start, 'day');
        const dayWidth = 50; // Wider columns

        header.innerHTML = '';
        body.innerHTML = '';
        header.style.width = `${totalDays * dayWidth}px`;
        body.style.width = `${totalDays * dayWidth}px`;

        // DRAW GRID & HEADER
        for(let i=0; i<totalDays; i++) {
            const d = start.add(i, 'day');
            
            // Header Cell
            const cell = document.createElement('div');
            cell.style.width = `${dayWidth}px`;
            cell.style.borderRight = '1px solid var(--border-color)';
            cell.style.fontSize = '0.75rem';
            cell.style.textAlign = 'center';
            cell.style.paddingTop = '10px';
            cell.style.color = d.day()===0||d.day()===6 ? 'rgba(255,255,255,0.1)' : 'var(--text-dim)';
            cell.textContent = d.format('DD');
            header.appendChild(cell);

            // Vertical Grid Line
            const line = document.createElement('div');
            line.className = 'gantt-grid-line';
            line.style.left = `${(i+1) * dayWidth}px`;
            body.appendChild(line);
        }

        // RENDER TASKS
        state.tasks.forEach((t, index) => {
            const tStart = dayjs(t.start_date);
            const tEnd = dayjs(t.end_date);
            const offset = tStart.diff(start, 'day');
            const duration = tEnd.diff(tStart, 'day') + 1;
            
            const row = document.createElement('div');
            row.className = 'gantt-task-row';
            row.style.top = `${index * 40}px`; // Spaced out rows

            const bar = document.createElement('div');
            bar.className = 'gantt-bar';
            bar.style.left = `${offset * dayWidth}px`;
            bar.style.width = `${(duration * dayWidth) - 10}px`;
            bar.style.backgroundColor = getTradeColor(t.trade_id);
            
            // Assignee Badge
            let assigneeHtml = '';
            if(t.shop_talent) {
                const initials = t.shop_talent.name.split(' ').map(n=>n[0]).join('').substring(0,2);
                assigneeHtml = `<div class="gantt-assignee" title="${t.shop_talent.name}">${initials}</div>`;
            }

            // Progress Fill
            const est = t.estimated_hours || 1;
            const act = t.actual_hours || 0;
            const pct = Math.min((act/est)*100, 100);

            bar.innerHTML = `
                <div class="gantt-progress-fill" style="width:${pct}%"></div>
                <span style="position:relative; z-index:2;">${t.name}</span>
                ${assigneeHtml}
            `;
            
            row.appendChild(bar);
            body.appendChild(row);
        });
    }

    // 4. INTERACTION HANDLERS
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
        const initials = user.email.substring(0,2).toUpperCase();
        await supabase.from('project_notes').insert({ project_id: state.currentProject.id, content, author_name: initials });
        input.value = '';
        loadDetail(state.currentProject.id); 
    });

    // FILE UPLOAD LOGIC
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary-gold)'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border-color)'; });
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    async function handleFiles(files) {
        if(!files || files.length === 0) return;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const filePath = `${state.currentProject.id}/${file.name}`;
            const { error } = await supabase.storage.from('project_files').upload(filePath, file);
            if(error) alert(`Error uploading ${file.name}: ` + error.message);
        }
        loadDetail(state.currentProject.id); // Refresh list
    }

    loadProjects();
});
