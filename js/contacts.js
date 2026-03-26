import { SUPABASE_URL, SUPABASE_ANON_KEY, formatDate, formatMonthYear, formatSimpleDate, parseCsvRow, themes, setupModalListeners, showModal, hideModal, updateActiveNavLink, setupUserMenuAndAuth, loadSVGs, addDays, showToast, setupGlobalSearch, checkAndSetNotifications, initializeAppState, getState, runWhenNavReady, hideGlobalLoader } from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        contacts: [],
        accounts: [],
        activities: [],
        contact_sequences: [],
        sequences: [],
        deals: [],
        tasks: [],
        sequence_steps: [],
        activityTypes: [],
        selectedContactId: null,
        isFormDirty: false,
        nameDisplayFormat: 'lastFirst'
    };
    let globalState = {};

    // --- DOM Element Selectors ---
    const navSidebar = document.querySelector(".nav-sidebar");
    const contactList = document.getElementById("contact-list");
    const contactForm = document.getElementById("contact-form");
    const contactSearch = document.getElementById("contact-search");
    const bulkImportContactsBtn = document.getElementById("bulk-import-contacts-btn");
    const bulkExportContactsBtn = document.getElementById("bulk-export-contacts-btn");
    const contactCsvInput = document.getElementById("contact-csv-input");
    const addContactBtn = document.getElementById("add-contact-btn");
    const deleteContactBtn = document.getElementById("delete-contact-btn");
    const logActivityBtn = document.getElementById("log-activity-btn");
    const assignSequenceSelect = document.getElementById("assign-sequence-select");
    const addTaskContactBtn = document.getElementById("add-task-contact-btn");
    const contactActivitiesList = document.getElementById("contact-activities-list");
    const removeFromSequenceBtn = document.getElementById("remove-from-sequence-btn");
    const completeSequenceBtn = document.getElementById("complete-sequence-btn");
    const sequenceEnrollmentText = document.getElementById("sequence-enrollment-text");
    const sequenceNextStepWrapper = document.getElementById("sequence-next-step-wrapper");
    const ringChartContainer = document.getElementById("ring-chart");
    const ringChartText = document.getElementById("ring-chart-text");
    const contactPendingTaskReminder = document.getElementById("contact-pending-task-reminder");
    const contactFormPlaceholder = document.getElementById("contact-form-placeholder");
    const importContactScreenshotBtn = document.getElementById("import-contact-screenshot-btn");
    const takePictureBtn = document.getElementById("take-picture-btn");
    const cameraInput = document.getElementById("camera-input");
    const aiActivityInsightBtn = document.getElementById("ai-activity-insight-btn");
    const organicStarIndicator = document.getElementById("organic-star-indicator");
    const writeEmailAIButton = document.getElementById("ai-write-email-btn");
    const sortFirstLastBtn = document.getElementById("sort-first-last-btn");
    const sortLastFirstBtn = document.getElementById("sort-last-first-btn");

    let tomSelectAccount = null;
    let tomSelectSequence = null;

    function initTomSelect(el, opts = {}) {
        if (!el || typeof window.TomSelect === "undefined") return null;
        try {
            return new window.TomSelect(el, { create: false, ...opts });
        } catch (e) {
            return null;
        }
    }

    function replacePlaceholders(template, contact, account) {
        if (!template) return '';
        let result = String(template);
        if (contact) {
            const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
            result = result.replace(/\[FirstName\]/gi, contact.first_name || '');
            result = result.replace(/\[LastName\]/gi, contact.last_name || '');
            result = result.replace(/\[FullName\]/gi, fullName);
            result = result.replace(/\[Name\]/gi, fullName);
        }
        if (account) {
            result = result.replace(/\[AccountName\]/gi, account.name || '');
            result = result.replace(/\[Account\]/gi, account.name || '');
        }
        return result;
    }

    function renderContactNextStep(contact, activeSequence, sequence) {
        const currentStep = state.sequence_steps.find(s => s.sequence_id === activeSequence.sequence_id && s.step_number === activeSequence.current_step_number);
        if (!currentStep) return '';
        const account = contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null;
        const description = replacePlaceholders(currentStep.subject || currentStep.message || '', contact, account);
        const stepType = (currentStep.type || '').toLowerCase();
        const dueDate = new Date(activeSequence.next_step_due_date);
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const isDue = dueDate.setHours(0, 0, 0, 0) <= startOfToday.getTime();
        const isPastDue = isDue && dueDate < startOfToday;

        const getStepIcon = () => {
            if (stepType.includes('linkedin')) return { icon: 'fa-paper-plane', title: 'Go to LinkedIn' };
            if (stepType.includes('email')) return { icon: 'fa-envelope', title: 'Send Email' };
            if (stepType.includes('call')) return { icon: 'fa-phone', title: 'Log a call' };
            if (stepType.includes('gift')) return { icon: 'fa-gift', title: 'Complete' };
            return { icon: 'fa-square-check', title: 'Complete' };
        };
        let btnHtml;
        if (isDue) {
            const { icon, title } = getStepIcon();
            if (stepType.includes('linkedin')) {
                btnHtml = `<button type="button" class="btn-primary send-linkedin-message-btn" data-cs-id="${activeSequence.id}" title="${title}"><i class="fa-solid ${icon}"></i></button>`;
            } else if (stepType.includes('email') && contact.email) {
                btnHtml = `<button type="button" class="btn-primary send-email-btn" data-cs-id="${activeSequence.id}" title="${title}"><i class="fa-solid ${icon}"></i></button>`;
            } else if (stepType.includes('call')) {
                btnHtml = `<button type="button" class="btn-primary log-call-btn" data-cs-id="${activeSequence.id}" title="Log a call"><i class="fa-solid ${icon}"></i></button>`;
            } else {
                btnHtml = `<button type="button" class="btn-primary complete-step-btn" data-cs-id="${activeSequence.id}" title="${title}"><i class="fa-solid ${icon}"></i></button>`;
            }
        } else {
            btnHtml = `<div class="sequence-step-due-overlay" title="Due ${formatSimpleDate(activeSequence.next_step_due_date)}">Due ${formatSimpleDate(activeSequence.next_step_due_date)}</div>`;
        }

        const itemClass = `sequence-step-item ${isPastDue ? 'past-due' : ''}`;
        const safeDesc = (description || '').replace(/</g, '&lt;');
        return `
            <div id="sequence-next-step-container" class="sequence-next-step-container">
                <div id="sequence-next-step" class="sequence-steps-list">
                    <div class="${itemClass}">
                        <div class="sequence-step-left">
                            <div class="sequence-step-due">${formatSimpleDate(activeSequence.next_step_due_date)}</div>
                            <div class="sequence-step-actions">${btnHtml}</div>
                        </div>
                        <div class="sequence-step-content">
                            <div class="sequence-step-description sequence-step-description-truncate">${safeDesc}</div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    async function completeStep(csId, processedDescription = null) {
        const cs = state.contact_sequences.find((c) => c.id === csId);
        if (!cs) return;
        const contact = state.contacts.find((c) => c.id === cs.contact_id);
        const currentStepInfo = state.sequence_steps.find(s => s.sequence_id === cs.sequence_id && s.step_number === cs.current_step_number);
        if (contact && currentStepInfo) {
            const { error: updateStepError } = await supabase
                .from('contact_sequence_steps')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('contact_sequence_id', cs.id)
                .eq('sequence_step_id', currentStepInfo.id);
            if (updateStepError) {
                console.error("Error updating contact_sequence_step:", updateStepError);
                return;
            }
            const account = contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null;
            const rawDescription = currentStepInfo.subject || currentStepInfo.message || "Completed step";
            const finalDescription = replacePlaceholders(rawDescription, contact, account);
            const descriptionForLog = processedDescription || finalDescription;
            await supabase.from("activities").insert([{
                contact_id: contact.id,
                account_id: contact.account_id,
                date: new Date().toISOString(),
                type: `Sequence: ${currentStepInfo.type}`,
                description: descriptionForLog,
                user_id: globalState.effectiveUserId
            }]);
        }
        const allStepsInSequence = state.sequence_steps
            .filter(s => s.sequence_id === cs.sequence_id)
            .sort((a, b) => a.step_number - b.step_number);
        const nextStep = allStepsInSequence.find(s => s.step_number > cs.current_step_number);
        if (nextStep) {
            await supabase.from("contact_sequences").update({
                current_step_number: nextStep.step_number,
                last_completed_date: new Date().toISOString(),
                next_step_due_date: addDays(new Date(), nextStep.delay_days).toISOString()
            }).eq("id", cs.id);
        } else {
            await supabase.from("contact_sequences").update({ status: "Completed" }).eq("id", cs.id);
        }
        await loadAllData();
    }

    function renderRingChartSegments(container, totalSteps, currentStepNum) {
        if (!totalSteps || totalSteps < 1) {
            container.innerHTML = '';
            return;
        }
        const cx = 50, cy = 50, outerR = 48, innerR = 35;
        const gapDeg = 2;
        const stepDeg = (360 - totalSteps * gapDeg) / totalSteps;
        const paths = [];
        for (let i = 0; i < totalSteps; i++) {
            const startDeg = -90 + i * (stepDeg + gapDeg) + gapDeg / 2;
            const endDeg = startDeg + stepDeg;
            const startRad = (startDeg * Math.PI) / 180;
            const endRad = (endDeg * Math.PI) / 180;
            const x1 = cx + outerR * Math.cos(startRad);
            const y1 = cy + outerR * Math.sin(startRad);
            const x2 = cx + outerR * Math.cos(endRad);
            const y2 = cy + outerR * Math.sin(endRad);
            const x3 = cx + innerR * Math.cos(endRad);
            const y3 = cy + innerR * Math.sin(endRad);
            const x4 = cx + innerR * Math.cos(startRad);
            const y4 = cy + innerR * Math.sin(startRad);
            const pathD = `M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 0 0 ${x4} ${y4} Z`;
            const stepNumber = i + 1;
            const fill = stepNumber < currentStepNum || stepNumber === currentStepNum
                ? 'var(--primary-gold)'
                : 'var(--bg-medium)';
            paths.push(`<path d="${pathD}" fill="${fill}" stroke="var(--card-bg)" stroke-width="0.8" stroke-linejoin="round" class="ring-chart-segment"/>`);
        }
        container.innerHTML = `<svg class="ring-chart-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${paths.join('')}</svg>`;
    }

    function openLogCallModal(csId) {
        const cs = state.contact_sequences.find(c => c.id === csId);
        if (!cs) return;
        const contact = state.contacts.find(c => c.id === cs.contact_id);
        if (!contact) return;
        const currentStep = state.sequence_steps.find(s => s.sequence_id === cs.sequence_id && s.step_number === cs.current_step_number);
        if (!currentStep) return;
        const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';
        const phone = (contact.phone || '').trim();
        const telHref = phone ? `tel:${phone.replace(/\D/g, '')}` : '';
        const phoneDisplay = phone || 'No phone number';
        const phoneHtml = telHref ? `<a href="${telHref}" class="log-call-phone-link">${phoneDisplay}</a>` : `<span class="text-[var(--text-medium)]">${phoneDisplay}</span>`;
        const contactActivities = state.activities.filter(a => a.contact_id === contact.id).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);
        let activitiesHtml = contactActivities.map(act => {
            const account = act.account_id ? state.accounts.find(a => a.id === act.account_id) : null;
            const meta = account ? account.name : 'N/A';
            return `<div class="recent-activity-item"><div class="activity-icon-wrap"><i class="fas fa-phone"></i></div><div class="activity-body"><div class="activity-meta">${meta}</div><div class="activity-description">${act.type}: ${(act.description || '').replace(/</g, '&lt;')}</div><div class="activity-date">${formatDate(act.date)}</div></div></div>`;
        }).join('');
        if (!activitiesHtml) activitiesHtml = '<p class="text-sm text-[var(--text-medium)] py-2">No recent activities for this contact.</p>';
        const bodyHtml = `<div class="log-call-modal-body"><p class="mb-3"><strong>${contactName.replace(/</g, '&lt;')}</strong></p><p class="mb-3">${phoneHtml}</p><label class="block text-sm font-medium mb-1">Call notes (optional)</label><textarea id="modal-call-notes" class="w-full border border-[var(--border-color)] px-3 py-2 text-sm bg-[var(--bg-light)] min-h-[80px] mb-3" placeholder="Notes from the call..."></textarea><div class="log-call-recent-activities"><div class="text-xs font-semibold text-[var(--text-medium)] mb-2">Recent activities</div><div class="log-call-activities-list max-h-[200px] overflow-y-auto">${activitiesHtml}</div></div></div>`;
        showModal('Log a call', bodyHtml, async () => {
            const notes = (document.getElementById('modal-call-notes')?.value || '').trim();
            await completeStep(csId, notes || 'Call completed');
        }, true, `<button id="modal-confirm-btn" class="btn-primary">Log</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
    }

    // --- Dirty Check and Navigation ---
    const handleNavigation = (url) => {
        if (state.isFormDirty) {
            showModal("Unsaved Changes", "You have unsaved changes that will be lost. Are you sure you want to leave?", () => {
                state.isFormDirty = false;
                window.location.href = url;
            }, true, `<button id="modal-confirm-btn" class="btn-primary">Discard & Leave</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        } else {
            window.location.href = url;
        }
    };

    const confirmAndSwitchContact = (newContactId) => {
        if (state.isFormDirty) {
            showModal("Unsaved Changes", "You have unsaved changes. Are you sure you want to switch contacts?", () => {
                state.isFormDirty = false;
                state.selectedContactId = newContactId;
                renderContactList();
                renderContactDetails();
                hideModal();
            }, true, `<button id="modal-confirm-btn" class="btn-primary">Discard & Switch</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        } else {
            state.selectedContactId = newContactId;
            renderContactList();
            renderContactDetails();
        }
    };

    // --- Data Fetching ---
    const LIST_LOADING_HTML = '<div class="list-loading-state"><div class="list-loading-spinner" aria-hidden="true"></div><p class="list-loading-title">Loading</p><p class="list-loading-subtitle">Fetching data…</p></div>';

    async function loadAllData() {
        if (!globalState.currentUser) {
            hideGlobalLoader();
            return;
        }
        if (contactList) contactList.innerHTML = LIST_LOADING_HTML;
        try {
            const [
                contactsRes,
                accountsRes,
                activitiesRes,
                contactSequencesRes,
                sequencesRes,
                dealsRes,
                tasksRes,
                sequenceStepsRes,
                activityTypesRes
            ] = await Promise.all([
                supabase.from('contacts').select('*').eq('user_id', globalState.effectiveUserId),
                supabase.from('accounts').select('*').eq('user_id', globalState.effectiveUserId),
                supabase.from('activities').select('*').eq('user_id', globalState.effectiveUserId),
                supabase.from('contact_sequences').select('*').eq('user_id', globalState.effectiveUserId),
                supabase.from('sequences').select('*').eq('user_id', globalState.effectiveUserId),
                supabase.from('deals_tw').select('*').eq('user_id', globalState.effectiveUserId),
                supabase.from('tasks').select('*').eq('user_id', globalState.effectiveUserId),
                supabase.from('sequence_steps').select('*'),
                supabase.from('activity_types').select('*')
            ]);

            const processResponse = (res, tableName) => {
                if (res.error) console.error(`Error loading ${tableName}:`, res.error.message);
                return res.data || [];
            };

            state.contacts = processResponse(contactsRes, 'contacts');
            state.accounts = processResponse(accountsRes, 'accounts');
            state.activities = processResponse(activitiesRes, 'activities');
            state.contact_sequences = processResponse(contactSequencesRes, 'contact_sequences');
            state.deals = processResponse(dealsRes, 'deals');
            state.tasks = processResponse(tasksRes, 'tasks');
            state.sequence_steps = processResponse(sequenceStepsRes, 'sequence_steps');
            state.activityTypes = [...new Map(processResponse(activityTypesRes, 'activity_types').map(item => [item.type_name, item])).values()];
            state.sequences = processResponse(sequencesRes, 'sequences');

        } catch (error) {
            console.error("Critical error in loadAllData:", error);
        } finally {
            hideGlobalLoader();
            renderContactList();
            if (state.selectedContactId) {
                const updatedContact = state.contacts.find(c => c.id === state.selectedContactId);
                if (updatedContact) {
                    renderContactDetails();
                } else {
                    state.selectedContactId = null;
                    renderContactDetails();
                }
            } else {
                renderContactDetails();
            }
        }
    }
    function getActivityIconInfo(act) {
        const typeLower = (act.type || '').toLowerCase();
        if (typeLower.includes("cognito") || typeLower.includes("intelligence")) return { iconClass: "icon-default", icon: "fa-magnifying-glass", iconPrefix: "fas" };
        if (typeLower.includes("email")) return { iconClass: "icon-email", icon: "fa-envelope", iconPrefix: "fas" };
        if (typeLower.includes("call")) return { iconClass: "icon-call", icon: "fa-phone", iconPrefix: "fas" };
        if (typeLower.includes("meeting")) return { iconClass: "icon-meeting", icon: "fa-video", iconPrefix: "fas" };
        if (typeLower.includes("linkedin")) return { iconClass: "icon-linkedin", icon: "fa-linkedin-in", iconPrefix: "fa-brands" };
        return { iconClass: "icon-default", icon: "fa-circle-info", iconPrefix: "fas" };
    }
    function updateSortToggleUI() {
        if (state.nameDisplayFormat === 'firstLast') {
            sortFirstLastBtn?.classList.add('active');
            sortLastFirstBtn?.classList.remove('active');
        } else {
            sortFirstLastBtn?.classList.remove('active');
            sortLastFirstBtn?.classList.add('active');
        }
    }
    
    // --- Render Functions ---
    const renderContactList = () => {
        if (!contactList) return;
        const searchTerm = contactSearch.value.toLowerCase();
        
        const filteredContacts = state.contacts
            .filter(c => (c.first_name || "").toLowerCase().includes(searchTerm) || (c.last_name || "").toLowerCase().includes(searchTerm) || (c.email || "").toLowerCase().includes(searchTerm))
            .sort((a, b) => {
                if (state.nameDisplayFormat === 'firstLast') {
                    return (a.first_name || "").localeCompare(b.first_name || "");
                } else { // lastFirst
                    return (a.last_name || "").localeCompare(b.last_name || "");
                }
            });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        contactList.innerHTML = "";
        filteredContacts.forEach((contact) => {
            const item = document.createElement("div");
            item.className = "list-item";
            const inActiveSequence = state.contact_sequences.some(cs => cs.contact_id === contact.id && cs.status === "Active");
            const hasRecentActivity = state.activities.some(act => act.contact_id === contact.id && new Date(act.date) > thirtyDaysAgo);
            
            const organicIcon = contact.is_organic ? '<span class="organic-star-list">★</span>' : '';
            const sequenceIcon = inActiveSequence ? '<span class="sequence-status-icon"><i class="fa-solid fa-paper-plane"></i></span>' : '';
            const hotIcon = hasRecentActivity ? '<span class="hot-contact-icon">🔥</span>' : '';

            const displayName = state.nameDisplayFormat === 'firstLast'
                ? `${contact.first_name} ${contact.last_name}`
                : `${contact.last_name}, ${contact.first_name}`;

            const accountName = state.accounts.find(a => a.id === contact.account_id)?.name || 'No Account';
            item.innerHTML = `
                <div class="contact-info">
                    <div class="contact-picker-item-icons${!contact.is_organic ? ' contact-picker-item-icons-empty' : ''}">${organicIcon}</div>
                    <div class="contact-name">${displayName}</div>
                    <div class="contact-picker-row-icons">${sequenceIcon}${hotIcon}</div>
                    <small class="account-name">${accountName}</small>
                </div>
            `;
            item.dataset.id = contact.id;
            if (contact.id === state.selectedContactId) item.classList.add("selected");
            contactList.appendChild(item);
        });
    };

    const populateAccountDropdown = () => {
        const contactAccountNameSelect = contactForm.querySelector("#contact-account-name");
        if (!contactAccountNameSelect) return;
        if (tomSelectAccount) {
            tomSelectAccount.destroy();
            tomSelectAccount = null;
        }
        contactAccountNameSelect.innerHTML = '<option value="">-- No Account --</option>';
        state.accounts
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
            .forEach((acc) => {
                const o = document.createElement("option");
                o.value = acc.id;
                o.textContent = acc.name;
                contactAccountNameSelect.appendChild(o);
            });
        tomSelectAccount = initTomSelect(contactAccountNameSelect, { placeholder: "-- No Account --" });
    };

    const renderContactDetails = () => {
        const contact = state.contacts.find((c) => c.id === state.selectedContactId);
        if (!contactForm) return;

        if (contactPendingTaskReminder && contact) {
            const pendingContactTasks = state.tasks.filter(task => task.status === 'Pending' && task.contact_id === contact.id);
            if (pendingContactTasks.length > 0) {
                const taskCount = pendingContactTasks.length;
                contactPendingTaskReminder.textContent = `You have ${taskCount} pending task${taskCount > 1 ? 's' : ''} for this contact.`;
                contactPendingTaskReminder.classList.remove('hidden');
            } else {
                contactPendingTaskReminder.classList.add('hidden');
            }
        } else if (contactPendingTaskReminder) {
            contactPendingTaskReminder.classList.add('hidden');
        }
        
        populateAccountDropdown();

        if (contact) {
            contactForm.classList.remove('hidden');
            if (contactFormPlaceholder) contactFormPlaceholder.classList.add('hidden');

            if (organicStarIndicator) {
                organicStarIndicator.classList.toggle('is-organic', !!contact.is_organic);
            }

            contactForm.querySelector("#contact-id").value = contact.id;
            contactForm.querySelector("#contact-first-name").value = contact.first_name || "";
            contactForm.querySelector("#contact-last-name").value = contact.last_name || "";
            contactForm.querySelector("#contact-email").value = contact.email || "";
            contactForm.querySelector("#contact-phone").value = contact.phone || "";
            contactForm.querySelector("#contact-title").value = contact.title || "";
            contactForm.querySelector("#contact-notes").value = contact.notes || "";
            contactForm.querySelector("#contact-last-saved").textContent = contact.last_saved ? `Last Saved: ${formatDate(contact.last_saved)}` : "Not yet saved.";
            if (tomSelectAccount) tomSelectAccount.setValue(contact.account_id || "");
            else contactForm.querySelector("#contact-account-name").value = contact.account_id || "";

            state.isFormDirty = false;

            contactActivitiesList.innerHTML = "";
            const activities = state.activities
                .filter((act) => act.contact_id === contact.id)
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            if (activities.length === 0) {
                contactActivitiesList.innerHTML = '<p class="recent-activities-empty text-sm px-4 py-6">No activities yet.</p>';
            } else {
                activities.forEach((act) => {
                    const { iconClass, icon, iconPrefix } = getActivityIconInfo(act);
                    const account = act.account_id ? state.accounts.find(a => a.id === act.account_id) : null;
                    const meta = account ? account.name : act.type;
                    const item = document.createElement("div");
                    item.className = "recent-activity-item";
                    item.innerHTML = `
                        <div class="activity-icon-wrap ${iconClass}"><i class="${iconPrefix || "fas"} ${icon}"></i></div>
                        <div class="activity-body">
                            <div class="activity-meta">${meta}</div>
                            <div class="activity-description">${(act.type || '')}: ${(act.description || '').replace(/</g, '&lt;')}</div>
                            <div class="activity-date">${formatDate(act.date)}</div>
                        </div>
                    `;
                    contactActivitiesList.appendChild(item);
                });
            }
            
            const activeSequence = state.contact_sequences.find(cs => cs.contact_id === contact.id && cs.status === "Active");
            if (sequenceEnrollmentText && ringChartText) {
                if (activeSequence) {
                    const sequence = state.sequences.find((s) => s.id === activeSequence.sequence_id);
                    const allSequenceSteps = state.sequence_steps.filter((s) => s.sequence_id === activeSequence.sequence_id);
                    const totalSteps = allSequenceSteps.length;
                    const currentStep = activeSequence.current_step_number;
                    const lastCompleted = currentStep - 1;
                    const ringProgress = document.getElementById('ring-chart-progress');
                    if (ringProgress) {
                        if (totalSteps > 0) {
                            renderRingChartSegments(ringProgress, totalSteps, currentStep);
                        } else {
                            ringProgress.innerHTML = '';
                            ringProgress.style.setProperty('--p', 0);
                        }
                    }
                    if (ringChartContainer) ringChartContainer.classList.remove('ring-chart-inactive');
                    if (ringChartText) ringChartText.textContent = `${lastCompleted}/${totalSteps}`;
                    const sequenceName = sequence ? sequence.name : 'Unknown';
                    const seqId = sequence ? sequence.id : activeSequence.sequence_id;
                    sequenceEnrollmentText.innerHTML = `<a href="sequences.html?sequenceId=${seqId}" class="sequence-name-link">${sequenceName.replace(/</g, '&lt;')}</a>`;
                    sequenceEnrollmentText.classList.remove('sequence-enrollment-empty');
                    if (removeFromSequenceBtn) removeFromSequenceBtn.classList.remove('hidden');
                    if (completeSequenceBtn) completeSequenceBtn.classList.remove('hidden');
                    if (sequenceNextStepWrapper) {
                        sequenceNextStepWrapper.innerHTML = renderContactNextStep(contact, activeSequence, sequence);
                    }
                } else {
                    if (ringChartContainer) ringChartContainer.classList.add('ring-chart-inactive');
                    const ringProgressEl = document.getElementById('ring-chart-progress');
                    if (ringProgressEl) {
                        ringProgressEl.innerHTML = '';
                        ringProgressEl.style.setProperty('--p', 0);
                    }
                    sequenceEnrollmentText.textContent = 'Not in a sequence.';
                    sequenceEnrollmentText.classList.add('sequence-enrollment-empty');
                    if (sequenceNextStepWrapper) sequenceNextStepWrapper.innerHTML = '';
                    if (removeFromSequenceBtn) removeFromSequenceBtn.classList.add('hidden');
                    if (completeSequenceBtn) completeSequenceBtn.classList.add('hidden');
                }
            }
            populateAssignSequenceDropdown();
        } else {
            // No contact selected: show form with empty fields (load on page load, don't wait for select)
            contactForm.classList.remove('hidden');
            if (contactFormPlaceholder) contactFormPlaceholder.classList.add('hidden');
            if (contactForm) {
                contactForm.reset();
                contactForm.querySelector("#contact-id").value = "";
                contactForm.querySelector("#contact-first-name").value = "";
                contactForm.querySelector("#contact-last-name").value = "";
                contactForm.querySelector("#contact-email").value = "";
                contactForm.querySelector("#contact-phone").value = "";
                contactForm.querySelector("#contact-title").value = "";
                contactForm.querySelector("#contact-notes").value = "";
                contactForm.querySelector("#contact-last-saved").textContent = "Not yet saved.";
                const contactAccountNameSelect = contactForm.querySelector("#contact-account-name");
                if (contactAccountNameSelect) contactAccountNameSelect.innerHTML = '<option value="">-- No Account --</option>';
                populateAccountDropdown();
            }
            if (organicStarIndicator) organicStarIndicator.classList.remove('is-organic');
            if (contactPendingTaskReminder) contactPendingTaskReminder.classList.add('hidden');
            if (contactActivitiesList) contactActivitiesList.innerHTML = "";
            if (sequenceNextStepWrapper) sequenceNextStepWrapper.innerHTML = '';
            if (ringChartContainer) ringChartContainer.classList.add('ring-chart-inactive');
            const ringProgressNoContact = document.getElementById('ring-chart-progress');
            if (ringProgressNoContact) {
                ringProgressNoContact.innerHTML = '';
                ringProgressNoContact.style.setProperty('--p', 0);
            }
            if (sequenceEnrollmentText) {
                sequenceEnrollmentText.textContent = "Select a contact to see details.";
                sequenceEnrollmentText.classList.add('sequence-enrollment-empty');
            }
            if (removeFromSequenceBtn) removeFromSequenceBtn.classList.add('hidden');
            if (completeSequenceBtn) completeSequenceBtn.classList.add('hidden');
            if (assignSequenceSelect) {
                if (tomSelectSequence) {
                    tomSelectSequence.destroy();
                    tomSelectSequence = null;
                }
                assignSequenceSelect.classList.add('hidden');
                assignSequenceSelect.value = '';
            }
        }
    };
    
    const hideContactDetails = (hideForm = true, clearSelection = false) => {
        if (contactForm && hideForm) contactForm.classList.add('hidden');
        if (contactFormPlaceholder) contactFormPlaceholder.classList.remove('hidden');
        if (tomSelectAccount) {
            tomSelectAccount.destroy();
            tomSelectAccount = null;
        }
        if (tomSelectSequence) {
            tomSelectSequence.destroy();
            tomSelectSequence = null;
        }
        if (contactForm) {
            contactForm.reset();
            contactForm.querySelector("#contact-id").value = "";
            contactForm.querySelector("#contact-last-saved").textContent = "Not yet saved.";
            const contactAccountNameSelect = contactForm.querySelector("#contact-account-name");
            if (contactAccountNameSelect) contactAccountNameSelect.innerHTML = '<option value="">-- No Account --</option>';
        }
        if(contactActivitiesList) contactActivitiesList.innerHTML = "";
        if (sequenceNextStepWrapper) sequenceNextStepWrapper.innerHTML = '';
        if (ringChartContainer) ringChartContainer.classList.add('ring-chart-inactive');
        const ringProgressHide = document.getElementById('ring-chart-progress');
        if (ringProgressHide) {
            ringProgressHide.innerHTML = '';
            ringProgressHide.style.setProperty('--p', 0);
        }
        if (sequenceEnrollmentText) {
            sequenceEnrollmentText.textContent = "Select a contact to see details.";
            sequenceEnrollmentText.classList.add('sequence-enrollment-empty');
        }
        if(removeFromSequenceBtn) removeFromSequenceBtn.classList.add('hidden');
        if(completeSequenceBtn) completeSequenceBtn.classList.add('hidden');
        if(assignSequenceSelect) {
            assignSequenceSelect.classList.add('hidden');
            assignSequenceSelect.value = '';
        }
        if(contactPendingTaskReminder) contactPendingTaskReminder.classList.add('hidden');

        if (clearSelection) {
            state.selectedContactId = null;
            document.querySelectorAll(".list-item").forEach(item => item.classList.remove("selected"));
            state.isFormDirty = false;
        }
        document.getElementById('contact-details')?.classList.remove('active');
        document.getElementById('contact-details-scrim')?.classList.remove('visible');
        document.getElementById('contact-details-scrim')?.setAttribute('aria-hidden', 'true');
    };
    
    async function processAndImportImage(base64Image) {
        showToast("Analyzing image data...", 'info');
        
        try {
            const { data, error } = await supabase.functions.invoke('extract-contact-info', {
                body: { image: base64Image }
            });

            if (error) throw error;
            
            const contactData = data;

            let accountIdToLink = null;
            if (contactData.company) {
                const matchingAccount = state.accounts.find(
                    acc => acc.name && contactData.company && acc.name.toLowerCase() === contactData.company.toLowerCase()
                );
                if (matchingAccount) {
                    accountIdToLink = matchingAccount.id;
                }
            }

            let contactId = null;
            if (contactData.first_name || contactData.last_name) {
                const existingContact = state.contacts.find(c =>
                    c.first_name === contactData.first_name && c.last_name === contactData.last_name
                );
                if (existingContact) {
                    contactId = existingContact.id;
                }
            }

            if (contactId) {
                await supabase.from("contacts").update({
                    email: contactData.email || '',
                    phone: contactData.phone || '',
                    title: contactData.title || '',
                    account_id: accountIdToLink
                }).eq('id', contactId);
            } else {
                const { data: newContactArr, error: insertError } = await supabase.from("contacts").insert([
                    {
                        first_name: contactData.first_name || '',
                        last_name: contactData.last_name || '',
                        email: contactData.email || '',
                        phone: contactData.phone || '',
                        title: contactData.title || '',
                        account_id: accountIdToLink,
                        user_id: globalState.effectiveUserId
                    }
                ]).select();
                if (insertError) throw insertError;
                contactId = newContactArr?.[0]?.id;
            }

            await loadAllData();
            state.selectedContactId = contactId;
            renderContactList();
            renderContactDetails();

            showToast(`Contact information for ${contactData.first_name || ''} ${contactData.last_name || ''} imported successfully!`, 'success');

        } catch (error) {
            console.error("Error invoking Edge Function or saving data:", error);
            showToast(`Failed to process image: ${error.message}. Please try again.`, 'error');
        } finally {
            hideModal();
        }
    }

    async function handlePasteEvent(event) {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        let blob = null;
        
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                blob = item.getAsFile();
                break;
            }
        }
        
        if (blob) {
            const modalBody = showModal("Importing Contact", `<div class="loader"></div><p class="placeholder-text" style="text-align: center;">Processing image from clipboard...</p>`, null, false, `<button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Image = e.target.result.split(',')[1];
                await processAndImportImage(base64Image);
            };
            reader.readAsDataURL(blob);
        } else {
            showModal("Error", "No image found in clipboard. Please ensure you copied an image.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        }
    }

    async function handleCameraInputChange(event) {
        const file = event.target.files[0];
        if (file) {
            const modalBody = showModal("Importing Contact", `<div class="loader"></div><p class="placeholder-text" style="text-align: center;">Processing image from camera...</p>`, null, false, `<button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Image = e.target.result.split(',')[1];
                await processAndImportImage(base64Image);
            };
            reader.readAsDataURL(file);
        } else {
            showModal("Error", "No image captured from camera.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        }
    }

    // --- AI EMAIL GENERATION ---
    async function showAIEmailModal() {
        if (!state.selectedContactId) {
            showModal("Error", "Please select a contact to write an email for.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return;
        }

        const contact = state.contacts.find(c => c.id === state.selectedContactId);
        if (!contact?.email) {
            showModal("Error", "The selected contact does not have an email address.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return;
        }

        const initialModalBody = `
            <p><strong>To:</strong> ${contact.first_name} ${contact.last_name} &lt;${contact.email}&gt;</p>
            <div id="ai-prompt-container">
                <label style="font-weight: 600;">Prompt:</label>
                <textarea id="ai-email-prompt" rows="3" placeholder="e.g., 'Write a follow-up email about our meeting.'"></textarea>
            </div>
            <div class="email-response-container hidden">
                <hr>
                <label>AI-Generated Subject:</label>
                <input type="text" id="ai-email-subject" />
                <label>AI-Generated Draft:</label>
                <textarea id="ai-email-body" rows="10"></textarea>
                <div class="flex-end-buttons">
                    <button id="open-email-client-btn" class="btn-primary">Open Email Client</button>
                </div>
            </div>
        `;
        showModal(
            `Write Email with AI for ${contact.first_name}`,
            initialModalBody,
            null,
            true,
            `<button id="ai-generate-email-btn" class="btn-primary">Generate</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`
        );

        // Use setTimeout to attach the listener after the modal is rendered
        setTimeout(() => {
            const generateBtn = document.getElementById('ai-generate-email-btn');
            if (generateBtn) {
                generateBtn.addEventListener('click', () => generateEmailWithAI(contact));
            }
        }, 0);
    }
    async function generateEmailWithAI(contact) {
        const userPrompt = document.getElementById('ai-email-prompt').value;
        const promptContainer = document.getElementById('ai-prompt-container');
        const responseContainer = document.querySelector('.email-response-container');
        const aiEmailSubject = document.getElementById('ai-email-subject');
        const aiEmailBody = document.getElementById('ai-email-body');
        const generateButton = document.getElementById('ai-generate-email-btn');

        if (!userPrompt) {
            showToast("Please enter a prompt.", "error");
            return;
        }

        const originalButtonText = generateButton.textContent;
        generateButton.disabled = true;
        generateButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generating...`;

        const contactName = `${contact.first_name} ${contact.last_name}`;
        const accountName = state.accounts.find(acc => acc.id === contact.account_id)?.name || '';

        try {
            const { data, error } = await supabase.functions.invoke('generate-prospect-email', {
                body: {
                    userPrompt: userPrompt,
                    contactName: contactName,
                    accountName: accountName
                }
            });

            if (error) throw error;
            
            // Find the account context for scrubbing
            const account = state.accounts.find(acc => acc.id === contact.account_id);
            
            // --- SCRUBBING LOGIC APPLIED HERE ---
            const scrubbedSubject = scrubAIMergeFields(data.subject || "No Subject", contact, account);
            const scrubbedBody = scrubAIMergeFields(data.body || "Failed to generate content.", contact, account);
            
            aiEmailSubject.value = scrubbedSubject;
            aiEmailBody.value = scrubbedBody;
            
            promptContainer.classList.add('hidden');
            responseContainer.classList.remove('hidden');

            // Add the listener for the 'Open Email Client' button now that it's visible
            const openEmailBtn = document.getElementById('open-email-client-btn');
            if(openEmailBtn) {
                openEmailBtn.addEventListener('click', () => openEmailClient(contact));
            }
            
            showToast("Email generated successfully!", "success");

        } catch (e) {
            console.error("Error generating email:", e);
            aiEmailSubject.value = "Error";
            aiEmailBody.value = "An error occurred while generating the email. Please try again.";
            
            promptContainer.classList.add('hidden');
            responseContainer.classList.remove('hidden');
            
            showToast("Failed to generate email.", "error");
        } finally {
            generateButton.disabled = false;
            generateButton.textContent = originalButtonText;
        }
    }
    async function openEmailClient(contact) {
        const emailSubject = document.getElementById('ai-email-subject').value;
        const emailBody = document.getElementById('ai-email-body').value;

        // Let encodeURIComponent handle the newlines automatically.
        const encodedBody = encodeURIComponent(emailBody); 
        
        const mailtoLink = `mailto:${contact.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodedBody}`;
        window.open(mailtoLink, '_blank');

        try {
            globalState = getState();
            const { error } = await supabase.from('activities').insert({
                contact_id: state.selectedContactId,
                account_id: contact?.account_id,
                type: 'AI-Generated Email',
                description: `AI-generated email draft opened in mail client. Subject: "${emailSubject}".`,
                user_id: globalState.effectiveUserId,
                date: new Date().toISOString()
            });

            if (error) {
                console.error("Error logging AI email activity:", error);
                showToast("Email activity logged with errors.", "warning");
            } else {
                showToast("Email activity successfully logged!", "success");
            }

            await loadAllData();
            hideModal();
        } catch (e) {
            console.error("Error logging activity:", e);
        }
    }
    async function handleAssignSequenceToContact(contactId, sequenceId, userId) {
        // 1. Fetch all steps for the chosen sequence, sorted by step number
        const { data: steps, error: stepsError } = await supabase
            .from('sequence_steps')
            .select('*')
            .eq('sequence_id', sequenceId)
            .order('step_number');

        if (stepsError || !steps || steps.length === 0) {
            showModal("Error", "Could not find steps for this sequence.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return false;
        }

        // 2. Create the main tracking record in `contact_sequences`
        const firstStep = steps[0];
        const firstDueDate = new Date();
        firstDueDate.setDate(firstDueDate.getDate() + (firstStep.delay_days || 0));

        const { data: contactSequence, error: csError } = await supabase
            .from('contact_sequences')
            .insert({
                contact_id: contactId,
                sequence_id: sequenceId,
                user_id: userId,
                status: 'Active',
                current_step_number: firstStep.step_number,
                next_step_due_date: firstDueDate.toISOString()
            })
            .select()
            .single();

        if (csError) {
            showModal("Error", 'Failed to enroll contact in sequence: ' + csError.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return false;
        }

        // 3. Prepare a to-do item for each step to be inserted into our new table
        let runningDueDate = new Date(); // This will be the base for calculating delays
        const contactStepRecords = steps.map((step, index) => {
            // The due date is relative to the *previous* step's completion. For initial creation, we chain them from today.
            if (index > 0) {
                 runningDueDate.setDate(runningDueDate.getDate() + (step.delay_days || 0));
            } else {
                 // The first step's due date is calculated from today
                 runningDueDate.setDate(new Date().getDate() + (step.delay_days || 0));
            }
            
            return {
                contact_id: contactId,
                sequence_id: sequenceId,
                sequence_step_id: step.id,
                contact_sequence_id: contactSequence.id,
                user_id: userId,
                status: 'pending',
                due_date: new Date(runningDueDate).toISOString(),
                assigned_to: step.assigned_to
            };
        });

        // 4. Bulk insert all the step tracking records
        const { error: cssError } = await supabase
            .from('contact_sequence_steps')
            .insert(contactStepRecords);
            
        if (cssError) {
            showModal("Error", 'Failed to create individual step tasks: ' + cssError.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            await supabase.from('contact_sequences').delete().eq('id', contactSequence.id); // Roll back
            return false;
        }
        
        return true; // Indicate success
    }

    function populateAssignSequenceDropdown() {
        if (!assignSequenceSelect) return;
        if (tomSelectSequence) {
            tomSelectSequence.destroy();
            tomSelectSequence = null;
        }
        const currentContactSequence = state.selectedContactId
            ? state.contact_sequences.find(cs => cs.contact_id === state.selectedContactId && cs.status === 'Active')
            : null;
        const showDropdown = state.selectedContactId && !currentContactSequence;

        assignSequenceSelect.innerHTML = '<option value="">Assign Sequence</option>' +
            state.sequences.map(s => `<option value="${s.id}">${s.is_abm ? '[ABM] ' : ''}${s.name}</option>`).join('');
        assignSequenceSelect.value = '';
        if (showDropdown) {
            assignSequenceSelect.classList.remove('hidden');
            tomSelectSequence = initTomSelect(assignSequenceSelect, {
                placeholder: 'Assign Sequence',
                searchField: [],
                dropdownParent: 'body',
                render: {
                    dropdown: function () {
                        const d = document.createElement('div');
                        d.className = 'ts-dropdown tom-select-no-search';
                        return d;
                    }
                }
            });
        } else {
            assignSequenceSelect.classList.add('hidden');
        }
    }

    function setupPageEventListeners() {
        setupModalListeners();
        
        navSidebar.addEventListener('click', (e) => {
            const navButton = e.target.closest('a.nav-button');
            if (navButton) {
                e.preventDefault();
                handleNavigation(navButton.href);
            }
        });

        // Step 5: Add event listeners for the toggle
        if (sortFirstLastBtn) {
            sortFirstLastBtn.addEventListener('click', () => {
                if (state.nameDisplayFormat !== 'firstLast') {
                    state.nameDisplayFormat = 'firstLast';
                    localStorage.setItem('contactNameDisplayFormat', 'firstLast');
                    updateSortToggleUI();
                    renderContactList();
                }
            });
        }

        if (sortLastFirstBtn) {
            sortLastFirstBtn.addEventListener('click', () => {
                if (state.nameDisplayFormat !== 'lastFirst') {
                    state.nameDisplayFormat = 'lastFirst';
                    localStorage.setItem('contactNameDisplayFormat', 'lastFirst');
                    updateSortToggleUI();
                    renderContactList();
                }
            });
        }
        
        if (organicStarIndicator) {
            organicStarIndicator.addEventListener('click', async () => {
                if (!state.selectedContactId) return;

                const contact = state.contacts.find(c => c.id === state.selectedContactId);
                if (!contact) return;

                const newOrganicState = !contact.is_organic;
                organicStarIndicator.classList.toggle('is-organic', newOrganicState);
                contact.is_organic = newOrganicState;

                const { error } = await supabase
                    .from('contacts')
                    .update({ is_organic: newOrganicState })
                    .eq('id', state.selectedContactId);

                if (error) {
                    console.error("Error updating organic status:", error);
                    organicStarIndicator.classList.toggle('is-organic', !newOrganicState);
                    contact.is_organic = !newOrganicState;
                    showModal("Error", "Could not save organic status.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                }
            });
        }
        
        contactForm.addEventListener('input', () => {
            state.isFormDirty = true;
        });

        window.addEventListener('beforeunload', (event) => {
            if (state.isFormDirty) {
                event.preventDefault();
                event.returnValue = '';
            }
        });
        
        contactSearch.addEventListener("input", renderContactList);

        addContactBtn.addEventListener("click", () => {
            const openNewContactModal = () => {
                hideContactDetails(false, true);
                showModal("New Contact", `
                    <label>First Name:</label><input type="text" id="modal-contact-first-name" required><br>
                    <label>Last Name:</label><input type="text" id="modal-contact-last-name" required>
                `, async () => {
                    const firstName = document.getElementById("modal-contact-first-name")?.value.trim();
                    const lastName = document.getElementById("modal-contact-last-name")?.value.trim();
                    if (!firstName || !lastName) {
                        showModal("Error", "First Name and Last Name are required.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                        return false;
                    }
                    globalState = getState();
                    const { data: newContactArr, error } = await supabase.from("contacts").insert([{ 
                        first_name: firstName, 
                        last_name: lastName,
                        
                        user_id: globalState.effectiveUserId,
                    }]).select();

                    if (error) {
                        showModal("Error", "Error creating contact: " + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                        return false;
                    }
                    
                    state.isFormDirty = false;
                    await loadAllData();
                    state.selectedContactId = newContactArr?.[0]?.id;
                    renderContactList();
                    renderContactDetails();
                    hideModal();
                    return true;
                }, true, `<button id="modal-confirm-btn" class="btn-primary">Create Contact</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            };

            if (state.isFormDirty) {
                showModal("Unsaved Changes", "You have unsaved changes. Do you want to discard them and add a new contact?", () => {
                    hideModal();
                    openNewContactModal();
                }, true, `<button id="modal-confirm-btn" class="btn-primary">Discard & New</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            } else {
                openNewContactModal();
            }
        });

        contactList.addEventListener("click", (e) => {
            const item = e.target.closest(".list-item");
            if (item) {
                const contactId = Number(item.dataset.id);
                if (contactId !== state.selectedContactId) {
                    confirmAndSwitchContact(contactId);
                }
                document.getElementById('contact-details')?.classList.add('active');
                document.getElementById('contact-details-scrim')?.classList.add('visible');
                document.getElementById('contact-details-scrim')?.setAttribute('aria-hidden', 'false');
            }
        });
        const contactDetailsCloseBtn = document.getElementById('contact-details-close-btn');
        const contactDetailsScrim = document.getElementById('contact-details-scrim');
        if (contactDetailsCloseBtn) contactDetailsCloseBtn.addEventListener('click', () => hideContactDetails(true));
        if (contactDetailsScrim) contactDetailsScrim.addEventListener('click', () => hideContactDetails(true));

        contactForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const id = contactForm.querySelector("#contact-id").value ? Number(contactForm.querySelector("#contact-id").value) : null;
            globalState = getState();
            const data = {
                first_name: contactForm.querySelector("#contact-first-name").value.trim(),
                last_name: contactForm.querySelector("#contact-last-name").value.trim(),
                email: contactForm.querySelector("#contact-email").value.trim(),
                phone: contactForm.querySelector("#contact-phone").value.trim(),
                title: contactForm.querySelector("#contact-title").value.trim(),
                account_id: contactForm.querySelector("#contact-account-name").value ? Number(contactForm.querySelector("#contact-account-name").value) : null,
                notes: contactForm.querySelector("#contact-notes").value,
                last_saved: new Date().toISOString(),
                
                user_id: globalState.effectiveUserId,
            };
            if (!data.first_name || !data.last_name) {
                showModal("Error", "First and Last name are required.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return;
            }

            if (id) {
                const { error } = await supabase.from("contacts").update(data).eq("id", id);
                if (error) {
                    showModal("Error", "Error saving contact: " + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                } else {
                    state.isFormDirty = false;
                    await loadAllData();
                    showModal("Success", "Contact saved successfully!", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                }
            } else {
                const { data: newContactArr, error: insertError } = await supabase.from("contacts").insert([data]).select();
                if (insertError) {
                    showModal("Error", "Error creating contact: " + insertError.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                } else {
                    state.selectedContactId = newContactArr?.[0]?.id;
                    state.isFormDirty = false;
                    await loadAllData();
                    showModal("Success", "Contact created successfully!", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                }
            }
        });


        deleteContactBtn.addEventListener("click", async () => {
            if (!state.selectedContactId) return;
            showModal("Confirm Deletion", "Are you sure you want to delete this contact?", async () => {
                const { error } = await supabase.from("contacts").delete().eq("id", state.selectedContactId);
                if (error) {
                    showModal("Error", "Error deleting contact: " + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                } else {
                    state.selectedContactId = null;
                    state.isFormDirty = false;
                    await loadAllData();
                    hideModal();
                    showModal("Success", "Contact deleted successfully.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                }
            }, true, `<button id="modal-confirm-btn" class="btn-danger">Delete</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        });

        bulkImportContactsBtn.addEventListener("click", () => contactCsvInput.click());
        contactCsvInput.addEventListener("change", async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = async function(e) {
                const rows = e.target.result.split("\n").filter((r) => r.trim() !== "");
                globalState = getState();
                const newRecords = rows.slice(1).map((row) => {
                    const c = parseCsvRow(row);
                    return {
                        first_name: c[0] || "",
                        last_name: c[1] || "",
                        email: c[2] || "",
                        phone: c[3] || "",
                        title: c[4] || "",
                        company: c[5] || "",
                        
                        user_id: globalState.effectiveUserId,
                    };
                });

                if (newRecords.length === 0) {
                    showModal("Info", "No valid records found to import.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    return;
                }

                let recordsToUpdate = [];
                let recordsToInsert = [];
                
                const findBestAccountMatch = (companyName) => {
                    if (!companyName) return null;
                    const lowerCompanyName = companyName.toLowerCase().trim();
                    const exactMatch = state.accounts.find(acc => acc.name.toLowerCase().trim() === lowerCompanyName);
                    if (exactMatch) return exactMatch.id;
                    const partialMatch = state.accounts.find(acc => acc.name.toLowerCase().includes(lowerCompanyName) || lowerCompanyName.includes(acc.name.toLowerCase()));
                    return partialMatch ? partialMatch.id : null;
                };

                for (const record of newRecords) {
                    const suggested_account_id = findBestAccountMatch(record.company);
                    
                    let existingContact = null;
                    if (record.email && record.email.trim()) {
                        existingContact = state.contacts.find(contact => 
                            contact.email && contact.email.toLowerCase() === record.email.toLowerCase()
                        );
                    }
                    if (!existingContact) {
                        existingContact = state.contacts.find(contact =>
                            contact.first_name.toLowerCase() === record.first_name.toLowerCase() &&
                            contact.last_name.toLowerCase() === record.last_name.toLowerCase()
                        );
                    }

                    if (existingContact) {
                        let changes = {};
                        if (existingContact.first_name !== record.first_name) changes.first_name = { old: existingContact.first_name, new: record.first_name };
                        if (existingContact.last_name !== record.last_name) changes.last_name = { old: existingContact.last_name, new: record.last_name };
                        if (existingContact.phone !== record.phone) changes.phone = { old: existingContact.phone, new: record.phone };
                        if (existingContact.title !== record.title) changes.title = { old: existingContact.title, new: record.title };
                        
                        recordsToUpdate.push({ ...record, id: existingContact.id, changes, suggested_account_id: suggested_account_id });
                    } else {
                        recordsToInsert.push({ ...record, suggested_account_id: suggested_account_id });
                    }
                }
                
                // This is the core change: build a reusable option string that checks for selected value
                const getAccountOptions = (suggestedId) => {
                    let options = `<option value="">-- No Account --</option>`;
                    options += state.accounts.map(acc => `<option value="${acc.id}" ${acc.id === suggestedId ? 'selected' : ''}>${acc.name}</option>`).join('');
                    return options;
                };

                const modalBodyHtml = `
                    <p>The import process identified the following changes. Use the checkboxes to select which rows you want to process.</p>
                    <div class="table-container-scrollable" style="max-height: 400px;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th><input type="checkbox" id="select-all-checkbox" checked></th>
                                    <th>Action</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Changes</th>
                                    <th>Suggested Account</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recordsToInsert.map((r, index) => `
                                    <tr class="import-row" data-action="insert" data-index="${index}">
                                        <td><input type="checkbox" class="row-select-checkbox" checked></td>
                                        <td style="color: var(--success-color);">Insert New</td>
                                        <td>${r.first_name} ${r.last_name}</td>
                                        <td>${r.email}</td>
                                        <td>-</td>
                                        <td>
                                            <select class="account-select">${getAccountOptions(r.suggested_account_id)}</select>
                                        </td>
                                    </tr>
                                `).join('')}
                                ${recordsToUpdate.map((r, index) => `
                                    <tr class="import-row" data-action="update" data-index="${index}">
                                        <td><input type="checkbox" class="row-select-checkbox" checked></td>
                                        <td style="color: var(--warning-yellow);">Update Existing</td>
                                        <td>${r.first_name} ${r.last_name}</td>
                                        <td>${r.email}</td>
                                        <td>
                                            ${Object.keys(r.changes).map(key => `
                                                <p><small><strong>${key}:</strong> "${r.changes[key].old}" &rarr; "<strong>${r.changes[key].new}</strong>"</small></p>
                                            `).join('')}
                                        </td>
                                        <td>
                                            <select class="account-select">${getAccountOptions(r.suggested_account_id)}</select>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                
                showModal("Confirm CSV Import", modalBodyHtml, async () => {
                    let successCount = 0;
                    let errorCount = 0;
                    
                    const selectedRowsData = [];
                    document.querySelectorAll('.modal-content .import-row input[type="checkbox"]:checked').forEach(checkbox => {
                        const row = checkbox.closest('.import-row');
                        const action = row.dataset.action;
                        const index = parseInt(row.dataset.index);
                        const accountSelect = row.querySelector('.account-select');
                        const accountId = accountSelect ? (accountSelect.tomselect ? accountSelect.tomselect.getValue() : accountSelect.value) : null;
                        selectedRowsData.push({ action, index, accountId });
                    });
                    
                    for (const rowData of selectedRowsData) {
                        const { action, index, accountId } = rowData;
                        
                        if (action === 'insert') {
                            const record = recordsToInsert[index];
                            record.account_id = accountId ? parseInt(accountId) : null;
                            delete record.company;
                            delete record.suggested_account_id;
                            const { error } = await supabase.from("contacts").insert([record]);
                            if (error) {
                                console.error("Error inserting contact:", error);
                                errorCount++;
                            } else {
                                successCount++;
                            }
                        } else if (action === 'update') {
                            const record = recordsToUpdate[index];
                            const updateData = {
                                first_name: record.first_name,
                                last_name: record.last_name,
                                email: record.email,
                                phone: record.phone,
                                title: record.title,
                                account_id: accountId ? parseInt(accountId) : null
                            };
                            const { error } = await supabase.from("contacts").update(updateData).eq('id', record.id);
                            if (error) {
                                console.error("Error updating contact:", error);
                                errorCount++;
                            } else {
                                successCount++;
                            }
                        }
                    }
                    
                    hideModal();

                    let resultMessage = '';
                    if (errorCount > 0) {
                        resultMessage = `Import finished with ${successCount} successes and ${errorCount} errors.`;
                    } else {
                        resultMessage = `Successfully imported/updated ${successCount} contacts.`;
                    }

                    showModal(
                        "Import Complete",
                        resultMessage,
                        async () => {
                            hideModal();
                            await loadAllData();
                        },
                        false,
                        `<button id="modal-confirm-btn" class="btn-primary">OK</button>`
                    );

                    return false;
                }, true, `<button id="modal-confirm-btn" class="btn-primary">Confirm & Import</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
                
                const modalBody = document.getElementById('modal-body');
                if (modalBody && typeof window.TomSelect !== 'undefined') {
                    modalBody.querySelectorAll('.account-select').forEach(sel => {
                        if (!sel.tomselect) try { new window.TomSelect(sel, { create: false, render: { dropdown: () => { const d = document.createElement('div'); d.className = 'ts-dropdown tom-select-no-search'; return d; } } }); } catch (e) {}
                    });
                }
                document.querySelectorAll('.import-row').forEach(row => {
                    const action = row.dataset.action;
                    const index = parseInt(row.dataset.index);
                    const record = action === 'insert' ? recordsToInsert[index] : recordsToUpdate[index];
                    if (record.suggested_account_id) {
                        const accountSelect = row.querySelector('.account-select');
                        if (accountSelect) {
                            if (accountSelect.tomselect) accountSelect.tomselect.setValue(record.suggested_account_id);
                            else accountSelect.value = record.suggested_account_id;
                        }
                    }
                });
                
                const selectAllCheckbox = document.getElementById('select-all-checkbox');
                if (selectAllCheckbox) {
                    selectAllCheckbox.addEventListener('change', (e) => {
                        const isChecked = e.target.checked;
                        document.querySelectorAll('.modal-content .row-select-checkbox').forEach(checkbox => {
                            checkbox.checked = isChecked;
                        });
                    });
                }
            };
            r.readAsText(f);
            e.target.value = "";
        });
        
        if (bulkExportContactsBtn) {
            bulkExportContactsBtn.addEventListener("click", () => {
                const contactsToExport = state.contacts;
                if (contactsToExport.length === 0) {
                    showModal("Info", "No contacts to export.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    return;
                }

                let csvContent = "data:text/csv;charset=utf-8,";
                const headers = ["first_name", "last_name", "email", "phone", "title"];
                csvContent += headers.join(",") + "\r\n";

                contactsToExport.forEach(contact => {
                    const row = [
                        `"${(contact.first_name || '').replace(/"/g, '""')}"`,
                        `"${(contact.last_name || '').replace(/"/g, '""')}"`,
                        `"${(contact.email || '').replace(/"/g, '""')}"`,
                        `"${(contact.phone || '').replace(/"/g, '""')}"`,
                        `"${(contact.title || '').replace(/"/g, '""')}"`
                    ];
                    csvContent += row.join(",") + "\r\n";
                });

                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", "contacts_export.csv");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }

        logActivityBtn.addEventListener("click", () => {
            if (!state.selectedContactId) return showModal("Error", "Please select a contact to log activity for.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            const contact = state.contacts.find(c => c.id === state.selectedContactId);
            const typeOptions = state.activityTypes.map(t => `<option value="${t.type_name}">${t.type_name}</option>`).join('');
            
            showModal("Log Activity", `
                <label>Activity Type:</label><select id="modal-activity-type" required>${typeOptions || '<option value="">No types found</option>'}</select>
                <label>Description:</label><textarea id="modal-activity-description" rows="4" required></textarea>
            `, async () => {
                const typeEl = document.getElementById('modal-activity-type');
                const type = typeEl?.tomselect ? typeEl.tomselect.getValue() : (typeEl?.value || '');
                const description = document.getElementById('modal-activity-description').value.trim();
                if (!type || !description) {
                    showModal("Error", "Activity type and description are required.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    return false;
                }
                globalState = getState();
                const { error } = await supabase.from('activities').insert({
                    contact_id: state.selectedContactId,
                    account_id: contact?.account_id,
                    type: type,
                    description: description,
                    
                    user_id: globalState.effectiveUserId,
                    date: new Date().toISOString()
                });
                if (error) {
                    showModal("Error", "Error logging activity: " + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                } else {
                    await loadAllData();
                    hideModal();
                    showModal("Success", "Activity logged successfully!", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                }
                return true;
            }, true, `<button id="modal-confirm-btn" class="btn-primary">Add Activity</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            const activityTypeSelect = document.getElementById("modal-activity-type");
            if (activityTypeSelect && typeof window.TomSelect !== "undefined") {
                try {
                    new window.TomSelect(activityTypeSelect, {
                        create: false,
                        render: { dropdown: () => { const d = document.createElement("div"); d.className = "ts-dropdown tom-select-no-search"; return d; } }
                    });
                } catch (e) {}
            }
        });
        
        assignSequenceSelect?.addEventListener("change", async () => {
            const sequenceId = tomSelectSequence ? tomSelectSequence.getValue() : assignSequenceSelect.value;
            if (!sequenceId || !state.selectedContactId) return;

            const selectedSequence = state.sequences.find(s => s.id === Number(sequenceId));
            if (!selectedSequence) {
                showToast("Selected sequence not found.", "error");
                if (tomSelectSequence) tomSelectSequence.setValue('');
                else assignSequenceSelect.value = '';
                return;
            }

            let success = false;
            globalState = getState();
            if (selectedSequence.is_abm) {
                success = await handleAssignSequenceToContact(state.selectedContactId, Number(sequenceId), globalState.effectiveUserId);
            } else {
                const firstStep = state.sequence_steps.find(s => s.sequence_id === selectedSequence.id && s.step_number === 1);
                if (!firstStep) {
                    showToast("Selected sequence has no steps.", "error");
                    if (tomSelectSequence) tomSelectSequence.setValue('');
                    else assignSequenceSelect.value = '';
                    return;
                }
                const { error } = await supabase.from('contact_sequences').insert({
                    contact_id: state.selectedContactId,
                    sequence_id: Number(sequenceId),
                    current_step_number: 1,
                    status: 'Active',
                    next_step_due_date: addDays(new Date(), firstStep.delay_days).toISOString(),
                    user_id: globalState.effectiveUserId,
                });
                if (error) {
                    showToast("Error assigning sequence: " + error.message, "error");
                    if (tomSelectSequence) tomSelectSequence.setValue('');
                    else assignSequenceSelect.value = '';
                    return;
                }
                success = true;
            }

            if (success) {
                if (tomSelectSequence) tomSelectSequence.setValue('');
                else assignSequenceSelect.value = '';
                await loadAllData();
                renderContactDetails();
                showToast("Sequence assigned successfully!", "success");
            }
        });

        document.body.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            const stepWrapperEl = document.getElementById('sequence-next-step-wrapper');
            if (!btn || !stepWrapperEl?.contains(btn)) return;
            const csId = Number(btn.dataset?.csId);
            if (!csId) return;
            const cs = state.contact_sequences.find(c => c.id === csId);
            const contact = cs ? state.contacts.find(c => c.id === cs.contact_id) : null;
            const sequence = cs ? state.sequences.find(s => s.id === cs.sequence_id) : null;
            const step = cs ? state.sequence_steps.find(s => s.sequence_id === cs.sequence_id && s.step_number === cs.current_step_number) : null;
            if (!cs || !contact || !sequence || !step) return;

            if (btn.matches('.log-call-btn')) {
                openLogCallModal(csId);
            } else if (btn.matches('.complete-step-btn')) {
                showModal('Confirm', 'Mark this step as complete?', async () => await completeStep(csId), true, `<button id="modal-confirm-btn" class="btn-primary">Complete</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            } else if (btn.matches('.send-email-btn')) {
                const account = contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null;
                const subject = replacePlaceholders(step.subject, contact, account);
                const message = replacePlaceholders(step.message, contact, account);
                showModal('Compose Email', `
                    <div class="form-group"><label for="modal-email-subject">Subject:</label><input type="text" id="modal-email-subject" class="form-control" value="${(subject || '').replace(/"/g, '&quot;')}"></div>
                    <div class="form-group"><label for="modal-email-body">Message:</label><textarea id="modal-email-body" class="form-control" rows="10">${(message || '')}</textarea></div>
                `, async () => {
                    const finalSubject = document.getElementById('modal-email-subject').value;
                    const finalMessage = document.getElementById('modal-email-body').value;
                    window.open(`mailto:${contact.email}?subject=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(finalMessage)}`, '_blank');
                    await completeStep(csId, `Email Sent: ${finalSubject}`);
                }, true, `<button id="modal-confirm-btn" class="btn-primary">Send with Email Client</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            } else if (btn.matches('.send-linkedin-message-btn')) {
                const account = contact.account_id ? state.accounts.find(a => a.id === contact.account_id) : null;
                const message = replacePlaceholders(step.message, contact, account);
                const linkedinUrl = contact.linkedin_profile_url || 'https://www.linkedin.com/feed/';
                showModal('Compose LinkedIn Message', `
                    <div class="form-group"><p><strong>To:</strong> ${contact.first_name} ${contact.last_name}</p><p class="modal-sub-text">The message will be copied. Paste it into LinkedIn.</p></div>
                    <div class="form-group"><label for="modal-linkedin-body">Message:</label><textarea id="modal-linkedin-body" class="form-control" rows="10">${(message || '')}</textarea></div>
                `, async () => {
                    const text = document.getElementById('modal-linkedin-body').value;
                    try {
                        await navigator.clipboard.writeText(text);
                        showToast('Message copied to clipboard.', 'success');
                    } catch (_) {}
                    window.open(linkedinUrl, '_blank');
                    await completeStep(csId, 'LinkedIn message sent');
                }, true, `<button id="modal-confirm-btn" class="btn-primary">Copy & Open LinkedIn</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            }
        });

        if (completeSequenceBtn) {
            completeSequenceBtn.addEventListener("click", async () => {
                if (!state.selectedContactId) return;
                const activeContactSequence = state.contact_sequences.find(cs => cs.contact_id === state.selectedContactId && cs.status === 'Active');
                if (!activeContactSequence) return showModal("Info", "Contact is not in an active sequence.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);

                showModal("Confirm Completion", `Are you sure you want to mark this sequence as complete? This indicates a successful outcome.`, async () => {
                    const { error } = await supabase.from('contact_sequences').update({ status: 'Completed' }).eq('id', activeContactSequence.id);
                    if (error) {
                        showModal("Error", "Error completing sequence: " + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    } else {
                        // Clean up the individual to-do items from the ABM table
                        await supabase.from('contact_sequence_steps').delete().eq('contact_sequence_id', activeContactSequence.id);

                        await loadAllData();
                        hideModal();
                        showModal("Success", "Sequence marked as complete!", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    }
                }, true, `<button id="modal-confirm-btn" class="btn-primary">Yes, Complete</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
            });
        }

        removeFromSequenceBtn.addEventListener("click", async () => {
            if (!state.selectedContactId) return;
            const activeContactSequence = state.contact_sequences.find(cs => cs.contact_id === state.selectedContactId && cs.status === 'Active');
            if (!activeContactSequence) return showModal("Info", "Contact is not in an active sequence.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);

            showModal("Confirm Removal", `Are you sure you want to remove this contact from the sequence? This action should be used if the sequence was unsuccessful.`, async () => {
                const { error } = await supabase.from('contact_sequences').update({ status: 'Removed' }).eq('id', activeContactSequence.id);
                if (error) {
                    showModal("Error", "Error removing from sequence: " + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                } else {
                    // Clean up the individual to-do items from the ABM table
                    await supabase.from('contact_sequence_steps').delete().eq('contact_sequence_id', activeContactSequence.id);
                    
                    await loadAllData();
                    hideModal();
                    showModal("Success", "Contact removed from sequence.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                }
            }, true, `<button id="modal-confirm-btn" class="btn-danger">Remove</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        });

        if (addTaskContactBtn) addTaskContactBtn.addEventListener("click", async () => {
            if (!state.selectedContactId) return showModal("Error", "Please select a contact to add a task for.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            const contact = state.contacts.find(c => c.id === state.selectedContactId);
            showModal('Add New Task', `
                <label>Description:</label><input type="text" id="modal-task-description" required><br><label>Due Date:</label><input type="date" id="modal-task-due-date">`,
                async () => {
                    const description = document.getElementById('modal-task-description').value.trim();
                    const dueDate = document.getElementById('modal-task-due-date').value;
                    if (!description) {
                        showModal("Error", 'Task description is required.', null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                        return false;
                    }
                    globalState = getState();
                    const newTask = {
                        user_id: globalState.effectiveUserId,
                        description,
                        due_date: dueDate || null,
                        status: 'Pending',
                        account_id: contact?.account_id,
                        contact_id: state.selectedContactId
                    };
                    const { error } = await supabase.from('tasks').insert([newTask]);
                    if (error) {
                        showModal("Error", 'Error adding task: ' + error.message, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    } else {
                        await loadAllData();
                        hideModal();
                        showModal("Success", 'Task added successfully!', null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    }
                    return true;
                }, true, `<button id="modal-confirm-btn" class="btn-primary">Add Task</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
        });

        if (importContactScreenshotBtn) {
            importContactScreenshotBtn.addEventListener("click", () => {
                showModal("Import Contact Information",
                    `<p>To import contact information:</p>
                        <ul>
                            <li><strong>Paste a screenshot:</strong> Use CTRL+V (or CMD+V on Mac) after taking a screenshot of an email signature.</li>
                            <li><strong>Take a picture:</strong> (Mobile only) Click the "Take Picture of Signature" button to use your device's camera.</li>
                        </ul>`,
                    null, false,
                    `<button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`
                );
                
                document.addEventListener('paste', handlePasteEvent, { once: true });
            });
        }

        if (takePictureBtn) {
            takePictureBtn.addEventListener("click", () => {
                cameraInput.click();
                showModal("Camera Ready", "Your device camera should be opening. Please take a picture of the email signature or business card.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            });
        }

        if (cameraInput) {
            cameraInput.addEventListener('change', handleCameraInputChange);
        }

        if (aiActivityInsightBtn) {
            aiActivityInsightBtn.addEventListener("click", async () => {
                if (!state.selectedContactId) {
                    showModal("Error", "Please select a contact to get AI insights.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    return;
                }

                const contact = state.contacts.find(c => c.id === state.selectedContactId);
                if (!contact) {
                    showModal("Error", "Selected contact not found.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    return;
                }

                const relevantActivities = state.activities
                    .filter(act => act.contact_id === contact.id)
                    .sort((a, b) => new Date(a.date) - new Date(b.date));

                if (relevantActivities.length === 0) {
                    showModal("Info", "No activities found for this contact to generate insights.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                    return;
                }

                const activityData = relevantActivities.map(act => 
                    `[${formatDate(act.date)}] Type: ${act.type}, Description: ${act.description}`
                ).join('\n');

                showModal("Generating AI Insight", `<div class="loader"></div><p class="placeholder-text" style="text-align: center;">Analyzing activities and generating insights...</p>`, null, false, `<button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);

                try {
                    const { data, error } = await supabase.functions.invoke('get-activity-insight', {
                        body: {
                            contactName: `${contact.first_name || ''} ${contact.last_name || ''}`,
                            activityLog: activityData
                        }
                    });

                    if (error) throw error;

                    const insight = data.insight || "No insight generated.";
                    const nextSteps = data.next_steps || "No specific next steps suggested.";

                    showModal("AI Activity Insight", `
                        <h4>Summary:</h4>
                        <p>${insight}</p>
                        <h4>Suggested Next Steps:</h4>
                        <p>${nextSteps}</p>
                    `, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);

                } catch (error) {
                    console.error("Error invoking AI insight Edge Function:", error);
                    showModal("Error", `Failed to generate AI insight: ${error.message}. Please try again.`, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                }
            });
        }
        
        if (writeEmailAIButton) {
            writeEmailAIButton.addEventListener("click", showAIEmailModal);
        }
    }
    async function refreshData() {
        // Clear selection, hide details
        hideContactDetails(true, true); 
        // Reload all data using the new effectiveUserId
        await loadAllData(); 
    }

    // --- App Initialization ---
    async function initializePage() {
        await loadSVGs();
        
        globalState = await initializeAppState(supabase);
        if (!globalState.currentUser) {
            hideGlobalLoader();
            return;
        }
        try {
        // Add the listener for the impersonation event
        window.addEventListener('effectiveUserChanged', async () => {
            // When the user is changed in the menu, get the new state
            globalState = getState();
            // Reload all data using the new effectiveUserId
            await refreshData();
        });

        state.nameDisplayFormat = localStorage.getItem('contactNameDisplayFormat') || 'lastFirst';
        updateSortToggleUI();
        setupPageEventListeners();
        
        await setupUserMenuAndAuth(supabase, globalState);
        
        const urlParams = new URLSearchParams(window.location.search);
const contactIdFromUrl = urlParams.get('contactId');
        if (contactIdFromUrl) state.selectedContactId = Number(contactIdFromUrl);

        await setupGlobalSearch(supabase);
        await checkAndSetNotifications(supabase);
        await loadAllData();

        if (contactIdFromUrl) {
            document.getElementById('contact-details')?.classList.add('active');
            document.getElementById('contact-details-scrim')?.classList.add('visible');
            document.getElementById('contact-details-scrim')?.setAttribute('aria-hidden', 'false');
        }
        } finally {
            hideGlobalLoader();
        }
    }

    // --- HELPER: Merge Field Scrubber ---
    function scrubAIMergeFields(text, contact, account) {
        if (!text) return "";
        const replacements = {
            '[FirstName]': contact.first_name || 'there',
            '[LastName]': contact.last_name || '',
            '[AccountName]': account?.name || 'your company'
        };

        let scrubbedText = text;
        Object.keys(replacements).forEach(placeholder => {
            // Escape special regex characters in the placeholder and use global flag
            const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            scrubbedText = scrubbedText.replace(regex, replacements[placeholder]);
        });
        return scrubbedText;
    }
    runWhenNavReady(function () { initializePage(); });
});
