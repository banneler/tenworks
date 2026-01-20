import { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    formatCurrency, 
    showModal, 
    hideModal, 
    setupUserMenuAndAuth, 
    loadSVGs 
} from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let state = {
    inventory: [],
    currentUser: null
};

document.addEventListener("DOMContentLoaded", async () => {
    await loadSVGs();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }
    state.currentUser = user;
    await setupUserMenuAndAuth(supabase, { currentUser: user });

    document.getElementById('btn-add-item').addEventListener('click', openAddItemModal);
    document.getElementById('inventory-search').addEventListener('input', renderTable);
    document.getElementById('inventory-filter').addEventListener('change', renderTable);

    await loadInventory();
});

async function loadInventory() {
    const { data, error } = await supabase.from('inventory_items').select('*').order('name');
    if(error) console.error(error);
    state.inventory = data || [];
    updateMetrics();
    renderTable();
}

function updateMetrics() {
    const totalValue = state.inventory.reduce((sum, item) => sum + (item.qty_on_hand * item.cost_per_unit), 0);
    const lowStock = state.inventory.filter(i => i.qty_on_hand <= i.reorder_point).length;
    
    document.getElementById('metric-value').textContent = formatCurrency(totalValue);
    document.getElementById('metric-low-stock').textContent = lowStock;
}

function renderTable() {
    const search = document.getElementById('inventory-search').value.toLowerCase();
    const cat = document.getElementById('inventory-filter').value;
    const tbody = document.getElementById('inventory-body');
    tbody.innerHTML = '';

    const filtered = state.inventory.filter(i => {
        const matchesSearch = i.name.toLowerCase().includes(search) || i.sku.toLowerCase().includes(search);
        const matchesCat = cat === 'All' || i.category === cat;
        return matchesSearch && matchesCat;
    });

    filtered.forEach(item => {
        const isLow = item.qty_on_hand <= item.reorder_point;
        const row = document.createElement('tr');
        if(isLow) row.style.background = 'rgba(231, 76, 60, 0.1)'; // Red tint for low stock

        row.innerHTML = `
            <td style="font-family:'Rajdhani'; font-weight:600;">${item.sku}</td>
            <td>${item.name}</td>
            <td><span class="badge" style="background:var(--bg-dark); padding:2px 6px; border-radius:4px; font-size:0.8rem;">${item.category}</span></td>
            <td>${item.location || '-'}</td>
            <td style="${isLow ? 'color:var(--danger-red); font-weight:bold;' : ''}">${item.qty_on_hand} ${item.uom}</td>
            <td style="color:var(--text-dim);">0 (Sim)</td>
            <td>${formatCurrency(item.cost_per_unit)}</td>
            <td>
                <button class="btn-secondary" style="padding:4px 8px;" onclick="window.editItem(${item.id})"><i class="fas fa-edit"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function openAddItemModal() {
    showModal('Add Inventory Item', `
        <div class="form-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div><label>SKU</label><input type="text" id="inv-sku" class="form-control"></div>
            <div><label>Name</label><input type="text" id="inv-name" class="form-control"></div>
            <div><label>Category</label><select id="inv-cat" class="form-control" style="background:var(--bg-dark); color:white;"><option>Sheet</option><option>Tube</option><option>Hardware</option><option>Finish</option></select></div>
            <div><label>Location</label><input type="text" id="inv-loc" class="form-control"></div>
            <div><label>Qty On Hand</label><input type="number" id="inv-qty" class="form-control" value="0"></div>
            <div><label>Cost Per Unit</label><input type="number" id="inv-cost" class="form-control" value="0.00" step="0.01"></div>
        </div>
        <button id="btn-save-inv" class="btn-primary" style="width:100%; margin-top:15px;">Save Item</button>
    `, async () => {
        // Validation logic here
    });

    setTimeout(() => {
        document.getElementById('btn-save-inv').onclick = async () => {
            const newItem = {
                sku: document.getElementById('inv-sku').value,
                name: document.getElementById('inv-name').value,
                category: document.getElementById('inv-cat').value,
                location: document.getElementById('inv-loc').value,
                qty_on_hand: document.getElementById('inv-qty').value,
                cost_per_unit: document.getElementById('inv-cost').value
            };
            await supabase.from('inventory_items').insert(newItem);
            hideModal();
            loadInventory();
        };
    }, 100);
}

// Make globally accessible for the onclick in HTML
window.editItem = (id) => {
    alert("Edit feature coming in V2! (ID: " + id + ")");
};
