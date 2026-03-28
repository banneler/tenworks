import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    formatCurrency, 
    showModal, 
    hideModal, 
    showToast,
    showActionSuccess,
    setupUserMenuAndAuth, 
    loadSVGs,
    setupGlobalSearch,
    runWhenNavReady,
    hideGlobalLoader
} from './shared_constants.js';
import { openSharedProjectLaunchModal } from './project_launch_shared.js';

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

function activateProjectTab(tabName) {
    if (!tabName) return;
    const targetTab = String(tabName).toLowerCase();
    const targetLink = Array.from(document.querySelectorAll('.tab-link'))
        .find(btn => String(btn.dataset.tab || '').toLowerCase() === targetTab);
    const targetContent = document.getElementById(`tab-${targetTab}`);
    if (!targetLink || !targetContent) return;
    document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    targetLink.classList.add('active');
    targetContent.classList.add('active');
}

async function openProjectFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const projectIdParam = params.get('project_id');
    const taskIdParam = params.get('task_id');
    const tabParam = params.get('tab');
    if (!projectIdParam) return;

    const targetProject = state.projects.find(p => String(p.id) === String(projectIdParam));
    if (!targetProject) return;

    await loadProjectDetails(targetProject.id);
    document.querySelectorAll('.list-item').forEach(row => {
        row.classList.toggle('selected', String(row.dataset.projectId) === String(targetProject.id));
    });

    if (tabParam) activateProjectTab(tabParam);

    if (taskIdParam) {
        activateProjectTab('timeline');
        setTimeout(() => {
            const taskSaveBtn = document.querySelector(`.task-save-actual[data-task-id="${taskIdParam}"]`);
            const row = taskSaveBtn ? taskSaveBtn.closest('tr') : null;
            if (!row) return;
            row.classList.add('talent-deeplink-highlight');
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setTimeout(() => row.classList.remove('talent-deeplink-highlight'), 1800);
        }, 120);
    }

    history.replaceState({}, '', window.location.pathname);
}

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
        await openProjectFromUrlParams();

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

    const { data: tasksData } = await supabase.from('project_tasks').select('project_id, start_date, end_date, status, assigned_talent_id').neq('status', 'Completed');
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
    
    // At Risk Logic:
    // 1. Has an overdue task
    // 2. OR: Has a task that should have started by now but is still 'Pending'
    // 3. OR: Has a task that should have started by now but has no assigned talent
    const atRiskTaskProjectIds = new Set(allTasks.filter(t => {
        const isOverdue = t.end_date && t.end_date < today;
        const isUnstarted = t.start_date && t.start_date <= today && t.status === 'Pending';
        const isUnassigned = t.start_date && t.start_date <= today && !t.assigned_talent_id;
        return isOverdue || isUnstarted || isUnassigned;
    }).map(t => t.project_id));

    state.projects.forEach(p => {
        if (!p.end_date || p.status === 'Completed') return;
        if (p.end_date >= today && p.end_date <= endPlus14Str && atRiskTaskProjectIds.has(p.id)) state.atRiskProjectIds.add(p.id);
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
        const badge = isOverdue
            ? '<span class="project-list-badge project-list-badge-overdue">Overdue</span>'
            : (isAtRisk ? '<span class="project-list-badge project-list-badge-risk">At risk</span>' : '');
        const statusClass = getProjectStatusClass(p.status);
        const el = document.createElement('div');
        el.className = 'list-item';
        el.dataset.projectId = String(p.id);
        if (state.currentProject && state.currentProject.id === p.id) el.classList.add('selected');

        el.innerHTML = `
            <div class="contact-info project-list-contact-info">
                <div class="contact-name">${p.name}${badge}</div>
                <div class="account-name">
                    <span class="project-list-status ${statusClass}">${p.status}</span> • ${formatCurrency(p.project_value)}
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
            viewProposalBtn.href = `proposals.html?proposal_id=${state.linkedProposal.id}`;
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
        let countdownClass = 'countdown-badge-good';
        if (diff < 0) countdownClass = 'countdown-badge-overdue';
        else if (diff <= 7) countdownClass = 'countdown-badge-soon';
        
        widget.innerHTML = `<span class="countdown-badge ${countdownClass}">
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
            `<li class="project-co-item">${(co.description || '—').replace(/</g, '&lt;')} · ${formatCurrency(co.amount)} <span class="project-co-status">(${co.status || 'pending'})</span> <button type="button" class="btn-secondary project-co-remove-btn" onclick="window.deleteChangeOrder('${co.id}')">Remove</button></li>`
        ).join('') || '<li class="project-co-empty">No change orders yet.</li>';
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
        const actualVal = t.actual_hours != null && t.actual_hours !== '' ? Number(t.actual_hours) : 0;
        tr.innerHTML = `
            <td class="project-task-name">${t.name}</td>
            <td>${t.estimated_hours ?? '-'}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="font-size: 0.8rem; color: var(--text-dim); min-width: 30px;">${actualVal}h +</span>
                    <input type="number" min="0" step="0.25" data-task-id="${t.id}" class="task-actual-input form-control project-task-actual-input" value="0" placeholder="Add">
                </div>
            </td>
            <td>
                <select class="form-control task-status-select" data-task-id="${t.id}" data-project-id="${t.project_id}" style="padding: 4px 8px; font-size: 0.8rem; background: var(--bg-dark); border: 1px solid var(--border-color); color: var(--text-bright); border-radius: 4px;">
                    <option value="Pending" ${t.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="In Progress" ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                    <option value="Completed" ${t.status === 'Completed' ? 'selected' : ''}>Completed</option>
                </select>
            </td>
            <td><button type="button" class="btn-secondary task-save-actual project-task-save-btn" data-task-id="${t.id}"><i class="fas fa-save"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.task-save-actual').forEach(btn => {
        btn.addEventListener('click', async () => {
            const taskId = btn.dataset.taskId;
            const input = tbody.querySelector(`.task-actual-input[data-task-id="${taskId}"]`);
            const statusSelect = tbody.querySelector(`.task-status-select[data-task-id="${taskId}"]`);
            const hoursToAdd = parseFloat(input?.value) || 0;
            const newStatus = statusSelect?.value || 'Pending';
            const projectId = statusSelect?.dataset.projectId;

            const task = state.tasks.find(t => t.id == taskId);
            const newTotalHours = (task.actual_hours || 0) + hoursToAdd;

            const { error } = await supabase.from('project_tasks').update({ actual_hours: newTotalHours, status: newStatus }).eq('id', taskId);
            if (error) {
                showToast('Update failed: ' + error.message, 'error');
            } else {
                if (newStatus === 'Completed' && projectId) {
                    const { data: siblingTasks } = await supabase.from('project_tasks').select('status').eq('project_id', projectId);
                    if (siblingTasks && siblingTasks.every(t => t.status === 'Completed')) {
                        const { data: proj } = await supabase.from('projects').select('status').eq('id', projectId).single();
                        if (proj && proj.status !== 'Completed') {
                            // PRE-FLIGHT CLOSEOUT CHECKS
                            const unpulledBom = state.bom.filter(b => b.status !== 'Pulled');
                            if (unpulledBom.length > 0) {
                                showToast(`Cannot complete project: ${unpulledBom.length} BOM items are not marked as 'Pulled'.`, 'error');
                                return;
                            }

                            // Check if final portal summary exists (assuming it's a note with a specific keyword, or just any note for now)
                            // For a more robust check, you might want a specific 'final_summary' flag on notes or projects.
                            // For now, let's just warn them to ensure they've communicated.
                            const hasNotes = state.notes && state.notes.length > 0;
                            const confirmMessage = hasNotes 
                                ? "All tasks are completed and BOM is pulled. Do you want to mark the entire project as Completed?" 
                                : "Warning: No portal updates/notes have been added to this project. All tasks are completed. Mark project as Completed anyway?";

                            if (confirm(confirmMessage)) {
                                await supabase.from('projects').update({ status: 'Completed' }).eq('id', projectId);
                            }
                        }
                    }
                }
                if (state.currentProject) await loadProjectDetails(state.currentProject.id);
            }
        });
    });
}

function renderBOM() {
    const tbody = document.getElementById('bom-list-body');
    if(!tbody) return;
    
    tbody.innerHTML = state.bom.map(item => {
        const inv = item.inventory_items || { name: 'Unknown Item', sku: '???', category: 'Misc', uom: 'ea', qty_on_hand: 0 };
        
        const isShortage = item.status !== 'Pulled' && (inv.qty_on_hand || 0) < item.qty_required;
        const shortageWarning = isShortage ? `<div style="color: var(--danger-red); font-size: 0.75rem; margin-top: 2px;"><i class="fas fa-exclamation-triangle"></i> Shortage (On Hand: ${inv.qty_on_hand || 0})</div>` : '';

        return `
            <tr>
                <td>
                    <div class="project-bom-item-name">${inv.name}</div>
                    <div class="project-bom-item-sku">${inv.sku}</div>
                    ${shortageWarning}
                </td>
                <td><span class="project-bom-category-pill">${inv.category}</span></td>
                <td>${item.qty_required} ${inv.uom}</td>
                <td>${item.qty_allocated} ${inv.uom}</td>
                <td>
                    <select class="form-control bom-status-select" data-bom-id="${item.id}" data-old-status="${item.status}" data-item-id="${item.inventory_item_id}" data-qty="${item.qty_allocated || item.qty_required}" style="padding: 4px 8px; font-size: 0.8rem; background: var(--bg-dark); border: 1px solid var(--border-color); color: var(--text-bright); border-radius: 4px; width: 100px;">
                        <option value="Pending" ${item.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Ordered" ${item.status === 'Ordered' ? 'selected' : ''}>Ordered</option>
                        <option value="Pulled" ${item.status === 'Pulled' ? 'selected' : ''}>Pulled</option>
                    </select>
                </td>
                <td>
                    <button class="btn-secondary project-bom-delete-btn" onclick="window.deleteBOM(${item.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="6" class="project-bom-empty">No materials added.</td></tr>';

    tbody.querySelectorAll('.bom-status-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const oldStatus = e.target.dataset.oldStatus;
            const newStatus = e.target.value;
            const bomId = e.target.dataset.bomId;
            const itemId = e.target.dataset.itemId;
            const qty = parseFloat(e.target.dataset.qty) || 0;

            if (oldStatus !== 'Pulled' && newStatus === 'Pulled') {
                const { data: inv } = await supabase.from('inventory_items').select('qty_on_hand').eq('id', itemId).single();
                if (inv) {
                    const newQty = (inv.qty_on_hand || 0) - qty;
                    if (newQty < 0) {
                        if (!confirm(`Warning: Pulling this item will result in negative inventory (${newQty}). Proceed anyway?`)) {
                            e.target.value = oldStatus; // Revert selection
                            return;
                        }
                    }
                    await supabase.from('inventory_items').update({ qty_on_hand: newQty }).eq('id', itemId);
                }
            } else if (oldStatus === 'Pulled' && newStatus !== 'Pulled') {
                const { data: inv } = await supabase.from('inventory_items').select('qty_on_hand').eq('id', itemId).single();
                if (inv) {
                    await supabase.from('inventory_items').update({ qty_on_hand: (inv.qty_on_hand || 0) + qty }).eq('id', itemId);
                }
            }

            const { error } = await supabase.from('project_bom').update({ status: newStatus }).eq('id', bomId);
            if (error) {
                showToast('Failed to update BOM status.', 'error');
            } else {
                showToast(`BOM item marked as ${newStatus}.`, 'success');
                loadProjectDetails(state.currentProject.id);
            }
        });
    });
}

function renderTeam() {
    const teamEl = document.getElementById('team-list');
    teamEl.innerHTML = state.contacts.map(c => {
        const contact = c.contacts;
        if(!contact) return '';
        return `
            <div class="project-team-card">
                <div>
                    <a href="contacts.html?contactId=${contact.id}" class="project-team-contact-link">${contact.first_name} ${contact.last_name}</a>
                    <div class="project-team-role">${c.role || 'Stakeholder'}</div>
                </div>
                <div class="project-team-meta">
                    <div>${contact.email || ''}</div>
                    <div>${contact.phone || ''}</div>
                    <button type="button" class="btn-secondary copy-portal-btn project-team-portal-btn" data-contact-id="${contact.id}" title="Copy customer portal link (all projects for this contact)">Portal link</button>
                </div>
            </div>
        `;
    }).join('') || '<div class="project-team-empty">No contacts assigned.</div>';

    teamEl.querySelectorAll('.copy-portal-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const contactId = btn.dataset.contactId;
            if (!contactId) return;
            const id = Number(contactId);
            if (Number.isNaN(id)) { showToast('Invalid contact id.', 'error'); return; }
            const { data: token, error } = await supabase.rpc('get_or_create_contact_portal_token', { p_contact_id: id });
            if (error) { showToast('Could not get portal link: ' + error.message, 'error'); return; }
            const url = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}status.html?portal=${token}`;
            try {
                await navigator.clipboard.writeText(url);
                if (window.showToast) window.showToast('Customer portal link copied.');
                else showToast('Portal link copied. Customer will see all their projects in one page.', 'success');
            } catch (_) {
                prompt('Copy this customer portal link:', url);
            }
        });
    });
}

function getPreferredPortalContactId() {
    if (!Array.isArray(state.contacts) || state.contacts.length === 0) return null;
    const ranked = [...state.contacts].sort((a, b) => {
        const aRole = (a?.role || '').toLowerCase();
        const bRole = (b?.role || '').toLowerCase();
        const score = (role) => {
            if (role.includes('client')) return 0;
            if (role.includes('owner')) return 1;
            if (role.includes('primary')) return 2;
            return 3;
        };
        return score(aRole) - score(bRole);
    });
    return ranked[0]?.contacts?.id || null;
}

function renderMiniGantt() {
    const header = document.getElementById('gantt-header');
    const body = document.getElementById('gantt-body');
    const project = state.currentProject;
    
    if(!state.tasks.length && !project.end_date) {
        body.innerHTML = '<div class="project-gantt-empty">No tasks scheduled.</div>';
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
            <div class="project-file-meta">
                <div class="project-file-name">${f.name}</div>
                <div class="project-file-size">${(f.metadata.size / 1024).toFixed(1)} KB</div>
            </div>
            <div class="file-actions">
                <button class="btn-file-action btn-view" onclick="window.previewFile('${f.name}')">View</button>
                <button class="btn-file-action btn-dl" onclick="window.downloadFile('${f.name}')">Download</button>
            </div>
        </div>
    `).join('') || '<div class="project-files-empty">No files uploaded.</div>';
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
                <div class="project-log-author-row">
                    <span class="log-avatar">${initials}</span>
                    <span class="project-log-author-name">${n.author_name || 'System'}</span>
                </div>
                <span>${dayjs(n.created_at).format('MMM D, h:mm A')}</span>
            </div>
            <div class="project-log-content">${n.content}</div>
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

        const basePath = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}`;
        const portalContactId = getPreferredPortalContactId();

        if (portalContactId != null) {
            const { data: portalToken, error: portalError } = await supabase.rpc('get_or_create_contact_portal_token', { p_contact_id: portalContactId });
            if (portalError) {
                showToast('Could not create portal link: ' + portalError.message, 'error');
                return;
            }
            const url = `${basePath}status.html?portal=${portalToken}&project=${state.currentProject.id}`;
            try {
                await navigator.clipboard.writeText(url);
                if (window.showToast) window.showToast('Customer portal link copied.');
                else showToast('Portal link copied. Customer will see all their projects.', 'success');
            } catch (_) {
                prompt('Copy this customer portal link:', url);
            }
            return;
        }

        // Fallback: if no contact is attached, keep sharing a single-project link.
        let token = state.currentProject.status_token;
        if (!token) {
            const newToken = crypto.randomUUID();
            const { error } = await supabase.from('projects').update({ status_token: newToken }).eq('id', state.currentProject.id);
            if (error) { showToast('Could not create status link: ' + error.message, 'error'); return; }
            state.currentProject.status_token = newToken;
            token = newToken;
        }
        const fallbackUrl = `${basePath}status.html?token=${token}`;
        try {
            await navigator.clipboard.writeText(fallbackUrl);
            if (window.showToast) window.showToast('No client contact on this project; copied single-project status link.');
            else showToast('Copied status link. Add a project contact to use portal links.', 'success');
        } catch (_) {
            prompt('Copy this project status link:', fallbackUrl);
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

    // NEW: Add Task Modal
    document.getElementById('btn-add-task')?.addEventListener('click', openAddTaskModal);

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
            showToast('Save failed (Check console). Note: Scope saved to logs as backup.', 'error'); 
        }

        if(newScope !== (state.currentProject.description || '')) {
            await createSystemNote(`Updated Scope: ${newScope}`);
        }

        if(newDueDate !== oldDate) {
            await createSystemNote(`Changed Due Date from ${oldDate || 'N/A'} to ${newDueDate || 'N/A'}`);
        }

        showActionSuccess('Project saved');
        loadProjectsList();
        loadProjectDetails(state.currentProject.id);
    });

    document.getElementById('btn-delete-project').addEventListener('click', async () => {
        if (!state.currentProject) return;
        
        const confirmMsg = `Are you sure you want to delete project "${state.currentProject.name}"?\n\nThis will permanently remove the project and all associated tasks. This action cannot be undone.`;
        showModal('Delete Project', confirmMsg, async () => {
            const { error } = await supabase.from('projects').delete().eq('id', state.currentProject.id);

            if (error) {
                showToast('Error deleting project: ' + error.message, 'error');
                return;
            }

            showActionSuccess('Project deleted');
            state.currentProject = null;
            document.getElementById('detail-content').classList.add('hidden');
            document.getElementById('empty-state').classList.remove('hidden');
            await loadProjectsList();
        });
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
            if(error && !error.message.includes('already exists')) showToast(`Error uploading ${file.name}: ${error.message}`, 'error');
        }
        
        statusSpan.style.display = 'none';
        loadProjectDetails(state.currentProject.id);
    });

    document.querySelectorAll('.tab-link').forEach(btn => {
        btn.addEventListener('click', () => {
            activateProjectTab(btn.dataset.tab);
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
        showToast("Could not load preview.", 'error');
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
    showModal('Remove Material Allocation', 'Remove this material allocation?', async () => {
        await supabase.from('project_bom').delete().eq('id', id);
        loadProjectDetails(state.currentProject.id);
    });
}

async function openAddBOMModal() {
    // Fetch inventory
    const { data: items } = await supabase.from('inventory_items').select('*').order('name');
    const safeItems = items || [];

    const options = safeItems.map(i => `<option value="${i.id}">${i.sku} - ${i.name} (${i.qty_on_hand} in stock)</option>`).join('');

    showModal('Add Material to BOM', `
        <div class="project-modal-field">
            <label>Select Item</label>
            <select id="bom-item-select" class="form-control project-modal-dark-input">
                <option value="">-- Choose Material --</option>
                ${options}
            </select>
            ${safeItems.length === 0 ? '<div class="project-modal-help">No inventory found. Add items in Inventory module first.</div>' : ''}
        </div>
        <div class="project-modal-grid-two">
            <div>
                <label>Qty Required</label>
                <input type="number" id="bom-req-qty" class="form-control" value="1">
            </div>
            <div>
                <label>Status</label>
                <select id="bom-status" class="form-control project-modal-dark-input">
                    <option value="Pending">Pending</option>
                    <option value="Pulled">Pulled</option>
                    <option value="Ordered">Ordered</option>
                </select>
            </div>
        </div>
        <button id="btn-save-bom" class="btn-primary project-modal-submit">Add Allocation</button>
    `, async () => {});

    setTimeout(() => {
        const saveBtn = document.getElementById('btn-save-bom');
        if(saveBtn) saveBtn.onclick = async () => {
            const itemId = document.getElementById('bom-item-select').value;
            const qty = document.getElementById('bom-req-qty').value;
            const status = document.getElementById('bom-status').value;

            if(!itemId) { showToast("Select an item.", 'error'); return; }

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

function openAddTaskModal() {
    if (!state.currentProject) return;

    const tradeOptions = state.trades.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    let dependencyOptions = `<option value="">-- None --</option>`;
    state.tasks.forEach(t => {
        dependencyOptions += `<option value="${t.id}">${t.name}</option>`;
    });

    showModal('Add Task', `
        <div class="project-modal-field">
            <label>Task Name</label>
            <input type="text" id="new-task-name" class="form-control project-modal-dark-input" placeholder="e.g. Fabrication">
        </div>
        <div class="project-modal-grid-two">
            <div>
                <label>Trade / Resource</label>
                <select id="new-task-trade" class="form-control project-modal-dark-input">
                    ${tradeOptions}
                </select>
            </div>
            <div>
                <label>Estimated Hours</label>
                <input type="number" id="new-task-est" class="form-control" value="0" min="0" step="0.5">
            </div>
        </div>
        <div class="project-modal-grid-two">
            <div>
                <label>Start Date</label>
                <input type="date" id="new-task-start" class="form-control project-modal-dark-input">
            </div>
            <div>
                <label>End Date</label>
                <input type="date" id="new-task-end" class="form-control project-modal-dark-input">
            </div>
        </div>
        <div class="project-modal-field" style="margin-top: 10px;">
            <label>Depends On</label>
            <select id="new-task-dependency" class="form-control project-modal-dark-input">
                ${dependencyOptions}
            </select>
        </div>
        <button id="btn-save-task" class="btn-primary project-modal-submit" style="margin-top: 15px;">Add Task</button>
    `, async () => {});

    setTimeout(() => {
        const saveBtn = document.getElementById('btn-save-task');
        if(saveBtn) saveBtn.onclick = async () => {
            const name = document.getElementById('new-task-name').value.trim();
            const tradeId = document.getElementById('new-task-trade').value;
            const estHrs = parseFloat(document.getElementById('new-task-est').value) || 0;
            const start = document.getElementById('new-task-start').value;
            const end = document.getElementById('new-task-end').value;
            const depId = document.getElementById('new-task-dependency').value || null;

            if(!name) { showToast("Enter a task name.", 'error'); return; }

            const { error } = await supabase.from('project_tasks').insert({
                project_id: state.currentProject.id,
                name: name,
                trade_id: tradeId,
                estimated_hours: estHrs,
                start_date: start || null,
                end_date: end || null,
                status: 'Pending',
                dependency_task_id: depId
            });

            if (error) {
                showToast('Error adding task: ' + error.message, 'error');
            } else {
                hideModal();
                loadProjectDetails(state.currentProject.id);
            }
        }
    }, 100);
}

function openAddChangeOrderModal() {
    if (!state.currentProject) return;
    showModal('Add Change Order', `
        <div class="project-modal-field-sm">
            <label>Description</label>
            <input type="text" id="co-description" class="form-control project-modal-dark-input" placeholder="e.g. Additional scope – Phase 2">
        </div>
        <div class="project-modal-field-sm">
            <label>Amount ($)</label>
            <input type="number" id="co-amount" class="form-control project-modal-dark-input" step="0.01" min="0" value="0">
        </div>
        <div>
            <label>Status</label>
            <select id="co-status" class="form-control project-modal-dark-input">
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
            </select>
        </div>
    `, async (modalBody) => {
        const desc = (modalBody.querySelector('#co-description')?.value || '').trim();
        const amount = parseFloat(modalBody.querySelector('#co-amount')?.value, 10);
        const status = modalBody.querySelector('#co-status')?.value || 'pending';
        if (!desc) { showToast('Enter a description.', 'error'); return false; }
        if (isNaN(amount) || amount < 0) { showToast('Enter a valid amount.', 'error'); return false; }
        const { error } = await supabase.from('project_change_orders').insert({
            project_id: state.currentProject.id,
            description: desc,
            amount: amount,
            status: status
        });
        if (error) { showToast('Error adding change order: ' + error.message, 'error'); return false; }
        await loadProjectDetails(state.currentProject.id);
    });
}

window.deleteChangeOrder = async (id) => {
    showModal('Remove Change Order', 'Remove this change order?', async () => {
        await supabase.from('project_change_orders').delete().eq('id', id);
        if (state.currentProject) loadProjectDetails(state.currentProject.id);
    });
};

// --- LAUNCH MODAL ---
async function openLaunchProjectModal(preSelectDealId) {
    await openSharedProjectLaunchModal({
        supabase,
        dayjs,
        addBusinessDays,
        showModal,
        showToast,
        formatCurrency,
        trades: state.trades,
        preSelectDealId,
        onSuccess: async () => {
            await loadProjectsList();
        }
    });
}

function getProjectStatusClass(status) {
    if (status === 'In Progress') return 'project-list-status-inprogress';
    if (status === 'Completed') return 'project-list-status-completed';
    return 'project-list-status-default';
}
