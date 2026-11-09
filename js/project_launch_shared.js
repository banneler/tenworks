function proposalLineTotal(row) {
    if (!row) return 0;
    if (row.kind === 'labor') {
        const hours = Number(row.hours !== '' && row.hours != null ? row.hours : row.qty) || 0;
        const rate = Number(row.rate !== '' && row.rate != null ? row.rate : row.amount) || 0;
        return hours * rate;
    }
    return (Number(row.qty) || 0) * (Number(row.amount) || 0);
}

function parseProposalContent(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (_) { return null; }
    }
    return raw;
}

export function summarizeProposalContent(raw) {
    const content = parseProposalContent(raw) || {};
    const rows = (content.locations || []).flatMap(loc => loc.rows || []);
    const materials = rows.filter(r => r && r.kind !== 'labor' && r.inventory_item_id);
    const labor = rows.filter(r => r && r.kind === 'labor' && String(r.task_name || r.description || '').trim());
    const milestones = (content.project_timeline || []).filter(t => String(t?.taskName || '').trim());
    const total = rows.reduce((sum, row) => sum + proposalLineTotal(row), 0);
    return { materials, labor, milestones, total };
}

export function proposalImportBlurb(plan) {
    if (!plan) return '';
    const bits = [];
    if (plan.materials.length) bits.push(`${plan.materials.length} material${plan.materials.length === 1 ? '' : 's'}`);
    if (plan.labor.length) bits.push(`${plan.labor.length} labor line${plan.labor.length === 1 ? '' : 's'}`);
    if (plan.milestones.length) bits.push(`${plan.milestones.length} milestone${plan.milestones.length === 1 ? '' : 's'}`);
    return bits.length ? `${bits.join(', ')} from proposal` : '';
}

export async function openSharedProjectLaunchModal({
    supabase,
    dayjs,
    addBusinessDays,
    showModal,
    showToast,
    formatCurrency,
    trades = [],
    preSelectDealId = null,
    onSuccess = async () => {}
}) {
    const [{ data: deals, error: dealsError }, { data: templates, error: templatesError }, { data: templateTasks, error: tasksError }] = await Promise.all([
        supabase.from('deals_tw').select('*').order('created_at', { ascending: false }),
        supabase.from('project_templates').select('*').order('name'),
        supabase.from('project_template_tasks').select('*').order('sort_order')
    ]);

    if (dealsError) {
        showToast("Error fetching deals: " + dealsError.message, 'error');
        return false;
    }
    if (!deals || deals.length === 0) {
        showToast("No deals yet. Create a deal and mark it Sold to launch a project.", 'error');
        return false;
    }

    const proposalByDeal = new Map();
    const dealIds = deals.map(d => d.id).filter(id => id != null);
    if (dealIds.length) {
        const { data: proposalRows } = await supabase.from('proposals_tw')
            .select('id, deal_id, content_json, updated_at')
            .in('deal_id', dealIds)
            .order('updated_at', { ascending: false });
        for (const row of proposalRows || []) {
            const key = String(row.deal_id);
            if (!proposalByDeal.has(key)) proposalByDeal.set(key, row);
        }
    }

    const stageRank = (stage) => {
        const s = String(stage || '').toLowerCase();
        if (s === 'closed won' || s === 'sold' || s === 'won') return 0;
        if (s.includes('closed lost') || s === 'lost') return 2;
        return 1; // open / other — after Sold
    };
    const sortedDeals = [...deals].sort((a, b) => {
        const r = stageRank(a.stage) - stageRank(b.stage);
        if (r !== 0) return r;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
    const dealOptions = sortedDeals.map((d) => {
        const name = d.deal_name || d.name || 'Unnamed';
        const amt = Number(d.value ?? d.amount) || 0;
        const stageDisp = (d.stage === 'Closed Won' || String(d.stage||'').toLowerCase()==='closed won') ? 'Sold' : (d.stage || '');
        const stageLabel = stageDisp ? ` · ${stageDisp}` : '';
        return `<option value="${d.id}" data-name="${name}" data-amt="${amt}">${name} (${formatCurrency(amt)}${stageLabel})</option>`;
    }).join('');

    const templateOptions = (templates || []).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    const defaultTemplateId = templates && templates.length > 0 ? templates[0].id : null;

    const computeDatesForTasks = (startValue, tasks) => {
        let currentStart = dayjs(startValue);
        const computed = [];
        for (const task of tasks) {
            // Default 1 week per task for initial layout
            const end = addBusinessDays(currentStart, 5);
            computed.push({
                ...task,
                start: currentStart.format('YYYY-MM-DD'),
                end: end.format('YYYY-MM-DD')
            });
            currentStart = addBusinessDays(end, 1);
        }
        return computed;
    };

    const initialStartDate = dayjs().format('YYYY-MM-DD');

    showModal('Launch Project Plan', `
        <div class="form-group">
            <label>Select Deal</label>
            <select id="launch-deal" class="form-control launch-project-deal-select">${dealOptions}</select>
            <p id="launch-proposal-note" style="margin:8px 0 0; color:var(--text-medium); font-size:0.9rem;"></p>
        </div>
        <div class="form-group">
            <label>Project Template</label>
            <select id="launch-template" class="form-control">
                ${templateOptions ? templateOptions : '<option value="">No templates available (Create in Shop Settings)</option>'}
                <option value="blank">Blank Project (No Tasks)</option>
            </select>
        </div>
        <div class="launch-project-shell">
            <div class="launch-project-topbar">
                <h4 class="launch-project-title">Phase Scheduling</h4>
                <div class="launch-project-date-grid">
                    <div>
                        <label class="launch-project-date-label">Project Start:</label>
                        <input type="date" id="master-start-date" class="form-control" value="${initialStartDate}">
                    </div>
                    <div>
                        <label class="launch-project-target-label">Target Completion:</label>
                        <input type="date" id="master-end-date" class="form-control launch-project-target-input" value="">
                    </div>
                </div>
            </div>
            <div class="launch-project-phase-header"><span>Phase</span><span>Start</span><span>End</span><span>Est. Hrs</span></div>
            <div id="dynamic-phase-rows"></div>
        </div>
    `, async (modalBody) => {
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const releaseConfirm = () => {
            if (!confirmBtn) return;
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm';
        };
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Launching…';
        }
        const dealSelect = document.getElementById('launch-deal');
        if (!dealSelect?.value) {
            releaseConfirm();
            showToast('Please select a deal.', 'error');
            return false;
        }

        const selectedOpt = dealSelect.options[dealSelect.selectedIndex];
        const projectName = selectedOpt?.dataset?.name || 'Unnamed';
        const dealValue = Number(selectedOpt?.dataset?.amt || 0);
        const startDate = document.getElementById('master-start-date')?.value || initialStartDate;
        const endDate = document.getElementById('master-end-date')?.value || initialStartDate;
        const dealId = dealSelect.value;
        const proposalRow = proposalByDeal.get(String(dealId));
        const plan = summarizeProposalContent(proposalRow?.content_json);
        const projectValue = plan.total > 0 ? Math.round(plan.total * 100) / 100 : dealValue;

        const { data: projectRows, error: projectError } = await supabase.from('projects').insert([{
            deal_id: dealId,
            name: projectName,
            start_date: startDate,
            end_date: endDate,
            project_value: projectValue,
            proposal_id: proposalRow?.id || null,
            status: 'Pre-Production',
            client_summary: null,
            client_summary_updated_at: null
        }]).select();
        
        if (projectError) {
            releaseConfirm();
            showToast(projectError.message, 'error');
            return false;
        }
        const projectId = projectRows?.[0]?.id;
        if (!projectId) {
            releaseConfirm();
            showToast('Project creation failed: missing inserted id.', 'error');
            return false;
        }

        try { sessionStorage.setItem('tw-show-project', String(projectId)); } catch (_) {}

        const insertedNames = new Map();
        const rememberTask = (name, id) => {
            const key = String(name || '').trim().toLowerCase();
            if (key && id) insertedNames.set(key, id);
        };

        const pickedRes = await supabase.from('deal_contacts').select('contact_id, role').eq('deal_id', dealId);
        if (!pickedRes.error && pickedRes.data?.length) {
            await supabase.from('project_contacts').insert(
                pickedRes.data.map((c) => ({ project_id: projectId, contact_id: c.contact_id, role: c.role || 'Client' }))
            );
        } else {
            const { data: dealRow } = await supabase.from('deals_tw').select('account_id').eq('id', dealId).single();
            if (dealRow?.account_id) {
                const { data: accountContacts } = await supabase.from('contacts').select('id').eq('account_id', dealRow.account_id);
                if (accountContacts?.length) {
                    await supabase.from('project_contacts').insert(
                        accountContacts.map((c) => ({ project_id: projectId, contact_id: c.id, role: 'Client' }))
                    );
                }
            }
        }

        // Insert dynamic tasks
        const taskRows = modalBody.querySelectorAll('.launch-project-phase-row');
        let prevTaskId = null;

        for (const row of taskRows) {
            const name = row.dataset.name;
            const tradeId = row.dataset.tradeId;
            const start = row.querySelector('.p-start').value;
            const end = row.querySelector('.p-end').value;
            const hrs = parseFloat(row.querySelector('.p-hrs').value) || 0;

            const payload = {
                project_id: projectId,
                trade_id: tradeId || null,
                name: name,
                start_date: start,
                end_date: end,
                estimated_hours: hrs,
                dependency_task_id: prevTaskId
            };

            const { data: taskData, error: taskError } = await supabase.from('project_tasks').insert(payload).select().single();
            if (!taskError && taskData) {
                prevTaskId = taskData.id;
                rememberTask(name, taskData.id);
            }
        }

        if (plan.materials.length) {
            const itemIds = [...new Set(plan.materials.map(line => line.inventory_item_id).filter(Boolean))];
            const { data: stockRows } = itemIds.length
                ? await supabase.from('inventory_items').select('id, qty_on_hand').in('id', itemIds)
                : { data: [] };
            const onHand = new Map((stockRows || []).map(item => [String(item.id), Number(item.qty_on_hand) || 0]));
            for (const line of plan.materials) {
                const qty = Number(line.qty) || 0;
                if (!line.inventory_item_id || qty <= 0) continue;
                const hand = onHand.get(String(line.inventory_item_id)) || 0;
                await supabase.from('project_bom').insert({
                    project_id: projectId,
                    inventory_item_id: line.inventory_item_id,
                    qty_required: qty,
                    qty_allocated: Math.min(qty, hand),
                    status: 'Pending'
                });
            }
        }

        for (const line of plan.labor) {
            const name = String(line.task_name || line.description || 'Labor').trim();
            const key = name.toLowerCase();
            const hours = Number(line.hours !== '' && line.hours != null ? line.hours : line.qty) || 0;
            if (insertedNames.has(key)) {
                await supabase.from('project_tasks').update({ estimated_hours: hours }).eq('id', insertedNames.get(key));
                continue;
            }
            const { data: taskData } = await supabase.from('project_tasks').insert({
                project_id: projectId,
                name,
                estimated_hours: hours,
                status: 'Pending',
                start_date: startDate,
                end_date: endDate,
                dependency_task_id: prevTaskId
            }).select('id').single();
            if (taskData?.id) {
                prevTaskId = taskData.id;
                rememberTask(name, taskData.id);
            }
        }

        for (const milestone of plan.milestones) {
            const name = String(milestone.taskName || '').trim();
            const key = name.toLowerCase();
            const dates = {
                start_date: milestone.startDate || startDate,
                end_date: milestone.endDate || milestone.startDate || endDate
            };
            if (insertedNames.has(key)) {
                await supabase.from('project_tasks').update(dates).eq('id', insertedNames.get(key));
                continue;
            }
            const { data: taskData } = await supabase.from('project_tasks').insert({
                project_id: projectId,
                name,
                estimated_hours: 0,
                status: 'Pending',
                ...dates,
                dependency_task_id: prevTaskId
            }).select('id').single();
            if (taskData?.id) {
                prevTaskId = taskData.id;
                rememberTask(name, taskData.id);
            }
        }

        await onSuccess({ projectId, dealId });
        return true;
    });

    setTimeout(() => {
        const launchDealSelect = document.getElementById('launch-deal');
        const startInput = document.getElementById('master-start-date');
        const templateSelect = document.getElementById('launch-template');
        const rowsContainer = document.getElementById('dynamic-phase-rows');
        const targetEndInput = document.getElementById('master-end-date');

        if (preSelectDealId && launchDealSelect?.querySelector(`option[value="${preSelectDealId}"]`)) {
            launchDealSelect.value = preSelectDealId;
        }

        const renderTasks = () => {
            if (!rowsContainer) return;
            const tplId = templateSelect.value;
            const startVal = startInput.value || initialStartDate;

            if (tplId === 'blank' || !tplId) {
                rowsContainer.innerHTML = '<div style="padding: 10px; color: var(--text-dim);">No tasks will be auto-generated.</div>';
                targetEndInput.value = startVal;
                return;
            }

            const tasksForTpl = (templateTasks || []).filter(t => t.template_id == tplId).sort((a,b) => a.sort_order - b.sort_order);
            const computed = computeDatesForTasks(startVal, tasksForTpl);

            if (computed.length > 0) {
                targetEndInput.value = computed[computed.length - 1].end;
            } else {
                targetEndInput.value = startVal;
            }

            rowsContainer.innerHTML = computed.map((t, i) => `
                <div class="launch-project-phase-row" data-name="${t.name}" data-trade-id="${t.trade_id}">
                    <span class="launch-project-phase-name" title="${t.name}">${t.name}</span>
                    <input type="date" class="form-control p-start" value="${t.start}">
                    <input type="date" class="form-control p-end" value="${t.end}">
                    <input type="number" class="form-control p-hrs" value="${t.estimated_hours || 0}">
                </div>
            `).join('');
        };

        const proposalNote = document.getElementById('launch-proposal-note');
        const refreshProposalNote = () => {
            if (!proposalNote || !launchDealSelect) return;
            const plan = summarizeProposalContent(proposalByDeal.get(String(launchDealSelect.value))?.content_json);
            proposalNote.textContent = proposalImportBlurb(plan);
        };
        if (launchDealSelect) launchDealSelect.addEventListener('change', refreshProposalNote);
        refreshProposalNote();

        if (templateSelect) templateSelect.addEventListener('change', renderTasks);
        if (startInput) startInput.addEventListener('change', renderTasks);

        // Initial render
        if (defaultTemplateId) {
            templateSelect.value = defaultTemplateId;
        }
        renderTasks();

    }, 100);

    return true;
}
