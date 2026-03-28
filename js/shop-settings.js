import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    setupModalListeners,
    showModal,
    hideModal,
    setupUserMenuAndAuth,
    loadSVGs,
    setupGlobalSearch,
    runWhenNavReady,
    hideGlobalLoader,
    showToast
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        talent: [],
        trades: [],
        machines: [],
        templates: [],
        template_tasks: []
    };

    const talentList = document.getElementById("settings-talent-list");
    const tradesList = document.getElementById("settings-trades-list");
    const machinesList = document.getElementById("settings-machines-list");
    const templatesList = document.getElementById("settings-templates-list");
    const refreshBtn = document.getElementById("settings-refresh-btn");

    async function loadAllData() {
        if (!state.currentUser) {
            hideGlobalLoader();
            return;
        }

        try {
            const [talentRes, tradesRes, machinesRes, templatesRes, templateTasksRes] = await Promise.all([
                supabase.from('shop_talent').select('*').order('name'),
                supabase.from('shop_trades').select('*').order('name'),
                supabase.from('shop_machines').select('*').order('name'),
                supabase.from('project_templates').select('*').order('name'),
                supabase.from('project_template_tasks').select('*').order('sort_order')
            ]);

            state.talent = talentRes.data || [];
            state.trades = tradesRes.data || [];
            state.machines = machinesRes.data || [];
            state.templates = templatesRes.data || [];
            state.template_tasks = templateTasksRes.data || [];

        } catch (error) {
            console.error("Error loading settings data:", error);
            showToast("Failed to load settings data. Ensure tables exist.", "error");
        } finally {
            hideGlobalLoader();
        }
        
        renderDashboard();
    }

    function renderDashboard() {
        renderTalent();
        renderTrades();
        renderMachines();
        renderTemplates();
    }

    // --- TALENT ---
    function renderTalent() {
        if (!talentList) return;
        talentList.innerHTML = state.talent.map(t => `
            <div class="settings-list-item">
                <div>
                    <div class="settings-list-item-title">${t.name} ${!t.active ? '<span style="color:var(--danger-red); font-size:0.8rem;">(Inactive)</span>' : ''}</div>
                    <div class="settings-list-item-meta">${t.hours_per_week} hrs/wk</div>
                </div>
                <div class="settings-actions">
                    <button class="btn-secondary btn-icon-only" onclick="window.editTalent(${t.id})" title="Edit"><i class="fas fa-pen"></i></button>
                </div>
            </div>
        `).join('') || '<p style="color:var(--text-dim); padding:10px;">No talent found.</p>';
    }

    window.editTalent = (id) => {
        const t = state.talent.find(x => x.id === id);
        if (!t) return;
        openTalentModal(t);
    };

    document.getElementById('btn-add-talent').addEventListener('click', () => openTalentModal());

    function openTalentModal(existing = null) {
        const title = existing ? 'Edit Talent' : 'Add Talent';
        showModal(title, `
            <div class="form-grid">
                <div style="grid-column: 1 / -1;">
                    <label>Name</label>
                    <input type="text" id="modal-t-name" class="form-control" value="${existing ? existing.name : ''}">
                </div>
                <div>
                    <label>Hours Per Week</label>
                    <input type="number" id="modal-t-hours" class="form-control" value="${existing ? existing.hours_per_week : 40}">
                </div>
                <div>
                    <label>Status</label>
                    <select id="modal-t-active" class="form-control">
                        <option value="true" ${existing && existing.active !== false ? 'selected' : ''}>Active</option>
                        <option value="false" ${existing && existing.active === false ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
            </div>
        `, async (modalBody) => {
            const name = modalBody.querySelector('#modal-t-name').value.trim();
            const hours = parseInt(modalBody.querySelector('#modal-t-hours').value) || 40;
            const active = modalBody.querySelector('#modal-t-active').value === 'true';

            if (!name) { showToast('Name is required', 'error'); return false; }

            const payload = { name, hours_per_week: hours, active };

            let error;
            if (existing) {
                const res = await supabase.from('shop_talent').update(payload).eq('id', existing.id);
                error = res.error;
            } else {
                const res = await supabase.from('shop_talent').insert(payload);
                error = res.error;
            }

            if (error) { showToast(error.message, 'error'); return false; }
            loadAllData();
            return true;
        });
    }

    // --- TRADES ---
    function renderTrades() {
        if (!tradesList) return;
        tradesList.innerHTML = state.trades.map(t => `
            <div class="settings-list-item">
                <div>
                    <div class="settings-list-item-title">${t.name}</div>
                    <div class="settings-list-item-meta">$${t.default_hourly_rate}/hr</div>
                </div>
                <div class="settings-actions">
                    <button class="btn-secondary btn-icon-only" onclick="window.editTrade(${t.id})" title="Edit"><i class="fas fa-pen"></i></button>
                </div>
            </div>
        `).join('') || '<p style="color:var(--text-dim); padding:10px;">No trades found.</p>';
    }

    window.editTrade = (id) => {
        const t = state.trades.find(x => x.id === id);
        if (!t) return;
        openTradeModal(t);
    };

    document.getElementById('btn-add-trade').addEventListener('click', () => openTradeModal());

    function openTradeModal(existing = null) {
        const title = existing ? 'Edit Trade' : 'Add Trade';
        showModal(title, `
            <div class="form-grid">
                <div style="grid-column: 1 / -1;">
                    <label>Trade Name</label>
                    <input type="text" id="modal-tr-name" class="form-control" value="${existing ? existing.name : ''}">
                </div>
                <div>
                    <label>Default Hourly Rate ($)</label>
                    <input type="number" id="modal-tr-rate" class="form-control" value="${existing ? existing.default_hourly_rate : 0}">
                </div>
            </div>
        `, async (modalBody) => {
            const name = modalBody.querySelector('#modal-tr-name').value.trim();
            const rate = parseFloat(modalBody.querySelector('#modal-tr-rate').value) || 0;

            if (!name) { showToast('Name is required', 'error'); return false; }

            const payload = { name, default_hourly_rate: rate };

            let error;
            if (existing) {
                const res = await supabase.from('shop_trades').update(payload).eq('id', existing.id);
                error = res.error;
            } else {
                const res = await supabase.from('shop_trades').insert(payload);
                error = res.error;
            }

            if (error) { showToast(error.message, 'error'); return false; }
            loadAllData();
            return true;
        });
    }

    // --- MACHINES ---
    function renderMachines() {
        if (!machinesList) return;
        machinesList.innerHTML = state.machines.map(m => `
            <div class="settings-list-item">
                <div>
                    <div class="settings-list-item-title">${m.name}</div>
                    <div class="settings-list-item-meta" style="color: ${m.status === 'Operational' ? 'var(--primary-blue)' : 'var(--danger-red)'}">${m.status}</div>
                </div>
                <div class="settings-actions">
                    <button class="btn-secondary btn-icon-only" onclick="window.editMachine(${m.id})" title="Edit"><i class="fas fa-pen"></i></button>
                </div>
            </div>
        `).join('') || '<p style="color:var(--text-dim); padding:10px;">No machines found.</p>';
    }

    window.editMachine = (id) => {
        const m = state.machines.find(x => x.id === id);
        if (!m) return;
        openMachineModal(m);
    };

    document.getElementById('btn-add-machine').addEventListener('click', () => openMachineModal());

    function openMachineModal(existing = null) {
        const title = existing ? 'Edit Machine' : 'Add Machine';
        showModal(title, `
            <div class="form-grid">
                <div style="grid-column: 1 / -1;">
                    <label>Machine Name</label>
                    <input type="text" id="modal-m-name" class="form-control" value="${existing ? existing.name : ''}">
                </div>
                <div>
                    <label>Status</label>
                    <select id="modal-m-status" class="form-control">
                        <option value="Operational" ${existing && existing.status === 'Operational' ? 'selected' : ''}>Operational</option>
                        <option value="Down for Maintenance" ${existing && existing.status === 'Down for Maintenance' ? 'selected' : ''}>Down for Maintenance</option>
                    </select>
                </div>
            </div>
        `, async (modalBody) => {
            const name = modalBody.querySelector('#modal-m-name').value.trim();
            const status = modalBody.querySelector('#modal-m-status').value;

            if (!name) { showToast('Name is required', 'error'); return false; }

            const payload = { name, status };

            let error;
            if (existing) {
                const res = await supabase.from('shop_machines').update(payload).eq('id', existing.id);
                error = res.error;
            } else {
                const res = await supabase.from('shop_machines').insert(payload);
                error = res.error;
            }

            if (error) { showToast(error.message, 'error'); return false; }
            loadAllData();
            return true;
        });
    }

    // --- TEMPLATES ---
    function renderTemplates() {
        if (!templatesList) return;
        templatesList.innerHTML = state.templates.map(t => {
            const taskCount = state.template_tasks.filter(task => task.template_id === t.id).length;
            return `
            <div class="settings-list-item">
                <div>
                    <div class="settings-list-item-title">${t.name}</div>
                    <div class="settings-list-item-meta">${taskCount} standard tasks</div>
                </div>
                <div class="settings-actions">
                    <button class="btn-secondary btn-icon-only" onclick="window.editTemplate(${t.id})" title="Edit"><i class="fas fa-pen"></i></button>
                    <button class="btn-secondary btn-icon-only" onclick="window.deleteTemplate(${t.id})" title="Delete" style="color: var(--danger-red);"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            `;
        }).join('') || '<p style="color:var(--text-dim); padding:10px;">No templates found.</p>';
    }

    window.editTemplate = (id) => {
        const t = state.templates.find(x => x.id === id);
        if (!t) return;
        openTemplateModal(t);
    };

    window.deleteTemplate = async (id) => {
        if (!confirm("Are you sure you want to delete this template?")) return;
        const { error } = await supabase.from('project_templates').delete().eq('id', id);
        if (error) {
            showToast('Error deleting template: ' + error.message, 'error');
        } else {
            showToast('Template deleted', 'success');
            loadAllData();
        }
    };

    document.getElementById('btn-add-template').addEventListener('click', () => openTemplateModal());

    function openTemplateModal(existing = null) {
        const title = existing ? 'Edit Template' : 'Add Template';
        const tasks = existing ? state.template_tasks.filter(t => t.template_id === existing.id).sort((a,b) => a.sort_order - b.sort_order) : [];
        
        let tradeOptions = state.trades.map(tr => `<option value="${tr.id}">${tr.name}</option>`).join('');

        const renderTaskRow = (task = null) => `
            <div class="template-task-row" style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px; background: var(--bg-dark); padding: 10px; border: 1px solid var(--border-color); border-radius: 4px;">
                <div style="flex: 1;">
                    <input type="text" class="form-control t-task-name" placeholder="Task Name" value="${task ? task.name : ''}">
                </div>
                <div style="width: 150px;">
                    <select class="form-control t-task-trade">
                        <option value="">Select Trade...</option>
                        ${state.trades.map(tr => `<option value="${tr.id}" ${task && task.trade_id == tr.id ? 'selected' : ''}>${tr.name}</option>`).join('')}
                    </select>
                </div>
                <div style="width: 100px;">
                    <input type="number" class="form-control t-task-hours" placeholder="Est. Hrs" value="${task ? task.estimated_hours : 8}">
                </div>
                <button type="button" class="btn-secondary btn-icon-only remove-task-row" style="color: var(--danger-red);"><i class="fas fa-times"></i></button>
            </div>
        `;

        showModal(title, `
            <div class="form-grid">
                <div style="grid-column: 1 / -1;">
                    <label>Template Name</label>
                    <input type="text" id="modal-tpl-name" class="form-control" value="${existing ? existing.name : ''}" placeholder="e.g. Standard Fabrication">
                </div>
                <div style="grid-column: 1 / -1;">
                    <label>Description (Optional)</label>
                    <textarea id="modal-tpl-desc" class="form-control" rows="2">${existing ? (existing.description || '') : ''}</textarea>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; margin-top: 10px;">
                        <label style="margin: 0;">Standard Tasks</label>
                        <button type="button" id="btn-add-tpl-task" class="btn-secondary" style="font-size: 0.8rem; padding: 4px 8px;"><i class="fas fa-plus"></i> Add Task</button>
                    </div>
                    <div id="tpl-tasks-container">
                        ${tasks.map(t => renderTaskRow(t)).join('')}
                        ${tasks.length === 0 ? renderTaskRow() : ''}
                    </div>
                </div>
            </div>
        `, async (modalBody) => {
            const name = modalBody.querySelector('#modal-tpl-name').value.trim();
            const desc = modalBody.querySelector('#modal-tpl-desc').value.trim();

            if (!name) { showToast('Template name is required', 'error'); return false; }

            // Gather tasks
            const taskRows = modalBody.querySelectorAll('.template-task-row');
            const tasksToSave = [];
            let valid = true;

            taskRows.forEach((row, index) => {
                const tName = row.querySelector('.t-task-name').value.trim();
                const tTrade = row.querySelector('.t-task-trade').value;
                const tHours = parseFloat(row.querySelector('.t-task-hours').value) || 0;

                if (tName) {
                    if (!tTrade) {
                        showToast(`Trade is required for task: ${tName}`, 'error');
                        valid = false;
                    }
                    tasksToSave.push({
                        name: tName,
                        trade_id: tTrade,
                        estimated_hours: tHours,
                        sort_order: index
                    });
                }
            });

            if (!valid) return false;

            let templateId = existing ? existing.id : null;

            if (existing) {
                const { error } = await supabase.from('project_templates').update({ name, description: desc }).eq('id', templateId);
                if (error) { showToast(error.message, 'error'); return false; }
            } else {
                const { data, error } = await supabase.from('project_templates').insert({ name, description: desc }).select().single();
                if (error) { showToast(error.message, 'error'); return false; }
                templateId = data.id;
            }

            // Sync tasks: delete old, insert new
            if (templateId) {
                await supabase.from('project_template_tasks').delete().eq('template_id', templateId);
                if (tasksToSave.length > 0) {
                    const tasksPayload = tasksToSave.map(t => ({ ...t, template_id: templateId }));
                    const { error: taskErr } = await supabase.from('project_template_tasks').insert(tasksPayload);
                    if (taskErr) {
                        showToast('Error saving tasks: ' + taskErr.message, 'error');
                        return false;
                    }
                }
            }

            loadAllData();
            return true;
        });

        // Add event listeners for dynamic task rows
        setTimeout(() => {
            const container = document.getElementById('tpl-tasks-container');
            const addBtn = document.getElementById('btn-add-tpl-task');

            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    container.insertAdjacentHTML('beforeend', renderTaskRow());
                });
            }

            if (container) {
                container.addEventListener('click', (e) => {
                    if (e.target.closest('.remove-task-row')) {
                        e.target.closest('.template-task-row').remove();
                    }
                });
            }
        }, 100);
    }

    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
            await loadAllData();
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        });
    }

    // --- Initialization ---
    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = 'index.html';
            return;
        }
        state.currentUser = session.user;

        runWhenNavReady(() => {
            setupUserMenuAndAuth(supabase);
            loadSVGs();
            setupGlobalSearch(supabase, state.currentUser);
            setupModalListeners();
        });

        await loadAllData();
    }

    init();
});