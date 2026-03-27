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
    const { data: deals, error } = await supabase.from('deals_tw').select('*').order('created_at', { ascending: false });
    if (error) {
        showToast("Error fetching deals: " + error.message, 'error');
        return false;
    }
    if (!deals || deals.length === 0) {
        showToast("No deals found in 'deals_tw' table.", 'error');
        return false;
    }

    const options = deals.map((d) => {
        const name = d.deal_name || d.name || 'Unnamed';
        const amt = d.amount || 0;
        return `<option value="${d.id}" data-name="${name}" data-amt="${amt}">${name} (${formatCurrency(amt)})</option>`;
    }).join('');

    const computeDates = (startValue) => {
        const start = dayjs(startValue);
        const p1End = addBusinessDays(start, 2);
        const p2Start = addBusinessDays(p1End, 1);
        const p2End = addBusinessDays(p2Start, 7);
        const p3Start = addBusinessDays(p2End, 1);
        const p3End = addBusinessDays(p3Start, 14);
        const p4Start = addBusinessDays(p3End, 1);
        const p4End = addBusinessDays(p4Start, 4);

        return {
            p1s: start.format('YYYY-MM-DD'),
            p1e: p1End.format('YYYY-MM-DD'),
            p2s: p2Start.format('YYYY-MM-DD'),
            p2e: p2End.format('YYYY-MM-DD'),
            p3s: p3Start.format('YYYY-MM-DD'),
            p3e: p3End.format('YYYY-MM-DD'),
            p4s: p4Start.format('YYYY-MM-DD'),
            p4e: p4End.format('YYYY-MM-DD'),
            target: p4End.format('YYYY-MM-DD')
        };
    };

    const initialDates = computeDates(dayjs().format('YYYY-MM-DD'));

    showModal('Launch Project Plan', `
        <div class="form-group">
            <label>Select Deal</label>
            <select id="launch-deal" class="form-control launch-project-deal-select">${options}</select>
        </div>
        <div class="launch-project-shell">
            <div class="launch-project-topbar">
                <h4 class="launch-project-title">Phase Scheduling</h4>
                <div class="launch-project-date-grid">
                    <div>
                        <label class="launch-project-date-label">Project Start:</label>
                        <input type="date" id="master-start-date" class="form-control" value="${initialDates.p1s}">
                    </div>
                    <div>
                        <label class="launch-project-target-label">Target Completion:</label>
                        <input type="date" id="master-end-date" class="form-control launch-project-target-input" value="${initialDates.target}">
                    </div>
                </div>
            </div>
            <div class="launch-project-phase-header"><span>Phase</span><span>Start</span><span>End</span><span>Est. Hrs</span></div>
            <div class="launch-project-phase-row"><span class="launch-project-phase-name">Kickoff</span><input type="date" id="p1-start" class="form-control" value="${initialDates.p1s}"><input type="date" id="p1-end" class="form-control" value="${initialDates.p1e}"><input type="number" id="p1-hrs" class="form-control" value="5"></div>
            <div class="launch-project-phase-row"><span class="launch-project-phase-name">Design</span><input type="date" id="p2-start" class="form-control" value="${initialDates.p2s}"><input type="date" id="p2-end" class="form-control" value="${initialDates.p2e}"><input type="number" id="p2-hrs" class="form-control" value="20"></div>
            <div class="launch-project-phase-row"><span class="launch-project-phase-name">Fabrication</span><input type="date" id="p3-start" class="form-control" value="${initialDates.p3s}"><input type="date" id="p3-end" class="form-control" value="${initialDates.p3e}"><input type="number" id="p3-hrs" class="form-control" value="80"></div>
            <div class="launch-project-phase-row"><span class="launch-project-phase-name">Installation</span><input type="date" id="p4-start" class="form-control" value="${initialDates.p4s}"><input type="date" id="p4-end" class="form-control" value="${initialDates.p4e}"><input type="number" id="p4-hrs" class="form-control" value="24"></div>
        </div>
    `, async () => {
        const dealSelect = document.getElementById('launch-deal');
        if (!dealSelect?.value) {
            showToast('Please select a deal.', 'error');
            return false;
        }

        const selectedOpt = dealSelect.options[dealSelect.selectedIndex];
        const projectName = selectedOpt?.dataset?.name || 'Unnamed';
        const projectValue = Number(selectedOpt?.dataset?.amt || 0);
        const startDate = document.getElementById('master-start-date')?.value || initialDates.p1s;
        const endDate = document.getElementById('master-end-date')?.value || initialDates.target;
        const dealId = dealSelect.value;

        const dates = {
            p1s: document.getElementById('p1-start')?.value || initialDates.p1s,
            p1e: document.getElementById('p1-end')?.value || initialDates.p1e,
            p1h: document.getElementById('p1-hrs')?.value || 5,
            p2s: document.getElementById('p2-start')?.value || initialDates.p2s,
            p2e: document.getElementById('p2-end')?.value || initialDates.p2e,
            p2h: document.getElementById('p2-hrs')?.value || 20,
            p3s: document.getElementById('p3-start')?.value || initialDates.p3s,
            p3e: document.getElementById('p3-end')?.value || initialDates.p3e,
            p3h: document.getElementById('p3-hrs')?.value || 80,
            p4s: document.getElementById('p4-start')?.value || initialDates.p4s,
            p4e: document.getElementById('p4-end')?.value || initialDates.p4e,
            p4h: document.getElementById('p4-hrs')?.value || 24
        };

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

        const createTask = async (payload) => {
            const { data, error: taskError } = await supabase.from('project_tasks').insert(payload).select().single();
            if (taskError) throw taskError;
            return data;
        };

        try {
            const t1 = await createTask({
                project_id: projectId,
                trade_id: trades[0]?.id || 1,
                name: 'Kickoff & Plan',
                start_date: dates.p1s,
                end_date: dates.p1e,
                estimated_hours: Number(dates.p1h) || 0
            });
            const t2 = await createTask({
                project_id: projectId,
                trade_id: trades[1]?.id || 2,
                name: 'CAD Drawings',
                start_date: dates.p2s,
                end_date: dates.p2e,
                estimated_hours: Number(dates.p2h) || 0,
                dependency_task_id: t1.id
            });
            const t3 = await createTask({
                project_id: projectId,
                trade_id: trades[2]?.id || 3,
                name: 'Fabrication',
                start_date: dates.p3s,
                end_date: dates.p3e,
                estimated_hours: Number(dates.p3h) || 0,
                dependency_task_id: t2.id
            });
            await createTask({
                project_id: projectId,
                trade_id: trades[4]?.id || 5,
                name: 'Installation',
                start_date: dates.p4s,
                end_date: dates.p4e,
                estimated_hours: Number(dates.p4h) || 0,
                dependency_task_id: t3.id
            });
        } catch (taskError) {
            showToast('Error creating launch tasks: ' + taskError.message, 'error');
            return false;
        }

        await onSuccess({ projectId, dealId });
    });

    setTimeout(() => {
        const launchDealSelect = document.getElementById('launch-deal');
        const startInput = document.getElementById('master-start-date');
        if (preSelectDealId && launchDealSelect?.querySelector(`option[value="${preSelectDealId}"]`)) {
            launchDealSelect.value = preSelectDealId;
        }
        if (!startInput) return;
        startInput.addEventListener('change', (e) => {
            const updated = computeDates(e.target.value || initialDates.p1s);
            const setValue = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.value = value;
            };
            setValue('p1-start', updated.p1s);
            setValue('p1-end', updated.p1e);
            setValue('p2-start', updated.p2s);
            setValue('p2-end', updated.p2e);
            setValue('p3-start', updated.p3s);
            setValue('p3-end', updated.p3e);
            setValue('p4-start', updated.p4s);
            setValue('p4-end', updated.p4e);
            setValue('master-end-date', updated.target);
        });
    }, 100);

    return true;
}
