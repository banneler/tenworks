/**
 * Multi-Site IRR Calculator for Constellation CRM (v7.3 - Product Cost Update)
 *
 * This script powers the irr.html page, managing multiple sites
 * as tabs and calculating a global IRR and Payback.
 *
 * Key features:
 * - Saves/Loads projects to/from Supabase 'irr_projects' table.
 * - Uses a single GLOBAL Target IRR for all calculations.
 * - Calculates and displays TCV, IRR, Payback, and Capital Investment.
 * - Exports a CSV with LIVE EXCEL FORMULAS for TCV, IRR, and Decision.
 * - Factors in SG&A (Commission) to all IRR calculations.
 */

// Import all shared functions and constants
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    setupModalListeners,
    showModal,
    hideModal,
    setupUserMenuAndAuth,
    loadSVGs,
    setupGlobalSearch,
    checkAndSetNotifications,
    formatDate
} from './shared_constants.js';

// Wait for the DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', async () => {

    // --- 1. Initialize Supabase and State ---
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const IRR_TABLE = 'irr_projects';
    
    let state = {
        currentUser: null,
        sites: [],
        nextSiteId: 1,
        activeSiteId: null,
        currentProjectId: null,
        isFormDirty: false
    };

    // --- 2. DOM Element References ---
    // Project Controls
    const newProjectBtn = document.getElementById('new-project-btn');
    const loadProjectBtn = document.getElementById('load-project-btn');
    const saveProjectBtn = document.getElementById('save-project-btn');
    const addSiteBtn = document.getElementById('add-site-btn');
    const printReportBtn = document.getElementById('print-report-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    
    // Project Inputs
    const projectNameInput = document.getElementById('project-name');
    const globalTargetIrrInput = document.getElementById('global-target-irr');

    // Site Containers
    const siteTabsContainer = document.getElementById('site-tabs-container');
    const siteFormsContainer = document.getElementById('site-forms-container');
    const siteFormTemplate = document.getElementById('site-form-template');

    // Global Results Elements
    const globalDecisionEl = document.getElementById('global-decision');
    const globalAnnualIRREl = document.getElementById('global-annual-irr');
    const globalTcvEl = document.getElementById('global-tcv');
    const globalPaybackEl = document.getElementById('global-payback'); 
    const globalCapitalInvestmentEl = document.getElementById('global-capital-investment');
    const globalErrorMessageEl = document.getElementById('global-error-message');

    // Load Modal Elements
    const loadProjectModal = document.getElementById('load-project-modal-backdrop');
    const loadProjectList = document.getElementById('load-project-list');
    const loadProjectCancelBtn = document.getElementById('load-project-cancel-btn');

    // --- 3. Core Project/Site Management Functions ---

    /**
     * Resets the entire page to a blank, new project.
     * Asks for confirmation if there are unsaved changes.
     */
    function handleNewProject() {
        const createNew = () => {
            state.currentProjectId = null;
            state.sites = [];
            state.nextSiteId = 1;
            state.activeSiteId = null;
            state.isFormDirty = false;

            projectNameInput.value = '';
            globalTargetIrrInput.value = '15';

            siteFormsContainer.innerHTML = '';
            siteTabsContainer.innerHTML = '';

            addNewSite(); // Adds one default site
            runGlobalCalculation();
            hideModal();
        };

        if (state.isFormDirty) {
            showModal("Unsaved Changes", "You have unsaved changes that will be lost. Are you sure you want to create a new project?",
                createNew, true,
                `<button id="modal-confirm-btn" class="btn-danger">Discard & Create New</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`
            );
        } else {
            createNew();
        }
    }

    /**
     * Creates a new site, adds it to state, and renders it.
     */
    function addNewSite() {
        const newSiteId = state.nextSiteId++;
        const siteName = `Site ${newSiteId}`;

        const templateClone = siteFormTemplate.content.cloneNode(true);
        const newFormWrapper = templateClone.querySelector('.site-form-wrapper');
        
        newFormWrapper.dataset.siteId = newSiteId;
        newFormWrapper.querySelector('.site-name-input').value = siteName;
        
        siteFormsContainer.appendChild(templateClone);

        const newSite = {
            id: newSiteId,
            name: siteName,
            inputs: {
                constructionCost: 100000,
                engineeringCost: 20000,
                productCost: 0, // <-- NEW
                monthlyCost: 500,
                nrr: 5000,
                mrr: 3000,
                term: 60,
            },
            result: {
                annualIRR: null,
                tcv: 0,
                decision: '--',
                payback: null,
                paybackRatio: null,
                error: null
            }
        };
        
        state.sites.push(newSite);
        attachFormListeners(newFormWrapper);

        runSiteCalculation(newSiteId, false);  
        renderTabs();
        setActiveSite(newSiteId);
        runGlobalCalculation();
        state.isFormDirty = true;
    }

    /**
     * Deletes a site from state and the DOM.
     */
    function deleteSite(siteId) {
        if (state.sites.length <= 1) {
            showModal("Action Not Allowed", "You must have at least one site.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return;
        }

        state.sites = state.sites.filter(site => site.id !== siteId);

        const formWrapper = siteFormsContainer.querySelector(`.site-form-wrapper[data-site-id="${siteId}"]`);
        if (formWrapper) formWrapper.remove();
        
        renderTabs();
        
        if (state.activeSiteId === siteId) {
            setActiveSite(state.sites[0].id);  
        }

        runGlobalCalculation();
        state.isFormDirty = true;
    }

    /**
     * Hides all site forms and shows only the one with the matching ID.
     */
    function setActiveSite(siteId) {
        state.activeSiteId = siteId;

        siteTabsContainer.querySelectorAll('.irr-tab').forEach(tab => {
            tab.classList.toggle('active', Number(tab.dataset.siteId) === siteId);
        });

        siteFormsContainer.querySelectorAll('.site-form-wrapper').forEach(form => {
            form.classList.toggle('active', Number(form.dataset.siteId) === siteId);
        });
    }

    /**
     * Re-draws the entire tab bar based on the current state.
     */
    function renderTabs() {
        siteTabsContainer.innerHTML = '';  

        state.sites.forEach(site => {
            const tab = document.createElement('button');
            tab.className = 'irr-tab';
            tab.dataset.siteId = site.id;

            let resultClass = 'pending';
            let resultText = '--%';
            
            if (site.result.error) {
                resultClass = 'error';
                resultText = 'Error';
            } else if (site.result.annualIRR !== null) {
                resultClass = site.result.decision === 'GO' ? 'go' : 'nogo';
                resultText = `${site.result.decision} (${(site.result.annualIRR * 100).toFixed(2)}%)`;
            }

            tab.innerHTML = `
                ${site.name}
                <span class="irr-tab-results ${resultClass}">${resultText}</span>
            `;

            siteTabsContainer.appendChild(tab);
        });
    }

    // --- 4. Calculation Functions ---

    /**
     * Calculates IRR & Payback for a single site, updates its state, and updates its UI.
     * @param {number} siteId - The ID of the site to calculate
     * @param {boolean} [runGlobal=true] - Whether to trigger a global recalculation
     */
    function runSiteCalculation(siteId, runGlobal = true) {
        const site = state.sites.find(s => s.id === siteId);
        if (!site) return;

        const globalTargetIRR = (parseFloat(globalTargetIrrInput.value) || 0) / 100;

        const formWrapper = siteFormsContainer.querySelector(`.site-form-wrapper[data-site-id="${siteId}"]`);
        if (!formWrapper) {
            console.error(`runSiteCalculation: Could not find formWrapper for siteId ${siteId}`);
            return;  
        }

        const resultsContainer = formWrapper.querySelector('.individual-results-container');
        if (!resultsContainer) {
            console.error(`runSiteCalculation: Could not find .individual-results-container in formWrapper for siteId ${siteId}`);
            return;
        }
        
        const decisionEl = resultsContainer.querySelector('.individual-decision');
        const annualIRREl = resultsContainer.querySelector('.individual-annual-irr');
        const tcvEl = resultsContainer.querySelector('.individual-tcv');  
        const paybackEl = resultsContainer.querySelector('.individual-payback');
        const errorMessageEl = resultsContainer.querySelector('.individual-error-message');

        if (!decisionEl || !annualIRREl || !tcvEl || !errorMessageEl || !paybackEl) {
            console.error(`runSiteCalculation: Missing results elements for siteId ${siteId}`);
            return;
        }

        // 1. Read inputs from DOM and save to state
        site.name = formWrapper.querySelector('.site-name-input').value || `Site ${site.id}`;
        site.inputs.term = parseInt(formWrapper.querySelector('.term-input').value) || 0; // <-- MOVED
        site.inputs.constructionCost = parseFloat(formWrapper.querySelector('.construction-cost-input').value) || 0;
        site.inputs.engineeringCost = parseFloat(formWrapper.querySelector('.engineering-cost-input').value) || 0;
        site.inputs.productCost = parseFloat(formWrapper.querySelector('.product-cost-input').value) || 0; // <-- NEW
        site.inputs.monthlyCost = parseFloat(formWrapper.querySelector('.monthly-cost-input').value) || 0;
        site.inputs.nrr = parseFloat(formWrapper.querySelector('.nrr-input').value) || 0;
        site.inputs.mrr = parseFloat(formWrapper.querySelector('.mrr-input').value) || 0;
        
        // 2. Calculate TCV
        const siteTCV = (site.inputs.mrr * site.inputs.term) + site.inputs.nrr;
        site.result.tcv = siteTCV;

        // 3. Calculate Payback
        const { paybackMonths, paybackRatio, error: paybackError } = getPaybackForSite(site.inputs);
        site.result.payback = paybackMonths;
        site.result.paybackRatio = paybackRatio;

        // 4. Calculate IRR
        const { cashFlows, error: validationError } = getCashFlowsForSite(site.inputs);

        // 5. Update State & UI
        const combinedError = validationError || paybackError;
        if (combinedError) {
            site.result.error = combinedError;
            site.result.annualIRR = null;
            site.result.decision = 'Error';
            showSiteError(errorMessageEl, decisionEl, annualIRREl, tcvEl, paybackEl, combinedError);
        } else {
            const monthlyIRR = calculateIRR(cashFlows);
            if (isNaN(monthlyIRR) || !isFinite(monthlyIRR)) {
                site.result.error = "Could not calculate IRR. Check inputs.";
                site.result.annualIRR = null;
                site.result.decision = 'Error';
                showSiteError(errorMessageEl, decisionEl, annualIRREl, tcvEl, paybackEl, site.result.error);
            } else {
                site.result.error = null;
                site.result.annualIRR = Math.pow(1 + monthlyIRR, 12) - 1;
                site.result.decision = site.result.annualIRR >= globalTargetIRR ? 'GO' : 'NO GO';
                showSiteResults(
                    errorMessageEl, decisionEl, annualIRREl, tcvEl, paybackEl,
                    site.result.annualIRR, site.result.decision, site.result.tcv,
                    site.result.payback, site.inputs.term, site.result.paybackRatio
                );
            }
        }
        
        renderTabs();
        setActiveSite(site.id);  
        
        if (runGlobal) {
            runGlobalCalculation();
        }
    }

    /**
     * Calculates the combined IRR, TCV, and Payback for *all* sites.
     */
    function runGlobalCalculation() {
        let globalCashFlows = [0];  
        let maxTerm = 0;
        let globalTCV = 0;
        
        // --- MODIFIED: Global Payback & CapEx Vars ---
        let totalGlobalConstructionCost = 0;
        let totalGlobalEngineeringCost = 0;
        let totalGlobalProductCost = 0; // <-- NEW
        let totalGlobalCapitalInvestment = 0;
        let totalGlobalNrr = 0;
        let totalGlobalMrr = 0;
        let totalGlobalMonthlyCost = 0;
        
        if (state.sites.length === 0) {
            showGlobalResults(NaN, 0, 0, null, 0, null, 0);
            return;
        }

        const globalTargetIRR = (parseFloat(globalTargetIrrInput.value) || 0) / 100;

        // --- 1. Aggregate all site data ---
        state.sites.forEach(site => {
            if (site.inputs.term > maxTerm) {
                maxTerm = site.inputs.term;
            }
            globalTCV += site.result.tcv || 0;
            
            // Sum inputs for global payback & CapEx
            totalGlobalConstructionCost += site.inputs.constructionCost || 0;
            totalGlobalEngineeringCost += site.inputs.engineeringCost || 0;
            totalGlobalProductCost += site.inputs.productCost || 0; // <-- NEW
            totalGlobalNrr += site.inputs.nrr || 0;
            totalGlobalMrr += site.inputs.mrr || 0;
            totalGlobalMonthlyCost += site.inputs.monthlyCost || 0;
        });
        
        // <-- MODIFIED: Calculate Total Capital Investment -->
        totalGlobalCapitalInvestment = totalGlobalConstructionCost + totalGlobalEngineeringCost + totalGlobalProductCost;

        globalTcvEl.textContent = `$${globalTCV.toLocaleString()}`;
        globalTcvEl.classList.remove('pending');
        
        globalCapitalInvestmentEl.textContent = `$${totalGlobalCapitalInvestment.toLocaleString()}`;
        globalCapitalInvestmentEl.classList.remove('pending');
        globalCapitalInvestmentEl.style.color = 'var(--text-color, #fff)';


        // --- 2. Calculate Global Payback ---
        const globalPaybackInputs = {
            constructionCost: totalGlobalConstructionCost,
            engineeringCost: totalGlobalEngineeringCost,
            productCost: totalGlobalProductCost, // <-- NEW
            nrr: totalGlobalNrr,
            mrr: totalGlobalMrr,
            monthlyCost: totalGlobalMonthlyCost,
            term: maxTerm
        };
        const { paybackMonths: globalPaybackMonths, paybackRatio: globalPaybackRatio } = getPaybackForSite(globalPaybackInputs);

        // --- 3. Calculate Global IRR ---
        globalCashFlows = new Array(maxTerm + 1).fill(0);

        for (const site of state.sites) {
            // getCashFlowsForSite is now updated to include productCost
            const { cashFlows, error } = getCashFlowsForSite(site.inputs);
            if (!error) {
                for (let i = 0; i < cashFlows.length; i++) {
                    if (i < globalCashFlows.length) {
                        globalCashFlows[i] += cashFlows[i];
                    }
                }
            }
        }
        
        const monthZero = globalCashFlows[0];
        const positiveFlow = globalCashFlows.slice(1).some(cf => cf > 0);
        
        if (monthZero >= 0 && !globalCashFlows.slice(1).some(cf => cf < 0)) {
            showGlobalError("Global project has no negative cash flow (no investment).");
            setPaybackUI(globalPaybackEl, globalPaybackMonths, maxTerm, globalPaybackRatio);
            return;
        }
         if (monthZero <= 0 && !positiveFlow) {
            showGlobalError("Global project has no positive cash flow.");
            setPaybackUI(globalPaybackEl, globalPaybackMonths, maxTerm, globalPaybackRatio);
            return;
        }

        const globalMonthlyIRR = calculateIRR(globalCashFlows);
        
        // --- 4. Show All Global Results ---
        showGlobalResults(
            globalMonthlyIRR, 
            globalTargetIRR, 
            globalTCV,
            globalPaybackMonths,
            maxTerm,
            globalPaybackRatio,
            totalGlobalCapitalInvestment
        );
    }

    /**
     * Helper to get a cash flow array from a site's inputs
     */
    function getCashFlowsForSite(inputs) {
        // <-- MODIFIED: Added productCost
        const { nrr, constructionCost, engineeringCost, productCost, mrr, monthlyCost, term } = inputs;
        const cashFlows = [];
        
        const sg_and_a_cost = (mrr * 1) + (nrr * 0.03);
        
        // <-- MODIFIED: Added productCost to the initial outflow
        const monthZeroCashFlow = nrr - (constructionCost + engineeringCost + productCost + sg_and_a_cost);
        const monthlyNetCashFlow = mrr - monthlyCost;

        if (term <= 0) return { cashFlows: [], error: "Term must be > 0" };
        
        if (monthZeroCashFlow >= 0 && monthlyNetCashFlow >= 0) {
            return { cashFlows: [], error: "No investment. All cash flows are positive." };
        }
        
        cashFlows.push(monthZeroCashFlow);
        for (let i = 0; i < term; i++) {
            cashFlows.push(monthlyNetCashFlow);
        }
        
        return { cashFlows, error: null };
    }

    /**
     * MODIFIED: Helper to get payback metrics from a site's inputs
     */
    function getPaybackForSite(inputs) {
        // <-- MODIFIED: Added productCost
        const { constructionCost, engineeringCost, productCost, nrr, mrr, monthlyCost, term } = inputs;

        // <-- MODIFIED: Added productCost to netCapex
        const netCapex = (constructionCost + engineeringCost + productCost) - nrr;
        const netMonthlyIncome = mrr - monthlyCost;

        let paybackMonths = null;
        let paybackRatio = null;
        let error = null;

        if (term <= 0) {
            error = "Term must be > 0";
            paybackMonths = Infinity;
            paybackRatio = Infinity;
        } else if (netMonthlyIncome <= 0) {
            if (netCapex > 0) {
                paybackMonths = Infinity;
                paybackRatio = Infinity;
            } else {
                paybackMonths = 0;
                paybackRatio = 0;
            }
        } else if (netCapex <= 0) {
            paybackMonths = 0;
            paybackRatio = 0;
        } else {
            paybackMonths = netCapex / netMonthlyIncome;
            paybackRatio = paybackMonths / term;
        }

        return { paybackMonths, paybackRatio, error };
    }


    // --- 5. UI Update Functions ---

    function setResultUI(el, text, state) { // state: 'go', 'nogo', 'error', 'pending', 'default'
        el.textContent = text;
        el.classList.remove('go', 'nogo', 'error', 'pending');
        
        switch (state) {
            case 'go':
                el.style.color = 'var(--color-success, #22c55e)';
                break;
            case 'nogo':
                el.style.color = 'var(--color-danger, #ef4444)';
                break;
            case 'error':
                el.style.color = 'var(--color-warning, #f97316)';
                break;
            case 'default':
                el.style.color = 'var(--text-color, #fff)';
                break;
            case 'pending':
            default:
                el.style.color = 'var(--text-color-secondary, #9ca3af)';
                break;
        }
    }

    function setPaybackUI(element, paybackMonths, term, ratio) {
        element.classList.remove('pending', 'payback-green', 'payback-yellow', 'payback-red');
        
        if (ratio === null || !isFinite(paybackMonths) || term <= 0) {
            element.textContent = "-- / --";
            element.classList.add('pending');
            element.style.color = 'var(--text-color-secondary, #9ca3af)';
        } else if (!isFinite(ratio)) { // Catches Infinity
            element.textContent = `Never / ${term}`;
            element.classList.add('payback-red');
        } else {
            element.textContent = `${paybackMonths.toFixed(1)} / ${term}`;
            if (ratio <= 0.5) {
                element.classList.add('payback-green');
            } else if (ratio < 1) {
                element.classList.add('payback-yellow');
            } else { // ratio >= 1
                element.classList.add('payback-red');
            }
        }
    }

    function showSiteResults(errorMessageEl, decisionEl, annualIRREl, tcvEl, paybackEl, annualIRR, decision, tcv, paybackMonths, term, paybackRatio) {
        errorMessageEl.classList.add('hidden');
        const decisionState = decision === 'GO' ? 'go' : 'nogo';
        setResultUI(decisionEl, decision, decisionState);
        setResultUI(annualIRREl, (annualIRR * 100).toFixed(2) + '%', decisionState);
        setResultUI(tcvEl, `$${tcv.toLocaleString()}`, 'tcv');
        tcvEl.style.color = 'var(--color-primary, #3b82f6)';
        
        setPaybackUI(paybackEl, paybackMonths, term, paybackRatio);
    }

    function showSiteError(errorMessageEl, decisionEl, annualIRREl, tcvEl, paybackEl, message) {
        errorMessageEl.classList.remove('hidden');
        errorMessageEl.textContent = message;
        setResultUI(decisionEl, 'Error', 'error');
        setResultUI(annualIRREl, '--%', 'error');
        setResultUI(tcvEl, '$0', 'error');
        
        setPaybackUI(paybackEl, null, null, null);
    }

    function showGlobalResults(monthlyIRR, targetIRR, tcv, globalPaybackMonths, globalTerm, globalPaybackRatio, totalCapitalInvestment) {
        globalErrorMessageEl.classList.add('hidden');
        
        setResultUI(globalTcvEl, `$${tcv.toLocaleString()}`, 'tcv');
        globalTcvEl.style.color = 'var(--color-primary, #3b82f6)';
        
        setResultUI(globalCapitalInvestmentEl, `$${(totalCapitalInvestment || 0).toLocaleString()}`, 'default');
        globalCapitalInvestmentEl.style.color = 'var(--text-color, #fff)';

        setPaybackUI(globalPaybackEl, globalPaybackMonths, globalTerm, globalPaybackRatio);

        if (isNaN(monthlyIRR) || !isFinite(monthlyIRR)) {
            showGlobalError("Could not calculate Global IRR. Check inputs.");
            return;
        }

        const annualIRR = Math.pow(1 + monthlyIRR, 12) - 1;
        
        if (annualIRR >= targetIRR) {
            setResultUI(globalDecisionEl, 'GO', 'go');
            setResultUI(globalAnnualIRREl, (annualIRR * 100).toFixed(2) + '%', 'go');
        } else {
            setResultUI(globalDecisionEl, 'NO GO', 'nogo');
            setResultUI(globalAnnualIRREl, (annualIRR * 100).toFixed(2) + '%', 'nogo');
        }
    }

    function showGlobalError(message) {
        setResultUI(globalDecisionEl, 'Error', 'error');
        setResultUI(globalAnnualIRREl, '--%', 'error');
        setResultUI(globalTcvEl, '$0', 'error');
        setResultUI(globalCapitalInvestmentEl, '$0', 'error');
        
        globalErrorMessageEl.textContent = message;
        globalErrorMessageEl.classList.remove('hidden');
    }
    
    // --- 6. Print Function ---

    function handlePrintReport() {
        const projectName = projectNameInput.value.trim() || "IRR Project Approval Report";
        const globalTargetIRR = (parseFloat(globalTargetIrrInput.value) || 0) / 100;

        let reportHtml = `
            <style>
                body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 20px; background: #fff; color: #000; font-size: 10pt; }
                h1 { color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 5px; font-size: 2rem; }
                h2 { color: #111; margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                
                th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                th:first-child, td:first-child { text-align: left; }

                th { background-color: #f4f4f4; }
                .go { color: #16a34a; font-weight: bold; }
                .nogo { color: #dc2626; font-weight: bold; }
                .warn { color: #f59e0b; font-weight: bold; }
                .error { color: #f97316; font-weight: bold; }
                .global-results { margin-top: 20px; padding: 15px; border: 2px solid #3b82f6; border-radius: 8px; background-color: #f9faff; page-break-inside: avoid; }
                .global-results h2 { margin-top: 0; border: none; font-size: 1.5rem; }
                
                .global-results-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; text-align: center; }
                
                .global-results-grid p { margin: 0; color: #555; font-size: 0.9rem; }
                .global-results-grid .value { font-size: 1.75rem; font-weight: bold; margin-top: 5px; }
            </style>
            <h1>${projectName}</h1>
        `;

        const globalDecision = globalDecisionEl.textContent;
        const globalDecisionClass = globalDecision === 'GO' ? 'go' : (globalDecision === 'NO GO' ? 'nogo' : 'error');
        
        const globalPayback = globalPaybackEl.textContent;
        const globalPaybackClass = (globalPaybackEl.className.match(/payback-(green|yellow|red)/) || [])[0] || '';
        let globalPaybackPrintClass = 'pending';
        if (globalPaybackClass === 'payback-green') globalPaybackPrintClass = 'go';
        if (globalPaybackClass === 'payback-yellow') globalPaybackPrintClass = 'warn';
        if (globalPaybackClass === 'payback-red') globalPaybackPrintClass = 'nogo';

        reportHtml += `
            <div class="global-results">
                <h2>Global Project Results (All Sites)</h2>
                <div class="global-results-grid">
                    <div>
                        <p>Global Decision</p>
                        <div class="value ${globalDecisionClass}">${globalDecision}</div>
                    </div>
                    <div>
                        <p>Global Annual IRR</p>
                        <div class="value ${globalDecisionClass}">${globalAnnualIRREl.textContent}</div>
                    </div>
                    <div>
                        <p>Total Capital Invest.</p>
                        <div class="value" style="color: #111;">${globalCapitalInvestmentEl.textContent}</div>
                    </div>
                    <div>
                        <p>Global TCV ($)</p>
                        <div class="value" style="color: #3b82f6;">${globalTcvEl.textContent}</div>
                    </div>
                    <div>
                        <p>Global Payback / Term</p>
                        <div class="value ${globalPaybackPrintClass}">${globalPayback}</div>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                <p style="margin: 0;"><strong>Global Target IRR:</strong> ${(globalTargetIRR * 100).toFixed(2)}%</p>
            </div>
        `;

        reportHtml += `
            <h2>Site Summary</h2>
            <table>
                <thead>
                    <tr>
                        <th>Site Name</th>
                        <th>TCV ($)</th>
                        <th>Construction ($)</th>
                        <th>Eng. ($)</th>
                        <th>Product ($)</th> <th>NRR ($)</th>
                        <th>MRR ($)</th>
                        <th>Monthly Cost ($)</th>
                        <th>Term (Mos)</th>
                        <th>Payback / Term</th>
                        <th>Calculated IRR</th>
                        <th>Decision</th>
                    </tr>
                </thead>
                <tbody>
        `;

        state.sites.forEach(site => {
            const inputs = site.inputs;
            const res = site.result;
            const irrText = res.error ? 'Error' : `${(res.annualIRR * 100).toFixed(2)}%`;
            const decisionClass = res.decision === 'GO' ? 'go' : (res.decision === 'NO GO' ? 'nogo' : 'error');

            let p_text = '-- / --';
            let p_class = '';
            if (!isFinite(res.paybackRatio)) {
                p_text = `Never / ${inputs.term}`;
                p_class = 'nogo';
            } else if (res.paybackRatio !== null && isFinite(res.payback)) {
                p_text = `${res.payback.toFixed(1)} / ${inputs.term}`;
                if (res.paybackRatio <= 0.5) p_class = 'go';
                else if (res.paybackRatio < 1) p_class = 'warn';
                else p_class = 'nogo';
            }

            reportHtml += `
                <tr>
                    <td>${site.name}</td>
                    <td>$${(res.tcv || 0).toLocaleString()}</td>
                    <td>${inputs.constructionCost.toLocaleString()}</td>
                    <td>${inputs.engineeringCost.toLocaleString()}</td>
                    <td>${inputs.productCost.toLocaleString()}</td> <td>${inputs.nrr.toLocaleString()}</td>
                    <td>${inputs.mrr.toLocaleString()}</td>
                    <td>${inputs.monthlyCost.toLocaleString()}</td>
                    <td>${inputs.term}</td>
                    <td class="${p_class}">${p_text}</td>
                    <td class="${decisionClass}">${irrText}</td>
                    <td class="${decisionClass}">${res.decision}</td>
                </tr>
            `;
        });

        reportHtml += `</tbody></table>`;

        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'absolute';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(`<html><head><title>${projectName}</title></head><body>`);
        frameDoc.write(reportHtml);
        frameDoc.write('</body></html>');
        frameDoc.close();

        setTimeout(() => {
            try {
                printFrame.contentWindow.focus();
                printFrame.contentWindow.print();
            } catch (e) {
                console.error("Print failed:", e);
                showModal("Error", "Could not open print dialog. Please check browser settings.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            } finally {
                if (document.body.contains(printFrame)) {
                    document.body.removeChild(printFrame);
                }
            }
        }, 250);
    }
    
    // --- 7. CSV Export Function ---

    /**
     * Helper function to escape CSV cell content.
     */
    function escapeCSV(content) {
        let str = String(content);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            str = `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    /**
     * Generates a CSV file with live formulas and triggers a download.
     */
    function handleExportCSV() {
        const projectName = projectNameInput.value.trim() || "IRR Project";
        const globalTargetIRR = (parseFloat(globalTargetIrrInput.value) || 15) / 100;
        
        let csvContent = [];

        // --- Header Info ---
        csvContent.push(`Project Name:,${escapeCSV(projectName)}`);
        csvContent.push(`Global Target IRR:,${globalTargetIRR}`);
        csvContent.push("");
        
        // --- MODIFIED: Site Table Headers ---
        const headers = [
            "Site Name",            // Col A
            "Construction Cost",    // Col B
            "Engineering Cost",     // Col C
            "Product Cost",         // Col D  <-- NEW
            "NRR (Upfront)",        // Col E
            "MRR",                  // Col F
            "Monthly Cost",         // Col G
            "Term (Months)",        // Col H
            "TCV (Formula)",        // Col I
            "Calculated IRR (Formula)", // Col J
            "Decision (Formula)",   // Col K
            "Payback Months (Formula)", // Col L
            "Payback Ratio (Formula)"   // Col M
        ];
        csvContent.push(headers.join(','));

        // --- Helper function for creating CSV formulas ---
        const createCsvFormula = (baseFormula) => {
            const escapedFormula = baseFormula.replace(/"/g, '""');
            return `"=${escapedFormula}"`;
        };

        // --- MODIFIED: Site Data Rows ---
        const startRow = 5;
        state.sites.forEach((site, index) => {
            const rowNum = startRow + index;
            const i = site.inputs;
            
            // --- MODIFIED: All formulas shifted and updated ---
            const tcvFormulaBase = `ROUND((F${rowNum}*H${rowNum})+E${rowNum}, 2)`;
            
            // PV = B+C+D+F-0.97*E
            const irrFormulaBase = `IFERROR((1+RATE(H${rowNum}, G${rowNum}-F${rowNum}, B${rowNum}+C${rowNum}+D${rowNum}+F${rowNum}-0.97*E${rowNum}))^12-1, "Error")`;
            const decisionFormulaBase = `IF(J${rowNum}="Error", "Error", IF(J${rowNum}>=B$2, "GO", "NO GO"))`;

            // Payback Months = (B+C+D-E) / (F-G)
            const paybackMonthsBase = `IFERROR(IF(F${rowNum}-G${rowNum}<=0, "Never", IF(B${rowNum}+C${rowNum}+D${rowNum}-E${rowNum}<=0, 0, (B${rowNum}+C${rowNum}+D${rowNum}-E${rowNum}) / (F${rowNum}-G${rowNum}))), "Error")`;
            const paybackRatioBase = `IFERROR(IF(L${rowNum}="Never", "Never", L${rowNum}/H${rowNum}), "Error")`;


            const row = [
                escapeCSV(site.name),
                i.constructionCost,
                i.engineeringCost,
                i.productCost, // <-- NEW
                i.nrr,
                i.mrr,
                i.monthlyCost,
                i.term,
                createCsvFormula(tcvFormulaBase),
                createCsvFormula(irrFormulaBase),
                createCsvFormula(decisionFormulaBase),
                createCsvFormula(paybackMonthsBase),
                createCsvFormula(paybackRatioBase)
            ];
            csvContent.push(row.join(','));
        });

        // --- MODIFIED: Global Summary ---
        if (state.sites.length > 0) {
            const lastRow = startRow + state.sites.length - 1;
            csvContent.push("");
            
            // Define summary row numbers
            const globalTcvRow = lastRow + 2;
            const globalCapExRow = globalTcvRow + 1;
            const globalIrrRow = globalCapExRow + 1;
            const globalDecisionRow = globalIrrRow + 1;
            const globalPaybackMonthsRow = globalDecisionRow + 1;
            const globalPaybackRatioRow = globalPaybackMonthsRow + 1;

            // --- 1. Global TCV (Formula uses new Col I) ---
            const globalTcvFormulaBase = `SUM(I${startRow}:I${lastRow})`;
            csvContent.push(`Global TCV (Formula):,,${createCsvFormula(globalTcvFormulaBase)}`);
            
            // --- 2. Global Capital Investment (Formula uses new Col D) ---
            const constRange = `B${startRow}:B${lastRow}`;
            const engRange = `C${startRow}:C${lastRow}`;
            const prodRange = `D${startRow}:D${lastRow}`; // <-- NEW
            const globalCapExFormulaBase = `SUM(${constRange})+SUM(${engRange})+SUM(${prodRange})`; // <-- MODIFIED
            csvContent.push(`Total Capital Investment (Formula):,,${createCsvFormula(globalCapExFormulaBase)}`);

            // --- 3. Global IRR & Payback (Conditional Formula) ---
            const firstTerm = state.sites[0]?.inputs.term;
            const allTermsSame = state.sites.every(s => s.inputs.term === firstTerm);

            if (allTermsSame && firstTerm > 0) {
                const firstTermCell = `H${startRow}`; // <-- MODIFIED (was G)
                const pmtRange = `G${startRow}:G${lastRow}`; // <-- MODIFIED (was F)
                const mrrRange = `F${startRow}:F${lastRow}`; // <-- MODIFIED (was E)
                const nrrRange = `E${startRow}:E${lastRow}`; // <-- MODIFIED (was D)
                // constRange, engRange, prodRange defined above

                // Global IRR (Formula uses new Col D)
                const globalIrrFormulaBase = `IFERROR((1+RATE(${firstTermCell}, SUM(${pmtRange})-SUM(${mrrRange}), SUM(${constRange})+SUM(${engRange})+SUM(${prodRange})+SUM(${mrrRange})-0.97*SUM(${nrrRange})))^12-1, "Error")`;
                csvContent.push(`Global IRR (Formula):,,${createCsvFormula(globalIrrFormulaBase)}`);
                
                // Global Decision
                const globalDecisionFormulaBase = `IF(C${globalIrrRow}="Error", "Error", IF(C${globalIrrRow}>=B$2, "GO", "NO GO"))`;
                csvContent.push(`Global Decision (Formula):,,${createCsvFormula(globalDecisionFormulaBase)}`);

                // Global Payback Months (Formula uses new Col D)
                const globalPaybackMonthsBase = `IFERROR(IF(SUM(${mrrRange})-SUM(${pmtRange})<=0, "Never", IF(SUM(${constRange})+SUM(${engRange})+SUM(${prodRange})-SUM(${nrrRange})<=0, 0, (SUM(${constRange})+SUM(${engRange})+SUM(${prodRange})-SUM(${nrrRange})) / (SUM(${mrrRange})-SUM(${pmtRange})))), "Error")`;
                csvContent.push(`Global Payback Months (Formula):,,${createCsvFormula(globalPaybackMonthsBase)}`);

                // Global Payback Ratio
                const globalPaybackRatioBase = `IFERROR(IF(C${globalPaybackMonthsRow}="Never", "Never", C${globalPaybackMonthsRow}/${firstTermCell}), "Error")`;
                csvContent.push(`Global Payback Ratio (Formula):,,${createCsvFormula(globalPaybackRatioBase)}`);

            } else {
                // Fallback to calculated values
                const globalIRRValue = globalAnnualIRREl.textContent;
                csvContent.push(`Global IRR (Calculated):,,${escapeCSV(globalIRRValue)}`);
                
                const globalDecisionValue = globalDecisionEl.textContent;
                csvContent.push(`Global Decision (Calculated):,,${escapeCSV(globalDecisionValue)}`);

                const globalPaybackValue = globalPaybackEl.textContent;
                csvContent.push(`Global Payback/Term (Calculated):,,${escapeCSV(globalPaybackValue)}`);
                
                csvContent.push(`Note:, "Global IRR and Payback are calculated values because site terms are not identical."`);
            }
        }

        // --- Download Logic ---
        const csvString = csvContent.join('\n');
        const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvString);
        
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${projectName.replace(/ /g, "_")}_IRR_Model.csv`);
        document.body.appendChild(link);
        
        link.click();
        
        document.body.removeChild(link);
    }

    // --- 8. Database (Save/Load) Functions ---

    /**
     * Saves the current project state to Supabase.
     */
    async function handleSaveProject() {
        const projectName = projectNameInput.value.trim();
        if (!projectName) {
            showModal("Cannot Save", "Please enter a Project Name before saving.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
            return;
        }

        showModal("Saving...", `<div class="loader"></div><p class="placeholder-text" style="text-align: center;">Saving project to database...</p>`, null, false, ``);

        const projectData = {
            project_name: projectName,
            global_target_irr: parseFloat(globalTargetIrrInput.value) || 15,
            sites: state.sites,
            user_id: state.currentUser.id,
            last_saved: new Date().toISOString()
        };

        let result;
        if (state.currentProjectId) {
            // Update
            result = await supabase.from(IRR_TABLE)
                .update(projectData)
                .eq('id', state.currentProjectId)
                .select();
        } else {
            // Insert
            result = await supabase.from(IRR_TABLE)
                .insert(projectData)
                .select();
        }

        if (result.error) {
            console.error("Error saving project:", result.error);
            showModal("Error", `Could not save project: ${result.error.message}`, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        } else {
            if (result.data && result.data[0]) {
                state.currentProjectId = result.data[0].id;
            }
            state.isFormDirty = false;
            showModal("Success!", "Project saved successfully.", null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
        }
    }

    /**
     * Fetches the list of saved projects and displays the load modal.
     */
    async function handleLoadProject() {
        loadProjectList.innerHTML = `<li class="placeholder-text">Loading...</li>`;
        loadProjectModal.classList.remove('hidden');

        const { data, error } = await supabase
            .from(IRR_TABLE)
            .select('id, project_name, last_saved, user_id')
            .order('last_saved', { ascending: false });

        if (error) {
            console.error("Error fetching projects:", error);
            loadProjectList.innerHTML = `<li class="placeholder-text error">Could not load projects.</li>`;
            return;
        }

        if (data.length === 0) {
            loadProjectList.innerHTML = `<li class="placeholder-text">No saved projects found.</li>`;
            return;
        }

        // Render the list
        loadProjectList.innerHTML = '';
        data.forEach(project => {
            const li = document.createElement('li');
            li.dataset.projectId = project.id;
            li.innerHTML = `
                <span class="project-name">${project.project_name}</span>
                <span class="project-date">Saved: ${formatDate(project.last_saved)}</span>
            `;
            loadProjectList.appendChild(li);
        });
    }

    /**
     * Loads a full project from the database by its ID.
     * @param {string} projectId - The UUID of the project to load.
     */
    async function loadProjectFromList(projectId) {
        const loadProject = async () => {
            // 1. Hide load modal, show loading modal
            loadProjectModal.classList.add('hidden');
            showModal("Loading...", `<div class="loader"></div><p class="placeholder-text" style="text-align: center;">Loading project...</p>`, null, false, ``);
            
            // 2. Fetch full project data
            const { data, error } = await supabase
                .from(IRR_TABLE)
                .select('*')
                .eq('id', projectId)
                .single();

            if (error) {
                console.error("Error loading project:", error);
                showModal("Error", `Could not load project: ${error.message}`, null, false, `<button id="modal-ok-btn" class="btn-primary">OK</button>`);
                return;
            }

            // 3. Hydrate state and DOM from loaded data
            hydrateState(data);
            
            // 4. Hide loading modal
            hideModal();
            state.isFormDirty = false;
        };
        
        if (state.isFormDirty) {
             showModal("Unsaved Changes", "You have unsaved changes that will be lost. Are you sure you want to load a different project?",
                loadProject, true,
                `<button id="modal-confirm-btn" class="btn-danger">Discard & Load</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`
            );
        } else {
            loadProject();
        }
    }

    /**
     * Rebuilds the entire page (state and DOM) from a loaded project object.
     * @param {object} projectData - The full project object from Supabase.
     */
    function hydrateState(projectData) {
        // 1. Clear existing DOM
        siteFormsContainer.innerHTML = '';
        siteTabsContainer.innerHTML = '';

        // 2. Set global state
        state.currentProjectId = projectData.id;
        state.sites = projectData.sites || [];
        state.activeSiteId = state.sites.length > 0 ? state.sites[0].id : null;
        state.nextSiteId = state.sites.length > 0 
            ? Math.max(...state.sites.map(s => s.id)) + 1 
            : 1;

        // 3. Set global inputs
        projectNameInput.value = projectData.project_name || '';
        globalTargetIrrInput.value = projectData.global_target_irr || 15;
        
        // 4. Rebuild DOM for each site
        state.sites.forEach(site => {
            const templateClone = siteFormTemplate.content.cloneNode(true);
            const newFormWrapper = templateClone.querySelector('.site-form-wrapper');
            
            newFormWrapper.dataset.siteId = site.id;
            
            // Populate all inputs from saved data
            newFormWrapper.querySelector('.site-name-input').value = site.name;
            const inputs = site.inputs || {};
            newFormWrapper.querySelector('.term-input').value = inputs.term || 0; // <-- MODIFIED
            newFormWrapper.querySelector('.construction-cost-input').value = inputs.constructionCost || 0;
            newFormWrapper.querySelector('.engineering-cost-input').value = inputs.engineeringCost || 0;
            newFormWrapper.querySelector('.product-cost-input').value = inputs.productCost || 0; // <-- NEW
            newFormWrapper.querySelector('.monthly-cost-input').value = inputs.monthlyCost || 0;
            newFormWrapper.querySelector('.nrr-input').value = inputs.nrr || 0;
            newFormWrapper.querySelector('.mrr-input').value = inputs.mrr || 0;
            
            siteFormsContainer.appendChild(templateClone);
            attachFormListeners(newFormWrapper);
            
            runSiteCalculation(site.id, false);
        });

        // 5. Run final calculations and renders
        runGlobalCalculation();
        renderTabs();
        if (state.activeSiteId) {
            setActiveSite(state.activeSiteId);
        }
    }


    // --- 9. Event Listener Setup ---

    /**
     * Attaches all necessary event listeners to a newly created site form.
     */
    function attachFormListeners(formWrapper) {
        const siteId = Number(formWrapper.dataset.siteId);

        formWrapper.addEventListener('input', (e) => {
            state.isFormDirty = true;
            if (e.target.classList.contains('site-name-input')) {
                const site = state.sites.find(s => s.id === siteId);
                if (site) site.name = e.target.value || `Site ${siteId}`;
                renderTabs();  
                setActiveSite(siteId);
            } else {
                runSiteCalculation(siteId);
            }
        });

        formWrapper.querySelector('.delete-site-btn').addEventListener('click', () => {
            const site = state.sites.find(s => s.id === siteId);
            showModal("Confirm Deletion", `Are you sure you want to delete "${site ? site.name : 'this site'}"?`,
                () => {
                    deleteSite(siteId);
                    hideModal();
                }, true,  
                `<button id="modal-confirm-btn" class="btn-danger">Delete</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`
            );
        });
    }

    /**
     * Sets up all global, non-site-specific event listeners.
     */
    function setupPageEventListeners() {
        setupModalListeners();  

        // Sidebar navigation
        const navSidebar = document.querySelector(".nav-sidebar");
        if (navSidebar) {
            navSidebar.addEventListener('click', (e) => {
                const navButton = e.target.closest('a.nav-button');
                if (navButton) {
                    e.preventDefault();
                    const url = navButton.href;
                    if (state.isFormDirty) {
                        showModal("Unsaved Changes", "You have unsaved changes that will be lost. Are you sure you want to leave?", 
                            () => {
                                state.isFormDirty = false;  
                                window.location.href = url;
                            }, true,  
                            `<button id="modal-confirm-btn" class="btn-danger">Discard & Leave</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`
                        );
                    } else {
                        window.location.href = url;
                    }
                }
            });
        }
        
        // Beforeunload confirmation
        window.addEventListener('beforeunload', (event) => {
            if (state.isFormDirty) {
                event.preventDefault();
                event.returnValue = '';
            }
        });

        // Project Control Buttons
        if (newProjectBtn) newProjectBtn.addEventListener('click', handleNewProject);
        if (loadProjectBtn) loadProjectBtn.addEventListener('click', handleLoadProject);
        if (saveProjectBtn) saveProjectBtn.addEventListener('click', handleSaveProject);
        if (addSiteBtn) addSiteBtn.addEventListener('click', addNewSite);
        if (printReportBtn) printReportBtn.addEventListener('click', handlePrintReport);
        if (exportCsvBtn) exportCsvBtn.addEventListener('click', handleExportCSV);
        
        // Tab bar click delegation
        if (siteTabsContainer) {
            siteTabsContainer.addEventListener('click', (e) => {
                const tab = e.target.closest('.irr-tab');
                if (tab) {
                    setActiveSite(Number(tab.dataset.siteId));
                }
            });
        }
        
        // Global Target IRR listener
        if (globalTargetIrrInput) {
            globalTargetIrrInput.addEventListener('input', () => {
                state.isFormDirty = true;
                state.sites.forEach(site => runSiteCalculation(site.id, false));  
                runGlobalCalculation();  
            });
        }
        
        // Project Name listener
        if (projectNameInput) {
            projectNameInput.addEventListener('input', () => {
                state.isFormDirty = true;
            });
        }

        // Load Modal Listeners
        if (loadProjectCancelBtn) {
            loadProjectCancelBtn.addEventListener('click', () => {
                loadProjectModal.classList.add('hidden');
            });
        }
        if (loadProjectList) {
            loadProjectList.addEventListener('click', (e) => {
                const li = e.target.closest('li[data-project-id]');
                if (li) {
                    loadProjectFromList(li.dataset.projectId);
                }
            });
        }
    }

    // --- 10. Main Page Initialization ---
    async function initializePage() {
        await loadSVGs();
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            console.error('Authentication failed or no session found. Redirecting to login.');
            window.location.href = "index.html";
            return;
        }
        state.currentUser = session.user;

        try {
            await setupUserMenuAndAuth(supabase, state);
            await setupGlobalSearch(supabase, state.currentUser);
            await checkAndSetNotifications(supabase);
            
            setupPageEventListeners();

            // Start the user with one site
            handleNewProject();
            state.isFormDirty = false;

        } catch (error) {
            console.error("Critical error during page initialization:", error);
            showModal(
                "Loading Error",
                "There was a problem loading the page. Please refresh to try again.",
                null, false,
                `<button id="modal-ok-btn" class="btn-primary">OK</button>`
            );
        }
    }

    // --- 11. Financial Calculation (Pure Functions) ---

    function calculateNPV(rate, cashFlows) {
        let npv = 0;
        for (let i = 0; i < cashFlows.length; i++) {
            npv += cashFlows[i] / Math.pow(1 + rate, i);
        }
        return npv;
    }

    function calculateIRR(cashFlows) {
        const maxIterations = 100;
        const precision = 1e-7;
        
        let minRate = -0.9999;  
        let maxRate = 1.0;     
        let midRate = (minRate + maxRate) / 2;

        let npvAtMin = calculateNPV(minRate, cashFlows);
        let npvAtMax = calculateNPV(maxRate, cashFlows);
        
        if (npvAtMin * npvAtMax > 0) {
            maxRate = 5.0;
            npvAtMax = calculateNPV(maxRate, cashFlows);
            if (npvAtMin * npvAtMax > 0) {
                 minRate = -0.999999;
                 maxRate = 20.0;
                 npvAtMin = calculateNPV(minRate, cashFlows);
                 npvAtMax = calculateNPV(maxRate, cashFlows);
                 if (npvAtMin * npvAtMax > 0) return NaN;  
            }
        }

        for (let i = 0; i < maxIterations; i++) {
            midRate = (minRate + maxRate) / 2;
            let npvAtMid = calculateNPV(midRate, cashFlows);

            if (Math.abs(npvAtMid) < precision) {
                return midRate;
            } else if (npvAtMid * npvAtMin > 0) {
                minRate = midRate;
                npvAtMin = npvAtMid;
            } else {
                maxRate = midRate;
            }
        }
        
        return midRate;
    }

    // --- 12. Run Initialization ---
    initializePage();
});
