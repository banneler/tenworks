import { 
    SUPABASE_URL, SUPABASE_ANON_KEY, setupUserMenuAndAuth, 
    loadSVGs, updateActiveNavLink, initializeAppState, 
    setupModalListeners, setupGlobalSearch, checkAndSetNotifications 
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const ENGINES = [
        { 
            id: 'get-daily-briefing', 
            name: 'Command Center', 
            demoPersona: "A high-performance Sales Director focused on momentum and revenue.", 
            demoVoice: "Encouraging, high-energy, and Nebraska-friendly.", 
            demoInstructions: "Start with 'Howdy, Partner!'. Use bullet points for the Top 5 priorities.", 
            technicalPrompt: "This engine acts as a strategic filter for your CRM. It is hardcoded to ingest a massive payload of raw data—including pending tasks, active deals, Cognito news alerts, and contact engagement logs." 
        },
        { 
            id: 'get-account-briefing', 
            name: 'Account Recon', 
            demoPersona: "A relentless Enterprise Account Strategist specializing in the Nebraska market.", 
            demoVoice: "Consultative, data-driven, and objective.", 
            demoInstructions: "Flag accounts hitting $35M revenue or 75+ employee thresholds. Identify cross-sell gaps.", 
            technicalPrompt: "This engine acts as a 'Strategic Intelligence Officer.' It is technically unique because it is granted access to live Google Search tools to find information outside of the CRM."
        },
        { 
            id: 'get-gemini-suggestion', 
            name: 'Cognito Suggestion', 
            demoPersona: "A consultative telecom advisor who values the prospect's time.", 
            demoVoice: "Professional, concise, and non-robotic.", 
            demoInstructions: "Reference news alerts naturally. Focus on insights rather than just asking for a meeting.", 
            technicalPrompt: "This engine is the 'Lead Cultivator' for the Cognito system. It maps real-time firmographic alerts to GPC’s product portfolio." 
        },
        { 
            id: 'generate-custom-suggestion', 
            name: 'Cognito Refiner', 
            demoPersona: "An expert communications and copywriting coach.", 
            demoVoice: "Direct and instruction-led.", 
            demoInstructions: "Strictly follow user feedback to adjust the tone or focus of the previous draft.", 
            technicalPrompt: "This engine acts as a 'Professional Editor' and Revisionist. It processes the current state of an outreach draft alongside a user's feedback."
        },
           { 
            id: 'custom-user-social-post', 
            name: 'Product Post', 
            demoPersona: "A senior GPC Product Marketing Specialist.", 
            demoVoice: "Authoritative yet approachable. Focus on outcomes, not features.", 
            demoInstructions: "Emphasize local reliability and GPC's deep roots in the Nebraska business community.", 
            technicalPrompt: "This tool is wired to reach out to the GPC Product database to pull in 'Verbiage Context.' It takes your raw topic and selected products."
        },
        { 
            id: 'refine-social-post', 
            name: 'Post Refiner', 
            demoPersona: "A professional business journal editor.", 
            demoVoice: "Polished, sophisticated, and concise.", 
            demoInstructions: "Clean up wordiness. Optimize for mobile readability on LinkedIn.", 
            technicalPrompt: "This engine acts as a 'Professional Content Editor.' It applies iterative user feedback to an existing draft."
        },
        { 
            id: 'generate-prospect-email', 
            name: 'Contact Email', 
            demoPersona: "An experienced Strategic Markets Group sales lead.", 
            demoVoice: "Value-first and peer-to-peer.", 
            demoInstructions: "Keep it under 150 words. Anchor on a specific business outcome.", 
            technicalPrompt: "This engine performs a 'triple-join' of data: user name/title, product verbiage context, and prospect industry." 
        },
        { 
            id: 'get-activity-insight', 
            name: 'Activity Insights', 
            demoPersona: "A sharp Strategic Sales Analyst.", 
            demoVoice: "Insightful, analytical, and action-oriented.", 
            demoInstructions: "Flag accounts with zero activity in 30 days.", 
            technicalPrompt: "This engine parses chronologically ordered activity logs to identify relationship sentiment and velocity." 
        }
    ];

    let state = { 
        selectedEngineId: null, 
        configs: [], 
        currentUser: null 
    };

    const tabContainer = document.getElementById("ai-engine-tabs");
    const editorForm = document.getElementById("ai-editor-form");
    const placeholder = document.getElementById("no-selection-msg");
    const saveBtn = document.getElementById("save-config-btn");

    function showToast(message, type = 'success') {
        const existingToast = document.querySelector('.constellation-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `constellation-toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // LOAD CONFIGS: Adjusted for the User-Fallback Hierarchy
    async function loadConfigs() {
        if (!state.currentUser) return;
        
        // Fetch User Overrides OR Global Defaults (where user_id is null)
        const { data, error } = await supabase
            .from('ai_configs')
            .select('*')
            .or(`user_id.eq.${state.currentUser.id},user_id.is.null`)
            .order('user_id', { ascending: false, nullsFirst: false });

        if (error) return console.error("Error loading configs:", error);
        
        // Ensure we only keep the best match for each function (User > Global)
        const uniqueConfigs = [];
        const seenFunctions = new Set();
        
        data.forEach(config => {
            if (!seenFunctions.has(config.function_id)) {
                uniqueConfigs.push(config);
                seenFunctions.add(config.function_id);
            }
        });

        state.configs = uniqueConfigs;
        renderTabs();
        
        // If an engine was already selected, refresh its view
        if (state.selectedEngineId) selectEngine(state.selectedEngineId);
    }

    function renderTabs() {
        tabContainer.innerHTML = ENGINES.map(e => `
            <button class="irr-tab ${state.selectedEngineId === e.id ? 'active' : ''}" data-id="${e.id}">
                ${e.name}
            </button>
        `).join('');
    }

    function selectEngine(id) {
        state.selectedEngineId = id;
        const engine = ENGINES.find(e => e.id === id);
        
        // Find the active config for this engine in state
        const config = state.configs.find(c => c.function_id === id) || {};
        const isUserOverride = config.user_id === state.currentUser.id;

        renderTabs();
        placeholder.classList.add('hidden');
        editorForm.classList.remove('hidden');
        saveBtn.classList.remove('hidden');

        document.getElementById('selected-engine-name').textContent = engine.name;
        document.getElementById('ai-technical-foundation').value = engine.technicalPrompt;

        // Visual Indicator of Config State
        const badge = document.getElementById('config-status-badge');
        if (badge) {
            badge.textContent = isUserOverride ? "✨ PERSONAL VOICE ACTIVE" : "🏛️ SYSTEM DEFAULT ACTIVE";
            badge.className = isUserOverride ? "status-badge personal" : "status-badge system";
        }

        const pField = document.getElementById('ai-persona');
        const vField = document.getElementById('ai-voice');
        const iField = document.getElementById('ai-custom-instructions');

        pField.value = config.persona || '';
        vField.value = config.voice || '';
        iField.value = config.custom_instructions || '';

        pField.placeholder = `Demo: ${engine.demoPersona}`;
        vField.placeholder = `Demo: ${engine.demoVoice}`;
        iField.placeholder = `Demo: ${engine.demoInstructions}`;
    }

    async function initializePage() {
        await loadSVGs();
        const globalState = await initializeAppState(supabase); 
        
        if (globalState.currentUser) {
            state.currentUser = globalState.currentUser;
            await setupUserMenuAndAuth(supabase, globalState); 
            await setupGlobalSearch(supabase);
            await checkAndSetNotifications(supabase);
            updateActiveNavLink();
            setupModalListeners();
            await loadConfigs();

            tabContainer.addEventListener('click', (e) => {
                const tab = e.target.closest('.irr-tab');
                if (tab) selectEngine(tab.dataset.id);
            });

            // SAVE CONFIG: Updated to target the User UUID Override
            saveBtn.addEventListener('click', async () => {
                if (!state.selectedEngineId) return;

                const data = {
                    function_id: state.selectedEngineId,
                    user_id: state.currentUser.id, // Save as personal override
                    persona: document.getElementById('ai-persona').value,
                    voice: document.getElementById('ai-voice').value,
                    custom_instructions: document.getElementById('ai-custom-instructions').value,
                    updated_at: new Date().toISOString()
                };

                // Upsert on (function_id, user_id)
                const { error } = await supabase
                    .from('ai_configs')
                    .upsert(data, { onConflict: 'function_id, user_id' });
                
                if (error) {
                    showToast(`Save Error: ${error.message}`, 'error');
                } else {
                    showToast("Your Personal AI Voice Updated!");
                    await loadConfigs(); // Refresh to show override status
                }
            });

            // OPTIONAL: Add a "Reset to Default" logic
            const resetBtn = document.getElementById("reset-config-btn");
            if (resetBtn) {
                resetBtn.addEventListener('click', async () => {
                    const { error } = await supabase
                        .from('ai_configs')
                        .delete()
                        .match({ function_id: state.selectedEngineId, user_id: state.currentUser.id });
                    
                    if (!error) {
                        showToast("Reset to System Standard.");
                        await loadConfigs();
                    }
                });
            }
        } else {
            window.location.href = "index.html";
        }
    }

    initializePage();
});
