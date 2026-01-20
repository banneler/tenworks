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
    trades: [],
    currentProject: null,
    tasks: [],
    contacts: [],
    files: [],
    notes: [],
    currentUser: null,
    hideZeroValue: true // Default: Hide $0 projects
};

document.addEventListener("DOMContentLoaded", async () => {
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    
    state.currentUser = user;
    await setupUserMenuAndAuth(supabase, { currentUser: user });
    await setupGlobalSearch(supabase, user);

    // Pre-load trades for the launch modal
    const { data: trades } = await supabase.from('shop_trades').select('*').order('id');
    state.trades = trades || [];

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

    // 2. Parallel Fetch
    const [tasksRes, contactsRes, notesRes, filesRes] = await Promise.all([
        supabase.from('project_tasks').select('*').eq('project_id', projectId).order('start_date'),
        supabase.from('project_contacts').select('role, contacts(id, first_name, last_name, email, phone)').eq('project_id', projectId),
        supabase.from('project_notes').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.storage.from('project_files').list(`${projectId}`)
    ]);

    state.tasks = tasksRes.data || [];
    state.contacts = contactsRes.data || [];
    state.notes = notesRes.data || [];
    state.files = (filesRes.data || []).filter(f => f.name !== '.emptyFolderPlaceholder');

    renderDetailView();
}

// --- 2. RENDERING ---

function renderProjectList() {
    const listEl = document.getElementById('project-list');
    const search = document.getElementById('project-search').value.toLowerCase();
    listEl.innerHTML = '';

    // Filter Logic: Search Text AND (HideZero Toggle)
    const filtered = state.projects.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search);
        const matchesValue = !state.hideZeroValue || (p.project_value > 0);
        return matchesSearch && matchesValue;
    });

    filtered.forEach(p => {
        const el = document.createElement('div');
        el.className = 'list-item'; 
        
        if(state.currentProject && state.currentProject.id === p.id) el.classList.add('selected');
        
        el.innerHTML = `
            <div class="contact-info" style="padding-left:0;">
                <div class="contact-name">${p.name}</div>
                <div class="account-name">
                    <span style="color:${getStatusColor(p.status)}">${p.status}</span> • ${formatCurrency(p.project_value)}
                </div>
            </div>
        `;
        el.onclick = () => {
            document.querySelectorAll('.list-item').forEach(row => row.classList.remove('selected'));
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
    document.getElementById('header-value-display').textContent = formatCurrency(p.project_value);
    
    // System ID (New)
    document.getElementById('detail-id').textContent = p.id;
    
    // Date Range
    document.getElementById('detail-start-date').value = p.start_date || '';
    document.getElementById('detail-due-date').value = p.end_date || '';
    
    // Description/Scope
    document.getElementById('detail-scope').value = p.description || ''; 

    // Countdown Widget
    const widget = document.getElementById('countdown-widget');
    if(p.end_date) {
        const diff = dayjs(p.end_date).diff(dayjs(), 'day');
        let color = '#4CAF50'; 
        if(diff < 0) color = '#F44336'; 
        else if(diff <= 7) color = '#FFC107'; 
        
        widget.innerHTML = `<span class="countdown-badge" style="background:${color}20; color:${color}; border:1px solid ${color}40;">
            ${diff < 0 ? Math.abs(diff) + ' Days Overdue' : diff + ' Days Left'}
        </span>`;
    } else {
        widget.innerHTML = '';
    }

    // KPI Calc
    const totalEst = state.tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    const totalAct = state.tasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0);
    const progress = totalEst > 0 ? Math.round((totalAct / totalEst) * 100) : 0;

    document.getElementById('kpi-est').textContent = totalEst;
    document.getElementById('kpi-act').textContent = totalAct;
    document.getElementById('kpi-progress').textContent = `${progress}%`;

    // Render Tabs
    renderTeam();
    renderMiniGantt();
    renderFiles();
    renderLogs();
}

function renderTeam() {
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
}

function renderMiniGantt() {
    const header = document.getElementById('gantt-header');
    const body = document.getElementById('gantt-body');
    const project = state.currentProject;
    
    if(!state.tasks.length && !project.end_date) {
        body.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim);">No tasks scheduled.</div>';
        return;
    }

    // 1. Calculate Date Range (Tasks vs Project Due Date)
    let minDate = dayjs();
    let maxDate = dayjs().add(14, 'day'); // Default buffer

    if(state.tasks.length > 0) {
        minDate = dayjs(state.tasks[0].start_date);
        maxDate = dayjs(state.tasks[0].end_date);
        
        state.tasks.forEach(t => {
            const s = dayjs(t.start_date);
            const e = dayjs(t.end_date);
            if(s.isBefore(minDate)) minDate = s;
            if(e.isAfter(maxDate)) maxDate = e;
        });
    }

    // If project has an end date, make sure the timeline includes it
    if(project.end_date) {
        const pEnd = dayjs(project.end_date);
        if(pEnd.isAfter(maxDate)) maxDate = pEnd;
        if(pEnd.isBefore(minDate)) minDate = pEnd.subtract(2, 'day');
    }

    const start = minDate.subtract(2, 'day');
    const end = maxDate.add(5, 'day');
    const totalDays = end.diff(start, 'day') + 1;
    const dayWidth = 50;

    const totalWidth = totalDays * dayWidth;
    header.style.width = `${totalWidth}px`;
    body.style.width = `${totalWidth}px`;
    header.innerHTML = '';
    body.innerHTML = '';

    // 2. Render Header Grid
    for(let i=0; i<totalDays; i++) {
        const d = start.add(i, 'day');
        const cell = document.createElement('div');
        cell.className = 'gantt-date-cell';
        cell.style.width = `${dayWidth}px`;
        cell.textContent = d.format('DD MMM');
        if(d.day() === 0 || d.day() === 6) cell.style.background = 'rgba(255,255,255,0.03)';
        header.appendChild(cell);
    }

    // 3. Render Finish Line
    let targetPixel = null;
    if(project.end_date) {
        const finishDate = dayjs(project.end_date);
        const diff = finishDate.diff(start, 'day');
        if(diff >= 0 && diff < totalDays) {
            targetPixel = (diff + 1) * dayWidth; // Right edge of the day
            const line = document.createElement('div');
            line.className = 'gantt-finish-line';
            line.style.left = `${diff * dayWidth}px`; // Start of the deadline day
            line.title = `Due Date: ${finishDate.format('MMM D')}`;
            
            const flag = document.createElement('div');
            flag.className = 'gantt-finish-flag';
            flag.innerHTML = '<i class="fas fa-flag-checkered"></i>';
            
            line.appendChild(flag);
            body.appendChild(line);
        }
    }

    // 4. Render Bars
    state.tasks.forEach((t, index) => {
        const tStart = dayjs(t.start_date);
        const tEnd = dayjs(t.end_date);
        const diffDays = tStart.diff(start, 'day');
        const duration = tEnd.diff(tStart, 'day') + 1;
        
        const barLeft = diffDays * dayWidth;
        const barWidth = (duration * dayWidth) - 10;
        
        const bar = document.createElement('div');
        bar.className = 'gantt-task-bar'; // Updated class for taller bars
        bar.style.left = `${barLeft}px`;
        bar.style.width = `${barWidth}px`;
        bar.style.top = `${(index * 60) + 15}px`; // Increased vertical spacing for 50px bars
        
        const baseColor = TRADE_COLORS[t.trade_id] || '#555';
        
        // --- OVERRUN LOGIC (Schedule Page Architecture) ---
        if (targetPixel !== null && (barLeft + barWidth) > targetPixel) {
             // Task crosses deadline!
             const safeWidth = Math.max(0, targetPixel - barLeft);
             const safePercent = (safeWidth / barWidth) * 100;
             
             // Gradient: Safe Color -> Sharp Transition -> Alert Red
             bar.style.background = `linear-gradient(90deg, ${baseColor} ${safePercent}%, #ff4444 ${safePercent}%)`;
             bar.style.border = '1px solid #ff4444';
        } else {
             // Safe Task
             bar.style.backgroundColor = baseColor;
        }

        // Burn Rate / Progress Overlay
        const percent = t.estimated_hours ? (t.actual_hours / t.estimated_hours) : 0;
        const burnColor = percent > 1 ? '#ff4444' : 'rgba(255,255,255,0.8)'; // Bright white or Red
        
        bar.innerHTML = `
            <span class="gantt-task-info">${t.name}</span>
            <div class="burn-line" style="width: ${Math.min(percent * 100, 100)}%; background: ${burnColor}; box-shadow: 0 0 5px ${burnColor}; pointer-events:none;"></div>
        `;

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
            <div class="file-actions">
                <button class="btn-file-action btn-view" onclick="window.previewFile('${f.name}')">View</button>
                <button class="btn-file-action btn-dl" onclick="window.downloadFile('${f.name}')">Download</button>
            </div>
        </div>
    `).join('') || '<div style="color:var(--text-dim); padding:10px;">No files uploaded.</div>';
}

function renderLogs() {
    const list = document.getElementById('log-feed');
    list.innerHTML = state.notes.map(n => {
        let initials = 'TW';
        if(n.author_name) {
             const parts = n.author_name.split(' ');
             if(parts.length > 1) {
                 initials = (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
             } else {
                 initials = n.author_name.substring(0,2).toUpperCase();
             }
        }

        return `
        <div class="log-card">
            <div class="log-meta">
                <div style="display:flex; align-items:center;">
                    <span class="log-avatar">${initials}</span>
                    <span style="font-weight:600; color:var(--text-bright);">${n.author_name || 'System'}</span>
                </div>
                <span>${dayjs(n.created_at).format('MMM D, h:mm A')}</span>
            </div>
            <div style="color:var(--text-bright); margin-left:34px;">${n.content}</div>
        </div>
    `}).join('');
}

// --- 3. EVENT LISTENERS ---

function setupEventListeners() {
    document.getElementById('project-search').addEventListener('input', renderProjectList);
    document.getElementById('btn-launch-project').addEventListener('click', openLaunchProjectModal);

    // Hide $0 Toggle
    document.getElementById('toggle-hide-zero').addEventListener('change', (e) => {
        state.hideZeroValue = e.target.checked;
        renderProjectList();
    });

    // Save Changes
    document.getElementById('btn-save-main').addEventListener('click', async () => {
        if(!state.currentProject) return;
        
        const newName = document.getElementById('detail-name').value;
        const newStatus = document.getElementById('detail-status').value;
        const newScope = document.getElementById('detail-scope').value;
        const newStartDate = document.getElementById('detail-start-date').value;
        const newDueDate = document.getElementById('detail-due-date').value;
        const oldDate = state.currentProject.end_date;

        // 1. Update DB (Including Description now)
        const { error } = await supabase.from('projects').update({
            name: newName,
            status: newStatus,
            description: newScope, // Attempting to save scope directly
            start_date: newStartDate || null,
            end_date: newDueDate || null
        }).eq('id', state.currentProject.id);

        if(error) { 
            console.error("Save Error:", error);
            alert('Save failed (Check console). Note: Scope saved to logs as backup.'); 
        }

        // 2. System Notes (Backup/Audit)
        if(newScope !== (state.currentProject.description || '')) {
            await createSystemNote(`Updated Scope: ${newScope}`);
        }

        if(newDueDate !== oldDate) {
            await createSystemNote(`Changed Due Date from ${oldDate || 'N/A'} to ${newDueDate || 'N/A'}`);
        }

        alert('Project saved.');
        loadProjectsList();
        loadProjectDetails(state.currentProject.id);
    });

    // Delete Project
    document.getElementById('btn-delete-project').addEventListener('click', async () => {
        if (!state.currentProject) return;
        
        const confirmMsg = `Are you sure you want to delete project "${state.currentProject.name}"?\n\nThis will permanently remove the project and all associated tasks. This action cannot be undone.`;
        if (!confirm(confirmMsg)) return;

        // Delete from DB
        const { error } = await supabase.from('projects').delete().eq('id', state.currentProject.id);

        if (error) {
            alert('Error deleting project: ' + error.message);
            return;
        }

        // UI Cleanup
        alert('Project deleted.');
        state.currentProject = null;
        document.getElementById('detail-content').classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
        await loadProjectsList();
    });

    // File Upload
    const btnUpload = document.getElementById('btn-upload-file');
    const fileInput = document.getElementById('file-input');
    const statusSpan = document.getElementById('upload-status');
    
    btnUpload.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', async (e) => {
        if(!e.target.files.length) return;
        statusSpan.style.display = 'inline-block';
        
        for(let file of e.target.files) {
            const path = `${state.currentProject.id}/${file.name}`;
            const { error } = await supabase.storage.from('project_files').upload(path, file);
            if(error && !error.message.includes('already exists')) alert(`Error uploading ${file.name}: ${error.message}`);
        }
        
        statusSpan.style.display = 'none';
        loadProjectDetails(state.currentProject.id);
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
        await createSystemNote(txt);
        document.getElementById('new-log-input').value = '';
        loadProjectDetails(state.currentProject.id);
    });
}

// --- HELPERS ---
async function createSystemNote(content) {
    let author = 'System';
    if(state.currentUser && state.currentUser.user_metadata && state.currentUser.user_metadata.full_name) {
        author = state.currentUser.user_metadata.full_name;
    } else if(state.currentUser) {
        author = state.currentUser.email;
    }

    await supabase.from('project_notes').insert({
        project_id: state.currentProject.id,
        author_name: author,
        content: content
    });
}

function addBusinessDays(date, daysToAdd) {
    let d = dayjs(date);
    let added = 0;
    if (daysToAdd === 0) return d;
    while (added < daysToAdd) {
        d = d.add(1, 'day');
        if (d.day() !== 0 && d.day() !== 6) added++;
    }
    return d;
}

// --- FILE HELPERS ---

window.previewFile = async (fileName) => {
    const { data, error } = await supabase.storage.from('project_files').createSignedUrl(`${state.currentProject.id}/${fileName}`, 3600);
    if(data) {
        const wrapper = document.getElementById('file-preview-wrapper');
        const frame = document.getElementById('preview-frame');
        wrapper.style.display = 'block';
        frame.src = data.signedUrl;
    } else {
        alert("Could not load preview.");
    }
};

window.downloadFile = async (fileName) => {
    const { data } = await supabase.storage.from('project_files').createSignedUrl(`${state.currentProject.id}/${fileName}`, 60, { download: true });
    if(data) {
        const a = document.createElement('a');
        a.href = data.signedUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
};

// --- LAUNCH MODAL ---
async function openLaunchProjectModal() {
    const { data: deals, error } = await supabase.from('deals_tw').select('*').order('created_at', { ascending: false });
    if (error) { alert("Error fetching deals: " + error.message); return; }
    if (!deals || deals.length === 0) { alert("No deals found in 'deals_tw' table."); return; }

    const options = deals.map(d => {
        const name = d.deal_name || d.name || 'Unnamed';
        const amt = d.amount || 0;
        return `<option value="${d.id}" data-name="${name}" data-amt="${amt}">${name} (${formatCurrency(amt)})</option>`;
    }).join('');

    const today = dayjs();
    const start = today; 
    const p1End = addBusinessDays(start, 2);  
    const p2Start = addBusinessDays(p1End, 1);
    const p2End = addBusinessDays(p2Start, 7); 
    const p3Start = addBusinessDays(p2End, 1);
    const p3End = addBusinessDays(p3Start, 14); 
    const p4Start = addBusinessDays(p3End, 1);
    const p4End = addBusinessDays(p4Start, 4); 
    const defTarget = p4End.format('YYYY-MM-DD');

    showModal('Launch Project Plan', `
        <div class="form-group"><label>Select Deal</label><select id="launch-deal" class="form-control" style="background:var(--bg-dark); color:white; padding:10px; width:100%; box-sizing:border-box;">${options}</select></div>
        <div style="margin-top:20px; border-top:1px solid var(--border-color); padding-top:15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h4 style="color:var(--text-bright); margin:0;">Phase Scheduling</h4>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; width:350px;">
                    <div><label style="margin:0; font-size:0.7rem; color:var(--text-dim);">Project Start:</label><input type="date" id="master-start-date" class="form-control" style="width:100%;" value="${start.format('YYYY-MM-DD')}"></div>
                    <div><label style="margin:0; font-size:0.7rem; color:var(--primary-gold);">Target Completion:</label><input type="date" id="master-end-date" class="form-control" style="width:100%; border:1px solid var(--primary-gold);" value="${defTarget}"></div>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; align-items:center; margin-bottom:5px; font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:1px;"><span>Phase</span><span>Start</span><span>End</span><span>Est. Hrs</span></div>
            <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;"><span style="align-self:center; color:var(--text-bright);">Kickoff</span><input type="date" id="p1-start" class="form-control" value="${start.format('YYYY-MM-DD')}"><input type="date" id="p1-end" class="form-control" value="${p1End.format('YYYY-MM-DD')}"><input type="number" id="p1-hrs" class="form-control" value="5"></div>
            <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;"><span style="align-self:center; color:var(--text-bright);">Design</span><input type="date" id="p2-start" class="form-control" value="${p2Start.format('YYYY-MM-DD')}"><input type="date" id="p2-end" class="form-control" value="${p2End.format('YYYY-MM-DD')}"><input type="number" id="p2-hrs" class="form-control" value="20"></div>
            <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;"><span style="align-self:center; color:var(--text-bright);">Fabrication</span><input type="date" id="p3-start" class="form-control" value="${p3Start.format('YYYY-MM-DD')}"><input type="date" id="p3-end" class="form-control" value="${p3End.format('YYYY-MM-DD')}"><input type="number" id="p3-hrs" class="form-control" value="80"></div>
            <div style="display:grid; grid-template-columns: 100px 1fr 1fr 80px; gap:8px; margin-bottom:8px;"><span style="align-self:center; color:var(--text-bright);">Installation</span><input type="date" id="p4-start" class="form-control" value="${p4Start.format('YYYY-MM-DD')}"><input type="date" id="p4-end" class="form-control" value="${p4End.format('YYYY-MM-DD')}"><input type="number" id="p4-hrs" class="form-control" value="24"></div>
        </div>
    `, async () => {
        const sel = document.getElementById('launch-deal');
        if(!sel.value) return;
        const name = sel.options[sel.selectedIndex].dataset.name;
        const amt = sel.options[sel.selectedIndex].dataset.amt;
        const crdd = document.getElementById('master-end-date').value; 
        const startD = document.getElementById('master-start-date').value;

        const dates = {
            p1s: document.getElementById('p1-start').value, p1e: document.getElementById('p1-end').value, p1h: document.getElementById('p1-hrs').value,
            p2s: document.getElementById('p2-start').value, p2e: document.getElementById('p2-end').value, p2h: document.getElementById('p2-hrs').value,
            p3s: document.getElementById('p3-start').value, p3e: document.getElementById('p3-end').value, p3h: document.getElementById('p3-hrs').value,
            p4s: document.getElementById('p4-start').value, p4e: document.getElementById('p4-end').value, p4h: document.getElementById('p4-hrs').value,
        };

        const { data: proj, error: projError } = await supabase.from('projects').insert([{ 
            deal_id: sel.value, 
            name, 
            start_date: startD, 
            end_date: crdd, 
            project_value: amt, 
            status: 'Pre-Production' 
        }]).select();
        
        if(projError) { alert(projError.message); return; }
        const pid = proj[0].id;

        const { data: t1 } = await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[0]?.id||1, name: 'Kickoff & Plan', start_date: dates.p1s, end_date: dates.p1e, estimated_hours: dates.p1h }).select();
        const { data: t2 } = await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[1]?.id||2, name: 'CAD Drawings', start_date: dates.p2s, end_date: dates.p2e, estimated_hours: dates.p2h, dependency_task_id: t1[0].id }).select();
        const { data: t3 } = await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[2]?.id||3, name: 'Fabrication', start_date: dates.p3s, end_date: dates.p3e, estimated_hours: dates.p3h, dependency_task_id: t2[0].id }).select();
        await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[4]?.id||5, name: 'Installation', start_date: dates.p4s, end_date: dates.p4e, estimated_hours: dates.p4h, dependency_task_id: t3[0].id });

        loadProjectsList();
    });
    
    setTimeout(() => {
        document.getElementById('master-start-date').addEventListener('change', (e) => {
            const s = dayjs(e.target.value);
            const d1e = addBusinessDays(s, 2);
            const d2s = addBusinessDays(d1e, 1);
            const d2e = addBusinessDays(d2s, 7);
            const d3s = addBusinessDays(d2e, 1);
            const d3e = addBusinessDays(d3s, 14);
            const d4s = addBusinessDays(d3e, 1);
            const d4e = addBusinessDays(d4s, 4);

            document.getElementById('p1-start').value = s.format('YYYY-MM-DD');
            document.getElementById('p1-end').value = d1e.format('YYYY-MM-DD');
            document.getElementById('p2-start').value = d2s.format('YYYY-MM-DD');
            document.getElementById('p2-end').value = d2e.format('YYYY-MM-DD');
            document.getElementById('p3-start').value = d3s.format('YYYY-MM-DD');
            document.getElementById('p3-end').value = d3e.format('YYYY-MM-DD');
            document.getElementById('p4-start').value = d4s.format('YYYY-MM-DD');
            document.getElementById('p4-end').value = d4e.format('YYYY-MM-DD');
            document.getElementById('master-end-date').value = d4e.format('YYYY-MM-DD');
        });
    }, 100);
}

function getStatusColor(status) {
    if(status === 'In Progress') return 'var(--primary-blue)';
    if(status === 'Completed') return '#4CAF50';
    return 'var(--text-dim)';
}
