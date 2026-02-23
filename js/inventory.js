import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    formatCurrency, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs,
    runWhenNavReady 
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let state = {
    inventory: [],
    allocatedByItem: {},
    totalAllocated: 0,
    openOrders: [],
    filterBy: 'all', // 'all' | 'lowStock' | 'short'
    currentUser: null
};

document.addEventListener("DOMContentLoaded", async () => {
    runWhenNavReady(async () => {
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    state.currentUser = user;
    await setupUserMenuAndAuth(supabase, { currentUser: user });

    document.getElementById('btn-add-item').addEventListener('click', openAddItemModal);
    document.getElementById('inventory-search').addEventListener('input', renderTable);
    document.getElementById('inventory-filter').addEventListener('change', renderTable);
    document.getElementById('kpi-low-stock')?.addEventListener('click', () => { state.filterBy = 'lowStock'; renderTable(); document.getElementById('inventory-table-container')?.scrollIntoView({ behavior: 'smooth' }); });
    document.getElementById('kpi-short')?.addEventListener('click', () => { state.filterBy = 'short'; renderTable(); document.getElementById('inventory-table-container')?.scrollIntoView({ behavior: 'smooth' }); });
    document.getElementById('filter-show-all')?.addEventListener('click', (e) => { e.preventDefault(); state.filterBy = 'all'; renderTable(); });

    await loadInventory();
    });
});

async function loadInventory() {
    const { data, error } = await supabase.from('inventory_items').select('*').order('name');
    if (error) console.error(error);
    state.inventory = data || [];

    const { data: bomRows } = await supabase.from('project_bom').select('inventory_item_id, qty_allocated');
    state.allocatedByItem = {};
    state.totalAllocated = 0;
    (bomRows || []).forEach(row => {
        const id = row.inventory_item_id;
        const qty = Number(row.qty_allocated) || 0;
        state.allocatedByItem[id] = (state.allocatedByItem[id] || 0) + qty;
        state.totalAllocated += qty;
    });

    const { data: orders } = await supabase.from('purchase_orders').select('*, inventory_items(sku, name, uom)').in('status', ['pending', 'ordered']).order('created_at', { ascending: false });
    state.openOrders = orders || [];

    updateMetrics();
    renderTable();
    renderOpenOrdersSection();
}

function updateMetrics() {
    const totalValue = state.inventory.reduce((sum, item) => sum + (item.qty_on_hand * item.cost_per_unit), 0);
    const lowStock = state.inventory.filter(i => (i.reorder_point != null && i.qty_on_hand <= i.reorder_point)).length;
    const short = state.inventory.filter(i => (i.qty_on_hand || 0) - (state.allocatedByItem[i.id] ?? 0) < 0).length;

    document.getElementById('metric-value').textContent = formatCurrency(totalValue);
    document.getElementById('metric-low-stock').textContent = lowStock;
    const elAlloc = document.getElementById('metric-allocated');
    if (elAlloc) elAlloc.textContent = state.totalAllocated;
    const elShort = document.getElementById('metric-short');
    if (elShort) elShort.textContent = short;
}

function renderTable() {
    const search = document.getElementById('inventory-search').value.toLowerCase();
    const cat = document.getElementById('inventory-filter').value;
    const tbody = document.getElementById('inventory-body');
    tbody.innerHTML = '';

    let filtered = state.inventory.filter(i => {
        const matchesSearch = i.name.toLowerCase().includes(search) || (i.sku || '').toLowerCase().includes(search);
        const matchesCat = cat === 'All' || i.category === cat;
        return matchesSearch && matchesCat;
    });
    if (state.filterBy === 'lowStock') {
        filtered = filtered.filter(i => i.reorder_point != null && (i.qty_on_hand || 0) <= i.reorder_point);
    } else if (state.filterBy === 'short') {
        filtered = filtered.filter(i => (i.qty_on_hand || 0) - (state.allocatedByItem[i.id] ?? 0) < 0);
    }

    const filterInd = document.getElementById('filter-indicator');
    const filterLabel = document.getElementById('filter-label');
    if (filterInd && filterLabel) {
        if (state.filterBy === 'lowStock') { filterInd.style.display = 'inline'; filterLabel.textContent = 'Low stock'; }
        else if (state.filterBy === 'short') { filterInd.style.display = 'inline'; filterLabel.textContent = 'Items short'; }
        else { filterInd.style.display = 'none'; }
    }

    filtered.forEach(item => {
        const reorder = item.reorder_point != null ? Number(item.reorder_point) : null;
        const isLow = reorder != null && item.qty_on_hand <= reorder;
        const allocated = state.allocatedByItem[item.id] ?? 0;
        const onHand = Number(item.qty_on_hand) || 0;
        const available = onHand - allocated;
        const isShort = available < 0;
        const uom = item.uom || 'ea';
        const row = document.createElement('tr');
        if (isLow) row.style.background = 'rgba(231, 76, 60, 0.1)';

        row.innerHTML = `
            <td style="font-family:'Rajdhani'; font-weight:600;">${item.sku}</td>
            <td>${item.name}</td>
            <td><span class="badge" style="background:var(--bg-dark); padding:2px 6px; border-radius:4px; font-size:0.8rem;">${item.category}</span></td>
            <td>${item.location || '-'}</td>
            <td style="${isLow ? 'color:var(--danger-red); font-weight:bold;' : ''}">${item.qty_on_hand} ${uom}</td>
            <td>${allocated} ${uom}</td>
            <td style="${isShort ? 'color:var(--danger-red); font-weight:bold;' : ''}">${available} ${uom}</td>
            <td>${formatCurrency(item.cost_per_unit)}</td>
            <td>
                <button class="btn-secondary" style="padding:4px 8px; margin-right:4px;" onclick="window.orderMore(${item.id})" title="Order more"><i class="fas fa-truck"></i></button>
                <button class="btn-secondary" style="padding:4px 8px;" onclick="window.editItem(${item.id})"><i class="fas fa-edit"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderOpenOrdersSection() {
    const section = document.getElementById('open-orders-section');
    const tbody = document.getElementById('open-orders-body');
    const emptyEl = document.getElementById('open-orders-empty');
    if (!section || !tbody) return;
    if (state.openOrders.length === 0) {
        section.style.display = 'block';
        tbody.innerHTML = '';
        const tbl = tbody.closest('table');
        if (tbl) tbl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }
    const table = tbody.closest('table');
    if (table) table.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';
    section.style.display = 'block';
    tbody.innerHTML = state.openOrders.map(po => {
        const inv = po.inventory_items || {};
        const remaining = Math.max(0, Number(po.qty_ordered) - Number(po.qty_received));
        const expected = po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '–';
        return `
            <tr>
                <td><strong>${inv.name || '?'}</strong> <span style="color:var(--text-dim); font-size:0.85rem;">${inv.sku || ''}</span></td>
                <td>${po.qty_ordered} ${inv.uom || 'ea'}</td>
                <td>${po.qty_received} ${inv.uom || 'ea'}</td>
                <td>${expected}</td>
                <td><span style="font-size:0.8rem; color:var(--primary-gold);">${po.status}</span></td>
                <td>
                    ${remaining > 0 ? `<button class="btn-secondary" style="padding:4px 10px; margin-right:4px;" onclick="window.receiveOrder('${po.id}')"><i class="fas fa-box-open"></i> Receive</button>` : ''}
                    <button class="btn-secondary" style="padding:4px 8px; border-color:#773030; color:#ff8888;" onclick="window.cancelOrder('${po.id}')" title="Cancel order"><i class="fas fa-times"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function openOrderMoreModal(item) {
    const reorderQty = item.reorder_point != null ? Math.max(1, Math.ceil(Number(item.reorder_point) - (item.qty_on_hand || 0))) : 1;
    showModal(`Order more: ${item.name}`, `
        <div class="form-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div><label>Qty to order</label><input type="number" id="po-qty" class="form-control" min="1" value="${reorderQty}"></div>
            <div><label>Expected date (optional)</label><input type="date" id="po-expected" class="form-control"></div>
            <div style="grid-column:span 2;"><label>Notes (optional)</label><input type="text" id="po-notes" class="form-control" placeholder="PO number, supplier..."></div>
        </div>
        <button id="btn-po-submit" class="btn-primary" style="width:100%; margin-top:15px;">Create order</button>
    `, () => {});

    setTimeout(() => {
        document.getElementById('btn-po-submit').onclick = async () => {
            const qty = parseFloat(document.getElementById('po-qty').value) || 1;
            const expected = document.getElementById('po-expected').value || null;
            const notes = document.getElementById('po-notes').value?.trim() || null;
            if (qty <= 0) { alert('Enter a quantity.'); return; }
            const { error } = await supabase.from('purchase_orders').insert({
                inventory_item_id: item.id,
                qty_ordered: qty,
                qty_received: 0,
                status: 'ordered',
                expected_date: expected,
                notes
            });
            if (error) { alert('Failed: ' + error.message); return; }
            hideModal();
            await loadInventory();
        };
    }, 100);
}

function openReceiveModal(po) {
    const inv = po.inventory_items || {};
    const remaining = Math.max(0, Number(po.qty_ordered) - Number(po.qty_received));
    showModal(`Receive: ${inv.name || 'Item'}`, `
        <p style="color:var(--text-dim); margin-bottom:12px;">Ordered: ${po.qty_ordered} ${inv.uom || 'ea'}. Already received: ${po.qty_received} ${inv.uom || 'ea'}.</p>
        <div class="form-group">
            <label>Qty to receive now</label>
            <input type="number" id="receive-qty" class="form-control" min="0" step="0.01" value="${remaining}">
        </div>
        <button id="btn-receive-submit" class="btn-primary" style="width:100%; margin-top:15px;">Receive & update stock</button>
    `, () => {});

    setTimeout(() => {
        document.getElementById('btn-receive-submit').onclick = async () => {
            const qty = parseFloat(document.getElementById('receive-qty').value) || 0;
            if (qty <= 0) { hideModal(); return; }
            const item = state.inventory.find(i => i.id === po.inventory_item_id);
            if (!item) { alert('Item not found.'); hideModal(); return; }
            const newOnHand = (Number(item.qty_on_hand) || 0) + qty;
            const newReceived = (Number(po.qty_received) || 0) + qty;
            const newStatus = newReceived >= Number(po.qty_ordered) ? 'received' : 'ordered';

            const { error: errInv } = await supabase.from('inventory_items').update({ qty_on_hand: newOnHand }).eq('id', po.inventory_item_id);
            if (errInv) { alert('Update inventory failed: ' + errInv.message); return; }
            const { error: errPo } = await supabase.from('purchase_orders').update({ qty_received: newReceived, status: newStatus }).eq('id', po.id);
            if (errPo) { alert('Update order failed: ' + errPo.message); return; }
            hideModal();
            await loadInventory();
        };
    }, 100);
}

window.orderMore = (inventoryItemId) => {
    const item = state.inventory.find(i => i.id === inventoryItemId);
    if (item) openOrderMoreModal(item);
};
window.receiveOrder = (poId) => {
    const po = state.openOrders.find(o => o.id === poId);
    if (po) openReceiveModal(po);
};
window.cancelOrder = async (poId) => {
    if (!confirm('Cancel this order line?')) return;
    const { error } = await supabase.from('purchase_orders').update({ status: 'cancelled' }).eq('id', poId);
    if (!error) await loadInventory();
};

const UOM_OPTIONS = ['ea', 'ft', 'lb', 'sheet', 'gal', 'box'];

function openAddItemModal() {
    showModal('Add Inventory Item', `
        <div class="form-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div><label>SKU</label><input type="text" id="inv-sku" class="form-control"></div>
            <div><label>Name</label><input type="text" id="inv-name" class="form-control"></div>
            <div><label>Category</label><select id="inv-cat" class="form-control" style="background:var(--bg-dark); color:white;"><option>Sheet</option><option>Tube</option><option>Hardware</option><option>Finish</option></select></div>
            <div><label>UOM</label><select id="inv-uom" class="form-control" style="background:var(--bg-dark); color:white;">${UOM_OPTIONS.map(u => `<option value="${u}">${u}</option>`).join('')}</select></div>
            <div><label>Location</label><input type="text" id="inv-loc" class="form-control"></div>
            <div><label>Qty On Hand</label><input type="number" id="inv-qty" class="form-control" value="0" min="0"></div>
            <div><label>Reorder Point</label><input type="number" id="inv-reorder" class="form-control" value="0" min="0" placeholder="Low stock alert below this"></div>
            <div><label>Cost Per Unit</label><input type="number" id="inv-cost" class="form-control" value="0.00" step="0.01" min="0"></div>
        </div>
        <button id="btn-save-inv" class="btn-primary" style="width:100%; margin-top:15px;">Save Item</button>
    `, async () => {});

    setTimeout(() => {
        document.getElementById('btn-save-inv').onclick = async () => {
            const sku = document.getElementById('inv-sku').value?.trim();
            const name = document.getElementById('inv-name').value?.trim();
            if (!sku || !name) { alert('SKU and Name are required.'); return; }
            const newItem = {
                sku,
                name,
                category: document.getElementById('inv-cat').value,
                uom: document.getElementById('inv-uom').value || 'ea',
                location: document.getElementById('inv-loc').value?.trim() || null,
                qty_on_hand: Number(document.getElementById('inv-qty').value) || 0,
                reorder_point: Number(document.getElementById('inv-reorder').value) || 0,
                cost_per_unit: Number(document.getElementById('inv-cost').value) || 0
            };
            const { error } = await supabase.from('inventory_items').insert(newItem);
            if (error) { alert('Save failed: ' + error.message); return; }
            hideModal();
            await loadInventory();
        };
    }, 100);
}

function openEditItemModal(item) {
    const uomOptions = UOM_OPTIONS.map(u => `<option value="${u}" ${(item.uom || 'ea') === u ? 'selected' : ''}>${u}</option>`).join('');
    showModal('Edit Inventory Item', `
        <div class="form-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div><label>SKU</label><input type="text" id="inv-sku" class="form-control" value="${(item.sku || '').replace(/"/g, '&quot;')}"></div>
            <div><label>Name</label><input type="text" id="inv-name" class="form-control" value="${(item.name || '').replace(/"/g, '&quot;')}"></div>
            <div><label>Category</label><select id="inv-cat" class="form-control" style="background:var(--bg-dark); color:white;"><option value="Sheet" ${item.category === 'Sheet' ? 'selected' : ''}>Sheet</option><option value="Tube" ${item.category === 'Tube' ? 'selected' : ''}>Tube</option><option value="Hardware" ${item.category === 'Hardware' ? 'selected' : ''}>Hardware</option><option value="Finish" ${item.category === 'Finish' ? 'selected' : ''}>Finish</option></select></div>
            <div><label>UOM</label><select id="inv-uom" class="form-control" style="background:var(--bg-dark); color:white;">${uomOptions}</select></div>
            <div><label>Location</label><input type="text" id="inv-loc" class="form-control" value="${(item.location || '').replace(/"/g, '&quot;')}"></div>
            <div><label>Qty On Hand</label><input type="number" id="inv-qty" class="form-control" value="${Number(item.qty_on_hand) || 0}" min="0"></div>
            <div><label>Reorder Point</label><input type="number" id="inv-reorder" class="form-control" value="${Number(item.reorder_point) ?? ''}" min="0" placeholder="Low stock alert below this"></div>
            <div><label>Cost Per Unit</label><input type="number" id="inv-cost" class="form-control" value="${Number(item.cost_per_unit) || 0}" step="0.01" min="0"></div>
        </div>
        <button id="btn-save-inv" class="btn-primary" style="width:100%; margin-top:15px;">Save Changes</button>
    `, async () => {});

    setTimeout(() => {
        document.getElementById('btn-save-inv').onclick = async () => {
            const sku = document.getElementById('inv-sku').value?.trim();
            const name = document.getElementById('inv-name').value?.trim();
            if (!sku || !name) { alert('SKU and Name are required.'); return; }
            const reorderVal = document.getElementById('inv-reorder').value;
            const update = {
                sku,
                name,
                category: document.getElementById('inv-cat').value,
                uom: document.getElementById('inv-uom').value || 'ea',
                location: document.getElementById('inv-loc').value?.trim() || null,
                qty_on_hand: Number(document.getElementById('inv-qty').value) || 0,
                reorder_point: reorderVal === '' || reorderVal == null ? null : Number(reorderVal),
                cost_per_unit: Number(document.getElementById('inv-cost').value) || 0
            };
            const { error } = await supabase.from('inventory_items').update(update).eq('id', item.id);
            if (error) { alert('Update failed: ' + error.message); return; }
            hideModal();
            await loadInventory();
        };
    }, 100);
}

window.editItem = (id) => {
    const item = state.inventory.find(i => i.id === id);
    if (!item) return;
    openEditItemModal(item);
};
