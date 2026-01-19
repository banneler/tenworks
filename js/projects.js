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
                el.className = 'item-list-row';
                if (state.currentProject && state.currentProject.id === p.id) el.classList.add('selected');
                
                const initial = p.name.charAt(0).toUpperCase();
                
                // EXACT ACCOUNT PAGE STRUCTURE
                el.innerHTML = `
                    <div class="item-icon">${initial}</div>
                    <div class="item-details">
                        <div class="item-main">${p.name}</div>
                        <div class="item-sub">
                            <span>${p.status}</span>
                            <span>${formatCurrency(p.project_value)}</span>
                        </div>
                    </div>
                `;
                el.onclick = () => loadDetail(p.id);
                listEl.appendChild(el);
            });
    }

    document.getElementById('project-search').addEventListener('input', renderList);

    // 2. DETAIL LOADER
    async function loadDetail(id) {
        const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single();
        state.currentProject = proj;
        if (!proj) return;

        if (proj.deal_id) {
            const { data: deal } = await supabase.from('deals_tw').select('deal_name').eq('id', proj.deal_id).single();
            if (deal) state.currentProject.deal_name = deal.deal_name;
        }

        // Updated Contact Query to get PHONE
        const [taskRes, logRes, contactRes, fileRes] = await Promise.all([
            supabase.from('project_tasks').select('*, shop_talent(name)').eq('project_id', id),
            supabase.from('project_notes').select('*').eq('project_id', id).order('created_at', { ascending: false }),
            supabase.from('project_contacts').select('*, contacts(id, first_name, last_name, email, phone)').eq('project_id', id),
            supabase.storage.from('project_files').list(`${id}`)
        ]);

        state.tasks = taskRes.data || [];
        state.logs = logRes.data || [];
        state.projectContacts = contactRes.data || [];
        
        if (fileRes.error && fileRes.error.message.includes('not found')) {
            state.files = [];
        } else {
            state.files = fileRes.data || [];
        }

        renderDetail();
        renderList();
    }

    function renderDetail() {
        if (!state.currentProject) return;
        document.querySelector('.empty-state').classList.add('hidden');
        document.getElementById('detail-content').classList.remove('hidden');

        const p = state.currentProject;
        document.getElementById('detail-name').value = p.name;
        document.getElementById('detail-status').textContent = p.status;
        document.getElementById('detail-dates').textContent = `${dayjs(p.start_date).format('MMM D')} - ${dayjs(p.end_date).format('MMM D')}`;
        document.getElementById('detail-value').textContent = formatCurrency(p.project_value);
        document.getElementById('detail-scope').value = p.description || '';
        document.getElementById('detail-due-date').value = p.end_date || '';

        // PROGRESS
        const totalEst = state.tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
        const totalAct = state.tasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0);
        const progress = totalEst > 0 ? Math.min(Math.round((totalAct / totalEst) * 100), 100) : 0;

        document.getElementById('kpi-est-hours').textContent = totalEst;
        document.getElementById('kpi-act-hours').textContent = totalAct;
        document.getElementById('kpi-progress').textContent = `${progress}%`;

        // COUNTDOWN
        const countdownEl = document.getElementById('countdown-widget');
        if (p.end_date) {
            const diff = dayjs(p.end_date).diff(dayjs(), 'day');
            let color = '#4CAF50'; 
            if (diff < 0) color = '#F44336'; 
            else if (diff <= 7) color = '#FFC107'; 
            countdownEl.innerHTML = `<span style="background:${color}20; color:${color}; padding:5px 12px; border-radius:20px; font-weight:700; font-size:0.85rem; border:1px solid ${color}40;">${diff < 0 ? Math.abs(diff) + ' Days Overdue' : diff + ' Days Left'}</span>`;
        } else {
            countdownEl.innerHTML = '';
        }

        renderContacts();
        renderLogs();
        renderFiles();
        
        if(document.querySelector('.tab-btn.active').dataset.tab === 'timeline') renderMiniGantt();
    }

    // 3. RENDERERS
    function renderContacts() {
        const list = document.getElementById('project-contacts-list');
        list.innerHTML = state.projectContacts.map(c => `
            <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border-color); background:rgba(255,255,255,0.02); margin-bottom:5px; border-radius:4px;">
                <div>
                    <a href="contacts.html?id=${c.contacts.id}" class="talent-name-clickable" style="font-weight:600; color:var(--text-bright); text-decoration:none;">${c.contacts.first_name} ${c.contacts.last_name}</a>
                    <div style="font-size:0.8rem; color:var(--text-dim); text-transform:uppercase; margin-top:2px;">${c.role || 'Stakeholder'}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.8rem; color:var(--text-dim);">${c.contacts.email || ''}</div>
                    <div style="font-size:0.8rem; color:var(--text-dim);">${c.contacts.phone || ''}</div>
                </div>
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
        if(state.files.length === 0) { list.innerHTML = ''; return; }
        
        list.innerHTML = state.files.map(f => {
            return `
                <div class="file-item-card">
                    <div class="file-icon-box"><i class="fas fa-file-alt"></i></div>
                    <div style="flex:1; cursor:pointer;" onclick="previewFile('${f.name}')">
                        <div style="color:var(--text-bright); font-weight:600;">${f.name}</div>
                        <div style="color:var(--text-dim); font-size:0.75rem;">${(f.metadata.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <button onclick="previewFile('${f.name}')" class="btn-text" style="color:var(--primary-blue); margin-right:10px;"><i class="fas fa-eye"></i></button>
                </div>
            `;
        }).join('');
    }

    window.previewFile = async (fileName) => {
        const { data } = supabase.storage.from('project_files').getPublicUrl(`${state.currentProject.id}/${fileName}`);
        if(data) {
            document.getElementById('file-preview-container').classList.remove('hidden');
            document.getElementById('file-preview-frame').src = data.publicUrl;
        }
    };

    document.getElementById('close-preview').addEventListener('click', () => {
        document.getElementById('file-preview-container').classList.add('hidden');
        document.getElementById('file-preview-frame').src = '';
    });

    function renderMiniGantt() {
        const scrollArea = document.getElementById('gantt-scroll-area');
        const header = document.getElementById('mini-gantt-header');
        const body = document.getElementById('mini-gantt-body');
        
        if(!state.currentProject.start_date || !state.currentProject.end_date) {
            body.innerHTML = '<div style="padding:20px; color:var(--text-dim); text-align:center;">No dates set.</div>';
            return;
        }

        const start = dayjs(state.currentProject.start_date).subtract(2, 'day');
        const end = dayjs(state.currentProject.end_date).add(5, 'day');
        const totalDays = end.diff(start, 'day');
        const dayWidth = 50; 
        const totalWidth = totalDays * dayWidth;

        scrollArea.style.width = `${totalWidth}px`;
        header.style.minWidth = `${totalWidth}px`; 
        body.style.minWidth = `${totalWidth}px`;
        
        header.innerHTML = '';
        body.innerHTML = '';

        for(let i=0; i<totalDays; i++) {
            const d = start.add(i, 'day');
            
            const cell = document.createElement('div');
            cell.style.width = `${dayWidth}px`;
            cell.style.borderRight = '1px solid var(--border-color)';
            cell.style.fontSize = '0.75rem';
            cell.style.textAlign = 'center';
            cell.style.paddingTop = '10px';
            cell.style.color = d.day()===0||d.day()===6 ? 'rgba(255,255,255,0.1)' : 'var(--text-dim)';
            cell.textContent = d.format('DD');
            header.appendChild(cell);

            const line = document.createElement('div');
            line.className = 'gantt-grid-line';
            line.style.left = `${(i+1) * dayWidth}px`;
            body.appendChild(line);
        }

        state.tasks.forEach((t, index) => {
            const tStart = dayjs(t.start_date);
            const tEnd = dayjs(t.end_date);
            const offset = tStart.diff(start, 'day');
            const duration = tEnd.diff(tStart, 'day') + 1;
            
            const row = document.createElement('div');
            row.className = 'gantt-task-row';
            row.style.top = `${index * 55}px`;

            const bar = document.createElement('div');
            bar.className = 'gantt-task-bar'; // Renamed to match Schedule Page CSS
            bar.style.left = `${offset * dayWidth}px`;
            bar.style.width = `${(duration * dayWidth) - 10}px`;
            bar.style.backgroundColor = getTradeColor(t.trade_id);
            
            let assigneeHtml = '';
            if(t.shop_talent) {
                const initials = t.shop_talent.name.split(' ').map(n=>n[0]).join('').substring(0,2);
                assigneeHtml = `<div class="gantt-assignee" title="${t.shop_talent.name}">${initials}</div>`;
            }

            const est = t.estimated_hours || 1;
            const act = t.actual_hours || 0;
            const pct = Math.min((act/est)*100, 100);
            const burnColor = (act > est) ? '#ff4444' : 'rgba(255,255,255,0.6)';

            bar.innerHTML = `
                <div class="burn-line" style="width:${pct}%; background:${burnColor}; box-shadow: 0 0 5px ${burnColor};"></div>
                <span style="position:relative; z-index:2; margin-right:5px;">${t.name}</span>
                ${assigneeHtml}
            `;
            
            row.appendChild(bar);
            body.appendChild(row);
        });
    }

    // --- MAIN SAVE HANDLER (Updates Everything) ---
    document.getElementById('btn-save-changes').addEventListener('click', async () => {
        const newName = document.getElementById('detail-name').value;
        const newScope = document.getElementById('detail-scope').value;
        const newDueDate = document.getElementById('detail-due-date').value;
        const oldDueDate = state.currentProject.end_date;

        const updates = {
            name: newName,
            description: newScope,
            end_date: newDueDate || null
        };

        // Update Project
        const { error } = await supabase.from('projects').update(updates).eq('id', state.currentProject.id);
        
        if (error) {
            alert("Error saving: " + error.message);
        } else {
            // Check for Due Date Change & Log it
            if (newDueDate !== oldDueDate) {
                const initials = user.email.substring(0,2).toUpperCase();
                const msg = `Due Date updated to ${newDueDate || 'None'}`;
                await supabase.from('project_notes').insert({ 
                    project_id: state.currentProject.id, 
                    content: msg, 
                    author_name: initials 
                });
            }
            alert("Project saved successfully.");
            loadDetail(state.currentProject.id); // Refresh view
        }
    });

    // TABS
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
        if(!input.value) return;
        const initials = user.email.substring(0,2).toUpperCase();
        await supabase.from('project_notes').insert({ project_id: state.currentProject.id, content: input.value, author_name: initials });
        input.value = '';
        loadDetail(state.currentProject.id); 
    });

    // ADD CONTACT
    document.getElementById('btn-add-contact').addEventListener('click', async () => {
        const { data: contacts } = await supabase.from('contacts').select('*').order('last_name');
        const options = contacts.map(c => `<option value="${c.id}">${c.first_name} ${c.last_name}</option>`).join('');
        showModal('Add Project Contact', `
            <div class="form-group"><label>Select Contact</label><select id="new-contact-select" class="form-control" style="background:var(--bg-dark); color:white; padding:10px;">${options}</select></div>
            <div class="form-group"><label>Role</label><input type="text" id="new-contact-role" class="form-control" placeholder="e.g. Architect"></div>
            <button id="btn-save-contact" class="btn-primary" style="width:100%; margin-top:15px;">Add</button>
        `, async () => {});
        setTimeout(() => {
            document.getElementById('btn-save-contact').onclick = async () => {
                const contactId = document.getElementById('new-contact-select').value;
                const role = document.getElementById('new-contact-role').value;
                await supabase.from('project_contacts').insert({ project_id: state.currentProject.id, contact_id: contactId, role });
                hideModal(); loadDetail(state.currentProject.id);
            };
        }, 100);
    });

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
            if(error) {
                if(error.message.includes('not found')) alert("Error: Storage Bucket 'project_files' missing.");
                else alert("Upload failed: " + error.message);
            }
        }
        loadDetail(state.currentProject.id);
    }

    loadProjects();
});
