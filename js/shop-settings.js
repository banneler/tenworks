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
        machines: []
    };

    const talentList = document.getElementById("settings-talent-list");
    const tradesList = document.getElementById("settings-trades-list");
    const machinesList = document.getElementById("settings-machines-list");
    const refreshBtn = document.getElementById("settings-refresh-btn");

    async function loadAllData() {
        if (!state.currentUser) {
            hideGlobalLoader();
            return;
        }

        try {
            const [talentRes, tradesRes, machinesRes] = await Promise.all([
                supabase.from('shop_talent').select('*').order('name'),
                supabase.from('shop_trades').select('*').order('name'),
                supabase.from('shop_machines').select('*').order('name')
            ]);

            state.talent = talentRes.data || [];
            state.trades = tradesRes.data || [];
            state.machines = machinesRes.data || [];

        } catch (error) {
            console.error("Error loading settings data:", error);
            showToast("Failed to load settings data", "error");
        } finally {
            hideGlobalLoader();
        }
        
        renderDashboard();
    }

    function renderDashboard() {
        renderTalent();
        renderTrades();
        renderMachines();
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