// js/deals.js
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    formatMonthYear,
    formatMonthYearShort,
    formatCurrencyK,
    formatCurrency,
    getStageDisplayName,
    getDealStageColorClass,
    getDealValue,
    getElementsPillHtml,
    getKanbanDealCardContent,
    DEAL_ELEMENTS_LIST as ELEMENTS_LIST,
    escapeNotesForHtml,
    setupModalListeners,
    showModal,
    hideModal,
    showToast,
    updateActiveNavLink,
    setupUserMenuAndAuth,
    loadSVGs,
    setupGlobalSearch,
    checkAndSetNotifications,
    runWhenNavReady,
    hideGlobalLoader
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        deals: [],
        accounts: [],
        dealStages: [],
        dealsSortBy: "name",
        dealsSortDir: "asc",
        dealsViewMode: 'all',
        currentView: 'list',
        showClosedLost: false,
        currentUserQuota: 0,
        allUsersQuotas: [],
        dealsByStageChart: null,
        dealsByTimeChart: null,
        dealsByElementChart: null,
        filterStage: '',
        filterCloseMonth: '',
        filterCommitted: '',
        closeMonthOffset: 0
    };

    // --- DOM Element Selectors ---
    const dealsByStageCanvas = document.getElementById('deals-by-stage-chart');
    const stageChartEmptyMessage = document.getElementById('chart-empty-message');
    const dealsByTimeCanvas = document.getElementById('deals-by-time-chart');
    const timeChartEmptyMessage = document.getElementById('time-chart-empty-message');
    const dealsTableBody = document.querySelector("#deals-table tbody");
    const metricCurrentCommit = document.getElementById("metric-current-commit");
    const metricBestCase = document.getElementById("metric-best-case");
    const metricFunnel = document.getElementById("metric-funnel");
    const metricClosedWon = document.getElementById("metric-closed-won");
    const metricCurrentCommitTitle = document.getElementById("metric-current-commit-title");
    const metricBestCaseTitle = document.getElementById("metric-best-case-title");
    const commitTotalQuota = document.getElementById("commit-total-quota");
    const bestCaseTotalQuota = document.getElementById("best-case-total-quota");

    // Selectors for view toggle and containers
    const listViewContainer = document.getElementById('list-view-container');
    const kanbanBoardView = document.getElementById('kanban-board-view');
    const listViewBtn = document.getElementById('list-view-btn');
    const boardViewBtn = document.getElementById('board-view-btn');
    const dealsByStageChartContainer = document.getElementById('deals-by-stage-chart-container');

    const toggleClosedLost = document.getElementById('show-closed-lost');
    const listViewClosedLostRow = document.getElementById('list-view-closed-lost-row');
    const filterStagePills = document.getElementById('filter-stage-pills');
    const filterCloseMonthPills = document.getElementById('filter-close-month-pills');
    const filterCloseMonthScroll = document.getElementById('filter-close-month-scroll');
    const closeMonthPrevBtn = document.getElementById('close-month-prev');
    const closeMonthNextBtn = document.getElementById('close-month-next');
    const filterCommittedPills = document.getElementById('filter-committed-pills');
    const dealsFiltersResetBtn = document.getElementById('deals-filters-reset');
    const addDealBtn = document.getElementById('add-deal-btn');
    const dealsByProductCanvas = document.getElementById('deals-by-product-chart');
    const productChartEmptyMessage = document.getElementById('product-chart-empty-message');

    function initTomSelect(el, opts = {}) {
        if (!el || typeof window.TomSelect === "undefined") return null;
        try {
            return new window.TomSelect(el, { create: false, ...opts });
        } catch (e) {
            return null;
        }
    }
    const tomSelectNoSearchOpts = () => ({
        render: { dropdown: () => { const d = document.createElement("div"); d.className = "ts-dropdown tom-select-no-search"; return d; } }
    });

    // --- Data Fetching ---
    async function loadAllData() {
        if (!state.currentUser) {
            hideGlobalLoader();
            return;
        }

        const isManager = state.currentUser.user_metadata?.is_manager === true;
        const isTeamView = state.dealsViewMode === 'all' && isManager;

        // Deals table: public.deals_tw
        const dealsQuery = supabase.from("deals_tw").select("*");
        const accountsQuery = supabase.from("accounts").select("*");
        const dealStagesQuery = supabase.from("deal_stages").select("stage_name, sort_order").order('sort_order');
        
        if (!isTeamView) {
            dealsQuery.eq("user_id", state.currentUser.id);
            accountsQuery.eq("user_id", state.currentUser.id);
        }

        const currentUserQuotaQuery = supabase.from("user_quotas").select("monthly_quota").eq("user_id", state.currentUser.id);
        let allQuotasQuery = isManager ? supabase.from("user_quotas").select("monthly_quota") : Promise.resolve({ data: [], error: null });

        const promises = [dealsQuery, accountsQuery, currentUserQuotaQuery, dealStagesQuery, allQuotasQuery];
        const allTableNames = ["deals", "accounts", "currentUserQuota", "dealStages", "allUsersQuotas"];
        
        try {
            const results = await Promise.allSettled(promises);
            results.forEach((result, index) => {
                const tableName = allTableNames[index];
                if (result.status === "fulfilled" && !result.value.error) {
                    if (tableName === "currentUserQuota") {
                        state.currentUserQuota = result.value.data?.[0]?.monthly_quota || 0;
                    } else {
                        state[tableName] = result.value.data || [];
                    }
                } else {
                    console.error(`Error fetching ${tableName}:`, result.status === 'fulfilled' ? result.value.error?.message : result.reason);
                }
            });
        } catch (error) {
            console.error("Critical error in loadAllData:", error);
        } finally {
            hideGlobalLoader();
            populateDealsFilters();
            renderAll();
        }
    }

    // --- Chart Colors & Helpers ---
    function createChartGradient(ctx, chartArea, index, totalDatasets) {
        if (!chartArea || !ctx) return 'rgba(0,0,0,0.5)';
        
        // TenWorks Gold Palette (Metallic/Industrial Golds)
        const palette = [
            '#D4AF37', // Classic Gold
            '#C5A028', // Deep Gold
            '#E5C150', // Bright Gold
            '#B69121', // Dark Gold
            '#F1D06E'  // Pale Gold
        ];
        
        const baseColor = palette[index % palette.length];
        const lightenColor = (color, percent) => {
            const f=parseInt(color.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent,R=f>>16,G=f>>8&0x00FF,B=f&0x0000FF;
            return "#"+(0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
        }
        const gradient = ctx.createLinearGradient(chartArea.left, chartArea.top, chartArea.right, chartArea.bottom);
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(1, lightenColor(baseColor, 0.3));
        return gradient;
    }

    function getFutureDeals() {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        return state.deals.filter(deal => {
            if (!deal.close_month) return true;
            const [dealYear, dealMonth] = deal.close_month.split('-').map(Number);
            return dealYear > currentYear || (dealYear === currentYear && dealMonth >= currentMonth);
        });
    }

    function toggleElementInList(dealId, element) {
        const deal = state.deals.find(d => d.id === dealId);
        if (!deal) return;
        const current = (deal.elements || '').split(',').map(p => p.trim()).filter(Boolean);
        const set = new Set(current.map(p => p.toLowerCase()));
        const elLower = element.toLowerCase();
        if (set.has(elLower)) {
            set.delete(elLower);
        } else {
            set.add(elLower);
        }
        const newList = ELEMENTS_LIST.filter(el => set.has(el.toLowerCase()));
        const newValue = newList.join(', ');
        return newValue;
    }

    async function saveDealElements(dealId, elementsValue) {
        const payload = { elements: elementsValue == null ? null : String(elementsValue) };
        const { data, error } = await supabase.from('deals_tw').update(payload).eq('id', dealId).select('id, elements');
        if (error) {
            showToast('Error updating elements: ' + error.message, 'error');
            return false;
        }
        if (!data || data.length === 0) {
            showToast('Could not update deal. You may not have permission.', 'error');
            return false;
        }
        const deal = state.deals.find(d => d.id === dealId);
        if (deal) deal.elements = data[0].elements;
        render();
        renderDealsByElementChart();
        return true;
    }

    /** Pipeline by Element chart: theme gold variations. Border color is card bg to create segment spacing. */
    function getElementChartColor(label) {
        const l = (label || '').toLowerCase();
        const gapColor = '#252a30'; // --card-bg, shows as padding between segments
        if (l.includes('steel')) return { bg: '#8b7355', border: gapColor };       // bronze
        if (l.includes('aluminum')) return { bg: '#9a8570', border: gapColor };    // muted gold
        if (l.includes('glass')) return { bg: '#a89278', border: gapColor };       // light bronze
        if (l.includes('powdercoat')) return { bg: '#b38c62', border: gapColor };   // primary gold
        if (l.includes('paint')) return { bg: '#c9a87a', border: gapColor };        // lighter gold
        if (l.includes('structural')) return { bg: '#8b6914', border: gapColor };   // dark gold
        if (l.includes('wood')) return { bg: '#d4b896', border: gapColor };         // pale gold
        return { bg: '#9a8570', border: gapColor };
    }

    function renderDealsByElementChart() {
        if (!dealsByProductCanvas || !productChartEmptyMessage) return;
        const openDeals = getFilteredDeals().filter(deal => deal.stage !== 'Closed Won' && deal.stage !== 'Closed Lost');
        const countByElement = {};
        openDeals.forEach(deal => {
            if (!deal.elements || !deal.elements.trim()) {
                countByElement['Uncategorized'] = (countByElement['Uncategorized'] || 0) + 1;
                return;
            }
            const elements = deal.elements.split(',').map(p => p.trim()).filter(p => p);
            const seen = new Set();
            elements.forEach(p => {
                const lower = p.toLowerCase();
                const normalized = ELEMENTS_LIST.find(el => el.toLowerCase() === lower) || 'Uncategorized';
                if (!seen.has(normalized)) {
                    seen.add(normalized);
                    countByElement[normalized] = (countByElement[normalized] || 0) + 1;
                }
            });
        });
        if (Object.keys(countByElement).length === 0) {
            dealsByProductCanvas.classList.add('hidden');
            productChartEmptyMessage.classList.remove('hidden');
            if (state.dealsByElementChart) { state.dealsByElementChart.destroy(); state.dealsByElementChart = null; }
            return;
        }
        dealsByProductCanvas.classList.remove('hidden');
        productChartEmptyMessage.classList.add('hidden');
        const sortedElements = Object.entries(countByElement).sort(([, a], [, b]) => b - a);
        const labels = sortedElements.map(([p]) => p);
        const data = sortedElements.map(([, count]) => count);
        const backgroundColors = labels.map(l => getElementChartColor(l).bg);
        const borderColors = labels.map(l => getElementChartColor(l).border);
        if (state.dealsByElementChart) state.dealsByElementChart.destroy();
        state.dealsByElementChart = new Chart(dealsByProductCanvas, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: backgroundColors, borderColor: borderColors, borderWidth: 4 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                spacing: 2,
                plugins: {
                    legend: { position: 'right', labels: { color: '#b0b0b0', font: { size: 11 } } },
                    tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed} project${c.parsed === 1 ? '' : 's'}` } }
                }
            }
        });
    }

    function getFunnelDeals() {
        const futureDeals = getFutureDeals();
        return futureDeals.filter(deal => {
            if (deal.stage === 'Closed Won') return false;
            if (deal.stage === 'Closed Lost' && !state.showClosedLost) return false;
            return true;
        });
    }

    /** List view: always show current month (all stages) and future; past closed lost only when "Show closed lost" is on. */
    function getBaseDeals() {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        const isClosedLost = (d) => (d.stage || '').toLowerCase().includes('closed lost') || (d.stage || '').toLowerCase().includes('lost');
        return state.deals.filter(deal => {
            if (!deal.close_month) return true;
            const [dealYear, dealMonth] = deal.close_month.split('-').map(Number);
            const isCurrentMonth = dealYear === currentYear && dealMonth === currentMonth;
            const isFuture = dealYear > currentYear || (dealYear === currentYear && dealMonth > currentMonth);
            if (isCurrentMonth || isFuture) return true;
            return isClosedLost(deal) && state.showClosedLost;
        });
    }

    function getFilteredDeals() {
        let deals = getBaseDeals();
        if (state.filterStage) deals = deals.filter(d => d.stage === state.filterStage);
        if (state.filterCloseMonth) deals = deals.filter(d => d.close_month === state.filterCloseMonth);
        if (state.filterCommitted === 'yes') deals = deals.filter(d => d.is_committed);
        if (state.filterCommitted === 'no') deals = deals.filter(d => !d.is_committed);
        return deals;
    }

    function createFilterPill(value, label, active) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'deals-filter-pill' + (active ? ' active' : '');
        btn.dataset.value = value;
        btn.textContent = label;
        return btn;
    }

    function getCloseMonthRange() {
        const now = new Date();
        const months = [];
        for (let i = -12; i <= 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        return months;
    }

    function populateDealsFilters() {
        if (filterStagePills) {
            filterStagePills.innerHTML = '';
            const stages = (state.dealStages || []).sort((a, b) => a.sort_order - b.sort_order);
            filterStagePills.appendChild(createFilterPill('', 'All', !state.filterStage));
            stages.forEach(s => {
                const name = s.stage_name || '';
                filterStagePills.appendChild(createFilterPill(name, name, state.filterStage === name));
            });
        }
        if (filterCloseMonthPills) {
            filterCloseMonthPills.innerHTML = '';
            filterCloseMonthPills.appendChild(createFilterPill('', 'All', !state.filterCloseMonth));
            const months = getCloseMonthRange();
            months.forEach(m => filterCloseMonthPills.appendChild(createFilterPill(m, formatMonthYear(m), state.filterCloseMonth === m)));
            if (filterCloseMonthScroll) {
                requestAnimationFrame(() => {
                    const pills = filterCloseMonthPills.querySelectorAll('.deals-filter-pill[data-value]');
                    const firstMonthPill = Array.from(pills).find(p => p.dataset.value);
                    const step = firstMonthPill ? firstMonthPill.offsetWidth + 4 : 80;
                    const baseIndex = 11;
                    const targetIndex = Math.max(0, Math.min(baseIndex + state.closeMonthOffset, months.length - 3));
                    filterCloseMonthScroll.scrollLeft = targetIndex * step;
                });
            }
        }
        if (filterCommittedPills) {
            filterCommittedPills.innerHTML = '';
            [['', 'All'], ['yes', 'Committed'], ['no', 'Uncommitted']].forEach(([val, lbl]) =>
                filterCommittedPills.appendChild(createFilterPill(val, lbl, state.filterCommitted === val))
            );
        }
        if (toggleClosedLost) toggleClosedLost.checked = state.showClosedLost;
    }
    
    const renderAll = () => {
        render();
        renderDealsMetrics();
        renderDealsByStageChart();
        renderDealsByTimeChart();
        renderDealsByElementChart();
    };

    const render = () => {
        if (state.currentView === 'list') {
            renderDealsPage();
            listViewContainer.classList.remove('hidden');
            kanbanBoardView.classList.add('hidden');
            dealsByStageChartContainer.classList.remove('hidden');
            if (listViewClosedLostRow) listViewClosedLostRow.classList.remove('hidden');
        } else {
            renderKanbanBoard();
            listViewContainer.classList.add('hidden');
            kanbanBoardView.classList.remove('hidden');
            dealsByStageChartContainer.classList.add('hidden');
            if (listViewClosedLostRow) listViewClosedLostRow.classList.add('hidden');
        }
    };

    // --- Render Functions ---
    function renderDealsByStageChart() {
        if (!dealsByStageCanvas || !stageChartEmptyMessage) return;

        const openDeals = getFilteredDeals().filter(deal => deal.stage !== 'Closed Won' && deal.stage !== 'Closed Lost'); 

        if (openDeals.length === 0) {
            dealsByStageCanvas.classList.add('hidden');
            stageChartEmptyMessage.classList.remove('hidden');
            if (state.dealsByStageChart) { state.dealsByStageChart.destroy(); state.dealsByStageChart = null; }
            return;
        }
        dealsByStageCanvas.classList.remove('hidden');
        stageChartEmptyMessage.classList.add('hidden');
        
        // Use Value for aggregation
        const stageValue = openDeals.reduce((acc, deal) => {
            const stage = deal.stage || 'Uncategorized';
            acc[stage] = (acc[stage] || 0) + getDealValue(deal);
            return acc;
        }, {});
        
        const sortedStages = Object.entries(stageValue).sort(([, a], [, b]) => a - b);
        const labels = sortedStages.map(([stage]) => stage);
        const data = sortedStages.map(([, val]) => val);
        
        const isManager = state.currentUser.user_metadata?.is_manager === true;
        const isMyTeamView = state.dealsViewMode === 'all' && isManager;
        const effectiveMonthlyQuota = isMyTeamView ? state.allUsersQuotas.reduce((sum, quota) => sum + (quota.monthly_quota || 0), 0) : state.currentUserQuota;
        
        if (state.dealsByStageChart) state.dealsByStageChart.destroy();
        state.dealsByStageChart = new Chart(dealsByStageCanvas, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Value by Stage', data, backgroundColor: (c) => createChartGradient(c.chart.ctx, c.chart.chartArea, c.dataIndex, labels.length), borderColor: 'var(--bg-light)', borderWidth: 1, borderRadius: 5 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (c) => `Value: ${formatCurrency(c.parsed.x)}` } },
                    annotation: { annotations: { quotaLine: { type: 'line', scaleID: 'x', value: effectiveMonthlyQuota, borderColor: 'red', borderWidth: 2, borderDash: [6, 6] } } }
                },
                scales: { x: { ticks: { color: '#b0b0b0', callback: (v) => formatCurrencyK(v) }, grid: { color: '#b0b0b0' } }, y: { ticks: { color: '#b0b0b0' }, grid: { display: false } } }
            }
        });
    }

    function renderDealsByTimeChart() {
        if (!dealsByTimeCanvas || !timeChartEmptyMessage) return;
        
        const openDeals = getFilteredDeals().filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost' && d.close_month);

        if (openDeals.length === 0) {
            dealsByTimeCanvas.classList.add('hidden');
            timeChartEmptyMessage.classList.remove('hidden');
            if (state.dealsByTimeChart) { state.dealsByTimeChart.destroy(); state.dealsByTimeChart = null; }
            return;
        }
        dealsByTimeCanvas.classList.remove('hidden');
        timeChartEmptyMessage.classList.add('hidden');
        const today = new Date(), currentYear = today.getFullYear(), currentMonth = today.getMonth();
        const funnel = { '0-30 Days': 0, '31-60 Days': 0, '61-90 Days': 0, '90+ Days': 0 };
        openDeals.forEach(deal => {
            const [dealYear, dealMonth] = deal.close_month.split('-').map(Number);
            const monthDiff = (dealYear - currentYear) * 12 + (dealMonth - 1 - currentMonth);
            if (monthDiff === 0) { funnel['0-30 Days'] += getDealValue(deal); }
            else if (monthDiff === 1) { funnel['31-60 Days'] += getDealValue(deal); }
            else if (monthDiff === 2) { funnel['61-90 Days'] += getDealValue(deal); }
            else if (monthDiff > 2) { funnel['90+ Days'] += getDealValue(deal); }
        });
        const labels = Object.keys(funnel), data = Object.values(funnel);
        const isManager = state.currentUser.user_metadata?.is_manager === true;
        const isMyTeamView = state.dealsViewMode === 'all' && isManager;
        const effectiveMonthlyQuota = isMyTeamView ? state.allUsersQuotas.reduce((sum, quota) => sum + (quota.monthly_quota || 0), 0) : state.currentUserQuota;
        
        if (state.dealsByTimeChart) state.dealsByTimeChart.destroy();
        state.dealsByTimeChart = new Chart(dealsByTimeCanvas, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: (c) => createChartGradient(c.chart.ctx, c.chart.chartArea, c.dataIndex, labels.length), borderColor: 'var(--bg-light)', borderWidth: 1, borderRadius: 5 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (c) => `Value: ${formatCurrency(c.parsed.x)}` } },
                    annotation: { annotations: { quotaLine: { type: 'line', scaleID: 'x', value: effectiveMonthlyQuota, borderColor: 'red', borderWidth: 2, borderDash: [6, 6] } } }
                },
                scales: { x: { ticks: { color: '#b0b0b0', callback: (v) => formatCurrencyK(v) }, grid: { color: '#b0b0b0' } }, y: { ticks: { color: '#b0b0b0' }, grid: { display: false }, barPercentage: 0.7, categoryPercentage: 0.6 } }
            }
        });
    }

    const esc = (s) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    async function saveDealField(dealId, field, value) {
        const deal = state.deals.find((d) => d.id === dealId);
        if (!deal) return;
        const prev = deal[field];
        if (String(prev) === String(value)) return;
        if (field === 'name' && !(value || '').trim()) return showToast('Deal name is required.', 'error');
        let updateVal = value;
        if (field === 'value') updateVal = parseFloat(value) || 0;
        if (field === 'account_id') updateVal = value ? Number(value) : null;
        const { error } = await supabase.from('deals_tw').update({ [field]: updateVal }).eq('id', dealId);
        if (error) {
            showToast('Error saving: ' + error.message, 'error');
        } else {
            deal[field] = updateVal;
            if (field === 'account_id') deal.account_name = updateVal ? state.accounts.find((a) => a.id === updateVal)?.name || 'N/A' : 'N/A';
            renderDealsPage();
        }
    }

    function enterSelectMode(cell) {
        const dealId = Number(cell.dataset.dealId);
        const field = cell.dataset.field;
        const deal = state.deals.find((d) => d.id === dealId);
        if (!deal) return;
        if (field === 'account_id') {
            const opts = state.accounts
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map((a) => `<option value="${a.id}" ${deal.account_id === a.id ? 'selected' : ''}>${(a.name || '').replace(/</g, '&lt;')}</option>`)
                .join('');
            cell.innerHTML = `<select class="deal-inline-select"><option value="">--</option>${opts}</select>`;
            const sel = cell.querySelector('select');
            if (sel && typeof window.TomSelect !== "undefined") try { initTomSelect(sel, tomSelectNoSearchOpts()); } catch (e) {}
            sel.focus();
            sel.onblur = async () => {
                const v = sel.tomselect ? sel.tomselect.getValue() : sel.value;
                await saveDealField(dealId, field, v);
                renderDealsPage();
            };
            sel.onchange = () => sel.blur();
        } else if (field === 'stage') {
            const stages = state.dealStages.sort((a, b) => a.sort_order - b.sort_order);
            const currentStage = deal.stage || '';
            const wrap = document.createElement('div');
            wrap.className = 'deal-card-stage-fan-wrap';
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = `deal-card-stage-trigger ${getDealStageColorClass(currentStage)}`;
            trigger.innerHTML = `${getStageDisplayName(currentStage) || 'Stage'} <i class="fas fa-chevron-down deal-card-stage-chevron"></i>`;
            wrap.appendChild(trigger);
            const fan = document.createElement('div');
            fan.className = 'deal-card-stage-fan';
            const total = stages.length;
            const spread = Math.min(120, Math.max(60, (total - 1) * 25));
            const startAngle = 90 + spread / 2;
            let isSaved = false;
            const closeFan = () => {
                wrap.classList.remove('open');
                document.removeEventListener('click', closeFan);
                if (!isSaved) setTimeout(() => renderDealsPage(), 150);
            };
            stages.forEach((s, i) => {
                const angle = total <= 1 ? 90 : startAngle - (spread * i) / (total - 1);
                const pill = document.createElement('button');
                pill.type = 'button';
                pill.className = `deal-card-stage-pill ${getDealStageColorClass(s.stage_name)}`;
                pill.textContent = getStageDisplayName(s.stage_name);
                pill.dataset.stage = s.stage_name;
                pill.style.setProperty('--fan-angle', `${angle}deg`);
                pill.style.setProperty('--fan-i', `${i}`);
                pill.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    isSaved = true;
                    closeFan();
                    await saveDealField(dealId, field, s.stage_name);
                    renderDealsPage();
                });
                fan.appendChild(pill);
            });
            wrap.appendChild(fan);
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (wrap.classList.contains('open')) {
                    closeFan();
                } else {
                    wrap.classList.add('open');
                    setTimeout(() => document.addEventListener('click', closeFan), 0);
                }
            });
            wrap.addEventListener('click', (e) => e.stopPropagation());
            cell.innerHTML = '';
            cell.appendChild(wrap);
            trigger.click();
        }
    }

    function enterNumberMode(cell) {
        const dealId = Number(cell.dataset.dealId);
        const deal = state.deals.find((d) => d.id === dealId);
        if (!deal) return;
        const val = getDealValue(deal) || 0;
        cell.innerHTML = `<input type="number" class="deal-inline-input" value="${val}" min="0" step="0.01">`;
        const inp = cell.querySelector('input');
        inp.focus();
        inp.onblur = async () => {
            await saveDealField(dealId, 'value', inp.value);
            renderDealsPage();
        };
    }

    function enterMonthMode(cell) {
        const dealId = Number(cell.dataset.dealId);
        const deal = state.deals.find((d) => d.id === dealId);
        if (!deal) return;
        const val = deal.close_month || '';
        cell.innerHTML = `<input type="month" class="deal-inline-input" value="${val}">`;
        const inp = cell.querySelector('input');
        inp.focus();
        inp.onblur = async () => {
            await saveDealField(dealId, 'close_month', inp.value);
            renderDealsPage();
        };
    }

    const renderDealsPage = () => {
        if (!dealsTableBody) return;

        const dealsForList = getFilteredDeals();
        const dealsWithAccount = dealsForList.map((deal) => ({
            ...deal,
            account_name: state.accounts.find((a) => a.id === deal.account_id)?.name || "N/A"
        }));

        dealsWithAccount.sort((a, b) => {
            const valA = a[state.dealsSortBy], valB = b[state.dealsSortBy];
            const comparison = (typeof valA === "string") ? (valA || "").localeCompare(valB || "") : (valA > valB ? 1 : -1);
            return state.dealsSortDir === "desc" ? comparison * -1 : comparison;
        });

        dealsTableBody.innerHTML = "";

        dealsWithAccount.forEach((deal) => {
            const row = dealsTableBody.insertRow();
            const stageClass = getDealStageColorClass(deal.stage);
            row.innerHTML = `
                <td class="deal-cell-committed"><input type="checkbox" class="commit-deal-checkbox" data-deal-id="${deal.id}" ${deal.is_committed ? "checked" : ""}></td>
                <td class="deal-cell-editable deal-cell-select deal-cell-stage align-middle text-center w-32" data-deal-id="${deal.id}" data-field="stage" data-display="${esc(getStageDisplayName(deal.stage))}"><span class="deal-list-stage-pill ${stageClass}">${esc(getStageDisplayName(deal.stage)) || "Stage"}</span></td>
                <td class="deal-cell-editable deal-cell-month align-middle text-center w-40" data-deal-id="${deal.id}" data-field="close_month">${deal.close_month ? formatMonthYearShort(deal.close_month) : ""}</td>
                <td class="deal-cell-details align-middle">
                    <span class="deal-list-account deal-cell-editable deal-cell-select" data-deal-id="${deal.id}" data-field="account_id" data-display="${esc(deal.account_name)}" data-placeholder="Select Account">${esc(deal.account_name)}</span><br>
                    <span class="deal-list-name deal-cell-editable" contenteditable="true" data-deal-id="${deal.id}" data-field="name" data-placeholder="Deal Name">${esc(deal.name)}</span>
                </td>
                <td class="deal-cell-elements align-middle"><div class="deal-list-elements" data-deal-id="${deal.id}">${getElementsPillHtml(deal.id, deal.elements)}</div></td>
                <td class="deal-cell-editable deal-cell-number align-middle text-center font-bold text-[var(--primary-blue)] w-28" data-deal-id="${deal.id}" data-field="value">${formatCurrency(getDealValue(deal))}</td>
                <td class="deal-cell-notes align-middle min-w-[16rem] w-full p-0"><div class="deal-notes-cell-inner deal-cell-editable text-[0.8rem]" contenteditable="true" data-deal-id="${deal.id}" data-field="notes" data-placeholder="Job Details">${esc((deal.notes || '').replace(/\n/g, ' '))}</div></td>
                <td class="deal-cell-actions">
                    ${deal.stage === 'Closed Lost' ? ''
                : deal.stage === 'Closed Won'
                    ? `<a href="projects.html?launch_deal_id=${deal.id}" class="deal-action-icon" title="Launch Project"><i class="fas fa-play"></i></a>`
                    : `<a href="proposals.html?deal_id=${deal.id}" class="deal-action-icon" title="Proposal"><i class="fas fa-file-contract"></i></a>`
            }
                </td>`;
        });

        document.querySelectorAll("#deals-table th.sortable").forEach((th) => {
            th.classList.remove("asc", "desc");
            if (th.dataset.sort === state.dealsSortBy) th.classList.add(state.dealsSortDir);
        });
    };

    // Kanban Board Render Functions
    const renderKanbanBoard = () => {
        kanbanBoardView.innerHTML = '';

        const dealsToRender = getFilteredDeals();
        const stages = state.dealStages.map(s => s.stage_name);

        stages.forEach(stage => {
            const dealsInStage = dealsToRender.filter(d => d.stage === stage);
            const column = document.createElement('div');
            column.className = 'kanban-column';
            column.dataset.stage = stage;
            const totalValue = dealsInStage.reduce((sum, deal) => sum + getDealValue(deal), 0);
            const emptyHint = dealsInStage.length === 0 ? '<div class="kanban-column-empty">No deals</div>' : '';
            column.innerHTML = `
                <div class="kanban-column-header">
                    <h4>${getStageDisplayName(stage)} (${dealsInStage.length})</h4>
                    <span class="kanban-column-total">${formatCurrency(totalValue)}</span>
                </div>
                <div class="kanban-column-body">
                    ${dealsInStage.map(deal => renderDealCard(deal)).join('')}
                    ${emptyHint}
                </div>`;
            kanbanBoardView.appendChild(column);
        });
        setupDragAndDrop();
        kanbanBoardView.querySelectorAll('.kanban-card').forEach((card) => replaceStagePillWithFan(card));
        setupKanbanCardFlipAndEdit();
    };

    function replaceStagePillWithFan(card) {
        const stageEl = card.querySelector('.deal-card-stage');
        if (!stageEl) return;
        const dealId = Number(card.dataset.id);
        const deal = state.deals.find((d) => d.id === dealId);
        if (!deal) return;
        const stages = state.dealStages.sort((a, b) => a.sort_order - b.sort_order);
        const currentStage = deal.stage || '';
        const wrap = document.createElement('div');
        wrap.className = 'deal-card-stage-fan-wrap';
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = `deal-card-stage-trigger ${getDealStageColorClass(currentStage)}`;
        trigger.innerHTML = `${getStageDisplayName(currentStage) || 'Stage'} <i class="fas fa-chevron-down deal-card-stage-chevron"></i>`;
        wrap.appendChild(trigger);
        const fan = document.createElement('div');
        fan.className = 'deal-card-stage-fan';
        const total = stages.length;
        const spread = Math.min(120, Math.max(60, (total - 1) * 25));
        const startAngle = 90 + spread / 2;
        stages.forEach((s, i) => {
            const angle = total <= 1 ? 90 : startAngle - (spread * i) / (total - 1);
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = `deal-card-stage-pill ${getDealStageColorClass(s.stage_name)}`;
            pill.textContent = getStageDisplayName(s.stage_name);
            pill.dataset.stage = s.stage_name;
            pill.style.setProperty('--fan-angle', `${angle}deg`);
            pill.style.setProperty('--fan-i', `${i}`);
            pill.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newStage = s.stage_name;
                const { error } = await supabase.from('deals_tw').update({ stage: newStage }).eq('id', dealId);
                if (error) { showToast('Error updating stage', 'error'); return; }
                deal.stage = newStage;
                trigger.innerHTML = `${getStageDisplayName(newStage)} <i class="fas fa-chevron-down deal-card-stage-chevron"></i>`;
                trigger.className = `deal-card-stage-trigger ${getDealStageColorClass(newStage)}`;
                wrap.classList.remove('open');
                document.removeEventListener('click', closeFan);
                const column = card.closest('.kanban-column');
                if (column && column.dataset.stage !== newStage) {
                    renderKanbanBoard();
                }
            });
            fan.appendChild(pill);
        });
        wrap.appendChild(fan);
        const closeFan = () => {
            wrap.classList.remove('open');
            document.removeEventListener('click', closeFan);
        };
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (wrap.classList.contains('open')) {
                closeFan();
            } else {
                wrap.classList.add('open');
                setTimeout(() => document.addEventListener('click', closeFan), 0);
            }
        });
        wrap.addEventListener('click', (e) => e.stopPropagation());
        fan.querySelectorAll('.deal-card-stage-pill').forEach((p) => {
            p.addEventListener('click', () => closeFan());
        });
        stageEl.replaceWith(wrap);
    }

    function enterNotesEditMode(card, dealId, currentNotes) {
        const backContent = card.querySelector('.deal-card-back-content');
        const backBody = card.querySelector('.deal-card-back-body');
        const backEditBtn = card.querySelector('.deal-card-back-edit');
        if (!backContent || !backBody || !backEditBtn) return;
        card.classList.add('deal-card-notes-editing');
        backBody.dataset.originalNotes = currentNotes;
        const textarea = document.createElement('textarea');
        textarea.className = 'deal-card-notes-textarea';
        textarea.value = currentNotes;
        textarea.rows = 4;
        backBody.innerHTML = '';
        backBody.appendChild(textarea);
        const wrap = document.createElement('div');
        wrap.className = 'deal-card-notes-edit-actions';
        wrap.innerHTML = '<button type="button" class="btn-icon btn-icon-sm deal-card-notes-cancel" title="Cancel"><i class="fas fa-times"></i></button><button type="button" class="btn-icon btn-icon-sm deal-card-notes-save" title="Save job details"><i class="fas fa-check"></i></button>';
        backEditBtn.replaceWith(wrap);
        const saveBtn = wrap.querySelector('.deal-card-notes-save');
        const cancelBtn = wrap.querySelector('.deal-card-notes-cancel');
        const exitNotesEdit = () => {
            card.classList.remove('deal-card-notes-editing');
            const orig = backBody.dataset.originalNotes || '';
            backBody.removeAttribute('data-original-notes');
            backBody.innerHTML = orig ? escapeNotesForHtml(orig) : '<span class="text-muted">No job details</span>';
            const newEditBtn = document.createElement('button');
            newEditBtn.type = 'button';
            newEditBtn.className = 'btn-icon btn-icon-sm deal-card-back-edit';
            newEditBtn.dataset.dealId = dealId;
            newEditBtn.title = 'Edit job details';
            newEditBtn.innerHTML = '<i class="fas fa-pen"></i>';
            wrap.replaceWith(newEditBtn);
            newEditBtn.addEventListener('click', (e) => { e.stopPropagation(); enterNotesEditMode(card, dealId, (state.deals.find(d => d.id === dealId) || {}).notes || ''); });
        };
        saveBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const value = textarea.value.trim();
            const { error } = await supabase.from('deals_tw').update({ notes: value }).eq('id', dealId);
            if (error) { showToast('Error saving job details', 'error'); return; }
            const deal = state.deals.find(d => d.id === dealId);
            if (deal) deal.notes = value;
            backBody.dataset.originalNotes = value;
            exitNotesEdit();
        });
        cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); exitNotesEdit(); });
    }

    function setupKanbanCardFlipAndEdit() {
        const cards = kanbanBoardView.querySelectorAll('.kanban-card.deal-card-flippable');
        cards.forEach(card => {
            const flipInner = card.querySelector('.deal-card-flip-inner');
            if (!flipInner) return;
            const dealId = Number(card.dataset.id);
            const noFlipSelector = '.deal-card-commit-toggle, .deal-card-stage-pill, .deal-card-proposal-icon, .deal-card-editable, .deal-card-elements, .element-pill, .deal-card-back-edit, .deal-card-notes-save, .deal-card-notes-cancel';
            flipInner.addEventListener('click', (e) => {
                if (card.classList.contains('deal-card-notes-editing')) return;
                const inNoFlip = e.target.closest(noFlipSelector);
                if (inNoFlip) {
                    if (e.target.closest('.deal-card-back-edit')) { e.preventDefault(); e.stopPropagation(); enterNotesEditMode(card, dealId, (state.deals.find(d => d.id === dealId) || {}).notes || ''); }
                    return;
                }
                if (card.classList.contains('deal-card-flipped')) { card.classList.remove('deal-card-flipped'); return; }
                card.classList.add('deal-card-flipped');
            });
            card.querySelectorAll('.deal-card-back-edit').forEach(btn => {
                btn.replaceWith(btn.cloneNode(true));
            });
            card.querySelector('.deal-card-back-edit')?.addEventListener('click', (e) => {
                e.stopPropagation();
                enterNotesEditMode(card, dealId, (state.deals.find(d => d.id === dealId) || {}).notes || '');
            });
            card.querySelectorAll('.deal-card-editable').forEach(el => {
                el.replaceWith(el.cloneNode(true));
            });
            card.querySelectorAll('.deal-card-editable').forEach(el => {
                el.addEventListener('click', (e) => { e.stopPropagation(); startInlineEdit(card, el, dealId); });
            });
        });
    }

    function startInlineEdit(card, el, dealId) {
        const field = el.dataset.field;
        const deal = state.deals.find(d => d.id === dealId);
        if (!deal || !field) return;
        if (el.classList.contains('deal-card-editing')) return;
        const tag = el.tagName.toLowerCase();
        const currentText = el.textContent.trim();
        let input;
        if (field === 'value') {
            input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.step = '0.01';
            input.value = getDealValue(deal);
            input.className = 'deal-card-inline-input';
        } else if (field === 'name') {
            input = document.createElement('input');
            input.type = 'text';
            input.value = deal.name || '';
            input.className = 'deal-card-inline-input';
        } else if (field === 'account') {
            input = document.createElement('select');
            input.className = 'deal-card-inline-input';
            state.accounts.sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(acc => {
                const opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = acc.name || '';
                if (acc.id === deal.account_id) opt.selected = true;
                input.appendChild(opt);
            });
        } else if (field === 'close_month') {
            input = document.createElement('input');
            input.type = 'month';
            input.value = deal.close_month || '';
            input.className = 'deal-card-inline-input';
        } else return;
        el.classList.add('deal-card-editing');
        el.textContent = '';
        el.appendChild(input);
        if (input.tagName === 'SELECT' && typeof window.TomSelect !== 'undefined') {
            try { initTomSelect(input, tomSelectNoSearchOpts()); } catch (e) {}
        }
        input.focus();
        const save = async () => {
            let value;
            if (field === 'value') value = parseFloat(input.value) || 0;
            else if (field === 'name') value = input.value.trim();
            else if (field === 'account') value = Number(input.tomselect ? input.tomselect.getValue() : input.value);
            else if (field === 'close_month') value = input.value || null;
            const payload = field === 'value' ? { value } : field === 'name' ? { name: value } : field === 'account' ? { account_id: value } : { close_month: value };
            const { error } = await supabase.from('deals_tw').update(payload).eq('id', dealId);
            el.classList.remove('deal-card-editing');
            input.remove();
            if (error) { showToast('Error saving', 'error'); render(); return; }
            if (field === 'value') deal.value = value; else if (field === 'name') deal.name = value; else if (field === 'account') deal.account_id = value; else deal.close_month = value;
            if (field === 'value') el.textContent = formatCurrency(value) + '/mo';
            else if (field === 'name') { const safe = (value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); el.textContent = value.length > 28 ? value.substring(0, 28) + '...' : value; el.title = value; }
            else if (field === 'account') { const acc = state.accounts.find(a => a.id === value); el.textContent = acc ? acc.name : '—'; }
            else el.textContent = value ? formatMonthYearShort(value) : '—';
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    }

    function cycleStage(card, dealId) {
        const deal = state.deals.find(d => d.id === dealId);
        if (!deal) return;
        const stages = state.dealStages.map(s => s.stage_name);
        const idx = stages.indexOf(deal.stage);
        const next = stages[(idx + 1) % stages.length];
        deal.stage = next;
        supabase.from('deals_tw').update({ stage: next }).eq('id', dealId).then(({ error }) => {
            if (error) { render(); return; }
            const pill = card.querySelector('.deal-card-stage-pill');
            if (pill) { pill.textContent = getStageDisplayName(next); pill.className = 'deal-card-stage-pill ' + getDealStageColorClass(next); }
        });
    }

    const renderDealCard = (deal) => {
        const account = state.accounts.find(a => a.id === deal.account_id);
        const accountName = (account && account.name) ? account.name : '—';
        return getKanbanDealCardContent(deal, { accountName, draggable: true });
    };

    const renderDealsMetrics = () => {
        if (!metricCurrentCommit) return;
        const isManager = state.currentUser.user_metadata?.is_manager === true;
        const isMyTeamView = state.dealsViewMode === 'all' && isManager;
        if (metricCurrentCommitTitle && metricBestCaseTitle) {
            metricCurrentCommitTitle.textContent = isMyTeamView ? "My Team's Current Commit" : "My Current Commit";
            metricBestCaseTitle.textContent = isMyTeamView ? "My Team's Current Best Case" : "My Current Best Case";
        }
        const effectiveMonthlyQuota = isMyTeamView ? state.allUsersQuotas.reduce((sum, quota) => sum + (quota.monthly_quota || 0), 0) : state.currentUserQuota;
        if (commitTotalQuota && bestCaseTotalQuota) {
            if (isMyTeamView) {
                commitTotalQuota.textContent = formatCurrency(effectiveMonthlyQuota);
                bestCaseTotalQuota.textContent = formatCurrency(effectiveMonthlyQuota);
                commitTotalQuota.classList.remove('hidden');
                bestCaseTotalQuota.classList.remove('hidden');
            } else {
                commitTotalQuota.classList.add('hidden');
                bestCaseTotalQuota.classList.add('hidden');
            }
        }
        const currentMonth = new Date().getMonth(), currentYear = new Date().getFullYear();
        let currentCommit = 0, bestCase = 0, closedWon = 0;
        
        state.deals.forEach((deal) => {
            const dealCloseDate = deal.close_month ? new Date(deal.close_month + '-02') : null;
            const isCurrentMonth = dealCloseDate && dealCloseDate.getMonth() === currentMonth && dealCloseDate.getFullYear() === currentYear;
            if (isCurrentMonth) {
                if (deal.stage === 'Closed Won') closedWon += getDealValue(deal);
                else {
                    bestCase += getDealValue(deal);
                    if (deal.is_committed) currentCommit += getDealValue(deal);
                }
            }
        });

        const dealsForFunnel = getFunnelDeals();
        const totalFunnel = dealsForFunnel.reduce((sum, deal) => sum + getDealValue(deal), 0);

        let closedWonCount = 0;
        state.deals.forEach(d => {
            if (d.stage !== 'Closed Won') return;
            const dealCloseDate = d.close_month ? new Date(d.close_month + '-02') : null;
            if (dealCloseDate && dealCloseDate.getMonth() === currentMonth && dealCloseDate.getFullYear() === currentYear) closedWonCount++;
        });
        const arpu = closedWonCount > 0 ? closedWon / closedWonCount : 0;
        const metricArpuEl = document.getElementById('metric-arpu');
        if (metricArpuEl) metricArpuEl.textContent = formatCurrency(arpu);

        metricCurrentCommit.textContent = formatCurrencyK(currentCommit);
        metricBestCase.textContent = formatCurrencyK(bestCase);
        metricFunnel.textContent = formatCurrencyK(totalFunnel);
        metricClosedWon.textContent = formatCurrencyK(closedWon);
        
        const commitPercentage = effectiveMonthlyQuota > 0 ? ((currentCommit / effectiveMonthlyQuota) * 100).toFixed(1) : 0;
        const bestCasePercentage = effectiveMonthlyQuota > 0 ? ((bestCase / effectiveMonthlyQuota) * 100).toFixed(1) : 0;
        document.getElementById("commit-quota-percent").textContent = `${commitPercentage}%`;
        document.getElementById("best-case-quota-percent").textContent = `${bestCasePercentage}%`;
    };

    async function handleCommitDeal(dealId, isCommitted) {
        const { error } = await supabase.from('deals_tw').update({ is_committed: isCommitted }).eq('id', dealId);
        if (error) {
            showToast('Error updating commit status: ' + error.message, 'error');
        } else {
            const deal = state.deals.find(d => d.id === dealId);
            if (deal) deal.is_committed = isCommitted;
            renderDealsMetrics();
        }
    }

    function getElementsCheckboxesHtml(selectedProductsString) {
        const selected = new Set((selectedProductsString || '').split(',').map(p => p.trim().toLowerCase()).filter(Boolean));
        return `<div class="modal-elements-group">${ELEMENTS_LIST.map(el => {
            const checked = selected.has(el.toLowerCase()) ? ' checked' : '';
            return `<label class="modal-element-label"><input type="checkbox" class="modal-deal-element" value="${el}"${checked}> ${el}</label>`;
        }).join('')}</div>`;
    }

    function getSelectedElementsFromModal() {
        const checked = document.querySelectorAll('.modal-deal-element:checked');
        return Array.from(checked).map(el => el.value).join(', ');
    }

    function handleEditDeal(dealId) {
        const deal = state.deals.find(d => d.id === dealId);
        if (!deal) return;
        if (deal.stage === 'Closed Won') return;
        const stageOptions = state.dealStages.sort((a, b) => a.sort_order - b.sort_order).map(s => `<option value="${s.stage_name}" ${deal.stage === s.stage_name ? 'selected' : ''}>${getStageDisplayName(s.stage_name)}</option>`).join('');
        const accountOptions = state.accounts.sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(acc => `<option value="${acc.id}" ${deal.account_id === acc.id ? 'selected' : ''}>${(acc.name || '').replace(/</g, '&lt;')}</option>`).join('');
        const elementsHtml = getElementsCheckboxesHtml(deal.elements);

        showModal("Edit Deal", `
            <label>Deal Name:</label><input type="text" id="modal-deal-name" value="${(deal.name || '').replace(/"/g, '&quot;')}" required>
            <label>Account:</label><select id="modal-deal-account" required>${accountOptions}</select>
            <label>Stage:</label><select id="modal-deal-stage" required>${stageOptions}</select>
            <label>Project Value:</label><input type="number" id="modal-deal-value" min="0" value="${getDealValue(deal)}">
            <label>Close Month:</label><input type="month" id="modal-deal-close-month" value="${deal.close_month || ''}">
            <label>Elements:</label>${elementsHtml}
            <label>Job Details:</label><textarea id="modal-deal-notes" rows="3" placeholder="Job Details">${(deal.notes || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        `, async () => {
            const accEl = document.getElementById('modal-deal-account');
            const stageEl = document.getElementById('modal-deal-stage');
            const updatedDeal = {
                name: document.getElementById('modal-deal-name').value.trim(),
                account_id: Number(accEl?.tomselect ? accEl.tomselect.getValue() : (accEl?.value || '')),
                stage: stageEl?.tomselect ? stageEl.tomselect.getValue() : (stageEl?.value || ''),
                value: parseFloat(document.getElementById('modal-deal-value').value) || 0,
                close_month: document.getElementById('modal-deal-close-month').value || null,
                elements: getSelectedElementsFromModal(),
                notes: document.getElementById('modal-deal-notes').value.trim(),
            };
            if (!updatedDeal.name) return showToast('Deal name is required.', 'error');
            const { error } = await supabase.from("deals_tw").update(updatedDeal).eq("id", deal.id);
            if (error) { showToast("Error updating deal: " + error.message, 'error'); return false; }
            await loadAllData(); hideModal();
        });
        const modalAcc = document.getElementById("modal-deal-account");
        const modalStage = document.getElementById("modal-deal-stage");
        if (modalAcc && typeof window.TomSelect !== "undefined") try { initTomSelect(modalAcc, tomSelectNoSearchOpts()); } catch (e) {}
        if (modalStage && typeof window.TomSelect !== "undefined") try { initTomSelect(modalStage, tomSelectNoSearchOpts()); } catch (e) {}
    }

    // Drag and Drop Logic
    const setupDragAndDrop = () => {
        const cards = document.querySelectorAll('.kanban-card');
        const columns = document.querySelectorAll('.kanban-column-body');
        let draggedCard = null;
        cards.forEach(card => {
            card.addEventListener('dragstart', () => {
                draggedCard = card;
                setTimeout(() => card.classList.add('dragging'), 0);
            });
            card.addEventListener('dragend', () => {
                draggedCard.classList.remove('dragging');
                draggedCard = null;
            });
        });
        columns.forEach(column => {
            column.addEventListener('dragover', e => {
                e.preventDefault();
                const afterElement = getDragAfterElement(column, e.clientY);
                if (afterElement == null) column.appendChild(draggedCard);
                else column.insertBefore(draggedCard, afterElement);
            });
            column.addEventListener('drop', async (e) => {
                e.preventDefault();
                if (!draggedCard) return;
                const newStage = column.closest('.kanban-column').dataset.stage;
                const dealId = Number(draggedCard.dataset.id);
                const deal = state.deals.find(d => d.id === dealId);
                if (deal && deal.stage !== newStage) {
                    deal.stage = newStage; 
                    render(); 
                    const { error } = await supabase.from('deals_tw').update({ stage: newStage }).eq('id', dealId);
                    if (error) {
                        showToast('Could not update deal stage. Please try again.', 'error');
                        await loadAllData();
                    }
                }
            });
        });
    };

    const getDragAfterElement = (container, y) => {
        const draggableElements = [...container.querySelectorAll('.kanban-card:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    };

    // --- Event Listener Setup ---
    function setupPageEventListeners() {
        setupModalListeners();
        document.getElementById("logout-btn").addEventListener("click", async () => {
            await supabase.auth.signOut();
            window.location.href = "index.html";
        });

        document.querySelector("#deals-table thead").addEventListener("click", (e) => {
            const th = e.target.closest("th.sortable");
            if (!th) return;
            const sortKey = th.dataset.sort;
            if (state.dealsSortBy === sortKey) {
                state.dealsSortDir = state.dealsSortDir === "asc" ? "desc" : "asc";
            } else {
                state.dealsSortBy = sortKey;
                state.dealsSortDir = "asc";
            }
            renderDealsPage();
        });

        document.addEventListener("click", (e) => {
            const pillsContainer = document.getElementById("deals");
            if (!pillsContainer?.contains(e.target)) return;
            const pill = e.target.closest(".element-pill");
            if (pill?.dataset?.dealId && pill.dataset.element) {
                e.preventDefault();
                const dealId = Number(pill.dataset.dealId);
                const element = pill.dataset.element;
                const newValue = toggleElementInList(dealId, element);
                if (newValue === undefined) return;
                saveDealElements(dealId, newValue);
                return;
            }
        });

        dealsTableBody.addEventListener("blur", (e) => {
            const cell = e.target.closest(".deal-cell-editable[contenteditable='true']");
            if (!cell) return;
            const dealId = Number(cell.dataset.dealId);
            const field = cell.dataset.field;
            const value = (cell.textContent || '').trim().replace(/\s+/g, ' ').replace(/<br\s*\/?>/gi, '\n');
            if (dealId && field) saveDealField(dealId, field, value);
        }, true);

        dealsTableBody.addEventListener("click", (e) => {
            const editBtn = e.target.closest(".edit-deal-btn");
            const nameLink = e.target.closest(".deal-name-link");
            const selectCell = e.target.closest(".deal-cell-select");
            const numCell = e.target.closest(".deal-cell-number");
            const monthCell = e.target.closest(".deal-cell-month");
            if (editBtn) { handleEditDeal(Number(editBtn.dataset.dealId)); return; }
            if (nameLink) {
                const deal = state.deals.find(d => d.id === Number(nameLink.dataset.dealId));
                if (deal?.account_id) window.location.href = `accounts.html?accountId=${deal.account_id}`;
                return;
            }
            if (selectCell && !selectCell.querySelector("select")) enterSelectMode(selectCell);
            else if (numCell && !numCell.querySelector("input")) enterNumberMode(numCell);
            else if (monthCell && !monthCell.querySelector("input")) enterMonthMode(monthCell);
        });
        
        document.addEventListener("change", (e) => {
            const commitCheck = e.target.closest(".commit-deal-checkbox");
            if (commitCheck) handleCommitDeal(Number(commitCheck.dataset.dealId), commitCheck.checked);
        });

        listViewBtn.addEventListener('click', () => handleViewToggle('list'));
        boardViewBtn.addEventListener('click', () => handleViewToggle('board'));

        if (toggleClosedLost) {
            toggleClosedLost.addEventListener('change', (e) => {
                state.showClosedLost = e.target.checked;
                localStorage.setItem('deals_show_closed_lost', state.showClosedLost);
                populateDealsFilters();
                renderAll();
            });
        }

        [filterStagePills, filterCloseMonthPills, filterCommittedPills].forEach(container => {
            if (!container) return;
            container.addEventListener('click', (e) => {
                const pill = e.target.closest('.deals-filter-pill');
                if (!pill) return;
                const value = pill.dataset.value || '';
                if (container === filterStagePills) { state.filterStage = value; }
                else if (container === filterCloseMonthPills) { state.filterCloseMonth = value; }
                else if (container === filterCommittedPills) { state.filterCommitted = value; }
                populateDealsFilters();
                renderAll();
            });
        });

        if (closeMonthPrevBtn) closeMonthPrevBtn.addEventListener('click', () => { state.closeMonthOffset = Math.max(-12, (state.closeMonthOffset || 0) - 1); populateDealsFilters(); });
        if (closeMonthNextBtn) closeMonthNextBtn.addEventListener('click', () => { state.closeMonthOffset = Math.min(12, (state.closeMonthOffset || 0) + 1); populateDealsFilters(); });

        if (dealsFiltersResetBtn) {
            dealsFiltersResetBtn.addEventListener('click', () => {
                state.filterStage = '';
                state.filterCloseMonth = '';
                state.filterCommitted = '';
                state.closeMonthOffset = 0;
                populateDealsFilters();
                renderAll();
            });
        }

        if (addDealBtn) {
            addDealBtn.addEventListener('click', () => {
                const stageOptions = (state.dealStages || []).sort((a, b) => a.sort_order - b.sort_order).map(s => `<option value="${s.stage_name}">${getStageDisplayName(s.stage_name)}</option>`).join('');
                const accountOptions = (state.accounts || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(acc => `<option value="${acc.id}">${acc.name}</option>`).join('');
                const elementsHtml = getElementsCheckboxesHtml('');
                showModal('New Deal', `
                    <label>Deal Name:</label><input type="text" id="modal-deal-name" required>
                    <label>Account:</label><select id="modal-deal-account" required><option value="">-- Select Account --</option>${accountOptions}</select>
                    <label>Stage:</label><select id="modal-deal-stage" required><option value="">-- Select --</option>${stageOptions}</select>
                    <label>Project Value:</label><input type="number" id="modal-deal-value" min="0" value="0">
                    <label>Close Month:</label><input type="month" id="modal-deal-close-month">
                    <label>Elements:</label>${elementsHtml}
                    <label>Job Details:</label><textarea id="modal-deal-notes" rows="3" placeholder="Job Details"></textarea>
                `, async () => {
                    const accEl = document.getElementById('modal-deal-account');
                    const stageEl = document.getElementById('modal-deal-stage');
                    const name = document.getElementById('modal-deal-name').value.trim();
                    const account_id = accEl?.tomselect ? accEl.tomselect.getValue() : (accEl?.value || '');
                    const stage = stageEl?.tomselect ? stageEl.tomselect.getValue() : (stageEl?.value || '');
                    const value = parseFloat(document.getElementById('modal-deal-value').value) || 0;
                    const close_month = document.getElementById('modal-deal-close-month').value || null;
                    const elementsVal = getSelectedElementsFromModal();
                    const notes = document.getElementById('modal-deal-notes').value.trim();
                    if (!name) { showToast('Deal name is required.', 'error'); return false; }
                    if (!account_id) { showToast('Please select an account.', 'error'); return false; }
                    if (!stage) { showToast('Please select a stage.', 'error'); return false; }
                    const payload = {
                        user_id: state.currentUser.id,
                        account_id: Number(account_id),
                        name,
                        stage,
                        value,
                        close_month,
                        elements: elementsVal,
                        notes: notes || null,
                        is_committed: false
                    };
                    const { error } = await supabase.from('deals_tw').insert(payload);
                    if (error) { showToast('Error creating deal: ' + error.message, 'error'); return false; }
                    await loadAllData();
                    hideModal();
                    showToast('Deal created.', 'success');
                    return true;
                }, true, '<button id="modal-confirm-btn" class="btn-primary">Create</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>');
                const newAcc = document.getElementById("modal-deal-account");
                const newStage = document.getElementById("modal-deal-stage");
                if (newAcc && typeof window.TomSelect !== "undefined") try { initTomSelect(newAcc, tomSelectNoSearchOpts()); } catch (e) {}
                if (newStage && typeof window.TomSelect !== "undefined") try { initTomSelect(newStage, tomSelectNoSearchOpts()); } catch (e) {}
            });
        }
    }
    
    const handleViewToggle = (view) => {
        state.currentView = view;
        localStorage.setItem('deals_view_mode', view);
        listViewBtn.classList.toggle('active', view === 'list');
        boardViewBtn.classList.toggle('active', view === 'board');
        render();
    };

    // --- App Initialization ---
    async function initializePage() {
        try {
        await loadSVGs();
        updateActiveNavLink();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            state.currentUser = session.user;
            await setupUserMenuAndAuth(supabase, state);
            setupPageEventListeners();
            await setupGlobalSearch(supabase, state.currentUser);
            await checkAndSetNotifications(supabase);
            
            const savedView = localStorage.getItem('deals_view_mode') || 'list';
            state.currentView = savedView;
            listViewBtn.classList.toggle('active', savedView === 'list');
            boardViewBtn.classList.toggle('active', savedView === 'board');

            const savedShowClosedLost = localStorage.getItem('deals_show_closed_lost');
            state.showClosedLost = savedShowClosedLost === 'true';
            if (toggleClosedLost) toggleClosedLost.checked = state.showClosedLost;
            
            await loadAllData();
        } else {
            hideGlobalLoader();
            window.location.href = "index.html";
        }
        } finally {
            hideGlobalLoader();
        }
    }

    runWhenNavReady(function () { initializePage(); });
});
