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
        showToast("No deals found in 'deals_tw' table.", 'error');
        return false;
    }

    const dealOptions = deals.map((d) => {
        const name = d.deal_name || d.name || 'Unnamed';
        const amt = d.amount || 0;
        return `<option value="${d.id}" data-name="${name}" data-amt="${amt}">${name} (${formatCurrency(amt)})</option>`;
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
        const dealSelect = document.getElementById('launch-deal');
        if (!dealSelect?.value) {
            showToast('Please select a deal.', 'error');
            return false;
        }

        const selectedOpt = dealSelect.options[dealSelect.selectedIndex];
        const projectName = selectedOpt?.dataset?.name || 'Unnamed';
        const projectValue = Number(selectedOpt?.dataset?.amt || 0);
        const startDate = document.getElementById('master-start-date')?.value || initialStartDate;
        const endDate = document.getElementById('master-end-date')?.value || initialStartDate;
        const dealId = dealSelect.value;

        const { data: projectRows, error: projectError } = await supabase.from('projects').insert([{
            deal_id: dealId,
            name: projectName,
            start_date: startDate,
            end_date: endDate,
            project_value: projectValue,
            status: 'Pre-Production'
        }]).select();
        
        if (projectError) {
            showToast(projectError.message, 'error');
            return false;
        }
        const projectId = projectRows?.[0]?.id;
        if (!projectId) {
            showToast('Project creation failed: missing inserted id.', 'error');
            return false;
        }

        const { data: proposalRow } = await supabase.from('proposals_tw')
            .select('id')
            .eq('deal_id', dealId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (proposalRow?.id) {
            await supabase.from('projects').update({ proposal_id: proposalRow.id }).eq('id', projectId);
        }

        const { data: dealRow } = await supabase.from('deals_tw').select('account_id').eq('id', dealId).single();
        if (dealRow?.account_id) {
            const { data: accountContacts } = await supabase.from('contacts').select('id').eq('account_id', dealRow.account_id);
            if (accountContacts?.length) {
                await supabase.from('project_contacts').insert(
                    accountContacts.map((c) => ({ project_id: projectId, contact_id: c.id, role: 'Client' }))
                );
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
