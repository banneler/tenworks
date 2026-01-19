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

// --- TRADE COLORS (Matches Schedule Page) ---
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
    currentProject: null,
    tasks: [],
    contacts: [],
    files: [],
    notes: [],
    currentUser: null
};

document.addEventListener("DOMContentLoaded", async () => {
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    
    state.currentUser = user;
    await setupUserMenuAndAuth(supabase, { currentUser: user });
    await setupGlobalSearch(supabase, user);

    setupEventListeners();
    await loadProjectsList();
});

// --- 1. DATA LOADING ---

async function loadProjectsList() {
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) console.error("Error loading projects:", error);
    state.projects = data || [];
    renderProjectList();
}

async function loadProjectDetails(projectId) {
    // 1. Get Project Data
    const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).single();
    state.currentProject = project;

    // 2. Parallel Fetch: Tasks, Contacts (Joined), Notes, Files
    const [tasksRes, contactsRes, notesRes, filesRes] = await Promise.all([
        supabase.from('project_tasks').select('*').eq('project_id', projectId).order('start_date'),
        supabase.from('project_contacts').select('role, contacts(id, first_name, last_name, email, phone)').eq('project_id', projectId),
        supabase.from('project_notes').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.storage.from('project_files').list(`${projectId}`)
    ]);

    state.tasks = tasksRes.data || [];
    state.contacts = contactsRes.data || [];
    state.notes = notesRes.data || [];
    state.files = (filesRes.data || []).filter(f => f.name !== '.emptyFolderPlaceholder'); // Filter junk

    renderDetailView();
}

// --- 2. RENDERING ---

function renderProjectList() {
    const listEl = document.getElementById('project-list');
    const search = document.getElementById('project-search').value.toLowerCase();
    listEl.innerHTML = '';

    state.projects
        .filter(p => p.name.toLowerCase().includes(search))
        .forEach(p => {
            const el = document.createElement('div');
            el.className = 'item-list-row';
            if(state.currentProject && state.currentProject.id === p.id) el.classList.add('selected');
            
            // Clean Text Alignment (No Icon Square)
            el.innerHTML = `
                <h4>${p.name}</h4>
                <div>
                    <span style="color:${getStatusColor(p.status)}">${p.status}</span>
                    <span>${formatCurrency(p.project_value)}</span>
                </div>
            `;
            el.onclick = () => {
                document.querySelectorAll('.item-list-row').forEach(row => row.classList.remove('selected'));
                el.classList.add('selected');
                loadProjectDetails(p.id);
            };
            listEl.appendChild(el);
        });
}

function renderDetailView() {
    const p = state.currentProject;
    if(!p) return;

    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('detail-content').classList.remove('hidden');

    // Header Inputs
    document.getElementById('detail-name').value = p.name;
    document.getElementById('detail-status').value = p.status;
    document.getElementById('detail-value').textContent = formatCurrency(p.project_value);
    document.getElementById('detail-due-date').value = p.end_date || '';
    document.getElementById('detail-scope').value = p.description || '';

    // Tab 1: KPIs
    const totalEst = state.tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    const totalAct = state.tasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0);
    const progress = totalEst > 0 ? Math.round((totalAct / totalEst) * 100) : 0;

    document.getElementById('kpi-est').textContent = totalEst;
    document.getElementById('kpi-act').textContent = totalAct;
    document.getElementById('kpi-progress').textContent = `${progress}%`;

    // Tab 1: Team
    const teamEl = document.getElementById('team-list');
    teamEl.innerHTML = state.contacts.map(c => {
        const contact = c.contacts;
        if(!contact) return '';
        return `
            <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid var(--border-color); background:rgba(255,255,255,0.02); margin-bottom:5px;">
                <div>
                    <a href="contacts.html?id=${contact.id}" style="font-weight:600; text-decoration:none; color:var(--text-bright);">${contact.first_name} ${contact.last_name}</a>
                    <div style="font-size:0.75rem; color:var(--primary-gold);">${c.role || 'Stakeholder'}</div>
                </div>
                <div style="text-align:right; font-size:0.8rem; color:var(--text-dim);">
                    <div>${contact.email || ''}</div>
                    <div>${contact.phone || ''}</div>
                </div>
            </div>
        `;
    }).join('') || '<div style="color:var(--text-dim); padding:10px; font-style:italic;">No contacts assigned.</div>';

    // Tab 2: Gantt
    renderMiniGantt();

    // Tab 3: Files
    renderFiles();

    // Tab 4: Logs
    renderLogs();
}

function renderMiniGantt() {
    const header = document.getElementById('gantt-header');
    const body = document.getElementById('gantt-body');
    const container = document.getElementById('mini-gantt-container');
    
    if(!state.tasks.length) {
        body.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim);">No tasks scheduled.</div>';
        return;
    }

    // 1. Calculate Date Range
    let minDate = dayjs(state.tasks[0].start_date);
    let maxDate = dayjs(state.tasks[0].end_date);

    state.tasks.forEach(t => {
        const s = dayjs(t.start_date);
        const e = dayjs(t.end_date);
        if(s.isBefore(minDate)) minDate = s;
        if(e.isAfter(maxDate)) maxDate = e;
    });

    // Buffer: -2 days start, +5 days end
    const start = minDate.subtract(2, 'day');
    const end = maxDate.add(5, 'day');
    const totalDays = end.diff(start, 'day') + 1;
    const dayWidth = 50;

    // 2. Set Container Widths
    const totalWidth = totalDays * dayWidth;
    header.style.width = `${totalWidth}px`;
    body.style.width = `${totalWidth}px`;
    header.innerHTML = '';
    body.innerHTML = '';

    // 3. Render Header Grid
    for(let i=0; i<totalDays; i++) {
        const d = start.add(i, 'day');
        const cell = document.createElement('div');
        cell.className = 'gantt-date-cell';
        cell.style.width = `${dayWidth}px`;
        cell.textContent = d.format('DD MMM');
        if(d.day() === 0 || d.day() === 6) cell.style.background = 'rgba(255,255,255,0.03)';
        header.appendChild(cell);
    }

    // 4. Render Bars
    state.tasks.forEach((t, index) => {
        const tStart = dayjs(t.start_date);
        const tEnd = dayjs(t.end_date);
        const diffDays = tStart.diff(start, 'day');
        const duration = tEnd.diff(tStart, 'day') + 1;
        
        const bar = document.createElement('div');
        bar.className = 'gantt-bar';
        bar.style.left = `${diffDays * dayWidth}px`;
        bar.style.width = `${(duration * dayWidth) - 10}px`; // 10px gap
        bar.style.top = `${(index * 30) + 10}px`; // Stagger vertically
        bar.style.backgroundColor = TRADE_COLORS[t.trade_id] || '#555';
        bar.innerHTML = `<span>${t.name}</span>`;

        // Burn Line Overlay
        if(t.estimated_hours > 0 && t.actual_hours > 0) {
            const pct = Math.min((t.actual_hours / t.estimated_hours) * 100, 100);
            const overlay = document.createElement('div');
            overlay.className = 'burn-overlay';
            overlay.style.width = `${pct}%`;
            // Red if over budget
            if(t.actual_hours > t.estimated_hours) overlay.style.background = '#ff4444';
            bar.appendChild(overlay);
        }

        body.appendChild(bar);
    });
}

function renderFiles() {
    const list = document.getElementById('file-list');
    list.innerHTML = state.files.map(f => `
        <div class="file-row">
            <div class="file-icon"><i class="fas fa-file-alt"></i></div>
            <div style="flex:1;">
                <div style="color:var(--text-bright); font-weight:600;">${f.name}</div>
                <div style="font-size:0.7rem; color:var(--text-dim);">${(f.metadata.size / 1024).toFixed(1)} KB</div>
            </div>
            <button class="btn-text" onclick="window.previewFile('${f.name}')" style="color:var(--primary-gold); cursor:pointer;">View</button>
        </div>
    `).join('') || '<div style="color:var(--text-dim); padding:10px;">No files uploaded.</div>';
}

function renderLogs() {
    const list = document.getElementById('log-feed');
    list.innerHTML = state.notes.map(n => `
        <div class="log-card">
            <div class="log-meta">
                <span>${n.author_name || 'Sys'}</span>
                <span>${dayjs(n.created_at).format('MMM D, h:mm A')}</span>
            </div>
            <div style="color:var(--text-bright);">${n.content}</div>
        </div>
    `).join('');
}

// --- 3. EVENT LISTENERS ---

function setupEventListeners() {
    // Search
    document.getElementById('project-search').addEventListener('input', renderProjectList);

    // Save Changes
    document.getElementById('btn-save-main').addEventListener('click', async () => {
        if(!state.currentProject) return;
        
        const newName = document.getElementById('detail-name').value;
        const newStatus = document.getElementById('detail-status').value;
        const newDesc = document.getElementById('detail-scope').value;
        const newDate = document.getElementById('detail-due-date').value;
        const oldDate = state.currentProject.end_date;

        // 1. Update Project
        const { error } = await supabase.from('projects').update({
            name: newName,
            status: newStatus,
            description: newDesc,
            end_date: newDate || null
        }).eq('id', state.currentProject.id);

        if(error) { alert('Save failed: ' + error.message); return; }

        // 2. Check Date Change -> Insert System Note
        if(newDate !== oldDate) {
            const initials = state.currentUser.email.substring(0,2).toUpperCase();
            await supabase.from('project_notes').insert({
                project_id: state.currentProject.id,
                author_name: initials,
                content: `Changed Due Date from ${oldDate || 'N/A'} to ${newDate || 'N/A'}`
            });
        }

        alert('Project saved.');
        loadProjectsList(); // Refresh list
        loadProjectDetails(state.currentProject.id); // Refresh detail to show new log
    });

    // File Upload
    const btnUpload = document.getElementById('btn-upload-file');
    const fileInput = document.getElementById('file-input');
    
    btnUpload.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', async (e) => {
        if(!e.target.files.length) return;
        
        for(let file of e.target.files) {
            const path = `${state.currentProject.id}/${file.name}`;
            const { error } = await supabase.storage.from('project_files').upload(path, file);
            if(error) alert(`Error uploading ${file.name}: ${error.message}`);
        }
        
        loadProjectDetails(state.currentProject.id); // Refresh files
    });

    // Tabs
    document.querySelectorAll('.tab-link').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });

    // Add Note
    document.getElementById('btn-add-log').addEventListener('click', async () => {
        const txt = document.getElementById('new-log-input').value;
        if(!txt) return;
        
        const initials = state.currentUser.email.substring(0,2).toUpperCase();
        await supabase.from('project_notes').insert({
            project_id: state.currentProject.id,
            author_name: initials,
            content: txt
        });
        
        document.getElementById('new-log-input').value = '';
        loadProjectDetails(state.currentProject.id); // Refresh logs
    });
}

// --- HELPERS ---
function getStatusColor(status) {
    if(status === 'In Progress') return 'var(--primary-blue)';
    if(status === 'Completed') return '#4CAF50';
    return 'var(--text-dim)';
}

window.previewFile = async (fileName) => {
    const { data } = supabase.storage.from('project_files').getPublicUrl(`${state.currentProject.id}/${fileName}`);
    if(data) {
        const wrapper = document.getElementById('file-preview-wrapper');
        const frame = document.getElementById('preview-frame');
        wrapper.style.display = 'block';
        frame.src = data.publicUrl;
    }
};
