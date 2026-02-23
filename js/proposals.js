/**
 * Ten Works Proposal Generator — F1 Engine (JenniB-style)
 * - One page per element: Title, Cover Letter, Proposed Pricing (multi-page currentY), Total
 * - Placeholder per-page background (no PDF asset); pdf-lib + Snapdom
 * - Generate → PDF preview modal + Download button (no auto-download)
 */
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    formatCurrency,
    setupUserMenuAndAuth,
    loadSVGs,
    setupGlobalSearch,
    runWhenNavReady
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SNIPPETS = ['Custom fabrication', 'Precision metalwork', 'On-time delivery', 'Dedicated project management', 'Quality assurance', 'Scalable solutions'];
const ELEMENT_OPTIONS = [
    { key: 'title', label: 'Title Page', icon: 'fa-file' },
    { key: 'cover', label: 'Cover Letter', icon: 'fa-envelope' },
    { key: 'scope_finishes', label: 'Scope of Work & Finishes', icon: 'fa-hammer' },
    { key: 'deliverables', label: 'Deliverables', icon: 'fa-list-check' },
    { key: 'exclusions', label: 'Exclusions', icon: 'fa-rectangle-xmark' },
    { key: 'pricing', label: 'Proposed Pricing', icon: 'fa-dollar-sign' },
    { key: 'project_timeline', label: 'Project Timeline', icon: 'fa-clock' }
];

const PAGE_WIDTH = 612;   // 8.5" x 11" at 72 DPI
const PAGE_HEIGHT = 792;
const MARGIN = 36;
const BAR_HEIGHT = 46;
const CONTENT_TOP = PAGE_HEIGHT - MARGIN - BAR_HEIGHT - 24;
const BOTTOM_MARGIN = 80;

/** HTML template file names (fetched from /proposal_templates/). */
const COVER_TEMPLATE = 'TenWorks_Proposal_Cover.html';
const BLANK_TEMPLATE = 'TenWorks_Proposal_Blank.html';

async function getTemplate(fileName) {
    const res = await fetch(`proposal_templates/${fileName}`);
    if (!res.ok) throw new Error(`Template failed to load: ${fileName}`);
    return res.text();
}

function plainTextToHtml(text) {
    if (text == null || typeof text !== 'string') return '<p></p>';
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const paras = escaped.split(/\n\n+/);
    return paras.map(p => '<p style="margin:0 0 0.75em 0">' + p.replace(/\n/g, '<br>') + '</p>').join('');
}

/** Strip HTML to plain text (e.g. when loading saved payload that may contain old Quill HTML). */
function stripHtmlToPlain(str) {
    if (str == null || typeof str !== 'string') return '';
    if (!str.trim() || !/<[a-z]/.test(str)) return str;
    const div = document.createElement('div');
    div.innerHTML = str;
    return (div.textContent || div.innerText || '').trim();
}

function toTitleCase(str) {
    if (str == null || typeof str !== 'string') return '';
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

async function cropImageToCover(dataUrl, targetWidth, targetHeight, pan = 0.5) {
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });
    const cw = targetWidth * 2;
    const ch = targetHeight * 2;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    const targetAspect = targetWidth / targetHeight;
    const imgAspect = img.width / img.height;
    let sourceX, sourceY, sourceWidth, sourceHeight;
    if (imgAspect > targetAspect) {
        sourceHeight = img.height;
        sourceWidth = img.height * targetAspect;
        sourceX = (img.width - sourceWidth) * (1 - pan);
        sourceY = 0;
    } else {
        sourceWidth = img.width;
        sourceHeight = img.width / targetAspect;
        sourceX = 0;
        sourceY = (img.height - sourceHeight) * (1 - pan);
    }
    sourceX = Math.max(0, Math.min(sourceX, img.width - sourceWidth));
    sourceY = Math.max(0, Math.min(sourceY, img.height - sourceHeight));
    ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, cw, ch);
    return canvas.toDataURL('image/png');
}

let state = {
    locations: [],
    elementOrder: ['title', 'cover', 'scope_finishes', 'deliverables', 'exclusions', 'pricing', 'project_timeline'],
    scopeFinishes: { narrative: '', materials: [] },
    deliverables: [{ item: '', description: '', qty: 1 }],
    exclusions: ['Site preparation and leveling', 'Electrical hookups and permitting'],
    projectTimeline: [],
    proposalNotes: '',
    heroImage: null,
    heroPan: 0.5,
    currentProposalId: null,
    dealId: null,
    projectId: null,
    currentUser: null
};
let currentPdfBlobUrl = null;

function updateShareStatusLinkVisibility() {
    const btn = document.getElementById('btn-share-status-link');
    if (btn) btn.style.display = state.projectId ? 'inline-flex' : 'none';
}

function escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}
function escapeAttr(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function addLocationBlock(name = '') {
    const id = crypto.randomUUID();
    state.locations.push({ id, name, rows: [{ description: '', qty: 1, amount: '' }] });
    renderPricingLocations();
    return id;
}

function addPricingRow(locationId) {
    const loc = state.locations.find(l => l.id === locationId);
    if (!loc) return;
    loc.rows.push({ description: '', qty: 1, amount: '' });
    renderPricingLocations();
}

function removePricingRow(locationId, rowIndex) {
    const loc = state.locations.find(l => l.id === locationId);
    if (!loc || !loc.rows[rowIndex]) return;
    loc.rows.splice(rowIndex, 1);
    if (loc.rows.length === 0) loc.rows.push({ description: '', qty: 1, amount: '' });
    renderPricingLocations();
}

function removeLocationBlock(locationId) {
    state.locations = state.locations.filter(l => l.id !== locationId);
    renderPricingLocations();
}

function renderPricingLocations() {
    const container = document.getElementById('pricing-locations');
    if (!container) return;
    container.innerHTML = '';
    state.locations.forEach(loc => {
        const block = document.createElement('div');
        block.className = 'bg-black/20 border border-white/20 p-4';
        block.dataset.locationId = loc.id;
        const qtyVal = (r) => (r.qty !== undefined && r.qty !== '') ? r.qty : 1;
        let rowsHtml = loc.rows.map((r, i) => {
            const unit = parseFloat(r.amount) || 0;
            const q = parseInt(qtyVal(r), 10) || 0;
            const lineTotal = formatCurrency(unit * q);
            return `
            <tr class="pricing-row" data-loc-id="${loc.id}" data-row="${i}">
                <td class="pr-2 py-1"><input type="text" class="pricing-desc w-full bg-black/30 border border-white/20 text-white py-1.5 px-2 text-sm" data-loc-id="${loc.id}" data-row="${i}" value="${escapeAttr(r.description)}" placeholder="Description"></td>
                <td class="pr-2 py-1 w-16"><input type="number" class="pricing-qty w-full bg-black/30 border border-white/20 text-white py-1.5 px-2 text-sm text-center" data-loc-id="${loc.id}" data-row="${i}" value="${escapeAttr(String(qtyVal(r)))}" placeholder="1" min="1" step="1"></td>
                <td class="pr-2 py-1 w-28"><input type="number" class="pricing-amt w-full bg-black/30 border border-white/20 text-white py-1.5 px-2 text-sm" data-loc-id="${loc.id}" data-row="${i}" value="${escapeAttr(r.amount)}" placeholder="0" step="0.01"></td>
                <td class="py-1 w-24 text-right text-white/80 text-sm line-total">${lineTotal}</td>
                <td class="py-1 w-8"><button type="button" class="remove-row text-white/50 hover:text-red-400" data-loc-id="${loc.id}" data-row="${i}" aria-label="Remove"><i class="fas fa-times"></i></button></td>
            </tr>`;
        }).join('');
        block.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <input type="text" class="location-name flex-1 bg-black/30 border border-white/20 text-white py-1.5 px-2 text-sm mr-2" data-loc-id="${loc.id}" value="${escapeAttr(loc.name)}" placeholder="Location name / ID">
                <button type="button" class="remove-location text-white/50 hover:text-red-500 text-sm" data-loc-id="${loc.id}" aria-label="Remove location"><i class="fas fa-trash"></i></button>
            </div>
            <table class="w-full text-sm">
                <thead><tr><th class="text-left text-white/60 text-xs py-1">Description</th><th class="text-center text-white/60 text-xs py-1 w-16">Qty</th><th class="text-right text-white/60 text-xs py-1 w-28">Unit price</th><th class="text-right text-white/60 text-xs py-1 w-24">Line total</th><th class="w-8"></th></tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
            <button type="button" class="add-row mt-2 text-sm text-white/70 hover:text-[var(--primary-blue)]" data-loc-id="${loc.id}"><i class="fas fa-plus mr-1"></i> Add row</button>`;
        container.appendChild(block);
    });
    function refreshLineTotal(locId, rowIndex) {
        const loc = state.locations.find(l => l.id === locId);
        if (!loc?.rows?.[rowIndex]) return;
        const r = loc.rows[rowIndex];
        const unit = parseFloat(r.amount) || 0;
        const q = parseInt(r.qty, 10) || 0;
        const lineEl = container.querySelector(`tr.pricing-row[data-loc-id="${locId}"][data-row="${rowIndex}"] .line-total`);
        if (lineEl) lineEl.textContent = formatCurrency(unit * q);
    }
    container.querySelectorAll('.pricing-desc').forEach(el => {
        el.addEventListener('input', () => {
            const loc = state.locations.find(l => l.id === el.dataset.locId);
            const row = parseInt(el.dataset.row, 10);
            if (loc?.rows?.[row]) loc.rows[row].description = el.value;
        });
    });
    container.querySelectorAll('.pricing-qty').forEach(el => {
        el.addEventListener('input', () => {
            const loc = state.locations.find(l => l.id === el.dataset.locId);
            const row = parseInt(el.dataset.row, 10);
            if (loc?.rows?.[row]) { loc.rows[row].qty = el.value; refreshLineTotal(el.dataset.locId, row); }
        });
    });
    container.querySelectorAll('.pricing-amt').forEach(el => {
        el.addEventListener('input', () => {
            const loc = state.locations.find(l => l.id === el.dataset.locId);
            const row = parseInt(el.dataset.row, 10);
            if (loc?.rows?.[row]) { loc.rows[row].amount = el.value; refreshLineTotal(el.dataset.locId, row); }
        });
    });
    container.querySelectorAll('.location-name').forEach(el => {
        el.addEventListener('input', () => {
            const loc = state.locations.find(l => l.id === el.dataset.locId);
            if (loc) loc.name = el.value;
        });
    });
    container.querySelectorAll('.add-row').forEach(btn => btn.addEventListener('click', () => addPricingRow(btn.dataset.locId)));
    container.querySelectorAll('.remove-row').forEach(btn => btn.addEventListener('click', () => removePricingRow(btn.dataset.locId, parseInt(btn.dataset.row, 10))));
    container.querySelectorAll('.remove-location').forEach(btn => btn.addEventListener('click', () => removeLocationBlock(btn.dataset.locId)));
}

function getElementOrderFromDom() {
    const list = document.getElementById('elements-list');
    if (!list) return state.elementOrder.slice();
    return Array.from(list.querySelectorAll('li[data-element]')).map(li => li.dataset.element).filter(Boolean);
}

function renderElementsList() {
    const list = document.getElementById('elements-list');
    if (!list) return;
    const order = state.elementOrder.length ? state.elementOrder : ELEMENT_OPTIONS.map(o => o.key);
    list.innerHTML = order.map(key => {
        const opt = ELEMENT_OPTIONS.find(o => o.key === key);
        if (!opt) return '';
        return `<li class="flex items-center gap-2 py-1 cursor-grab active:cursor-grabbing border border-transparent hover:border-white/20 px-1" draggable="true" data-element="${escapeAttr(key)}"><i class="fas fa-grip-vertical text-white/40"></i> ${opt.icon ? `<i class="fas ${escapeAttr(opt.icon)} text-white/50"></i> ` : ''}${escapeHtml(opt.label)}</li>`;
    }).join('');
    wireElementListDragDrop(list);
}

function wireElementListDragDrop(list) {
    if (!list) return;
    let draggedEl = null;
    list.addEventListener('dragstart', (e) => {
        if (e.target.closest('li[data-element]')) {
            draggedEl = e.target.closest('li[data-element]');
            e.dataTransfer.setData('text/plain', draggedEl.dataset.element);
            e.dataTransfer.effectAllowed = 'move';
            draggedEl.classList.add('opacity-50');
        }
    });
    list.addEventListener('dragend', () => {
        if (draggedEl) draggedEl.classList.remove('opacity-50');
        draggedEl = null;
    });
    list.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const li = e.target.closest('li[data-element]');
        if (li && li !== draggedEl) li.classList.add('ring-1', 'ring-[var(--primary-blue)]');
    });
    list.addEventListener('dragleave', (e) => {
        const li = e.target.closest('li[data-element]');
        if (li) li.classList.remove('ring-1', 'ring-[var(--primary-blue)]');
    });
    list.addEventListener('drop', (e) => {
        e.preventDefault();
        list.querySelectorAll('li[data-element]').forEach(el => el.classList.remove('ring-1', 'ring-[var(--primary-blue)]'));
        const key = e.dataTransfer.getData('text/plain');
        const targetLi = e.target.closest('li[data-element]');
        if (!key || !targetLi || key === targetLi.dataset.element) return;
        const keys = getElementOrderFromDom();
        const fromIdx = keys.indexOf(key);
        const toIdx = keys.indexOf(targetLi.dataset.element);
        if (fromIdx === -1 || toIdx === -1) return;
        keys.splice(fromIdx, 1);
        keys.splice(toIdx, 0, key);
        state.elementOrder = keys;
        renderElementsList();
    });
}

function addScopeMaterial() {
    state.scopeFinishes.materials.push({ name: '', finish: '' });
    renderScopeMaterials();
}

function removeScopeMaterial(index) {
    state.scopeFinishes.materials.splice(index, 1);
    renderScopeMaterials();
}

function renderScopeMaterials() {
    const container = document.getElementById('scope-materials');
    if (!container) return;
    container.innerHTML = state.scopeFinishes.materials.map((m, i) => `
        <div class="flex gap-2 items-center border border-white/20 bg-black/20 p-2">
            <input type="text" class="scope-mat-name flex-1 bg-black/30 border border-white/20 text-white py-1.5 px-2 text-sm" data-index="${i}" value="${escapeAttr(m.name)}" placeholder="Material / item">
            <input type="text" class="scope-mat-finish flex-1 bg-black/30 border border-white/20 text-white py-1.5 px-2 text-sm" data-index="${i}" value="${escapeAttr(m.finish)}" placeholder="Finish / notes">
            <button type="button" class="remove-scope-mat text-white/50 hover:text-red-400" data-index="${i}" aria-label="Remove"><i class="fas fa-times"></i></button>
        </div>`).join('');
    container.querySelectorAll('.scope-mat-name').forEach(el => {
        el.addEventListener('input', () => { state.scopeFinishes.materials[parseInt(el.dataset.index, 10)].name = el.value; });
    });
    container.querySelectorAll('.scope-mat-finish').forEach(el => {
        el.addEventListener('input', () => { state.scopeFinishes.materials[parseInt(el.dataset.index, 10)].finish = el.value; });
    });
    container.querySelectorAll('.remove-scope-mat').forEach(btn => {
        btn.addEventListener('click', () => removeScopeMaterial(parseInt(btn.dataset.index, 10)));
    });
}

function addTimelineMilestone() {
    state.projectTimeline.push({ taskName: '', startDate: '', endDate: '' });
    renderProjectTimeline();
}

function removeTimelineMilestone(i) {
    state.projectTimeline.splice(i, 1);
    renderProjectTimeline();
}

function syncTimelineFromDom() {
    const container = document.getElementById('timeline-milestones');
    if (!container) return;
    container.querySelectorAll('tr[data-timeline-index]').forEach(row => {
        const i = parseInt(row.dataset.timelineIndex, 10);
        if (isNaN(i) || i >= state.projectTimeline.length) return;
        const task = row.querySelector('input[name="timeline-task"]');
        const start = row.querySelector('input[name="timeline-start"]');
        const end = row.querySelector('input[name="timeline-end"]');
        if (task) state.projectTimeline[i].taskName = task.value.trim();
        if (start) state.projectTimeline[i].startDate = start.value.trim();
        if (end) state.projectTimeline[i].endDate = end.value.trim();
    });
}

function renderProjectTimeline() {
    const container = document.getElementById('timeline-milestones');
    if (!container) return;
    container.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'w-full text-sm border border-white/20';
    table.innerHTML = `
        <thead><tr class="bg-black/20">
            <th class="text-left text-white/70 py-2 px-2 font-semibold">Task</th>
            <th class="text-left text-white/70 py-2 px-2 font-semibold">Start</th>
            <th class="text-left text-white/70 py-2 px-2 font-semibold">End</th>
            <th class="w-10"></th>
        </tr></thead>
        <tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    state.projectTimeline.forEach((t, i) => {
        const tr = document.createElement('tr');
        tr.className = 'border-t border-white/10';
        tr.dataset.timelineIndex = String(i);
        tr.innerHTML = `
            <td class="py-1 px-2"><input type="text" name="timeline-task" value="${escapeAttr(t.taskName)}" placeholder="Task name" class="w-full bg-black/20 border border-white/20 text-white py-1.5 px-2 text-sm placeholder-white/40"></td>
            <td class="py-1 px-2"><input type="date" name="timeline-start" value="${escapeAttr(t.startDate)}" class="bg-black/20 border border-white/20 text-white py-1.5 px-2 text-sm"></td>
            <td class="py-1 px-2"><input type="date" name="timeline-end" value="${escapeAttr(t.endDate)}" class="bg-black/20 border border-white/20 text-white py-1.5 px-2 text-sm"></td>
            <td class="py-1 px-2"><button type="button" class="timeline-remove text-white/50 hover:text-red-400 p-1" data-index="${i}" title="Remove"><i class="fas fa-times"></i></button></td>`;
        tbody.appendChild(tr);
    });
    container.appendChild(table);
    tbody.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', syncTimelineFromDom);
        input.addEventListener('blur', syncTimelineFromDom);
    });
    container.querySelectorAll('.timeline-remove').forEach(btn => {
        btn.addEventListener('click', () => removeTimelineMilestone(parseInt(btn.dataset.index, 10)));
    });
    const addWrap = document.createElement('div');
    addWrap.className = 'mt-2';
    addWrap.innerHTML = `<button type="button" id="btn-add-milestone" class="flex items-center gap-2 py-2 px-4 border border-dashed border-white/30 text-white/70 hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)] text-sm transition"><i class="fas fa-plus"></i> Add milestone</button>`;
    container.appendChild(addWrap);
    addWrap.querySelector('#btn-add-milestone')?.addEventListener('click', addTimelineMilestone);
}

function addDeliverableRow() {
    state.deliverables.push({ item: '', description: '', qty: 1 });
    renderDeliverables();
}

function removeDeliverableRow(i) {
    state.deliverables.splice(i, 1);
    if (state.deliverables.length === 0) state.deliverables.push({ item: '', description: '', qty: 1 });
    renderDeliverables();
}

function renderDeliverables() {
    const tbody = document.getElementById('deliverables-tbody');
    if (!tbody) return;
    tbody.innerHTML = state.deliverables.map((d, i) => `
        <tr class="border-t border-white/10" data-deliverable-index="${i}">
            <td class="p-1"><input type="text" name="deliverable-item" value="${escapeAttr(d.item)}" placeholder="Item" class="w-full bg-black/20 border border-white/20 text-white py-1.5 px-2 text-sm placeholder-white/40"></td>
            <td class="p-1"><input type="text" name="deliverable-description" value="${escapeAttr(d.description)}" placeholder="Description / Specs" class="w-full bg-black/20 border border-white/20 text-white py-1.5 px-2 text-sm placeholder-white/40"></td>
            <td class="p-1 w-20"><input type="number" min="1" name="deliverable-qty" value="${d.qty}" class="w-full bg-black/20 border border-white/20 text-white py-1.5 px-2 text-sm"></td>
            <td class="p-1 w-10"><button type="button" class="deliverable-remove text-white/50 hover:text-red-400 p-1" data-index="${i}" title="Remove row"><i class="fas fa-times"></i></button></td>
        </tr>`).join('');
    tbody.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', syncDeliverablesFromDom);
        input.addEventListener('blur', syncDeliverablesFromDom);
    });
    tbody.querySelectorAll('.deliverable-remove').forEach(btn => {
        btn.addEventListener('click', () => removeDeliverableRow(parseInt(btn.dataset.index, 10)));
    });
}

function addExclusion() {
    state.exclusions.push('');
    renderExclusions();
}

function removeExclusion(i) {
    state.exclusions.splice(i, 1);
    renderExclusions();
}

function renderExclusions() {
    const container = document.getElementById('exclusions-list');
    if (!container) return;
    container.innerHTML = state.exclusions.map((text, i) => `
        <div class="flex gap-2 items-center border border-white/20 bg-black/20 p-2">
            <input type="text" name="exclusion-item" value="${escapeAttr(text)}" placeholder="Exclusion item (by others)" class="flex-1 bg-black/20 border border-white/20 text-white py-2 px-3 text-sm placeholder-white/40">
            <button type="button" class="exclusion-remove text-white/50 hover:text-red-400 p-1" data-index="${i}" title="Remove"><i class="fas fa-times"></i></button>
        </div>`).join('');
    container.querySelectorAll('.exclusion-remove').forEach(btn => {
        btn.addEventListener('click', () => removeExclusion(parseInt(btn.dataset.index, 10)));
    });
}

function renderSnippets() {
    const el = document.getElementById('snippet-buttons');
    if (!el) return;
    el.innerHTML = SNIPPETS.map(s => `<button type="button" class="snippet-btn w-full border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white/90 hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)] text-center" data-snippet="${escapeAttr(s)}">${escapeHtml(s)}</button>`).join('');
    el.querySelectorAll('.snippet-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const ta = document.getElementById('cover-letter');
            if (!ta) return;
            const insert = btn.dataset.snippet || '';
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const text = ta.value;
            ta.value = text.slice(0, start) + insert + text.slice(end);
            ta.focus();
            ta.selectionStart = ta.selectionEnd = start + insert.length;
        });
    });
}

function updateReadiness() {
    const list = document.getElementById('readiness-checklist');
    if (!list) return;
    const client = document.getElementById('global-biz')?.value?.trim();
    const rep = document.getElementById('sales-rep')?.value?.trim();
    const cover = document.getElementById('cover-letter')?.value?.trim() ?? '';
    const hasPricing = state.locations.some(l => l.rows.some(r => r.description || parseFloat(r.amount)));
    list.innerHTML = `
        <li class="flex items-center gap-2"><i class="fas fa-${client && rep ? 'check-circle text-green-400' : 'circle text-white/40'}"></i> Client & rep filled</li>
        <li class="flex items-center gap-2"><i class="fas fa-${cover ? 'check-circle text-green-400' : 'circle text-white/40'}"></i> Cover letter personalized</li>
        <li class="flex items-center gap-2"><i class="fas fa-${hasPricing ? 'check-circle text-green-400' : 'circle text-white/40'}"></i> Pricing reviewed</li>
        <li class="flex items-center gap-2"><i class="fas fa-circle text-white/40"></i> Ready to generate</li>`;
}

function syncScopeFromDom() {
    const narrativeEl = document.getElementById('scope-narrative');
    if (narrativeEl) state.scopeFinishes.narrative = narrativeEl.value ?? state.scopeFinishes.narrative ?? '';
    const materialsContainer = document.getElementById('scope-materials');
    if (materialsContainer) {
        materialsContainer.querySelectorAll('.scope-mat-name').forEach(el => {
            const i = parseInt(el.dataset.index, 10);
            if (!isNaN(i) && state.scopeFinishes.materials[i]) state.scopeFinishes.materials[i].name = el.value ?? '';
        });
        materialsContainer.querySelectorAll('.scope-mat-finish').forEach(el => {
            const i = parseInt(el.dataset.index, 10);
            if (!isNaN(i) && state.scopeFinishes.materials[i]) state.scopeFinishes.materials[i].finish = el.value ?? '';
        });
    }
}

function syncDeliverablesFromDom() {
    const container = document.getElementById('deliverables-tbody');
    if (!container) return;
    container.querySelectorAll('tr[data-deliverable-index]').forEach(row => {
        const i = parseInt(row.dataset.deliverableIndex, 10);
        if (isNaN(i) || i >= state.deliverables.length) return;
        const itemInput = row.querySelector('input[name="deliverable-item"]');
        const descInput = row.querySelector('input[name="deliverable-description"]');
        const qtyInput = row.querySelector('input[name="deliverable-qty"]');
        if (itemInput) state.deliverables[i].item = itemInput.value.trim();
        if (descInput) state.deliverables[i].description = descInput.value.trim();
        if (qtyInput) state.deliverables[i].qty = parseInt(qtyInput.value, 10) || 1;
    });
}

function getPayload() {
    syncTimelineFromDom();
    syncDeliverablesFromDom();
    const exclusionsContainer = document.getElementById('exclusions-list');
    const exclusionItems = exclusionsContainer ? exclusionsContainer.querySelectorAll('input[name="exclusion-item"]') : [];
    const exclusionsFromDom = Array.from(exclusionItems).map(inp => inp.value.trim()).filter(Boolean);
    if (exclusionItems.length > 0) state.exclusions = exclusionsFromDom.length ? exclusionsFromDom : state.exclusions;
    const data = {
        client_name: document.getElementById('global-biz')?.value ?? '',
        sales_rep: document.getElementById('sales-rep')?.value ?? '',
        project_start: document.getElementById('project-start')?.value ?? '',
        project_complete: document.getElementById('project-complete')?.value ?? '',
        cover_letter: document.getElementById('cover-letter')?.value ?? '',
        proposal_notes: document.getElementById('proposal-notes')?.value ?? '',
        element_order: state.elementOrder.slice(),
        locations: state.locations.map(l => ({ id: l.id, name: l.name, rows: l.rows.map(r => ({ ...r })) })),
        scope_finishes: { narrative: document.getElementById('scope-narrative')?.value ?? '', materials: state.scopeFinishes.materials.map(m => ({ ...m })) },
        deliverables: state.deliverables.map(d => ({ ...d })),
        exclusions: state.exclusions.slice(),
        project_timeline: state.projectTimeline.map(t => ({ ...t }))
    };
    return data;
}

function setPayload(data) {
    if (!data) return;
    const globalBiz = document.getElementById('global-biz');
    const salesRep = document.getElementById('sales-rep');
    const projectStart = document.getElementById('project-start');
    const projectComplete = document.getElementById('project-complete');
    if (globalBiz) globalBiz.value = data.client_name ?? '';
    if (salesRep) salesRep.value = data.sales_rep ?? '';
    if (projectStart) projectStart.value = data.project_start ?? '';
    if (projectComplete) projectComplete.value = data.project_complete ?? '';
    const coverEl = document.getElementById('cover-letter');
    if (coverEl) coverEl.value = stripHtmlToPlain(data.cover_letter ?? '');
    if (Array.isArray(data.element_order) && data.element_order.length) {
        state.elementOrder = data.element_order.filter(k => ELEMENT_OPTIONS.some(o => o.key === k));
        if (state.elementOrder.length !== ELEMENT_OPTIONS.length) {
            const have = new Set(state.elementOrder);
            state.elementOrder = [...state.elementOrder, ...ELEMENT_OPTIONS.map(o => o.key).filter(k => !have.has(k))];
        }
    }
    const norm = (r) => ({ description: r.description ?? '', qty: r.qty !== undefined && r.qty !== '' ? r.qty : 1, amount: r.amount ?? '' });
    if (Array.isArray(data.locations) && data.locations.length) {
        state.locations = data.locations.map(l => ({ id: l.id || crypto.randomUUID(), name: l.name || '', rows: (l.rows && l.rows.length) ? l.rows.map(norm) : [{ description: '', qty: 1, amount: '' }] }));
    } else {
        state.locations = [{ id: crypto.randomUUID(), name: '', rows: [{ description: '', qty: 1, amount: '' }] }];
    }
    if (data.scope_finishes) {
        state.scopeFinishes = { narrative: data.scope_finishes.narrative ?? '', materials: Array.isArray(data.scope_finishes.materials) ? data.scope_finishes.materials.map(m => ({ name: m.name ?? '', finish: m.finish ?? '' })) : [] };
        const scopeEl = document.getElementById('scope-narrative');
        if (scopeEl) scopeEl.value = stripHtmlToPlain(state.scopeFinishes.narrative ?? '');
    }
    if (Array.isArray(data.project_timeline)) {
        state.projectTimeline = data.project_timeline.map(t => ({ taskName: t.taskName ?? '', startDate: t.startDate ?? '', endDate: t.endDate ?? '' }));
    }
    if (Array.isArray(data.deliverables) && data.deliverables.length) {
        state.deliverables = data.deliverables.map(d => ({ item: d.item ?? '', description: d.description ?? '', qty: d.qty !== undefined && d.qty !== '' ? (parseInt(d.qty, 10) || 1) : 1 }));
    }
    if (Array.isArray(data.exclusions)) {
        state.exclusions = data.exclusions.length ? data.exclusions.map(e => String(e ?? '')) : ['Site preparation and leveling', 'Electrical hookups and permitting'];
    }
    if (data.proposal_notes != null) {
        state.proposalNotes = String(data.proposal_notes ?? '');
        const notesEl = document.getElementById('proposal-notes');
        if (notesEl) notesEl.value = stripHtmlToPlain(state.proposalNotes);
    }
    renderElementsList();
    renderPricingLocations();
    renderScopeMaterials();
    renderDeliverables();
    renderExclusions();
    renderProjectTimeline();
    updateReadiness();
}

async function prefillFromDeal(dealId) {
    const { data: deal, error } = await supabase.from('deals_tw').select('*').eq('id', dealId).single();
    if (error || !deal) return;
    let clientName = deal.deal_name || deal.name || '';
    if (deal.account_id) {
        const { data: account } = await supabase.from('accounts').select('name').eq('id', deal.account_id).single();
        if (account?.name) clientName = account.name;
    }
    document.getElementById('global-biz').value = clientName;
    const amount = deal.mrc ?? deal.amount ?? 0;
    state.locations = [{ id: crypto.randomUUID(), name: deal.name || deal.deal_name || '', rows: [{ description: deal.products || 'Project services', qty: 1, amount: amount ? String(amount) : '' }] }];
    renderPricingLocations();
    updateReadiness();
}

async function prefillFromProject(projectId) {
    const { data: project, error } = await supabase.from('projects').select('*').eq('id', projectId).single();
    if (error || !project) return;
    let clientName = project.name || '';
    if (project.deal_id) {
        const { data: deal } = await supabase.from('deals_tw').select('account_id').eq('id', project.deal_id).single();
        if (deal?.account_id) {
            const { data: account } = await supabase.from('accounts').select('name').eq('id', deal.account_id).single();
            if (account?.name) clientName = account.name;
        }
    }
    document.getElementById('global-biz').value = clientName;
    const { data: tasks } = await supabase.from('project_tasks').select('name, start_date, end_date, estimated_hours').eq('project_id', projectId).order('start_date');
    const { data: bom } = await supabase.from('project_bom').select('*, inventory_items(name, sku)').eq('project_id', projectId);
    const rows = (tasks && tasks.length > 0)
        ? tasks.map(t => ({ description: t.name || 'Task', qty: 1, amount: t.estimated_hours ? String(Math.round((t.estimated_hours || 0) * 125)) : '' }))
        : [{ description: project.description || 'Project scope', qty: 1, amount: project.project_value ? String(project.project_value) : '' }];
    state.locations = [{ id: crypto.randomUUID(), name: project.name || '', rows }];
    state.projectTimeline = (tasks || []).map(t => ({
        taskName: t.name || '',
        startDate: t.start_date ? t.start_date.slice(0, 10) : '',
        endDate: t.end_date ? t.end_date.slice(0, 10) : ''
    }));
    state.scopeFinishes.materials = (bom || []).map(row => ({
        name: row.inventory_items?.name || row.sku || 'Material',
        finish: ''
    }));
    const scopeEl = document.getElementById('scope-narrative');
    if (scopeEl && !scopeEl.value.trim()) scopeEl.value = stripHtmlToPlain(state.scopeFinishes.narrative || project.description || '');
    renderPricingLocations();
    renderScopeMaterials();
    renderProjectTimeline();
    updateReadiness();
}

/**
 * All pages are rendered from HTML templates (Cover + Blank) via getTemplate + snapdom; no PDF backgrounds.
 */
async function exportPdf() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('hidden');

    const wrap = document.getElementById('render-zones');
    const coverTemplate = document.getElementById('hidden-cover-template');
    const coverBody = document.getElementById('print-cover-body');
    const pricingTemplate = document.getElementById('hidden-pricing-template');
    const deliverablesTemplate = document.getElementById('hidden-deliverables-template');
    const exclusionsTemplate = document.getElementById('hidden-exclusions-template');
    if (wrap) { wrap.style.top = '0'; wrap.style.zIndex = '9999'; }

    try {
        syncScopeFromDom();
        syncTimelineFromDom();

        /** Give the page time to settle on first click (fonts, iframes, paint). Reduces first-click blank output. */
        const PRE_GENERATE_DELAY_MS = 4000;
        const [,,, snapdomModule, pdfLibModule] = await Promise.all([
            new Promise(r => setTimeout(r, PRE_GENERATE_DELAY_MS)),
            getTemplate(BLANK_TEMPLATE),
            getTemplate(COVER_TEMPLATE),
            import('https://unpkg.com/@zumer/snapdom/dist/snapdom.mjs'),
            import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js')
        ]);
        const snapdom = snapdomModule.snapdom;
        const { PDFDocument, rgb, StandardFonts } = pdfLibModule;

        const pdfDoc = await PDFDocument.create();
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);
        const brandNavy = rgb(0.12, 0.14, 0.16); // #1F2329
        const pureWhite = rgb(1, 1, 1);

        const fontByKey = { mono: monoFont, sansMedium: regularFont, sansLight: regularFont };

        const client = document.getElementById('global-biz')?.value?.trim() || '—';
        const rep = document.getElementById('sales-rep')?.value?.trim() || '';
        const projectStart = document.getElementById('project-start')?.value?.trim() || '';
        const projectComplete = document.getElementById('project-complete')?.value?.trim() || '';
        const lineTotalFn = (r) => (parseFloat(r.amount) || 0) * (parseInt(r.qty, 10) || 0);
        const grandTotal = state.locations.reduce((sum, l) => sum + (l.rows || []).reduce((s, r) => s + lineTotalFn(r), 0), 0);
        const grandTotalText = formatCurrency(grandTotal);
        const fullWidth = 540;
        const contentWidthPt = 480;
        const contentWidthPx = 640;
        const contentBorder = '1px solid #94a3b8';
        const tableRowBorder = '#eef2f6';
        const zebraLight = '#f8fafc';
        const zebraDark = '#f1f5f9';
        /** Delay before snapdom to allow layout/paint to settle and reduce print inconsistency. */
        const SNAPDOM_DELAY_MS = 200;
        const waitBeforeSnap = () => new Promise(r => setTimeout(r, SNAPDOM_DELAY_MS));
        /** Max content height (px at scale 2) that fits one blank page content area. */
        const ONE_PAGE_CONTENT_HEIGHT_PX = 1600;

        /** Move a hidden (off-screen) element into viewport so the browser paints it, then capture. Restores position after. */
        const captureOffScreenElement = async (el, widthPx, captureFn) => {
            if (!el) return await captureFn();
            const hadOffScreen = el.classList.contains('top-[-9999px]');
            const prevStyle = { position: el.style.position, left: el.style.left, top: el.style.top, zIndex: el.style.zIndex, width: el.style.width };
            try {
                if (hadOffScreen) {
                    el.classList.remove('top-[-9999px]');
                    el.style.position = 'fixed';
                    el.style.left = '0';
                    el.style.top = '0';
                    el.style.zIndex = '-1';
                    if (widthPx) el.style.width = widthPx + 'px';
                    await new Promise(r => requestAnimationFrame(r));
                    await new Promise(r => requestAnimationFrame(r));
                }
                return await captureFn();
            } finally {
                if (hadOffScreen) {
                    el.classList.add('top-[-9999px]');
                    el.style.position = prevStyle.position || '';
                    el.style.left = prevStyle.left || '';
                    el.style.top = prevStyle.top || '';
                    el.style.zIndex = prevStyle.zIndex || '';
                    el.style.width = prevStyle.width || '';
                }
            }
        };

        const addPageFromBlankTemplate = async (pageTitle, contentDataUrl, options = {}) => {
            const { showHeaderTitle = true } = options;
            const html = await getTemplate(BLANK_TEMPLATE);
            const iframe = document.createElement('iframe');
            iframe.setAttribute('style', 'position:absolute;left:0;top:0;width:816px;height:1056px;border:0;pointer-events:none;z-index:-1');
            document.body.appendChild(iframe);
            iframe.srcdoc = html;
            await new Promise(r => { iframe.onload = r; });
            const doc = iframe.contentDocument;
            const header = doc.querySelector('.h-24.bg-brand.flex');
            if (header && showHeaderTitle && pageTitle) {
                const titleSpan = doc.createElement('span');
                titleSpan.className = 'text-white font-mono text-xs tracking-[0.2em] uppercase';
                titleSpan.textContent = pageTitle;
                header.appendChild(titleSpan);
            }
            const contentEl = doc.querySelector('.proposal-content');
            if (contentEl && contentDataUrl) {
                contentEl.innerHTML = `<img src="${contentDataUrl}" alt="" style="width:100%;height:auto;display:block;object-fit:contain">`;
                const img = contentEl.querySelector('img');
                if (img) {
                    await new Promise((resolve) => {
                        if (img.complete) resolve();
                        else { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 3000); }
                    });
                }
            }
            await doc.fonts.ready;
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            await waitBeforeSnap();
            const pageEl = doc.body.firstElementChild;
            const cap = await snapdom(pageEl, { scale: 2, backgroundColor: 'white' });
            const canvas = await cap.toCanvas();
            const dataUrl = canvas.toDataURL('image/png');
            document.body.removeChild(iframe);
            const png = await pdfDoc.embedPng(dataUrl);
            const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            page.drawImage(png, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
            return page;
        };

        const addTitlePage = async () => {
            const dateStr = (() => {
                if (projectStart || projectComplete) {
                    return [projectStart, projectComplete].filter(Boolean).map(d => {
                        try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (_) { return d; }
                    }).join(' – ');
                }
                return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            })();
            const html = await getTemplate(COVER_TEMPLATE);
            const iframe = document.createElement('iframe');
            iframe.setAttribute('style', 'position:absolute;left:0;top:0;width:816px;height:1056px;border:0;pointer-events:none;z-index:-1');
            document.body.appendChild(iframe);
            iframe.srcdoc = html;
            await new Promise(r => { iframe.onload = r; });
            const doc = iframe.contentDocument;
            await doc.fonts.ready;
            await new Promise(r => requestAnimationFrame(r));
            const dateSpan = doc.querySelector('.font-mono.flex.items-center span.text-right');
            if (dateSpan) dateSpan.textContent = dateStr;
            const preparedForLabel = Array.from(doc.querySelectorAll('p')).find(p => p.textContent.trim() === 'Prepared For');
            if (preparedForLabel) {
                const grid = preparedForLabel.closest('[class*="grid"]');
                if (grid) {
                    const cols = grid.querySelectorAll(':scope > div');
                    const preparedForP = cols[0]?.querySelectorAll('p')[1];
                    const preparedByP = cols[1]?.querySelectorAll('p')[1];
                    if (preparedForP) preparedForP.textContent = toTitleCase(client);
                    if (preparedByP) preparedByP.textContent = rep || '';
                }
            }
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            const heroImg = doc.querySelector('.w-\\[55\\%\\] img') || doc.querySelector('img');
            if (heroImg && state.heroImage) {
                heroImg.src = state.heroImage;
                heroImg.style.objectFit = 'cover';
                heroImg.style.objectPosition = `${(state.heroPan * 100).toFixed(0)}% center`;
                await new Promise((resolve) => {
                    heroImg.onload = () => resolve();
                    heroImg.onerror = () => resolve();
                });
            } else if (heroImg) {
                await new Promise((resolve) => {
                    if (heroImg.complete && heroImg.naturalWidth) return resolve();
                    heroImg.onload = () => resolve();
                    heroImg.onerror = () => resolve();
                    setTimeout(resolve, 2500);
                });
            }
            await doc.fonts.ready;
            await new Promise(r => setTimeout(r, 1300)); // let fade-in animations finish (delay-200 + 1s)
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            const pageEl = doc.getElementById('proposal-page') || doc.body.firstElementChild;
            await waitBeforeSnap();
            const cap = await snapdom(pageEl, { scale: 2, backgroundColor: 'white' });
            const canvas = await cap.toCanvas();
            const dataUrl = canvas.toDataURL('image/png');
            document.body.removeChild(iframe);
            const titlePng = await pdfDoc.embedPng(dataUrl);
            const titlePage = pdfDoc.insertPage(0, [PAGE_WIDTH, PAGE_HEIGHT]);
            titlePage.drawImage(titlePng, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
        };

        const addCoverPage = async () => {
            const coverText = document.getElementById('cover-letter')?.value?.trim() || '';
            if (!coverTemplate || !coverBody) return;
            coverBody.innerHTML = plainTextToHtml(coverText);
            coverTemplate.classList.remove('top-[-9999px]');
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => setTimeout(r, 50));
            await waitBeforeSnap();
            const coverCapture = await snapdom(coverTemplate, { scale: 2, backgroundColor: 'transparent' });
            const coverCanvas = await coverCapture.toCanvas();
            coverTemplate.classList.add('top-[-9999px]');
            const coverDataUrl = coverCanvas.toDataURL('image/png');
            await addPageFromBlankTemplate('COVER LETTER', coverDataUrl, { showHeaderTitle: false });
        };

        const buildPricingHtml = (locations, includeProjectTotal = true) => {
            let html = '';
            locations.forEach((loc, i) => {
                const locName = loc.name || 'Location';
                const locTotal = (loc.rows || []).reduce((s, r) => s + lineTotalFn(r), 0);
                const locTotalText = formatCurrency(locTotal);
                const isLast = i === locations.length - 1;
                html += `
                <div style="width:100%;margin-bottom:20px;font-family:sans-serif;">
                    <div style="background:#1F2329;color:#ffffff;font-weight:700;padding:10px 16px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(locName)}</div>
                    <div style="display:flex;background:${zebraDark};color:#1F2329;font-weight:600;padding:8px 16px;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">
                        <div style="flex:1;">Product / Description</div>
                        <div style="width:70px;text-align:center;">Qty</div>
                        <div style="width:100px;text-align:right;">Unit price</div>
                        <div style="width:110px;text-align:right;">Line total</div>
                    </div>
                    <div style="background:#ffffff;">
                `;
                (loc.rows || []).forEach((r, rowIndex) => {
                    const unit = parseFloat(r.amount) || 0;
                    const q = parseInt(r.qty, 10) || 0;
                    const line = unit * q;
                    const rowBg = rowIndex % 2 === 0 ? '#ffffff' : zebraLight;
                    html += `<div style="display:flex;padding:10px 16px;border-bottom:1px solid ${tableRowBorder};color:#1F2329;background:${rowBg};"><div style="flex:1;">${escapeHtml(r.description || '—')}</div><div style="width:70px;text-align:center;">${q}</div><div style="width:100px;text-align:right;">${formatCurrency(unit)}</div><div style="width:110px;text-align:right;">${formatCurrency(line)}</div></div>`;
                });
                html += `
                    </div>
                    <div style="display:flex;align-items:center;padding:10px 16px;background:#ffffff;border-bottom:1px solid ${tableRowBorder};font-weight:700;font-size:14px;color:#1F2329;">
                        <div style="flex:1;text-transform:uppercase;letter-spacing:0.05em;">Location Total</div>
                        <div style="width:70px;"></div>
                        <div style="width:100px;"></div>
                        <div style="width:110px;text-align:right;">${locTotalText}</div>
                    </div>
                </div>`;
                if (isLast && locations.length > 0 && includeProjectTotal) {
                    html += `
                    <div style="width:100%;margin-top:12px;display:flex;align-items:center;padding:12px 16px;background:#1F2329;font-weight:700;font-size:16px;color:#ffffff;white-space:nowrap;border-bottom:1px solid ${tableRowBorder};">
                        <div style="flex:1;text-transform:uppercase;letter-spacing:0.05em;">Project Total</div>
                        <div style="width:70px;"></div>
                        <div style="width:100px;"></div>
                        <div style="width:110px;text-align:right;">${grandTotalText}</div>
                    </div>`;
                }
            });
            return html;
        };

        const addPricingPages = async () => {
            if (!pricingTemplate) return;
            const locationsWithRows = state.locations.filter(loc => (loc.rows || []).length > 0);
            if (locationsWithRows.length === 0) return;
            const             fullHtml = buildPricingHtml(locationsWithRows);
            pricingTemplate.innerHTML = `<div style="width:${contentWidthPx}px;border:${contentBorder};box-sizing:border-box;">${fullHtml}</div>`;
            pricingTemplate.style.width = contentWidthPx + 'px';
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            const can = await captureOffScreenElement(pricingTemplate, contentWidthPx, async () => {
                await waitBeforeSnap();
                const cap = await snapdom(pricingTemplate, { scale: 2, backgroundColor: 'transparent' });
                return cap.toCanvas();
            });
            if (can.height <= ONE_PAGE_CONTENT_HEIGHT_PX) {
                await addPageFromBlankTemplate('PROPOSED COSTS', can.toDataURL('image/png'));
                return;
            }
            for (let i = 0; i < locationsWithRows.length; i++) {
                const loc = locationsWithRows[i];
                const isLast = i === locationsWithRows.length - 1;
                const singleHtml = buildPricingHtml([loc], isLast);
                pricingTemplate.innerHTML = `<div style="width:${contentWidthPx}px;border:${contentBorder};box-sizing:border-box;">${singleHtml}</div>`;
                pricingTemplate.style.width = contentWidthPx + 'px';
                await new Promise(r => requestAnimationFrame(r));
                await new Promise(r => requestAnimationFrame(r));
                const pageCan = await captureOffScreenElement(pricingTemplate, contentWidthPx, async () => {
                    await waitBeforeSnap();
                    const pageCap = await snapdom(pricingTemplate, { scale: 2, backgroundColor: 'transparent' });
                    return pageCap.toCanvas();
                });
                const pageTitle = i === 0 ? 'PROPOSED COSTS' : 'PROPOSED COSTS (CONT.)';
                await addPageFromBlankTemplate(pageTitle, pageCan.toDataURL('image/png'));
            }
        };

        const buildScopeBlockHtml = () => {
            const narrative = document.getElementById('scope-narrative')?.value ?? state.scopeFinishes.narrative ?? '';
            const narrativeHtml = `<div style="width:100%;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#1F2329;margin-bottom:20px;">${plainTextToHtml(narrative)}</div>`;
            const materials = state.scopeFinishes.materials || [];
            const materialsRows = materials.length
                ? materials.map((m, rowIndex) => {
                    const rowBg = rowIndex % 2 === 0 ? '#ffffff' : zebraLight;
                    return `<div style="display:flex;padding:8px 16px;border-bottom:1px solid ${tableRowBorder};color:#1F2329;background:${rowBg};"><div style="flex:1;">${escapeHtml(m.name || '—')}</div><div style="flex:2;">${escapeHtml(m.finish || '—')}</div></div>`;
                }).join('')
                : '';
            const materialsTable = `<div style="font-family:sans-serif;color:#1F2329;border:${contentBorder};box-sizing:border-box;background:#ffffff;margin-bottom:20px;">
                <div style="background:#1F2329;color:#ffffff;font-weight:700;padding:10px 16px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">MATERIALS & FINISHES</div>
                <div style="display:flex;background:#e2e8f0;color:#1F2329;font-weight:600;padding:8px 16px;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;"><div style="flex:1;">Material / Item</div><div style="flex:2;">Finish</div></div>
                <div style="background:#ffffff;">${materialsRows || '<div style="padding:16px;color:#64748b;">None listed.</div>'}</div></div>`;
            return `<div style="width:${contentWidthPx}px;">${narrativeHtml}${materialsTable}</div>`;
        };

        const buildDeliverablesExclusionsHtml = () => {
            const rows = (state.deliverables && state.deliverables.length)
                ? state.deliverables.map((d, rowIndex) => {
                    const qty = d.qty !== undefined && d.qty !== '' ? parseInt(d.qty, 10) : 1;
                    const rowBg = rowIndex % 2 === 0 ? '#ffffff' : zebraLight;
                    return `<div style="display:flex;padding:10px 16px;border-bottom:1px solid ${tableRowBorder};color:#1F2329;background:${rowBg};"><div style="flex:1;">${escapeHtml(d.item || '—')}</div><div style="flex:2;">${escapeHtml(d.description || '—')}</div><div style="width:70px;text-align:center;">${isNaN(qty) ? '—' : qty}</div></div>`;
                }).join('')
                : '<div style="padding:16px;color:#64748b;">No deliverables.</div>';
            const deliverablesSection = `
                <div style="margin-bottom:20px;font-family:sans-serif;color:#1F2329;border:${contentBorder};box-sizing:border-box;background:#ffffff;">
                    <div style="background:#1F2329;color:#ffffff;font-weight:700;padding:10px 16px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">DELIVERABLES & SPECIFICATIONS</div>
                    <div style="display:flex;background:#e2e8f0;color:#1F2329;font-weight:600;padding:8px 16px;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;"><div style="flex:1;">Item</div><div style="flex:2;">Description / Specs</div><div style="width:70px;text-align:center;">Qty</div></div>
                    <div style="background:#ffffff;">${rows}</div>
                </div>`;
            const items = (state.exclusions && state.exclusions.length)
                ? state.exclusions.map((e, rowIndex) => {
                    const rowBg = rowIndex % 2 === 0 ? '#ffffff' : zebraLight;
                    return `<div style="display:flex;align-items:flex-start;padding:8px 16px;border-bottom:1px solid ${tableRowBorder};color:#1F2329;background:${rowBg};"><span style="margin-right:10px;color:#1F2329;">■</span><span style="flex:1;">${escapeHtml(String(e || '—'))}</span></div>`;
                }).join('')
                : '<div style="padding:16px;color:#64748b;">No exclusions listed.</div>';
            const exclusionsSection = `
                <div style="font-family:sans-serif;color:#1F2329;border:${contentBorder};box-sizing:border-box;background:#ffffff;">
                    <div style="background:#1F2329;color:#ffffff;font-weight:700;padding:10px 16px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">EXCLUSIONS (BY OTHERS)</div>
                    <div style="background:#ffffff;">${items}</div>
                </div>`;
            return `<div style="width:${contentWidthPx}px;">${deliverablesSection}${exclusionsSection}</div>`;
        };

        /** Handles scope + optionally deliverables & exclusions. One page if combined fits; else scope page then DELIVERABLES & EXCLUSIONS page. */
        const addScopeAndDeliverablesExclusionsCombined = async (elementOrder) => {
            syncDeliverablesFromDom();
            const exclusionsContainer = document.getElementById('exclusions-list');
            if (exclusionsContainer) {
                const inputs = exclusionsContainer.querySelectorAll('input[name="exclusion-item"]');
                const fromDom = Array.from(inputs).map(inp => inp.value.trim());
                if (inputs.length > 0) state.exclusions = fromDom.length ? fromDom : state.exclusions;
            }
            const includeDelivExcl = elementOrder.includes('deliverables') || elementOrder.includes('exclusions');
            const hasDeliverables = state.deliverables && state.deliverables.some(d => (d.item || '').trim() || (d.description || '').trim());
            const hasExclusions = state.exclusions && state.exclusions.length > 0 && state.exclusions.some(e => String(e || '').trim());
            const hasDelivExclContent = includeDelivExcl && (hasDeliverables || hasExclusions);

            const scopeBlockHtml = buildScopeBlockHtml();

            if (!hasDelivExclContent) {
                if (!deliverablesTemplate) return;
                deliverablesTemplate.innerHTML = scopeBlockHtml;
                deliverablesTemplate.style.width = contentWidthPx + 'px';
                await new Promise(r => requestAnimationFrame(r));
                await new Promise(r => requestAnimationFrame(r));
                const can = await captureOffScreenElement(deliverablesTemplate, contentWidthPx, async () => {
                    await waitBeforeSnap();
                    const cap = await snapdom(deliverablesTemplate, { scale: 2, backgroundColor: 'transparent' });
                    return cap.toCanvas();
                });
                await addPageFromBlankTemplate('SCOPE OF WORK', can.toDataURL('image/png'));
                return;
            }

            const delivExclHtml = buildDeliverablesExclusionsHtml();
            const subsectionTitle = `<div style="font-family:sans-serif;font-size:14px;font-weight:700;color:#1F2329;margin:24px 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Deliverables & Exclusions</div>`;
            const combinedHtml = `<div style="width:${contentWidthPx}px;">${scopeBlockHtml}${subsectionTitle}${delivExclHtml}</div>`;
            if (!deliverablesTemplate) return;
            deliverablesTemplate.innerHTML = combinedHtml;
            deliverablesTemplate.style.width = contentWidthPx + 'px';
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            const can = await captureOffScreenElement(deliverablesTemplate, contentWidthPx, async () => {
                await waitBeforeSnap();
                const cap = await snapdom(deliverablesTemplate, { scale: 2, backgroundColor: 'transparent' });
                return cap.toCanvas();
            });
            const combinedHeightPx = can.height;

            if (combinedHeightPx <= ONE_PAGE_CONTENT_HEIGHT_PX) {
                await addPageFromBlankTemplate('SCOPE OF WORK', can.toDataURL('image/png'));
                return;
            }

            deliverablesTemplate.innerHTML = scopeBlockHtml;
            deliverablesTemplate.style.width = contentWidthPx + 'px';
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            const scopeCanvas = await captureOffScreenElement(deliverablesTemplate, contentWidthPx, async () => {
                await waitBeforeSnap();
                const scopeCap = await snapdom(deliverablesTemplate, { scale: 2, backgroundColor: 'transparent' });
                return scopeCap.toCanvas();
            });
            await addPageFromBlankTemplate('SCOPE OF WORK', scopeCanvas.toDataURL('image/png'));

            deliverablesTemplate.innerHTML = delivExclHtml;
            deliverablesTemplate.style.width = contentWidthPx + 'px';
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            const delivCanvas = await captureOffScreenElement(deliverablesTemplate, contentWidthPx, async () => {
                await waitBeforeSnap();
                const delivCap = await snapdom(deliverablesTemplate, { scale: 2, backgroundColor: 'transparent' });
                return delivCap.toCanvas();
            });
            await addPageFromBlankTemplate('DELIVERABLES & EXCLUSIONS', delivCanvas.toDataURL('image/png'), { showHeaderTitle: true });
        };

        /** Only deliverables & exclusions (when scope_finishes is not in the order). */
        const addDeliverablesAndExclusionsPageOnly = async () => {
            const hasDeliverables = state.deliverables && state.deliverables.some(d => (d.item || '').trim() || (d.description || '').trim());
            const hasExclusions = state.exclusions && state.exclusions.length > 0 && state.exclusions.some(e => String(e || '').trim());
            const delivExclHtml = buildDeliverablesExclusionsHtml();
            if (!deliverablesTemplate) return;
            deliverablesTemplate.innerHTML = delivExclHtml;
            deliverablesTemplate.style.width = contentWidthPx + 'px';
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            const can = await captureOffScreenElement(deliverablesTemplate, contentWidthPx, async () => {
                await waitBeforeSnap();
                const cap = await snapdom(deliverablesTemplate, { scale: 2, backgroundColor: 'transparent' });
                return cap.toCanvas();
            });
            const headerTitle = hasDeliverables && hasExclusions ? 'DELIVERABLES & EXCLUSIONS' : hasDeliverables ? 'DELIVERABLES' : hasExclusions ? 'EXCLUSIONS' : 'DELIVERABLES & EXCLUSIONS';
            await addPageFromBlankTemplate(headerTitle, can.toDataURL('image/png'), { showHeaderTitle: true });
        };

        const addProjectTimelinePage = async () => {
            const div = document.createElement('div');
            div.style.cssText = `width:${contentWidthPx}px;font-family:sans-serif;color:#1F2329;border:${contentBorder};box-sizing:border-box;`;
            const rows = state.projectTimeline.length
                ? state.projectTimeline.map((t, rowIndex) => {
                    const start = t.startDate ? (() => { try { return new Date(t.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (_) { return t.startDate; } })() : '—';
                    const end = t.endDate ? (() => { try { return new Date(t.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (_) { return t.endDate; } })() : '—';
                    const rowBg = rowIndex % 2 === 0 ? '#ffffff' : zebraLight;
                    return `<div style="display:flex;padding:10px 16px;border-bottom:1px solid ${tableRowBorder};background:${rowBg};color:#1F2329;"><div style="flex:1;">${escapeHtml(t.taskName || '—')}</div><div style="width:140px;">${escapeHtml(start)}</div><div style="width:140px;">${escapeHtml(end)}</div></div>`;
                }).join('')
                : '<div style="padding:16px;color:#64748b;">No milestones.</div>';
            div.innerHTML = `
                <div style="background:#1F2329;color:#ffffff;font-weight:600;padding:8px 16px;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;display:flex;"><div style="flex:1;">Task</div><div style="width:140px;">Start</div><div style="width:140px;">End</div></div>
                <div style="background:#ffffff;">${rows}</div>`;
            div.style.background = '#ffffff';
            document.body.appendChild(div);
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            await waitBeforeSnap();
            try {
                const cap = await snapdom(div, { scale: 2, backgroundColor: 'transparent' });
                const can = await cap.toCanvas();
                const contentDataUrl = can.toDataURL('image/png');
                await addPageFromBlankTemplate('PROJECT TIMELINE', contentDataUrl);
            } finally {
                document.body.removeChild(div);
            }
        };

        const order = state.elementOrder && state.elementOrder.length ? state.elementOrder : ELEMENT_OPTIONS.map(o => o.key);
        let addedScopeDelivExcl = false;
        for (const key of order) {
            if (key === 'title') await addTitlePage();
            else if (key === 'cover') await addCoverPage();
            else if (key === 'scope_finishes') {
                await addScopeAndDeliverablesExclusionsCombined(order);
                addedScopeDelivExcl = true;
            }
            else if ((key === 'deliverables' || key === 'exclusions') && !addedScopeDelivExcl) {
                await addDeliverablesAndExclusionsPageOnly();
                addedScopeDelivExcl = true;
            }
            else if (key === 'pricing') await addPricingPages();
            else if (key === 'project_timeline') await addProjectTimelinePage();
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        if (currentPdfBlobUrl) URL.revokeObjectURL(currentPdfBlobUrl);
        currentPdfBlobUrl = URL.createObjectURL(blob);

        document.getElementById('pdf-preview-title').textContent = 'Generated Proposal Preview';
        const previewIframe = document.getElementById('pdf-preview-iframe');
        previewIframe.src = currentPdfBlobUrl + '#toolbar=0&navpanes=0&view=FitH';
        await new Promise((resolve) => {
            const done = () => { previewIframe.removeEventListener('load', done); previewIframe.removeEventListener('error', done); resolve(); };
            previewIframe.addEventListener('load', done);
            previewIframe.addEventListener('error', done);
            setTimeout(done, 2000);
        });
        document.getElementById('pdf-preview-modal').classList.remove('hidden');

        const downloadBtn = document.getElementById('modal-download-btn');
        if (downloadBtn) {
            downloadBtn.classList.remove('hidden');
            downloadBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = currentPdfBlobUrl;
                const rawName = document.getElementById('global-biz')?.value;
                a.download = (rawName ? toTitleCase(rawName).replace(/\s+/g, '_') : 'Ten_Works') + '_Proposal.pdf';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };
        }
        const closeBtn = document.getElementById('modal-close-btn');
        if (closeBtn) closeBtn.onclick = closePdfModal;
    } catch (e) {
        console.error(e);
        alert('PDF export failed. ' + (e && e.message ? e.message : String(e)));
    } finally {
        if (overlay) overlay.classList.add('hidden');
        if (wrap) { wrap.style.top = '-9999px'; wrap.style.zIndex = ''; }
    }
}

function closePdfModal() {
    const modal = document.getElementById('pdf-preview-modal');
    const iframe = document.getElementById('pdf-preview-iframe');
    const downloadBtn = document.getElementById('modal-download-btn');
    if (modal) modal.classList.add('hidden');
    if (iframe) iframe.src = '';
    if (downloadBtn) downloadBtn.classList.add('hidden');
    if (currentPdfBlobUrl) {
        URL.revokeObjectURL(currentPdfBlobUrl);
        currentPdfBlobUrl = null;
    }
}

async function saveProposal() {
    const payload = getPayload(); // includes scope_finishes, project_timeline, locations, etc.
    const row = {
        user_id: state.currentUser.id,
        deal_id: state.dealId || null,
        project_id: state.projectId || null,
        title: document.getElementById('global-biz')?.value ?? '',
        client_name: payload.client_name,
        content_json: payload,
        status: 'draft'
    };
    if (state.currentProposalId) {
        const { error } = await supabase.from('proposals_tw').update(row).eq('id', state.currentProposalId);
        if (error) {
            saveToLocalFallback(payload, error);
            return;
        }
        try { localStorage.removeItem('tw_proposal_draft'); } catch (_) {}
        alert('Proposal updated.');
    } else {
        const { data, error } = await supabase.from('proposals_tw').insert(row).select('id').single();
        if (error) {
            saveToLocalFallback(payload, error);
            return;
        }
        state.currentProposalId = data.id;
        try { localStorage.removeItem('tw_proposal_draft'); } catch (_) {}
        alert('Proposal saved.');
    }
    await refreshLoadSelect();
}

function saveToLocalFallback(payload, serverError = null) {
    try {
        localStorage.setItem('tw_proposal_draft', JSON.stringify({ ...payload, updated_at: new Date().toISOString() }));
    } catch (e) {
        alert('Save failed: ' + e.message);
        refreshLoadSelect();
        return;
    }
    const msg = serverError
        ? `Could not save to server (${serverError.code || 'error'}). Your proposal was saved locally as a backup.`
        : 'Saved locally.';
    alert(msg);
    refreshLoadSelect();
}

async function refreshLoadSelect() {
    const sel = document.getElementById('load-select');
    if (!sel) return;
    const current = sel.value;
    let options = '<option value="">— Load proposal —</option>';
    try {
        const { data } = await supabase.from('proposals_tw').select('id, title, client_name, updated_at').eq('user_id', state.currentUser.id).order('updated_at', { ascending: false }).limit(50);
        if (data?.length) options += data.map(p => `<option value="${p.id}">${escapeAttr((p.title || p.client_name || 'Untitled') + ' · ' + (p.updated_at ? new Date(p.updated_at).toLocaleDateString() : ''))}</option>`).join('');
    } catch (_) {}
    const local = localStorage.getItem('tw_proposal_draft');
    if (local) try { const p = JSON.parse(local); options += `<option value="local">${escapeAttr((p.client_name || 'Local draft') + ' (local)')}</option>`; } catch (_) {}
    sel.innerHTML = options;
    if (current) sel.value = current;
}

async function loadProposal() {
    const id = document.getElementById('load-select')?.value;
    if (!id) { alert('Select a proposal to load.'); return; }
    if (id === 'local') {
        const raw = localStorage.getItem('tw_proposal_draft');
        if (!raw) { alert('No local draft found.'); return; }
        try { setPayload(JSON.parse(raw)); } catch (_) { alert('Could not load.'); }
        await refreshLoadSelect();
        return;
    }
    const { data, error } = await supabase.from('proposals_tw').select('*').eq('id', id).single();
    if (error || !data) { alert('Could not load proposal.'); return; }
    state.currentProposalId = data.id;
    state.dealId = data.deal_id || null;
    state.projectId = data.project_id || null;
    setPayload(data.content_json || {});
    await refreshLoadSelect();
    updateShareStatusLinkVisibility();
}

document.addEventListener('DOMContentLoaded', async () => {
    runWhenNavReady(async () => {
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    state.currentUser = user;
    await setupUserMenuAndAuth(supabase, { currentUser: user });
    await setupGlobalSearch(supabase, user);

    const params = new URLSearchParams(window.location.search);
    state.dealId = params.get('deal_id') || null;
    state.projectId = params.get('project_id') || null;

    // Prefer project when both present (e.g. from Projects "Generate Proposal")
    if (state.projectId) await prefillFromProject(state.projectId);
    else if (state.dealId) await prefillFromDeal(state.dealId);
    else if (state.locations.length === 0) addLocationBlock('');

    updateShareStatusLinkVisibility();

    document.getElementById('btn-share-status-link')?.addEventListener('click', async () => {
        if (!state.projectId) return;
        const { data: project, error: fetchErr } = await supabase.from('projects').select('status_token').eq('id', state.projectId).single();
        if (fetchErr || !project) { alert('Could not load project.'); return; }
        let token = project.status_token;
        if (!token) {
            const newToken = crypto.randomUUID();
            const { error: updateErr } = await supabase.from('projects').update({ status_token: newToken }).eq('id', state.projectId);
            if (updateErr) { alert('Could not create share link: ' + updateErr.message); return; }
            token = newToken;
        }
        const url = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}status.html?token=${token}`;
        try {
            await navigator.clipboard.writeText(url);
            alert('Status link copied to clipboard.');
        } catch (_) {
            prompt('Copy this status link for your client:', url);
        }
    });

    renderElementsList();
    renderPricingLocations();
    renderScopeMaterials();
    renderDeliverables();
    renderExclusions();
    renderProjectTimeline();
    renderSnippets();
    updateReadiness();
    await refreshLoadSelect();

    const pdfModal = document.getElementById('pdf-preview-modal');
    if (pdfModal) pdfModal.addEventListener('click', (e) => { if (e.target === pdfModal) closePdfModal(); });

    document.getElementById('btn-save').addEventListener('click', saveProposal);
    document.getElementById('btn-load').addEventListener('click', loadProposal);
    document.getElementById('btn-export-pdf').addEventListener('click', exportPdf);
    document.getElementById('btn-add-location').addEventListener('click', () => addLocationBlock(''));
    const btnAddMaterial = document.getElementById('btn-add-material');
    if (btnAddMaterial) btnAddMaterial.addEventListener('click', addScopeMaterial);
    const btnAddDeliverable = document.getElementById('btn-add-deliverable');
    if (btnAddDeliverable) btnAddDeliverable.addEventListener('click', addDeliverableRow);
    const btnAddExclusion = document.getElementById('btn-add-exclusion');
    if (btnAddExclusion) btnAddExclusion.addEventListener('click', addExclusion);
    document.getElementById('global-biz').addEventListener('input', updateReadiness);
    document.getElementById('sales-rep').addEventListener('input', updateReadiness);
    document.getElementById('cover-letter').addEventListener('input', updateReadiness);
    const scopeNarrative = document.getElementById('scope-narrative');
    if (scopeNarrative) scopeNarrative.addEventListener('input', () => { state.scopeFinishes.narrative = scopeNarrative.value; });

    const heroDropzone = document.getElementById('hero-dropzone');
    const heroUpload = document.getElementById('hero-upload');
    const heroPanEl = document.getElementById('hero-pan');
    if (heroDropzone && heroUpload) {
        const applyHeroPanPreview = () => {
            const pct = (state.heroPan * 100).toFixed(0);
            heroDropzone.style.backgroundPosition = state.heroImage ? `${pct}% center` : 'center';
        };
        const setHeroPreview = (dataUrl) => {
            state.heroImage = dataUrl;
            heroDropzone.style.backgroundImage = dataUrl ? `url(${dataUrl})` : '';
            applyHeroPanPreview();
        };
        heroDropzone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); heroDropzone.classList.add('border-white/40', 'bg-black/30'); });
        heroDropzone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); heroDropzone.classList.remove('border-white/40', 'bg-black/30'); });
        heroDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            heroDropzone.classList.remove('border-white/40', 'bg-black/30');
            const file = e.dataTransfer?.files?.[0];
            if (!file || !file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = () => { setHeroPreview(reader.result); };
            reader.readAsDataURL(file);
        });
        heroDropzone.addEventListener('click', () => heroUpload.click());
        heroUpload.addEventListener('change', () => {
            const file = heroUpload.files?.[0];
            if (!file || !file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = () => { setHeroPreview(reader.result); };
            reader.readAsDataURL(file);
            heroUpload.value = '';
        });
        if (heroPanEl) {
            heroPanEl.value = String(state.heroPan);
            heroPanEl.addEventListener('input', () => {
                state.heroPan = Math.max(0, Math.min(1, parseFloat(heroPanEl.value) || 0.5));
                applyHeroPanPreview();
            });
        }
    }
    }); // runWhenNavReady
});
