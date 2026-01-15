// js/deals.js
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    formatMonthYear,
    formatCurrencyK,
    formatCurrency,
    // themes, // Removed theme import
    setupModalListeners,
    showModal,
    hideModal,
    updateActiveNavLink,
    setupUserMenuAndAuth,
    loadSVGs,
    setupGlobalSearch,
    checkAndSetNotifications
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
        dealsViewMode: 'mine',
        currentView: 'list', // 'list' or 'board'
        showClosedLost: true, 
        currentUserQuota: 0,
        allUsersQuotas: [],
        dealsByStageChart: null,
        dealsByTimeChart: null
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
    const viewMyDealsBtn = document.getElementById("view-my-deals-btn");
    const viewAllDealsBtn = document.getElementById("view-all-deals-btn");
    const dealsViewToggleDiv = document.querySelector('.deals-view-toggle');
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

    const toggleClosedLost = document.getElementById('show-closed-lost-check');

    // --- Data Fetching ---
    async function loadAllData() {
        if (!state.currentUser) return;

        const isManager = state.currentUser.user_metadata?.is_manager === true;
        const isTeamView = state.dealsViewMode === 'all' && isManager;

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
            renderAll(); 
        }
    }

    // --- Chart Colors & Helpers ---
    function createChartGradient(ctx, chartArea, index, totalDatasets) {
        if (!chartArea || !ctx) return 'rgba(0,0,0,0.5)';
        
        // TenWorks Default Palette (Industrial Blues/cyans)
        const palette = ['#007bff', '#00aeff', '#00c6ff', '#00dfff', '#00f2ff'];
        
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

    function getFunnelDeals() {
        const futureDeals = getFutureDeals();
        return futureDeals.filter(deal => {
            if (deal.stage === 'Closed Won') return false;
            if (deal.stage === 'Closed Lost' && !state.showClosedLost) return false;
            return true;
        });
    }
    
    const renderAll = () => {
        render(); 
        renderDealsMetrics();
        renderDealsByStageChart();
        renderDealsByTimeChart();
    };

    const render = () => {
        if (state.currentView === 'list') {
            renderDealsPage(); 
            listViewContainer.classList.remove('hidden');
            kanbanBoardView.classList.add('hidden');
            dealsByStageChartContainer.classList.remove('hidden');
        } else {
            renderKanbanBoard();
            listViewContainer.classList.add('hidden');
            kanbanBoardView.classList.remove('hidden');
            dealsByStageChartContainer.classList.add('hidden'); 
        }
    };

    // --- Render Functions ---
    function renderDealsByStageChart() {
        if (!dealsByStageCanvas || !stageChartEmptyMessage) return;

        const openDeals = getFunnelDeals(); 

        if (openDeals.length === 0) {
            dealsByStageCanvas.classList.add('hidden');
            stageChartEmptyMessage.classList.remove('hidden');
            if (state.dealsByStageChart) { state.dealsByStageChart.destroy(); state.dealsByStageChart = null; }
            return;
        }
        dealsByStageCanvas.classList.remove('hidden');
        stageChartEmptyMessage.classList.add('hidden');
        
        // Use 'mrc' (Project Value) for aggregation
        const stageValue = openDeals.reduce((acc, deal) => {
            const stage = deal.stage || 'Uncategorized';
            acc[stage] = (acc[stage] || 0) + (deal.mrc || 0);
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
                scales: { x: { ticks: { color: 'var(--text-medium)', callback: (v) => formatCurrencyK(v) }, grid: { color: 'var(--border-color)' } }, y: { ticks: { color: 'var(--text-medium)' }, grid: { display: false } } }
            }
        });
    }

    function renderDealsByTimeChart() {
        if (!dealsByTimeCanvas || !timeChartEmptyMessage) return;
        
        const openDeals = getFunnelDeals().filter(d => d.close_month);

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
            if (monthDiff === 0) { funnel['0-30 Days'] += deal.mrc || 0; }
            else if (monthDiff === 1) { funnel['31-60 Days'] += deal.mrc || 0; }
            else if (monthDiff === 2) { funnel['61-90 Days'] += deal.mrc || 0; }
            else if (monthDiff > 2) { funnel['90+ Days'] += deal.mrc || 0; }
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
                scales: { x: { ticks: { color: 'var(--text-medium)', callback: (v) => formatCurrencyK(v) }, grid: { color: 'var(--border-color)' } }, y: { ticks: { color: 'var(--text-medium)' }, grid: { display: false }, barPercentage: 0.7, categoryPercentage: 0.6 } }
            }
        });
    }

    const renderDealsPage = () => {
        if (!dealsTableBody) return;

        const dealsForList = getFunnelDeals();
        
        const dealsWithAccount = dealsForList.map((deal) => ({ ...deal, account_name: state.accounts.find((a) => a.id === deal.account_id)?.name || "N/A" }));
        dealsWithAccount.sort((a, b) => {
            const valA = a[state.dealsSortBy], valB = b[state.dealsSortBy];
            let comparison = (typeof valA === "string") ? (valA || "").localeCompare(b[state.dealsSortBy] || "") : (valA > valB ? 1 : -1);
            return state.dealsSortDir === "desc" ? comparison * -1 : comparison;
        });
        dealsTableBody.innerHTML = "";
        dealsWithAccount.forEach((deal) => {
            const row = dealsTableBody.insertRow();
            // Maps 'mrc' -> Project Value, 'products' -> Job Details
            row.innerHTML = `
                <td><input type="checkbox" class="commit-deal-checkbox" data-deal-id="${deal.id}" ${deal.is_committed ? "checked" : ""}></td>
                <td class="deal-name-link" data-deal-id="${deal.id}">${deal.name}</td>
                <td>${deal.term || ""}</td>
                <td>${deal.account_name}</td>
                <td>${deal.stage}</td>
                <td>${formatCurrency(deal.mrc || 0)}</td>
                <td>${deal.close_month ? formatMonthYear(deal.close_month) : ""}</td>
                <td>${deal.products || ""}</td>
                <td><div class="button-group-wrapper"><button class="btn-secondary edit-deal-btn" data-deal-id="${deal.id}">Edit</button></div></td>`;
        });
        document.querySelectorAll("#deals-table th.sortable").forEach((th) => {
            th.classList.remove("asc", "desc");
            if (th.dataset.sort === state.dealsSortBy) th.classList.add(state.dealsSortDir);
        });
    };

    // Kanban Board Render Functions
    const renderKanbanBoard = () => {
        kanbanBoardView.innerHTML = '';
        
        const dealsToRender = getFutureDeals().filter(deal => deal.stage !== 'Closed Won');

        const stages = state.dealStages
            .map(s => s.stage_name)
            .filter(stageName => {
                if (stageName === 'Closed Won') return false; 
                if (stageName === 'Closed Lost' && !state.showClosedLost) return false; 
                return true;
            });

        stages.forEach(stage => {
            const dealsInStage = dealsToRender.filter(d => d.stage === stage);
            const column = document.createElement('div');
            column.className = 'kanban-column';
            column.dataset.stage = stage;
            const totalValue = dealsInStage.reduce((sum, deal) => sum + deal.mrc, 0);
            column.innerHTML = `
                <div class="kanban-column-header">
                    <h4>${stage} (${dealsInStage.length})</h4>
                    <span class="kanban-column-total">${formatCurrency(totalValue)}</span>
                </div>
                <div class="kanban-column-body">
                    ${dealsInStage.map(deal => renderDealCard(deal)).join('')}
                </div>`;
            kanbanBoardView.appendChild(column);
        });
        setupDragAndDrop();
    };

    const renderDealCard = (deal) => {
        const account = state.accounts.find(a => a.id === deal.account_id);
        const committedIcon = deal.is_committed ? '<i class="fas fa-star committed-icon" title="Committed"></i>' : '';
        return `
            <div class="kanban-card" draggable="true" data-id="${deal.id}">
                <div class="kanban-card-header">
                    <h5 class="kanban-card-title">${deal.name}</h5>
                    ${committedIcon}
                </div>
                <p class="kanban-card-subtitle">${account ? account.name : 'N/A'}</p>
                <div class="kanban-card-footer">
                    <span class="kanban-card-mrc">${formatCurrency(deal.mrc)}</span>
                    <span class="kanban-card-date">
                        <i class="fas fa-calendar-alt"></i>
                        ${deal.close_month ? formatMonthYear(deal.close_month, { month: 'short', year: 'numeric' }) : ''}
                    </span>
                </div>
            </div>`;
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
                if (deal.stage === 'Closed Won') closedWon += deal.mrc || 0;
                else {
                    bestCase += deal.mrc || 0;
                    if (deal.is_committed) currentCommit += deal.mrc || 0;
                }
            }
        });

        const dealsForFunnel = getFunnelDeals();
        const totalFunnel = dealsForFunnel.reduce((sum, deal) => sum + (deal.mrc || 0), 0);

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
            alert('Error updating commit status: ' + error.message);
        } else {
            const deal = state.deals.find(d => d.id === dealId);
            if (deal) deal.is_committed = isCommitted;
            renderDealsMetrics();
        }
    }

    function handleEditDeal(dealId) {
        const deal = state.deals.find(d => d.id === dealId);
        if (!deal) return;
        const stageOptions = state.dealStages.sort((a,b) => a.sort_order - b.sort_order).map(s => `<option value="${s.stage_name}" ${deal.stage === s.stage_name ? 'selected' : ''}>${s.stage_name}</option>`).join('');
        const accountOptions = state.accounts.sort((a,b) => (a.name || "").localeCompare(b.name || "")).map(acc => `<option value="${acc.id}" ${deal.account_id === acc.id ? 'selected' : ''}>${acc.name}</option>`).join('');
        
        // TenWorks Custom Labels in Modal
        showModal("Edit Deal", `
            <label>Deal Name:</label><input type="text" id="modal-deal-name" value="${deal.name || ''}" required>
            <label>Account:</label><select id="modal-deal-account" required>${accountOptions}</select>
            <label>Term:</label><input type="text" id="modal-deal-term" value="${deal.term || ''}" placeholder="e.g., 12 months">
            <label>Stage:</label><select id="modal-deal-stage" required>${stageOptions}</select>
            <label>Project Value:</label><input type="number" id="modal-deal-mrc" min="0" value="${deal.mrc || 0}">
            <label>Close Month:</label><input type="month" id="modal-deal-close-month" value="${deal.close_month || ''}">
            <label>Job Details:</label><textarea id="modal-deal-products" placeholder="List products, comma-separated">${deal.products || ''}</textarea>
        `, async () => {
            const updatedDeal = {
                name: document.getElementById('modal-deal-name').value.trim(),
                account_id: Number(document.getElementById('modal-deal-account').value),
                term: document.getElementById('modal-deal-term').value.trim(),
                stage: document.getElementById('modal-deal-stage').value,
                mrc: parseFloat(document.getElementById('modal-deal-mrc').value) || 0,
                close_month: document.getElementById('modal-deal-close-month').value || null,
                products: document.getElementById('modal-deal-products').value.trim(),
            };
            if (!updatedDeal.name) return alert('Deal name is required.');
            const { error } = await supabase.from("deals_tw").update(updatedDeal).eq("id", deal.id);
            if (error) { alert("Error updating deal: " + error.message); }
            else { await loadAllData(); hideModal(); }
        });
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
                        console.error("Error updating deal stage:", error);
                        alert("Could not update deal stage. Please try again.");
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

        dealsTableBody.addEventListener("click", (e) => {
            const editBtn = e.target.closest(".edit-deal-btn");
            const nameLink = e.target.closest(".deal-name-link");
            if (editBtn) handleEditDeal(Number(editBtn.dataset.dealId));
            else if (nameLink) {
                const deal = state.deals.find(d => d.id === Number(nameLink.dataset.dealId));
                if (deal?.account_id) window.location.href = `accounts.html?accountId=${deal.account_id}`;
            }
        });
        
        dealsTableBody.addEventListener("change", (e) => {
            const commitCheck = e.target.closest(".commit-deal-checkbox");
            if (commitCheck) handleCommitDeal(Number(commitCheck.dataset.dealId), commitCheck.checked);
        });

        if (viewMyDealsBtn) {
            viewMyDealsBtn.addEventListener('click', async () => {
                state.dealsViewMode = 'mine';
                viewMyDealsBtn.classList.add('active');
                viewAllDealsBtn.classList.remove('active');
                await loadAllData();
            });
        }
        if (viewAllDealsBtn) {
            viewAllDealsBtn.addEventListener('click', async () => {
                const isManager = state.currentUser.user_metadata?.is_manager === true;
                if (!isManager) return alert("You must be a manager to view all deals.");
                state.dealsViewMode = 'all';
                viewAllDealsBtn.classList.add('active');
                viewMyDealsBtn.classList.remove('active');
                await loadAllData();
            });
        }
        
        listViewBtn.addEventListener('click', () => handleViewToggle('list'));
        boardViewBtn.addEventListener('click', () => handleViewToggle('board'));

        toggleClosedLost.addEventListener('change', (e) => {
            state.showClosedLost = e.target.checked;
            localStorage.setItem('deals_show_closed_lost', state.showClosedLost);
            renderAll(); 
        });
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
        await loadSVGs();
        updateActiveNavLink();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            state.currentUser = session.user;
            await setupUserMenuAndAuth(supabase, state);
            if (dealsViewToggleDiv) {
                const isManager = state.currentUser.user_metadata?.is_manager === true;
                const viewToggleButtons = dealsViewToggleDiv.querySelector('div:first-child');
                if (viewToggleButtons) {
                    viewToggleButtons.classList.toggle('hidden', !isManager);
                }
                
                if(isManager) {
                    viewMyDealsBtn.classList.add('active');
                    viewAllDealsBtn.classList.remove('active');
                }
            }
            setupPageEventListeners();
            await setupGlobalSearch(supabase, state.currentUser);
            await checkAndSetNotifications(supabase);
            
            const savedView = localStorage.getItem('deals_view_mode') || 'list';
            state.currentView = savedView;
            listViewBtn.classList.toggle('active', savedView === 'list');
            boardViewBtn.classList.toggle('active', savedView === 'board');

            const savedShowClosedLost = localStorage.getItem('deals_show_closed_lost');
            state.showClosedLost = savedShowClosedLost === null ? true : (savedShowClosedLost === 'true');
            toggleClosedLost.checked = state.showClosedLost;
            
            await loadAllData();
        } else {
            window.location.href = "index.html";
        }
    }

    initializePage();
});
