import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    setupModalListeners,
    showModal,
    showToast,
    setupUserMenuAndAuth,
    loadSVGs,
    setupGlobalSearch,
    runWhenNavReady,
    hideGlobalLoader
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const FALLBACK_COST = 75;

const state = {
    user: null,
    canEdit: false,
    talent: [],
    trades: [],
    skills: [],
    availability: [],
    rates: [],
    assignments: [],
    logins: [],
    selectedId: null,
    creating: false,
    tab: 'crew'
};

function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function canEditUser(user) {
    const role = String(user?.app_metadata?.role || '').toLowerCase();
    return role === 'admin' || role === 'ops' || user?.app_metadata?.is_admin === true;
}

function tradeById(id) {
    return state.trades.find(trade => String(trade.id) === String(id));
}

function skillsFor(talentId) {
    return state.skills.filter(skill => String(skill.talent_id) === String(talentId));
}

function primaryTradeName(talentId) {
    const skills = skillsFor(talentId);
    const primary = skills.find(skill => skill.is_primary) || skills[0];
    return primary ? (tradeById(primary.trade_id)?.name || '') : '';
}

function money(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

document.addEventListener('DOMContentLoaded', () => {
    runWhenNavReady(async () => {
        try {
            await loadSVGs();
            setupModalListeners();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { window.location.href = 'index.html'; return; }
            state.user = user;
            state.canEdit = canEditUser(user);
            await setupUserMenuAndAuth(supabase, { currentUser: user });
            setupGlobalSearch(supabase, user);
            document.getElementById('people-add').hidden = !state.canEdit;
            document.getElementById('people-add').addEventListener('click', () => { state.creating = true; state.selectedId = null; render(); });
            document.getElementById('people-refresh').addEventListener('click', loadAll);
            document.getElementById('people-search').addEventListener('input', renderList);
            document.getElementById('people-trade-filter').addEventListener('change', renderList);
            document.getElementById('people-show-inactive').addEventListener('change', renderList);
            document.getElementById('tab-crew').addEventListener('click', () => setTab('crew'));
            document.getElementById('tab-trades').addEventListener('click', () => setTab('trades'));
            await loadAll();
        } finally {
            hideGlobalLoader();
        }
    });
});

function setTab(tab) {
    state.tab = tab;
    document.getElementById('tab-crew').className = tab === 'crew' ? 'btn-primary' : 'btn-secondary';
    document.getElementById('tab-trades').className = tab === 'trades' ? 'btn-primary' : 'btn-secondary';
    document.getElementById('crew-view').classList.toggle('hidden', tab !== 'crew');
    document.getElementById('trades-view').classList.toggle('hidden', tab !== 'trades');
    document.getElementById('people-add').hidden = !state.canEdit || tab !== 'crew';
}

async function loadAll() {
    const [talentRes, tradeRes, skillRes, availRes, rateRes, assignRes, loginRes] = await Promise.all([
        supabase.from('shop_talent').select('*').order('name'),
        supabase.from('shop_trades').select('*').order('name'),
        supabase.from('talent_skills').select('*'),
        supabase.from('talent_availability').select('*').eq('status', 'PTO').order('date'),
        supabase.from('talent_rate_history').select('*').order('effective_date', { ascending: false }),
        supabase.from('task_assignments').select('id, talent_id, assigned_date, hours, project_tasks(name, projects(name))').order('assigned_date', { ascending: false }).limit(400),
        supabase.from('user_quotas').select('user_id, full_name').order('full_name')
    ]);
    const firstError = [talentRes, tradeRes, skillRes, availRes, rateRes, assignRes].find(result => result.error);
    if (firstError?.error) showToast(firstError.error.message, 'error');
    state.talent = talentRes.data || [];
    state.trades = tradeRes.data || [];
    state.skills = skillRes.data || [];
    state.availability = availRes.data || [];
    state.rates = rateRes.data || [];
    state.assignments = assignRes.data || [];
    state.logins = loginRes.data || [];
    render();
}

function render() {
    const filter = document.getElementById('people-trade-filter');
    const current = filter.value;
    filter.innerHTML = '<option value="">All trades</option>' + state.trades.map(trade =>
        `<option value="${trade.id}">${esc(trade.name)}</option>`
    ).join('');
    filter.value = current;
    renderList();
    renderDrawer();
    renderTrades();
}

function visibleTalent() {
    const query = document.getElementById('people-search').value.trim().toLowerCase();
    const tradeId = document.getElementById('people-trade-filter').value;
    const showInactive = document.getElementById('people-show-inactive').checked;
    return state.talent.filter(person => {
        if (!showInactive && person.active === false) return false;
        if (query && !String(person.name || '').toLowerCase().includes(query) && !String(person.role || '').toLowerCase().includes(query)) return false;
        if (tradeId && !skillsFor(person.id).some(skill => String(skill.trade_id) === String(tradeId))) return false;
        return true;
    });
}

function renderList() {
    const list = document.getElementById('people-list');
    const people = visibleTalent();
    list.innerHTML = people.map(person => `
        <button type="button" class="people-card ${String(state.selectedId) === String(person.id) ? 'selected' : ''}" data-id="${person.id}">
            <div class="people-card-title">${esc(person.name)} ${person.active === false ? '<span class="people-inactive">Inactive</span>' : ''}</div>
            <div class="people-card-meta">${esc(person.role || 'Crew')} · ${esc(primaryTradeName(person.id) || 'No trade')} · Cost ${formatRate(person.cost_rate)}</div>
        </button>
    `).join('') || '<p class="people-note">No one matches.</p>';
    list.querySelectorAll('.people-card').forEach(button => {
        button.addEventListener('click', () => {
            state.creating = false;
            state.selectedId = button.dataset.id;
            renderList();
            renderDrawer();
        });
    });
}

function formatRate(value) {
    const number = money(value);
    return number == null ? '—' : `$${number}`;
}

function renderDrawer() {
    const drawer = document.getElementById('people-drawer');
    if (state.creating) { drawer.innerHTML = personForm(null); wirePersonForm(null); return; }
    const person = state.talent.find(item => String(item.id) === String(state.selectedId));
    if (!person) {
        drawer.innerHTML = '<p class="people-note">Select a person to see their profile, skills, rates, and time off.</p>';
        return;
    }
    drawer.innerHTML = personForm(person);
    wirePersonForm(person);
}

function personForm(person) {
    const disabled = state.canEdit ? '' : 'disabled';
    const skills = person ? skillsFor(person.id) : [];
    const history = person ? state.rates.filter(row => String(row.talent_id) === String(person.id)) : [];
    const pto = person ? state.availability.filter(row => String(row.talent_id) === String(person.id)) : [];
    const historyRows = person ? state.assignments.filter(row => String(row.talent_id) === String(person.id)).slice(0, 12) : [];
    const loginOptions = ['<option value="">No linked login</option>'].concat(state.logins.map(login =>
        `<option value="${esc(login.user_id)}" ${person && String(person.auth_user_id) === String(login.user_id) ? 'selected' : ''}>${esc(login.full_name || login.user_id)}</option>`
    )).join('');
    const tradeOptions = state.trades.filter(trade => trade.active !== false).map(trade =>
        `<option value="${trade.id}">${esc(trade.name)}</option>`
    ).join('');
    return `
        <h2 style="margin-top:0;">${person ? esc(person.name) : 'New person'}</h2>
        <form id="person-form" class="people-grid">
            <label>Name<input class="form-control" name="name" required value="${esc(person?.name || '')}" ${disabled}></label>
            <label>Role<input class="form-control" name="role" value="${esc(person?.role || '')}" ${disabled}></label>
            <label>Email<input class="form-control" name="email" type="email" value="${esc(person?.email || '')}" ${disabled}></label>
            <label>Phone<input class="form-control" name="phone" value="${esc(person?.phone || '')}" ${disabled}></label>
            <label>Linked login<select class="form-control" name="auth_user_id" ${disabled}>${loginOptions}</select></label>
            <label>Employment<select class="form-control" name="employment_type" ${disabled}>
                ${['Employee', 'Contractor', 'Temp'].map(type => `<option ${person?.employment_type === type ? 'selected' : ''}>${type}</option>`).join('')}
            </select></label>
            <label>Hire date<input class="form-control" name="hire_date" type="date" value="${esc(person?.hire_date || '')}" ${disabled}></label>
            <label>End date<input class="form-control" name="end_date" type="date" value="${esc(person?.end_date || '')}" ${disabled}></label>
            <label>Hours / week<input class="form-control" name="hours_per_week" type="number" min="0" step="1" value="${esc(person?.hours_per_week ?? 40)}" ${disabled}></label>
            <label class="wide">Notes<textarea class="form-control" name="notes" rows="2" ${disabled}>${esc(person?.notes || '')}</textarea></label>
        </form>
        <div class="people-section">
            <h3>Skills</h3>
            <div id="skill-rows">
                ${skills.map(skill => skillRow(skill, tradeOptions, disabled)).join('') || (state.canEdit ? '' : '<p class="people-note">No skills yet.</p>')}
            </div>
            ${state.canEdit ? `<button type="button" id="add-skill" class="btn-secondary">Add skill</button>` : ''}
        </div>
        <div class="people-section">
            <h3>Rates</h3>
            <p class="people-note">Bill rate falls back to the primary trade. Cost rate falls back to the trade default, then $${FALLBACK_COST}.</p>
            <div class="people-grid">
                <label>Cost rate<input class="form-control" id="cost-rate" type="number" min="0" step="0.01" value="${person?.cost_rate ?? ''}" ${disabled}></label>
                <label>Bill override<input class="form-control" id="bill-override" type="number" min="0" step="0.01" value="${person?.bill_rate_override ?? ''}" placeholder="Trade rate" ${disabled}></label>
                <label>Effective date<input class="form-control" id="rate-date" type="date" value="${new Date().toISOString().slice(0, 10)}" ${disabled}></label>
            </div>
            <div style="margin-top:8px;">
                ${history.map(row => `<div class="people-history"><span>${esc(row.effective_date)}</span><span>Cost ${formatRate(row.cost_rate)}</span><span>Bill ${formatRate(row.bill_rate)}</span><span></span></div>`).join('') || '<p class="people-note">No rate history yet.</p>'}
            </div>
        </div>
        ${person ? `<div class="people-section"><h3>Time off</h3>
            ${state.canEdit ? '<div class="people-toolbar"><input id="pto-date" class="form-control" type="date"><button type="button" id="add-pto" class="btn-secondary">Add PTO day</button></div>' : ''}
            ${pto.map(day => `<div class="people-pto"><span>${esc(day.date)}</span><span>PTO</span><span></span>${state.canEdit ? `<button type="button" class="btn-secondary remove-pto" data-id="${day.id}" data-date="${esc(day.date)}">Remove</button>` : '<span></span>'}</div>`).join('') || '<p class="people-note">No upcoming PTO.</p>'}
        </div>
        <div class="people-section"><h3>Assignment history</h3>
            ${historyRows.map(row => {
                const task = row.project_tasks || {};
                const project = task.projects?.name || 'Project';
                return `<div class="people-pto"><span>${esc(row.assigned_date || '')}</span><span>${esc(project)}</span><span>${esc(task.name || '')}</span><span>${esc(row.hours ?? '')} h</span></div>`;
            }).join('') || '<p class="people-note">No assignments yet.</p>'}
        </div>` : ''}
        ${state.canEdit ? `<div style="display:flex;gap:8px;margin-top:16px;">
            <button type="button" id="save-person" class="btn-primary">Save</button>
            ${person && person.active !== false ? '<button type="button" id="deactivate-person" class="btn-secondary">Deactivate</button>' : ''}
        </div>` : '<p class="people-note">You can look, and ops can edit.</p>'}
    `;
}

function skillRow(skill, tradeOptions, disabled) {
    const selected = skill?.trade_id ? String(skill.trade_id) : '';
    const options = tradeOptions.replace(`value="${selected}"`, `value="${selected}" selected`);
    return `<div class="people-skill">
        <select class="form-control skill-trade" ${disabled}>${options}</select>
        <select class="form-control skill-level" ${disabled}>${[1, 2, 3, 4].map(level => `<option value="${level}" ${Number(skill?.proficiency) === level ? 'selected' : ''}>${level}</option>`).join('')}</select>
        <label><input type="radio" name="primary-skill" class="skill-primary" ${skill?.is_primary ? 'checked' : ''} ${disabled}> Primary</label>
        <input class="form-control skill-cert" type="date" value="${esc(skill?.cert_expires_on || '')}" ${disabled}>
        ${state.canEdit ? '<button type="button" class="btn-secondary remove-skill">Remove</button>' : ''}
    </div>`;
}

function wirePersonForm(person) {
    document.getElementById('add-skill')?.addEventListener('click', () => {
        const tradeOptions = state.trades.filter(trade => trade.active !== false).map(trade => `<option value="${trade.id}">${esc(trade.name)}</option>`).join('');
        document.getElementById('skill-rows').insertAdjacentHTML('beforeend', skillRow(null, tradeOptions, ''));
        bindSkillRemoves();
    });
    bindSkillRemoves();
    document.getElementById('save-person')?.addEventListener('click', () => savePerson(person));
    document.getElementById('deactivate-person')?.addEventListener('click', () => deactivate(person));
    document.getElementById('add-pto')?.addEventListener('click', () => addPto(person));
    document.querySelectorAll('.remove-pto').forEach(button => {
        button.addEventListener('click', async () => {
            const query = supabase.from('talent_availability').delete().eq('talent_id', person.id).eq('date', button.dataset.date);
            const { error } = button.dataset.id ? await supabase.from('talent_availability').delete().eq('id', button.dataset.id) : await query;
            if (error) { showToast(error.message, 'error'); return; }
            await loadAll();
        });
    });
}

function bindSkillRemoves() {
    document.querySelectorAll('.remove-skill').forEach(button => {
        button.onclick = () => button.closest('.people-skill').remove();
    });
}

function formValue(name) {
    return document.querySelector(`#person-form [name="${name}"]`)?.value ?? '';
}

async function savePerson(person) {
    const name = formValue('name').trim();
    if (!name) { showToast('Name is required.', 'error'); return; }
    const payload = {
        name,
        role: formValue('role').trim() || null,
        email: formValue('email').trim() || null,
        phone: formValue('phone').trim() || null,
        auth_user_id: formValue('auth_user_id') || null,
        employment_type: formValue('employment_type') || null,
        hire_date: formValue('hire_date') || null,
        end_date: formValue('end_date') || null,
        hours_per_week: Number(formValue('hours_per_week')) || 40,
        notes: formValue('notes').trim() || null,
        active: person ? person.active !== false : true
    };
    const cost = document.getElementById('cost-rate').value;
    const bill = document.getElementById('bill-override').value;
    payload.cost_rate = cost === '' ? null : Number(cost);
    payload.bill_rate_override = bill === '' ? null : Number(bill);
    let talentId = person?.id;
    if (person) {
        const { error } = await supabase.from('shop_talent').update(payload).eq('id', person.id);
        if (error) { showToast(error.message, 'error'); return; }
    } else {
        const { data, error } = await supabase.from('shop_talent').insert(payload).select('id').single();
        if (error) { showToast(error.message, 'error'); return; }
        talentId = data.id;
        state.selectedId = talentId;
        state.creating = false;
    }
    const skillPayload = [...document.querySelectorAll('.people-skill')].map(row => ({
        talent_id: talentId,
        trade_id: Number(row.querySelector('.skill-trade').value),
        proficiency: Number(row.querySelector('.skill-level').value),
        is_primary: row.querySelector('.skill-primary').checked,
        cert_expires_on: row.querySelector('.skill-cert').value || null
    })).filter(row => row.trade_id);
    if (skillPayload.filter(row => row.is_primary).length > 1) {
        showToast('Pick one primary skill.', 'error');
        return;
    }
    const { error: clearError } = await supabase.from('talent_skills').delete().eq('talent_id', talentId);
    if (clearError) { showToast(clearError.message, 'error'); return; }
    if (skillPayload.length) {
        const { error } = await supabase.from('talent_skills').insert(skillPayload);
        if (error) { showToast(error.message, 'error'); return; }
    }
    const changed = !person || money(person.cost_rate) !== payload.cost_rate || money(person.bill_rate_override) !== payload.bill_rate_override;
    if (changed) {
        const { error } = await supabase.from('talent_rate_history').insert({
            talent_id: talentId,
            cost_rate: payload.cost_rate,
            bill_rate: payload.bill_rate_override,
            effective_date: document.getElementById('rate-date').value || new Date().toISOString().slice(0, 10)
        });
        if (error) { showToast(error.message, 'error'); return; }
    }
    showToast('Saved.', 'success');
    await loadAll();
}

async function deactivate(person) {
    showModal('Deactivate', `Mark ${person.name} inactive? Their history stays.`, async () => {
        const { error } = await supabase.from('shop_talent').update({
            active: false,
            end_date: person.end_date || new Date().toISOString().slice(0, 10)
        }).eq('id', person.id);
        if (error) { showToast(error.message, 'error'); return false; }
        showToast('Deactivated.', 'success');
        await loadAll();
    });
}

async function addPto(person) {
    const date = document.getElementById('pto-date').value;
    if (!date) { showToast('Pick a date.', 'error'); return; }
    const { error } = await supabase.from('talent_availability').upsert(
        { talent_id: person.id, date, status: 'PTO' },
        { onConflict: 'talent_id,date' }
    );
    if (error) { showToast(error.message, 'error'); return; }
    await loadAll();
}

function renderTrades() {
    const list = document.getElementById('trades-list');
    list.innerHTML = state.trades.map(trade => `
        <div class="people-card" data-id="${trade.id}">
            <div class="people-card-title">${esc(trade.name)} ${trade.active === false ? '<span class="people-inactive">Retired</span>' : ''}</div>
            <div class="people-card-meta">Bill ${formatRate(trade.bill_rate ?? trade.default_hourly_rate)} · Default cost ${formatRate(trade.default_cost_rate)}</div>
            ${state.canEdit ? `<div class="people-grid" style="margin-top:8px;">
                <input class="form-control trade-name" value="${esc(trade.name)}">
                <input class="form-control trade-bill" type="number" min="0" step="0.01" value="${trade.bill_rate ?? trade.default_hourly_rate ?? ''}" placeholder="Bill rate">
                <input class="form-control trade-cost" type="number" min="0" step="0.01" value="${trade.default_cost_rate ?? ''}" placeholder="Default cost">
                <label><input type="checkbox" class="trade-active" ${trade.active === false ? '' : 'checked'}> Active</label>
                <button type="button" class="btn-primary save-trade">Save trade</button>
            </div>` : ''}
        </div>
    `).join('') || '<p class="people-note">No trades yet.</p>';
    list.querySelectorAll('.save-trade').forEach(button => {
        button.addEventListener('click', async () => {
            const card = button.closest('.people-card');
            const bill = card.querySelector('.trade-bill').value;
            const cost = card.querySelector('.trade-cost').value;
            const payload = {
                name: card.querySelector('.trade-name').value.trim(),
                bill_rate: bill === '' ? null : Number(bill),
                default_hourly_rate: bill === '' ? null : Number(bill),
                default_cost_rate: cost === '' ? null : Number(cost),
                active: card.querySelector('.trade-active').checked
            };
            if (!payload.name) { showToast('Trade name is required.', 'error'); return; }
            const { error } = await supabase.from('shop_trades').update(payload).eq('id', card.dataset.id);
            if (error) { showToast(error.message, 'error'); return; }
            showToast('Trade saved.', 'success');
            await loadAll();
        });
    });
}
