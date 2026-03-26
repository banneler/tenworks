import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    formatCurrency, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs,
    setupGlobalSearch,
    runWhenNavReady,
    hideGlobalLoader
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const dayjs = window.dayjs;

// --- TRADE COLORS (Matches Schedule Page) ---
const TRADE_COLORS = {
    1: '#546E7A', 2: '#1E88E5', 3: '#D4AF37', 4: '#8D6E63', 5: '#66BB6A', 6: '#7E57C2'
};

const DEFAULT_LABOR_RATE = 75; // $/hr for job cost summary

const TODAY = () => new Date().toISOString().slice(0, 10);
const DAYS_AT_RISK = 14;

const STALE_AFTER_MS = 2 * 60 * 1000;
let state = {
    projects: [],
    trades: [],
    currentProject: null,
    linkedProposal: null,
    overdueProjectIds: new Set(),
    atRiskProjectIds: new Set(),
    tasks: [],
    contacts: [],
    files: [],
    notes: [],
    bom: [],
    changeOrders: [],
    currentUser: null,
    hideZeroValue: true,
    lastLoadedAt: null
};

function showStalenessBanner() {
    const el = document.getElementById('data-staleness-banner');
    if (el) { el.style.display = 'flex'; el.classList.remove('hidden'); }
}
function hideStalenessBanner() {
    const el = document.getElementById('data-staleness-banner');
    if (el) { el.style.display = 'none'; el.classList.add('hidden'); }
}
function checkStaleness() {
    if (state.lastLoadedAt != null && (Date.now() - state.lastLoadedAt) > STALE_AFTER_MS) showStalenessBanner();
}

document.addEventListener("DOMContentLoaded", async () => {
    runWhenNavReady(async () => {
        try {
        await loadSVGs();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { hideGlobalLoader(); window.location.href = 'index.html'; return; }

        state.currentUser = user;
        await setupUserMenuAndAuth(supabase, { currentUser: user });
        await setupGlobalSearch(supabase, user);

        const { data: trades } = await supabase.from('shop_trades').select('*').order('id');
        state.trades = trades || [];

        setupEventListeners();
        await loadProjectsList();

        const launchDealId = new URLSearchParams(window.location.search).get('launch_deal_id');
        if (launchDealId) {
            history.replaceState({}, '', window.location.pathname);
            openLaunchProjectModal(launchDealId);
        }
        } finally {
            hideGlobalLoader();
        }
    });
});

// --- 1. DATA LOADING ---

async function loadProjectsList() {
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) console.error("Error loading projects:", error);
    state.projects = data || [];

    const { data: tasksData } = await supabase.from('project_tasks').select('project_id, end_date, status').neq('status', 'Completed');
    const allTasks = tasksData || [];
    const today = TODAY();
    const endPlus14 = new Date();
    endPlus14.setDate(endPlus14.getDate() + DAYS_AT_RISK);
    const endPlus14Str = endPlus14.toISOString().slice(0, 10);
    state.overdueProjectIds = new Set();
    state.atRiskProjectIds = new Set();
    state.projects.forEach(p => {
        if (!p.end_date || p.status === 'Completed') return;
        if (p.end_date < today) state.overdueProjectIds.add(p.id);
    });
    const overdueTaskProjectIds = new Set(allTasks.filter(t => t.end_date && t.end_date < today).map(t => t.project_id));
    state.projects.forEach(p => {
        if (!p.end_date || p.status === 'Completed') return;
        if (p.end_date >= today && p.end_date <= endPlus14Str && overdueTaskProjectIds.has(p.id)) state.atRiskProjectIds.add(p.id);
    });

    state.lastLoadedAt = Date.now();
    hideStalenessBanner();
    renderProjectList();
}

async function loadProjectDetails(projectId) {
    const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).single();
    state.currentProject = project;
    state.linkedProposal = null;
    if (project?.proposal_id) {
        const { data: prop } = await supabase.from('proposals_tw').select('id, title, updated_at').eq('id', project.proposal_id).maybeSingle();
        state.linkedProposal = prop || null;
    }

    const [tasksRes, contactsRes, notesRes, filesRes, bomRes, changeOrdersRes] = await Promise.all([
        supabase.from('project_tasks').select('*').eq('project_id', projectId).order('start_date'),
        supabase.from('project_contacts').select('role, contacts(id, first_name, last_name, email, phone)').eq('project_id', projectId),
        supabase.from('project_notes').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.storage.from('project_files').list(`${projectId}`),
        supabase.from('project_bom').select('*, inventory_items(sku, name, category, uom, cost_per_unit)').eq('project_id', projectId),
        supabase.from('project_change_orders').select('*').eq('project_id', projectId).order('created_at', { ascending: true })
    ]);

    state.tasks = tasksRes.data || [];
    state.contacts = contactsRes.data || [];
    state.notes = notesRes.data || [];
    state.files = (filesRes.data || []).filter(f => f.name !== '.emptyFolderPlaceholder');
    state.bom = bomRes.data || [];
    state.changeOrders = changeOrdersRes.data || [];

    renderDetailView();
}

// --- 2. RENDERING ---

function renderProjectList() {
    const listEl = document.getElementById('project-list');
    const search = document.getElementById('project-search').value.toLowerCase();
    const urlFilter = new URLSearchParams(window.location.search).get('filter');
    listEl.innerHTML = '';

    let filtered = state.projects.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search);
        const matchesValue = !state.hideZeroValue || (p.project_value > 0);
        return matchesSearch && matchesValue;
    });
    if (urlFilter === 'overdue') filtered = filtered.filter(p => state.overdueProjectIds.has(p.id));
    if (urlFilter === 'at_risk') filtered = filtered.filter(p => state.atRiskProjectIds.has(p.id));

    filtered.forEach(p => {
        const isOverdue = state.overdueProjectIds.has(p.id);
        const isAtRisk = state.atRiskProjectIds.has(p.id);
        const badge = isOverdue ? '<span style="font-size:0.7rem; background:#c62828; color:fff; padding:2px 6px; border-radius:4px; margin-left:6px;">Overdue</span>' : (isAtRisk ? '<span style="font-size:0.7rem; background:var(--warning-yellow); color:#000; padding:2px 6px; border-radius:4px; margin-left:6px;">At risk</span>' : '');
        const el = document.createElement('div');
        el.className = 'list-item';
        if (state.currentProject && state.currentProject.id === p.id) el.classList.add('selected');

        el.innerHTML = `
            <div class="contact-info" style="padding-left:0;">
                <div class="contact-name">${p.name}${badge}</div>
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

    const proposalBtn = document.getElementById('btn-generate-proposal');
    if (proposalBtn) {
        proposalBtn.style.display = 'inline-flex';
        proposalBtn.href = `proposals.html?project_id=${p.id}`;
        if (p.deal_id) proposalBtn.href += `&deal_id=${p.deal_id}`;
    }
    const scheduleBtn = document.getElementById('btn-open-schedule');
    if (scheduleBtn) {
        scheduleBtn.style.display = 'inline-flex';
        scheduleBtn.href = `schedule.html?project_id=${p.id}`;
    }
    const talentBtn = document.getElementById('btn-open-talent');
    if (talentBtn) {
        talentBtn.style.display = 'inline-flex';
        talentBtn.href = `talent.html?project_id=${p.id}`;
    }
    const viewProposalBtn = document.getElementById('btn-view-proposal');
    if (viewProposalBtn) {
        if (state.linkedProposal) {
            viewProposalBtn.style.display = 'inline-flex';
            viewProposalBtn.href = `proposals.html?id=${state.linkedProposal.id}`;
            viewProposalBtn.title = state.linkedProposal.title || 'View linked proposal';
            viewProposalBtn.innerHTML = `<i class="fas fa-file-alt"></i> ${state.linkedProposal.title ? 'View: ' + state.linkedProposal.title : 'View proposal'}`;
        } else {
            viewProposalBtn.style.display = 'none';
        }
    }
    const shareStatusBtn = document.getElementById('btn-share-status-link');
    if (shareStatusBtn) shareStatusBtn.style.display = 'inline-flex';

    document.getElementById('detail-name').value = p.name || '';
    document.getElementById('detail-status').value = p.status || '';
    const paymentUrlEl = document.getElementById('detail-payment-url');
    if (paymentUrlEl) paymentUrlEl.value = p.payment_url || '';
    const clientSummaryEl = document.getElementById('detail-client-summary');
    if (clientSummaryEl) clientSummaryEl.value = p.client_summary || '';
    const promptEl = document.getElementById('client-summary-prompt');
    if (promptEl) {
        const updatedAt = p.client_summary_updated_at ? new Date(p.client_summary_updated_at) : null;
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        const isStale = !updatedAt || updatedAt < weekAgo;
        if (isStale) {
            promptEl.style.display = 'block';
            promptEl.classList.remove('hidden');
        } else {
            promptEl.style.display = 'none';
            promptEl.classList.add('hidden');
        }
    }
    const originalValue = Number(p.project_value) || 0;
    const changeOrderTotal = (state.changeOrders || []).reduce((sum, co) => sum + (Number(co.amount) || 0), 0);
    const revisedValue = originalValue + changeOrderTotal;
    document.getElementById('header-value-display').textContent = formatCurrency(originalValue);
    const revEl = document.getElementById('header-revised-value');
    if (revEl) revEl.textContent = changeOrderTotal !== 0 ? `Revised: ${formatCurrency(revisedValue)}` : '';
    document.getElementById('detail-id').textContent = p.id;
    document.getElementById('detail-start-date').value = p.start_date || '';
    document.getElementById('detail-due-date').value = p.end_date || '';
    document.getElementById('detail-scope').value = p.description || ''; 

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

    const totalEst = state.tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    const totalAct = state.tasks.reduce((sum, t) => sum + (t.actual_hours || 0), 0);
    const progress = totalEst > 0 ? Math.round((totalAct / totalEst) * 100) : 0;

    document.getElementById('kpi-est').textContent = totalEst;
    document.getElementById('kpi-act').textContent = totalAct;
    document.getElementById('kpi-progress').textContent = `${progress}%`;

    const laborCost = totalAct * DEFAULT_LABOR_RATE;
    const materialCost = (state.bom || []).reduce((sum, row) => {
        const inv = row.inventory_items || {};
        const qty = Number(row.qty_allocated ?? row.qty_required) || 0;
        const cost = Number(inv.cost_per_unit) || 0;
        return sum + qty * cost;
    }, 0);
    const totalCost = laborCost + materialCost;
    const laborEl = document.getElementById('job-cost-labor');
    const materialEl = document.getElementById('job-cost-material');
    const totalEl = document.getElementById('job-cost-total');
    if (laborEl) laborEl.textContent = `Labor (${totalAct} hrs × $${DEFAULT_LABOR_RATE}/hr): ${formatCurrency(laborCost)}`;
    if (materialEl) materialEl.textContent = `Material (BOM): ${formatCurrency(materialCost)}`;
    if (totalEl) totalEl.textContent = `Total cost: ${formatCurrency(totalCost)}`;

    const origEl = document.getElementById('contract-original');
    const coLineEl = document.getElementById('contract-change-orders');
    const revContractEl = document.getElementById('contract-revised');
    const coListEl = document.getElementById('change-orders-list');
    if (origEl) origEl.textContent = `Original: ${formatCurrency(originalValue)}`;
    if (coLineEl) coLineEl.textContent = changeOrderTotal !== 0 ? `Change orders: +${formatCurrency(changeOrderTotal)}` : 'Change orders: none';
    if (revContractEl) revContractEl.textContent = `Revised total: ${formatCurrency(revisedValue)}`;
    if (coListEl) {
        coListEl.innerHTML = (state.changeOrders || []).map(co =>
            `<li style="margin-bottom:6px;">${(co.description || '—').replace(/</g, '&lt;')} · ${formatCurrency(co.amount)} <span style="font-size:0.8em; color:var(--text-dim);">(${co.status || 'pending'})</span> <button type="button" class="btn-secondary" style="padding:2px 6px; margin-left:6px; font-size:0.75rem;" onclick="window.deleteChangeOrder('${co.id}')">Remove</button></li>`
        ).join('') || '<li style="color:var(--text-dim);">No change orders yet.</li>';
    }
    document.getElementById('btn-add-change-order').onclick = () => openAddChangeOrderModal();

    renderTeam();
    renderMiniGantt();
    renderTaskList();
    renderFiles();
    renderLogs();
    renderBOM();
}

function renderTaskList() {
    const tbody = document.getElementById('project-task-list-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    state.tasks.forEach(t => {
        const tr = document.createElement('tr');
        const actualVal = t.actual_hours != null && t.actual_hours !== '' ? Number(t.actual_hours) : '';
        tr.innerHTML = `
            <td style="font-weight:600; color:var(--text-bright);">${t.name}</td>
            <td>${t.estimated_hours ?? '-'}</td>
            <td><input type="number" min="0" step="0.25" data-task-id="${t.id}" class="task-actual-input form-control" style="width:80px; padding:6px; background:var(--bg-dark); color:var(--text-bright); border:1px solid var(--border-color);" value="${actualVal}"></td>
            <td><span style="font-size:0.8rem; color:var(--text-dim);">${t.status || 'Pending'}</span></td>
            <td><button type="button" class="btn-secondary task-save-actual" data-task-id="${t.id}" style="padding:4px 10px;"><i class="fas fa-save"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.task-save-actual').forEach(btn => {
        btn.addEventListener('click', async () => {
            const taskId = btn.dataset.taskId;
            const input = tbody.querySelector(`.task-actual-input[data-task-id="${taskId}"]`);
            const val = parseFloat(input?.value) || 0;
            const { error } = await supabase.from('project_tasks').update({ actual_hours: val }).eq('id', taskId);
            if (error) alert('Update failed: ' + error.message);
            else if (state.currentProject) await loadProjectDetails(state.currentProject.id);
        });
    });
}

function renderBOM() {
    const tbody = document.getElementById('bom-list-body');
    if(!tbody) return;
    
    tbody.innerHTML = state.bom.map(item => {
        const inv = item.inventory_items || { name: 'Unknown Item', sku: '???', category: 'Misc', uom: 'ea' };
        
        let statusColor = '#888';
        if(item.status === 'Pulled') statusColor = 'var(--primary-blue)';
        if(item.status === 'Ordered') statusColor = 'var(--warning-yellow)';
        
        return `
            <tr>
                <td>
                    <div style="font-weight:600; color:var(--text-bright);">${inv.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-dim); font-family:'Rajdhani';">${inv.sku}</div>
                </td>
                <td><span style="font-size:0.75rem; background:rgba(255,255,255,0.05); padding:2px 5px; border-radius:3px;">${inv.category}</span></td>
                <td>${item.qty_required} ${inv.uom}</td>
                <td>${item.qty_allocated} ${inv.uom}</td>
                <td><span class="bom-status-pill" style="color:${statusColor}; border:1px solid ${statusColor};">${item.status}</span></td>
                <td>
                    <button class="btn-secondary" style="padding:4px 8px;" onclick="window.deleteBOM(${item.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-dim);">No materials added.</td></tr>';
}

function renderTeam() {
    const teamEl = document.getElementById('team-list');
    teamEl.innerHTML = state.contacts.map(c => {
        const contact = c.contacts;
        if(!contact) return '';
        return `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:10px; border-bottom:1px solid var(--border-color); background:rgba(255,255,255,0.02); margin-bottom:5px;">
                <div>
                    <a href="contacts.html?id=${contact.id}" style="font-weight:600; text-decoration:none; color:var(--text-bright);">${contact.first_name} ${contact.last_name}</a>
                    <div style="font-size:0.75rem; color:var(--primary-gold);">${c.role || 'Stakeholder'}</div>
                </div>
                <div style="text-align:right; font-size:0.8rem; color:var(--text-dim); display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                    <div>${contact.email || ''}</div>
                    <div>${contact.phone || ''}</div>
                    <button type="button" class="btn-secondary copy-portal-btn" style="padding:4px 10px; font-size:0.75rem; margin-top:4px;" data-contact-id="${contact.id}" title="Copy customer portal link (all projects for this contact)">Portal link</button>
                </div>
            </div>
        `;
    }).join('') || '<div style="color:var(--text-dim); padding:10px; font-style:italic;">No contacts assigned.</div>';

    teamEl.querySelectorAll('.copy-portal-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const contactId = btn.dataset.contactId;
            if (!contactId) return;
            const id = Number(contactId);
            if (Number.isNaN(id)) { alert('Invalid contact id.'); return; }
            const { data: token, error } = await supabase.rpc('get_or_create_contact_portal_token', { p_contact_id: id });
            if (error) { alert('Could not get portal link: ' + error.message); return; }
            const url = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}status.html?portal=${token}`;
            try {
                await navigator.clipboard.writeText(url);
                if (window.showToast) window.showToast('Customer portal link copied.');
                else alert('Portal link copied. Customer will see all their projects in one page.');
            } catch (_) {
                prompt('Copy this customer portal link:', url);
            }
        });
    });
}

function renderMiniGantt() {
    const header = document.getElementById('gantt-header');
    const body = document.getElementById('gantt-body');
    const project = state.currentProject;
    
    if(!state.tasks.length && !project.end_date) {
        body.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim);">No tasks scheduled.</div>';
        return;
    }

    let minDate = dayjs();
    let maxDate = dayjs().add(14, 'day');

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

    for(let i=0; i<totalDays; i++) {
        const d = start.add(i, 'day');
        const cell = document.createElement('div');
        cell.className = 'gantt-date-cell';
        cell.style.width = `${dayWidth}px`;
        cell.textContent = d.format('DD MMM');
        if(d.day() === 0 || d.day() === 6) cell.style.background = 'rgba(255,255,255,0.03)';
        header.appendChild(cell);
    }

    let targetPixel = null;
    if(project.end_date) {
        const finishDate = dayjs(project.end_date);
        const diff = finishDate.diff(start, 'day');
        if(diff >= 0 && diff < totalDays) {
            targetPixel = (diff + 1) * dayWidth; 
            const line = document.createElement('div');
            line.className = 'gantt-finish-line';
            line.style.left = `${diff * dayWidth}px`; 
            line.title = `Due Date: ${finishDate.format('MMM D')}`;
            
            const flag = document.createElement('div');
            flag.className = 'gantt-finish-flag';
            flag.innerHTML = '<i class="fas fa-flag-checkered"></i>';
            
            line.appendChild(flag);
            body.appendChild(line);
        }
    }

    state.tasks.forEach((t, index) => {
        const tStart = dayjs(t.start_date);
        const tEnd = dayjs(t.end_date);
        const diffDays = tStart.diff(start, 'day');
        const duration = tEnd.diff(tStart, 'day') + 1;
        
        const barLeft = diffDays * dayWidth;
        const barWidth = (duration * dayWidth) - 10;
        
        const bar = document.createElement('div');
        bar.className = 'gantt-task-bar'; 
        bar.style.left = `${barLeft}px`;
        bar.style.width = `${barWidth}px`;
        bar.style.top = `${(index * 60) + 15}px`; 
        
        const baseColor = TRADE_COLORS[t.trade_id] || '#555';
        
        if (targetPixel !== null && (barLeft + barWidth) > targetPixel) {
             const safeWidth = Math.max(0, targetPixel - barLeft);
             const safePercent = (safeWidth / barWidth) * 100;
             bar.style.background = `linear-gradient(90deg, ${baseColor} ${safePercent}%, #ff4444 ${safePercent}%)`;
             bar.style.border = '1px solid #ff4444';
        } else {
             bar.style.backgroundColor = baseColor;
        }

        const percent = t.estimated_hours ? ((t.actual_hours || 0) / t.estimated_hours) : 0;
        const burnColor = percent > 1 ? '#ff4444' : 'rgba(255,255,255,0.8)'; 
        
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
    const doProjectsRefresh = async () => {
        const btn = document.getElementById('btn-refresh-projects');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
        await loadProjectsList();
        if (state.currentProject) await loadProjectDetails(state.currentProject.id);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
    };
    document.getElementById('btn-refresh-projects').addEventListener('click', doProjectsRefresh);
    document.getElementById('staleness-refresh-btn')?.addEventListener('click', doProjectsRefresh);

    document.getElementById('dismiss-summary-prompt')?.addEventListener('click', () => {
        const el = document.getElementById('client-summary-prompt');
        if (el) { el.style.display = 'none'; el.classList.add('hidden'); }
    });

    document.getElementById('btn-share-status-link')?.addEventListener('click', async () => {
        if (!state.currentProject) return;
        let token = state.currentProject.status_token;
        if (!token) {
            const newToken = crypto.randomUUID();
            const { error } = await supabase.from('projects').update({ status_token: newToken }).eq('id', state.currentProject.id);
            if (error) { alert('Could not create share link: ' + error.message); return; }
            state.currentProject.status_token = newToken;
            token = newToken;
        }
        const url = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}status.html?token=${token}`;
        try {
            await navigator.clipboard.writeText(url);
            if (window.showToast) window.showToast('Status link copied to clipboard.');
            else alert('Link copied to clipboard.');
        } catch (_) {
            prompt('Copy this status link for your client:', url);
        }
    });

    window.addEventListener('focus', checkStaleness);
    setInterval(checkStaleness, 30000);

    supabase.channel('projects-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, async () => {
            await loadProjectsList();
            if (state.currentProject) await loadProjectDetails(state.currentProject.id);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, async () => {
            await loadProjectsList();
            if (state.currentProject) await loadProjectDetails(state.currentProject.id);
        })
        .subscribe();
    
    // NEW: BOM Modal
    document.getElementById('btn-add-bom').addEventListener('click', openAddBOMModal);

    document.getElementById('toggle-hide-zero').addEventListener('change', (e) => {
        state.hideZeroValue = e.target.checked;
        renderProjectList();
    });

    document.getElementById('btn-save-main').addEventListener('click', async () => {
        if(!state.currentProject) return;
        
        const newName = document.getElementById('detail-name').value;
        const newStatus = document.getElementById('detail-status').value;
        const newScope = document.getElementById('detail-scope').value;
        const newStartDate = document.getElementById('detail-start-date').value;
        const newDueDate = document.getElementById('detail-due-date').value;
        const newPaymentUrl = document.getElementById('detail-payment-url')?.value?.trim() || null;
        const newClientSummary = document.getElementById('detail-client-summary')?.value?.trim() || null;
        const oldDate = state.currentProject.end_date;
        const summaryChanged = newClientSummary !== (state.currentProject.client_summary || '');

        const { error } = await supabase.from('projects').update({
            name: newName,
            status: newStatus,
            description: newScope, 
            start_date: newStartDate || null,
            end_date: newDueDate || null,
            payment_url: newPaymentUrl,
            client_summary: newClientSummary,
            client_summary_updated_at: summaryChanged ? new Date().toISOString() : state.currentProject.client_summary_updated_at
        }).eq('id', state.currentProject.id);

        if(error) { 
            console.error("Save Error:", error);
            alert('Save failed (Check console). Note: Scope saved to logs as backup.'); 
        }

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

    document.getElementById('btn-delete-project').addEventListener('click', async () => {
        if (!state.currentProject) return;
        
        const confirmMsg = `Are you sure you want to delete project "${state.currentProject.name}"?\n\nThis will permanently remove the project and all associated tasks. This action cannot be undone.`;
        if (!confirm(confirmMsg)) return;

        const { error } = await supabase.from('projects').delete().eq('id', state.currentProject.id);

        if (error) {
            alert('Error deleting project: ' + error.message);
            return;
        }

        alert('Project deleted.');
        state.currentProject = null;
        document.getElementById('detail-content').classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
        await loadProjectsList();
    });

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

    document.querySelectorAll('.tab-link').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });

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

// --- BOM LOGIC ---
window.deleteBOM = async (id) => {
    if(!confirm("Remove this material allocation?")) return;
    await supabase.from('project_bom').delete().eq('id', id);
    loadProjectDetails(state.currentProject.id);
}

async function openAddBOMModal() {
    // Fetch inventory
    const { data: items } = await supabase.from('inventory_items').select('*').order('name');
    const safeItems = items || [];

    const options = safeItems.map(i => `<option value="${i.id}">${i.sku} - ${i.name} (${i.qty_on_hand} in stock)</option>`).join('');

    showModal('Add Material to BOM', `
        <div style="margin-bottom:15px;">
            <label>Select Item</label>
            <select id="bom-item-select" class="form-control" style="background:var(--bg-dark); color:white;">
                <option value="">-- Choose Material --</option>
                ${options}
            </select>
            ${safeItems.length === 0 ? '<div style="color:var(--text-dim); font-size:0.8rem; margin-top:5px;">No inventory found. Add items in Inventory module first.</div>' : ''}
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div>
                <label>Qty Required</label>
                <input type="number" id="bom-req-qty" class="form-control" value="1">
            </div>
            <div>
                <label>Status</label>
                <select id="bom-status" class="form-control" style="background:var(--bg-dark); color:white;">
                    <option value="Pending">Pending</option>
                    <option value="Pulled">Pulled</option>
                    <option value="Ordered">Ordered</option>
                </select>
            </div>
        </div>
        <button id="btn-save-bom" class="btn-primary" style="width:100%; margin-top:15px;">Add Allocation</button>
    `, async () => {});

    setTimeout(() => {
        const saveBtn = document.getElementById('btn-save-bom');
        if(saveBtn) saveBtn.onclick = async () => {
            const itemId = document.getElementById('bom-item-select').value;
            const qty = document.getElementById('bom-req-qty').value;
            const status = document.getElementById('bom-status').value;

            if(!itemId) return alert("Select an item.");

            await supabase.from('project_bom').insert({
                project_id: state.currentProject.id,
                inventory_item_id: itemId,
                qty_required: qty,
                qty_allocated: 0, // Default to 0 allocated for now
                status: status
            });
            hideModal();
            loadProjectDetails(state.currentProject.id);
        }
    }, 100);
}

function openAddChangeOrderModal() {
    if (!state.currentProject) return;
    showModal('Add Change Order', `
        <div style="margin-bottom:12px;">
            <label>Description</label>
            <input type="text" id="co-description" class="form-control" placeholder="e.g. Additional scope – Phase 2" style="background:var(--bg-dark); color:white; width:100%;">
        </div>
        <div style="margin-bottom:12px;">
            <label>Amount ($)</label>
            <input type="number" id="co-amount" class="form-control" step="0.01" min="0" value="0" style="background:var(--bg-dark); color:white; width:100%;">
        </div>
        <div>
            <label>Status</label>
            <select id="co-status" class="form-control" style="background:var(--bg-dark); color:white; width:100%;">
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
            </select>
        </div>
    `, async (modalBody) => {
        const desc = (modalBody.querySelector('#co-description')?.value || '').trim();
        const amount = parseFloat(modalBody.querySelector('#co-amount')?.value, 10);
        const status = modalBody.querySelector('#co-status')?.value || 'pending';
        if (!desc) { alert('Enter a description.'); return false; }
        if (isNaN(amount) || amount < 0) { alert('Enter a valid amount.'); return false; }
        const { error } = await supabase.from('project_change_orders').insert({
            project_id: state.currentProject.id,
            description: desc,
            amount: amount,
            status: status
        });
        if (error) { alert('Error adding change order: ' + error.message); return false; }
        await loadProjectDetails(state.currentProject.id);
    });
}

window.deleteChangeOrder = async (id) => {
    if (!confirm('Remove this change order?')) return;
    await supabase.from('project_change_orders').delete().eq('id', id);
    if (state.currentProject) loadProjectDetails(state.currentProject.id);
};

// --- LAUNCH MODAL ---
async function openLaunchProjectModal(preSelectDealId) {
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

        const dealId = sel.value;
        const { data: proj, error: projError } = await supabase.from('projects').insert([{
            deal_id: dealId,
            name,
            start_date: startD,
            end_date: crdd,
            project_value: amt,
            status: 'Pre-Production'
        }]).select();

        if (projError) { alert(projError.message); return; }
        const pid = proj[0].id;

        const { data: proposalRow } = await supabase.from('proposals_tw').select('id').eq('deal_id', dealId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
        if (proposalRow?.id) {
            await supabase.from('projects').update({ proposal_id: proposalRow.id }).eq('id', pid);
        }

        const { data: deal } = await supabase.from('deals_tw').select('account_id').eq('id', dealId).single();
        if (deal?.account_id) {
            const { data: accountContacts } = await supabase.from('contacts').select('id').eq('account_id', deal.account_id);
            if (accountContacts?.length) {
                await supabase.from('project_contacts').insert(accountContacts.map(c => ({ project_id: pid, contact_id: c.id, role: 'Client' })));
            }
        }

        const { data: t1 } = await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[0]?.id||1, name: 'Kickoff & Plan', start_date: dates.p1s, end_date: dates.p1e, estimated_hours: dates.p1h }).select();
        const { data: t2 } = await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[1]?.id||2, name: 'CAD Drawings', start_date: dates.p2s, end_date: dates.p2e, estimated_hours: dates.p2h, dependency_task_id: t1[0].id }).select();
        const { data: t3 } = await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[2]?.id||3, name: 'Fabrication', start_date: dates.p3s, end_date: dates.p3e, estimated_hours: dates.p3h, dependency_task_id: t2[0].id }).select();
        await supabase.from('project_tasks').insert({ project_id: pid, trade_id: state.trades[4]?.id||5, name: 'Installation', start_date: dates.p4s, end_date: dates.p4e, estimated_hours: dates.p4h, dependency_task_id: t3[0].id });

        loadProjectsList();
    });
    
    setTimeout(() => {
        const launchDealSel = document.getElementById('launch-deal');
        if (preSelectDealId && launchDealSel && launchDealSel.querySelector(`option[value="${preSelectDealId}"]`)) {
            launchDealSel.value = preSelectDealId;
        }
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
