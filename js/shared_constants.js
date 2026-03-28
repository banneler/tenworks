// js/shared_constants.js

// --- SHARED CONSTANTS AND FUNCTIONS ---

export const SUPABASE_URL = "https://ccrnueyxmnzqlaphqdjn.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjcm51ZXl4bW56cWxhcGhxZGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODgyOTIsImV4cCI6MjA4NDA2NDI5Mn0.fy6q89n3bzmwxjgOY9cMJoWqyynvA5M_COJqNdAQqME";

export const themes = ["dark", "light", "green", "blue", "corporate"];

// --- GLOBAL LOADER (Phase 2 — TENWORKS_FACELIFT_GUIDELINES.md § 2.3) ---
const GLOBAL_LOADER_ID = 'global-loader-overlay';

/**
 * Injects the global loader overlay into document.body if it does not already exist.
 * Uses TenWorks logo spinner (same as proposals loading-overlay). Visible by default
 * so it covers the main content until the page calls hideGlobalLoader().
 */
function injectGlobalLoaderMarkup() {
    if (document.getElementById(GLOBAL_LOADER_ID)) return;
    const overlay = document.createElement('div');
    overlay.id = GLOBAL_LOADER_ID;
    overlay.className = 'global-loader-overlay active';
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-busy', 'true');
    overlay.innerHTML = `
        <div class="global-loader-content">
            <div class="global-loader-spinner" aria-hidden="true">
                <img src="assets/logo.svg" alt="" class="global-loader-logo-spin" width="80" height="80">
            </div>
            <p class="global-loader-text">Loading…</p>
        </div>
    `;
    document.body.appendChild(overlay);
}

/**
 * Shows the global loader overlay (adds .active class).
 */
export function showGlobalLoader() {
    injectGlobalLoaderMarkup();
    const el = document.getElementById(GLOBAL_LOADER_ID);
    if (el) {
        el.classList.add('active');
        el.setAttribute('aria-busy', 'true');
    }
}

/**
 * Hides the global loader overlay (removes .active class).
 */
export function hideGlobalLoader() {
    const el = document.getElementById(GLOBAL_LOADER_ID);
    if (el) {
        el.classList.remove('active');
        el.setAttribute('aria-busy', 'false');
    }
}

// Inject loader as soon as body is available so it exists on page load
if (document.body) {
    injectGlobalLoaderMarkup();
} else {
    document.addEventListener('DOMContentLoaded', injectGlobalLoaderMarkup);
}

// --- NEW: GLOBAL STATE MANAGEMENT ---
const appState = {
    currentUser: null,          // The actual logged-in user object
    effectiveUserId: null,      // The ID of the user whose data is being viewed
    effectiveUserFullName: null,// The name of the user being viewed
    isManager: false,           // Is the logged-in user a manager?
    managedUsers: []            // Array of users the manager can view as
};

/**
 * Returns the current application state.
 */
export function getState() {
    return { ...appState };
}

/**
 * Sets the effective user for impersonation view.
 * @param {string} userId - The UUID of the user to view as.
 * @param {string} fullName - The full name of the user to view as.
 */
export function setEffectiveUser(userId, fullName) {
    appState.effectiveUserId = userId;
    appState.effectiveUserFullName = fullName;
    console.log(`Viewing as: ${fullName} (${userId})`);
    
    // This is the key part for triggering a UI refresh.
    // We dispatch a custom event that other parts of the app can listen for.
    window.dispatchEvent(new CustomEvent('effectiveUserChanged'));
}

/**
 * Run a callback when the nav partial has been injected (e.g. by nav-loader.js).
 * Use this for setup that depends on nav DOM (global search, user menu, SVGs).
 * If nav is already present, runs immediately; otherwise waits for the 'navReady' event.
 * @param {Function} callback - Called when nav is ready (no arguments).
 */
export function runWhenNavReady(callback) {
    const container = document.getElementById('nav-container');
    if (container && container.children.length > 0) {
        callback();
        return;
    }
    window.addEventListener('navReady', function onReady() {
        window.removeEventListener('navReady', onReady);
        callback();
    });
}

/**
 * Initializes the global state on application startup.
 * @param {SupabaseClient} supabase The Supabase client.
 * @returns {Promise<object>} The fully initialized state object.
 */
export async function initializeAppState(supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    appState.currentUser = user;
    appState.effectiveUserId = user.id;

    // Fetch user's full name for the default state
    const { data: currentUserQuota, error: quotaError } = await supabase
        .from('user_quotas')
        .select('full_name')
        .eq('user_id', user.id)
        .single();

    if (quotaError && quotaError.code !== 'PGRST116') console.error("Error fetching current user's name:", quotaError);
    appState.effectiveUserFullName = currentUserQuota?.full_name || 'User';

    // Check for manager status using the metadata
    appState.isManager = user.user_metadata?.is_manager === true;

    if (appState.isManager) {
        // If they are a manager, fetch all users from user_quotas for the dropdown
        const { data: allUsers, error } = await supabase
            .from('user_quotas')
            .select('user_id, full_name')
            .neq('user_id', user.id) // Don't include the manager in their own list
            .order('full_name'); 

        if (error) {
            console.error("Error fetching managed users from user_quotas:", error);
        } else {
            // Map directly to the format our dropdown function expects
            appState.managedUsers = allUsers.map(u => ({
                id: u.user_id,
                full_name: u.full_name
            }));
        }
    }
    
    return appState;
}

/**
 * Renders the impersonation dropdown in the user menu if the user is a manager.
 */
function renderImpersonationDropdown() {
    if (!appState.isManager || appState.managedUsers.length === 0) {
        return;
    }

    const userMenuPopup = document.getElementById('user-menu-popup');
    if (!userMenuPopup) return;

    // 1. Create the container
    const container = document.createElement('div');
    container.className = 'impersonation-container';

    // 2. Create the "My View" option
    const currentUserOption = {
        id: appState.currentUser.id,
        full_name: appState.effectiveUserFullName.includes('(Viewing As)') 
            ? 'My View' // If we're already viewing as someone, just show "My View"
            : appState.effectiveUserFullName 
    };
    
    const allUsers = [currentUserOption, ...appState.managedUsers];
    
    // 3. Create the options HTML
    const optionsHtml = allUsers.map(user => {
        const selected = (user.id === appState.effectiveUserId) ? 'selected' : '';
        return `<option value="${user.id}" data-full-name="${user.full_name}" ${selected}>${user.full_name}</option>`;
    }).join('');

    // 4. Set the inner HTML for the dropdown
    container.innerHTML = `
        <label for="impersonation-select">View As:</label>
        <select id="impersonation-select">
            ${optionsHtml}
        </select>
    `;
    
    // 5. Add it to the top of the popup
    userMenuPopup.prepend(container);

    // 5b. Add Demo Mobile View Toggle
    const isMobilePage = window.location.pathname.includes('mobile.html');
    if (isMobilePage) {
        const demoContainer = document.createElement('div');
        demoContainer.className = 'impersonation-container';
        demoContainer.style.marginTop = '10px';
        
        const currentDemoRole = localStorage.getItem('demo_mobile_role') || 'leader';
        
        demoContainer.innerHTML = `
            <label for="demo-role-select">Demo Mobile View:</label>
            <select id="demo-role-select" class="form-control" style="width: 100%; margin-top: 5px; background: var(--bg-dark); color: var(--text-bright); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px;">
                <option value="leader" ${currentDemoRole === 'leader' ? 'selected' : ''}>Leader View</option>
                <option value="laborer" ${currentDemoRole === 'laborer' ? 'selected' : ''}>Laborer View</option>
            </select>
        `;
        userMenuPopup.prepend(demoContainer);

        const demoSelect = document.getElementById('demo-role-select');
        if (demoSelect) {
            demoSelect.addEventListener('click', (e) => e.stopPropagation());
            demoSelect.addEventListener('change', (e) => {
                localStorage.setItem('demo_mobile_role', e.target.value);
                window.location.reload();
            });
        }
    }

    // 6. Add the event listener and optionally init TomSelect
    const impersonationSelect = document.getElementById('impersonation-select');
    if (impersonationSelect) {
        impersonationSelect.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        if (typeof window.TomSelect !== "undefined") {
            try {
                const ts = new window.TomSelect(impersonationSelect, {
                    create: false,
                    render: { dropdown: () => { const d = document.createElement("div"); d.className = "ts-dropdown tom-select-no-search"; return d; } }
                });
                ts.on("change", (userId) => {
                    const opt = impersonationSelect.querySelector(`option[value="${userId}"]`);
                    const fullName = opt ? opt.dataset.fullName : "";
                    setEffectiveUser(userId, fullName);
                    const userNameDisplay = document.getElementById("user-name-display");
                    if (userNameDisplay) {
                        if (userId === appState.currentUser.id) {
                            userNameDisplay.textContent = fullName;
                        } else {
                            userNameDisplay.textContent = `${fullName} (Viewing As)`;
                        }
                    }
                });
            } catch (e) {
                impersonationSelect.addEventListener('change', (e) => {
                    const selectedOption = e.target.options[e.target.selectedIndex];
                    const userId = selectedOption.value;
                    const fullName = selectedOption.dataset.fullName;
                    setEffectiveUser(userId, fullName);
                    const userNameDisplay = document.getElementById("user-name-display");
                    if (userNameDisplay) {
                        if (userId === appState.currentUser.id) {
                            userNameDisplay.textContent = fullName;
                        } else {
                            userNameDisplay.textContent = `${fullName} (Viewing As)`;
                        }
                    }
                });
            }
        } else {
            impersonationSelect.addEventListener('change', (e) => {
                const selectedOption = e.target.options[e.target.selectedIndex];
                const userId = selectedOption.value;
                const fullName = selectedOption.dataset.fullName;
                setEffectiveUser(userId, fullName);
                const userNameDisplay = document.getElementById("user-name-display");
                if (userNameDisplay) {
                    if (userId === appState.currentUser.id) {
                        userNameDisplay.textContent = fullName;
                    } else {
                        userNameDisplay.textContent = `${fullName} (Viewing As)`;
                    }
                }
            });
        }
    }
}

// --- THEME MANAGEMENT ---
export const themesList = themes; // Backward compatibility
let currentThemeIndex = 0;

function applyTheme(themeName) {
    const themeNameSpan = document.getElementById("theme-name");
    document.body.className = '';
    document.body.classList.add(`theme-${themeName}`);
    if (themeNameSpan) {
        const capitalizedThemeName = themeName.charAt(0).toUpperCase() + themeName.slice(1);
        themeNameSpan.textContent = capitalizedThemeName;
    }
}

async function saveThemePreference(supabase, userId, themeName) {
    const { error } = await supabase
        .from('user_preferences')
        .upsert({ user_id: userId, theme: themeName }, { onConflict: 'user_id' });
    if (error) {
        console.error("Error saving theme preference:", error);
    }
    localStorage.setItem('crm-theme', themeName);
}

export async function setupTheme(supabase, user) {
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    
    const { data, error } = await supabase
        .from('user_preferences')
        .select('theme')
        .eq('user_id', user.id)
        .single();

    let currentTheme = 'dark';
    if (error && error.code !== 'PGRST116') {
        console.error("Error fetching theme:", error);
    } else if (data) {
        currentTheme = data.theme;
    } else {
        await saveThemePreference(supabase, user.id, currentTheme);
    }
    
    currentThemeIndex = themes.indexOf(currentTheme);
    if (currentThemeIndex === -1) currentThemeIndex = 0;
    applyTheme(themes[currentThemeIndex]);
    localStorage.setItem('crm-theme', themes[currentThemeIndex]);

    if (themeToggleBtn && themeToggleBtn.dataset.listenerAttached !== 'true') {
        themeToggleBtn.addEventListener("click", () => {
            currentThemeIndex = (currentThemeIndex + 1) % themes.length;
            const newTheme = themes[currentThemeIndex];
            applyTheme(newTheme);
            saveThemePreference(supabase, user.id, newTheme);
        });
        themeToggleBtn.dataset.listenerAttached = 'true';
    }
}

// --- SHARED UTILITY FUNCTIONS ---

export function formatDate(dateString) {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatMonthYear(dateString) {
    if (!dateString) return "N/A";
    const [year, month] = dateString.split('-');
    const date = new Date(Date.UTC(year, month - 1, 2));  
    return date.toLocaleDateString("en-US", { year: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** Abbreviated month + year (e.g. "Jan 2025") for compact display. */
export function formatMonthYearShort(dateString) {
    if (!dateString) return "";
    const [year, month] = dateString.split('-');
    const date = new Date(Date.UTC(year, month - 1, 2));
    return date.toLocaleDateString("en-US", { year: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function formatSimpleDate(dateString) {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(date.getTime() + userTimezoneOffset);
    return adjustedDate.toLocaleDateString("en-US");
}

export function formatCurrency(value) {
    if (typeof value !== 'number') return '$0';
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatCurrencyK(value) {
    if (typeof value !== 'number') return '$0';
    if (Math.abs(value) >= 1000) {
        return `$${(value / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}K`;
    }
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// --- SHARED DEAL CARD HELPERS (Constellation-style, for accounts + deals) ---

/** Deal value: supports both value and legacy mrc. */
export function getDealValue(deal) {
    return (deal && (deal.value != null ? deal.value : deal.mrc)) || 0;
}

/** Elements list for deal card pills (kanban-style). */
export const DEAL_ELEMENTS_LIST = ['Steel', 'Aluminum', 'Glass', 'Powdercoat', 'Paint', 'Structural', 'Wood'];

export function getElementsPillHtml(dealId, elementsString) {
    const active = (elementsString || '').split(',').map(p => p.trim()).filter(Boolean);
    const activeLower = new Set(active.map(p => p.toLowerCase()));
    return `<div class="deal-list-elements-pills">${DEAL_ELEMENTS_LIST.map(el => {
        const isActive = activeLower.has(el.toLowerCase());
        return `<span class="element-pill ${isActive ? 'active' : ''}" data-deal-id="${dealId}" data-element="${el}" role="button" tabindex="0">${el}</span>`;
    }).join('')}</div>`;
}

/** Display name for stage (e.g. "Closed Won" → "Sold"). */
export function getStageDisplayName(stageName) {
    return stageName === 'Closed Won' ? 'Sold' : (stageName || '');
}

export function getDealStageColorClass(stageName) {
    if (!stageName) return "deal-stage-default";
    const s = (stageName || "").toLowerCase();
    if (s.includes("closed won") || s.includes("won") || s === "sold") return "deal-stage-won";
    if (s.includes("closed lost") || s.includes("lost")) return "deal-stage-lost";
    if (s.includes("discovery") || s.includes("qualification")) return "deal-stage-discovery";
    if (s.includes("proposal") || s.includes("quote")) return "deal-stage-proposal";
    if (s.includes("negotiation") || s.includes("contract")) return "deal-stage-negotiation";
    return "deal-stage-default";
}

export function escapeNotesForHtml(notes) {
    if (!notes || !notes.trim()) return "";
    return (notes || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
}

export const DEAL_PRODUCT_FAMILIES = ["Internet", "Ethernet", "UC", "PRI/SIP", "SD-WAN", "Firewall", "5G", "Cloud Connect", "Waves"];

function getProductClass(productName) {
    const p = (productName || "").toLowerCase().trim();
    if (p.includes("internet")) return "product-internet";
    if (p.includes("ethernet")) return "product-ethernet";
    if (p.includes("uc")) return "product-uc";
    if (p.includes("pri") || p.includes("sip")) return "product-pri-sip";
    if (p.includes("sdwan") || p.includes("sd-wan")) return "product-sdwan";
    if (p.includes("firewall")) return "product-firewall";
    if (p.includes("5g")) return "product-5g";
    if (p.includes("cloud")) return "product-cloud";
    if (p.includes("wave")) return "product-waves";
    return "product-default";
}

export function getProductPillHtml(dealId, productsString) {
    const activeProducts = (productsString || "").split(",").map((p) => p.trim().toLowerCase()).filter((p) => p);
    return `<div class="flex flex-wrap gap-1 mt-1 justify-start">
        ${DEAL_PRODUCT_FAMILIES.map((p) => {
            const isMatch = (ap) => ap === p.toLowerCase() ||
                (p === "PRI/SIP" && (ap.includes("pri") || ap.includes("sip"))) ||
                (p === "SD-WAN" && (ap.includes("sdwan") || ap.includes("sd-wan")));
            const isActive = activeProducts.some(isMatch);
            if (isActive) {
                return `<span class="product-pill product-pill-toggle active cursor-pointer hover:opacity-80 transition-opacity ${getProductClass(p)}" data-deal-id="${dealId}" data-product="${p}" title="Remove ${p}">${p}</span>`;
            }
            return `<span class="product-pill product-pill-toggle product-pill-inactive cursor-pointer" data-deal-id="${dealId}" data-product="${p}" title="Add ${p}">${p}</span>`;
        }).join("")}
    </div>`;
}

/**
 * Returns frontContent, backContent, and stageClass for a deal card (Constellation-style).
 * Use from accounts or deals page to build the card DOM.
 * @param {Object} deal - Deal object (id, stage, mrc, name, products, notes, close_month, term, is_committed)
 * @param {Object} options - { formatMonthYear: fn, includeStageIndicator: boolean (default true) }
 * @returns {{ frontContent: string, backContent: string, stageClass: string }}
 */
export function getDealCardContent(deal, options = {}) {
    const formatMonthYearFn = options.formatMonthYear || formatMonthYear;
    const includeStageIndicator = options.includeStageIndicator !== false;
    const stageClass = getDealStageColorClass(deal.stage);
    const notes = (deal.notes || "").trim();
    const notesEscaped = escapeNotesForHtml(notes);
    const dealId = deal.id;
    const truncate = (str, max = 30) => {
        if (!str) return '';
        return str.length > max ? str.substring(0, max) + '...' : str;
    };
    const safeName = (deal.name || "").replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeStage = (getStageDisplayName(deal.stage) || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const stageMarkup = includeStageIndicator
        ? `<span class="deal-card-stage-wrap"><span class="deal-card-stage-indicator ${stageClass}" aria-hidden="true"></span><span class="deal-card-stage">${safeStage}</span></span>`
        : `<span class="deal-card-stage">${safeStage}</span>`;

    const frontContent = `
        <div class="deal-card-header">
            <div class="deal-card-commit-row">
                <label class="deal-card-commit-toggle" for="deal-commit-${dealId}">
                    <input type="checkbox" id="deal-commit-${dealId}" class="deal-card-commit-input commit-deal-checkbox sr-only" data-deal-id="${dealId}" ${deal.is_committed ? "checked" : ""}>
                    <span class="deal-card-commit-slider"></span>
                    <span class="deal-card-commit-label">Committed</span>
                </label>
                ${stageMarkup}
            </div>
            <button type="button" class="btn-icon btn-icon-sm edit-deal-btn" data-deal-id="${dealId}" title="Edit Deal"><i class="fas fa-pen"></i></button>
        </div>
        <div class="deal-card-value">$${deal.mrc != null ? Number(deal.mrc) : 0}/mo</div>
        <div class="deal-card-name" title="${safeName}">${truncate(safeName, 30)}</div>
        <div class="deal-card-products">${getProductPillHtml(dealId, deal.products)}</div>
        <div class="deal-card-footer">
            ${deal.close_month ? `<span class="deal-card-close">${formatMonthYearFn(deal.close_month)}</span>` : '<span class="deal-card-close deal-card-empty"></span>'}
            ${deal.term ? `<span class="deal-card-term">Term: ${(deal.term + "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>` : '<span class="deal-card-term deal-card-empty"></span>'}
        </div>
    `;
    const backContent = `
        <div class="deal-card-back-content">
            <div class="deal-card-back-body">${notesEscaped || '<span class="text-muted">No job details</span>'}</div>
            <button type="button" class="btn-icon btn-icon-sm deal-card-back-edit" data-deal-id="${dealId}" title="Edit notes"><i class="fas fa-pen"></i></button>
        </div>`;
    return { frontContent, backContent, stageClass };
}

/**
 * Returns full HTML for the kanban-style deal card (used on Deals page and Account page).
 * @param {Object} deal - Deal object (id, stage, value, mrc, name, elements, notes, close_month, is_committed, account_id)
 * @param {Object} options - { accountName?: string (default '—'), draggable?: boolean (default false) }
 * @returns {string} HTML string for one card
 */
export function getKanbanDealCardContent(deal, options = {}) {
    const accountName = (options.accountName ?? '—').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const draggable = options.draggable === true;
    const stageClass = getDealStageColorClass(deal.stage);
    const safeName = (deal.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const truncate = (str, max = 28) => (!str ? '' : str.length > max ? str.substring(0, max) + '...' : str);
    const notesHtml = (deal.notes || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') || '<span class="text-muted">No job details</span>';
    const dealId = deal.id;
    const frontHtml = `
        <div class="deal-card-header">
            <label class="deal-card-commit-toggle">
                <input type="checkbox" class="commit-deal-checkbox sr-only" data-deal-id="${dealId}" ${deal.is_committed ? 'checked' : ''}>
                <span class="deal-card-commit-dot"></span>
                <span class="deal-card-commit-label">Committed</span>
            </label>
            <span class="deal-card-stage" data-deal-id="${dealId}">${getStageDisplayName(deal.stage) || 'Stage'}</span>
            <a href="proposals.html?deal_id=${dealId}" class="deal-card-proposal-icon" title="Proposal"><i class="fas fa-file-contract"></i></a>
        </div>
        <div class="deal-card-value deal-card-editable" data-deal-id="${dealId}" data-field="value" title="Click to edit">${formatCurrency(getDealValue(deal))}/mo</div>
        <div class="deal-card-name deal-card-editable" data-deal-id="${dealId}" data-field="name" title="${safeName}">${truncate(safeName)}</div>
        <div class="deal-card-account deal-card-editable" data-deal-id="${dealId}" data-field="account" title="Click to edit">${accountName}</div>
        <div class="deal-card-elements">${getElementsPillHtml(dealId, deal.elements)}</div>
        <div class="deal-card-footer">
            <span class="deal-card-close deal-card-editable" data-deal-id="${dealId}" data-field="close_month" title="Click to edit">${deal.close_month ? formatMonthYearShort(deal.close_month) : '—'}</span>
        </div>`;
    const backHtml = `
        <div class="deal-card-back-content">
            <div class="deal-card-back-body">${notesHtml}</div>
            <button type="button" class="btn-icon btn-icon-sm deal-card-back-edit" data-deal-id="${dealId}" title="Edit notes"><i class="fas fa-pen"></i></button>
        </div>`;
    const dragAttr = draggable ? ' draggable="true"' : '';
    return `
    <div class="kanban-card deal-card deal-card-flippable ${stageClass}"${dragAttr} data-id="${dealId}">
        <div class="deal-card-flip-inner">
            <div class="deal-card-front">${frontHtml}</div>
            <div class="deal-card-back">${backHtml}</div>
        </div>
    </div>`;
}

export function parseCsvRow(row) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

export function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

export function updateActiveNavLink() {
    const currentPage = window.location.pathname.split("/").pop();
    document.querySelectorAll(".nav-sidebar .nav-button").forEach(link => {
        const linkPage = link.getAttribute("href");
        if(linkPage) {
            link.classList.toggle("active", linkPage === currentPage);
        }
    });
}

// --- MODAL FUNCTIONS (FIXED) ---

// We do NOT store modal elements in top-level constants to avoid null errors.
let currentModalCallbacks = { onConfirm: null, onCancel: null };

export function getCurrentModalCallbacks() { return { ...currentModalCallbacks }; }
export function setCurrentModalCallbacks(callbacks) { currentModalCallbacks = { ...callbacks }; }

export function showModal(title, bodyHtml, onConfirm = null, showCancel = true, customActionsHtml = null, onCancel = null) {
    const modalBackdrop = document.getElementById("modal-backdrop");
    const modalTitle = document.getElementById("modal-title");
    const modalBody = document.getElementById("modal-body");
    const modalActions = document.getElementById("modal-actions");

    if (!modalBackdrop || !modalTitle || !modalBody || !modalActions) {
        console.error("Modal elements are missing from the DOM. Ensure #modal-backdrop is in your HTML.");
        return;
    }
    // Destroy any TomSelect instances in modal body before replacing content
    if (typeof window.TomSelect !== "undefined") {
        modalBody.querySelectorAll("select").forEach((sel) => {
            if (sel.tomselect) try { sel.tomselect.destroy(); } catch (e) {}
        });
    }
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    
    if (customActionsHtml) {
        modalActions.innerHTML = customActionsHtml;
    } else {
        modalActions.innerHTML = `
            <button id="modal-confirm-btn" class="btn-primary">Confirm</button>
            ${showCancel ? '<button id="modal-cancel-btn" class="btn-secondary">Cancel</button>' : ''}
        `;
    }

    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const okBtn = document.getElementById('modal-ok-btn');
    
    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            if (onConfirm) {
                const result = await Promise.resolve(onConfirm(modalBody)); // Pass modalBody reference
                if (result !== false) hideModal();
            } else {
                hideModal();
            }
        };
    }
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (onCancel) {
                onCancel();
            }
            hideModal();
        };
    }
    if (okBtn) {
        okBtn.onclick = () => {
            hideModal();
        };
    }

    modalBackdrop.classList.remove("hidden");
    // Re-attach backdrop click listener dynamically
    modalBackdrop.onclick = (e) => { if (e.target === modalBackdrop) hideModal(); };

    return modalBody; 
}

export function hideModal() {
    const modalBackdrop = document.getElementById("modal-backdrop");
    if (modalBackdrop) modalBackdrop.classList.add("hidden");
}

function handleEscapeKey(e) { if (e.key === "Escape") hideModal(); }

export function setupModalListeners() {
    window.addEventListener("keydown", handleEscapeKey);
}


// --- TOAST NOTIFICATIONS (Phase 5 — Constellation-V transplant) ---
export function showToast(message, type = 'success') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 4000);
}

export function showActionSuccess(actionLabel, detail = '') {
    const label = (actionLabel || 'Action completed').trim();
    const suffix = (detail || '').trim();
    showToast(suffix ? `${label}: ${suffix}` : label, 'success');
}

if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.showActionSuccess = showActionSuccess;
}


// --- USER MENU & AUTH LOGIC ---
export async function setupUserMenuAndAuth(supabase, state) {
    const userNameDisplay = document.getElementById('user-name-display');
    const userMenuPopup = document.getElementById('user-menu-popup');
    const logoutBtn = document.getElementById("logout-btn");
    const userMenuHeader = document.querySelector('.user-menu-header');
    const navMenuToggle = document.getElementById('nav-menu-toggle');

    if (!userMenuPopup || !userNameDisplay || !logoutBtn) {
        console.error("One or more user menu elements are missing.");
        return;
    }

    const { data: userData, error: userError } = await supabase
        .from('user_quotas')
        .select('full_name, monthly_quota')
        .eq('user_id', state.currentUser.id)
        .single();

    if (userError && userError.code !== 'PGRST116') {
        console.error('Error fetching user data:', userError);
        userNameDisplay.textContent = "Error";
        return;
    }
    
    if (!userData || !userData.full_name) {
        const modalBodyHtml = `
            <p>Welcome to Constellation! Please enter your details to get started.</p>
            <div>
                <label for="modal-full-name">Full Name</label>
                <input type="text" id="modal-full-name" required>
            </div>
            <div>
                <label for="modal-monthly-quota">Monthly Quota ($)</label>
                <input type="number" id="modal-monthly-quota" required placeholder="e.g., 50000">
            </div>
        `;
        showModal("Welcome!", modalBodyHtml, async () => {
            const fullName = document.getElementById('modal-full-name')?.value.trim();
            const monthlyQuota = document.getElementById('modal-monthly-quota')?.value;

            if (!fullName || !monthlyQuota) {
                alert("Please fill out all fields.");
                return false;
            }

            const { error: upsertError } = await supabase
                .from('user_quotas')
                .upsert({
                    user_id: state.currentUser.id,
                    full_name: fullName,
                    monthly_quota: Number(monthlyQuota)
                }, { onConflict: 'user_id' });

            if (upsertError) {
                console.error("Error saving user details to user_quotas:", upsertError);
                alert("Could not save your profile details. Please try again: " + upsertError.message);
                return false;
            }

            const { error: updateUserError } = await supabase.auth.updateUser({
                data: { full_name: fullName }
            });

            if (updateUserError) {
                console.warn("Could not save full_name to user metadata:", updateUserError);
            }

            userNameDisplay.textContent = fullName;
            await setupTheme(supabase, state.currentUser);
            attachUserMenuListeners();
            return true;

        }, false, `<button id="modal-confirm-btn" class="btn-primary">Get Started</button>`);
    
    } else {
        userNameDisplay.textContent = userData.full_name || 'User';
        await setupTheme(supabase, state.currentUser);
        renderImpersonationDropdown();
        attachUserMenuListeners();
    }

    function attachUserMenuListeners() {
        if (logoutBtn.dataset.listenerAttached === 'true') return;

        if (userMenuHeader && !navMenuToggle) {
            userMenuHeader.addEventListener('click', (e) => {
                e.stopPropagation();
                userMenuPopup.classList.toggle('show');
            });
            window.addEventListener('click', () => {
                if (userMenuPopup.classList.contains('show')) {
                    userMenuPopup.classList.remove('show');
                }
            });
        }
        logoutBtn.addEventListener("click", async () => {
            await supabase.auth.signOut();
            window.location.href = "index.html";
        });
        logoutBtn.dataset.listenerAttached = 'true';
    }
}

export async function loadSVGs() {
    const svgPlaceholders = document.querySelectorAll('[data-svg-loader]');
    
    for (const placeholder of svgPlaceholders) {
        const svgUrl = placeholder.dataset.svgLoader;
        if (svgUrl) {
            try {
                const response = await fetch(svgUrl);
                if (!response.ok) throw new Error(`Failed to load SVG: ${response.statusText}`);
                
                const svgText = await response.text();
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
                const svgElement = svgDoc.documentElement;

                if (svgElement.querySelector('parsererror')) {
                    console.error(`Error parsing SVG from ${svgUrl}`);
                    continue;
                }
                
                if (svgUrl.includes('logo.svg') || svgUrl.includes('logo-small.svg')) {
                    svgElement.classList.add('nav-logo');
                } else if (svgUrl.includes('user-icon.svg')) {
                    svgElement.classList.add('user-icon');
                }

                placeholder.replaceWith(svgElement);

            } catch (error) {
                console.error(`Could not load SVG from ${svgUrl}`, error);
                placeholder.innerHTML = '';
            }
        }
    }
}

// --- GLOBAL SEARCH FUNCTION ---
export async function setupGlobalSearch(supabase) {
    const searchInput = document.getElementById('global-search-input');
    const searchResultsContainer = document.getElementById('global-search-results');
    let searchTimeout;

    if (!searchInput || !searchResultsContainer) {
        // console.warn("Global search elements not found on this page."); // Suppress warn
        return;
    }

    searchInput.addEventListener('keyup', (e) => {
        clearTimeout(searchTimeout);
        const searchTerm = e.target.value.trim();

        if (searchTerm.length < 2) {
            searchResultsContainer.classList.add('hidden');
            return;
        }

        searchTimeout = setTimeout(() => {
            performSearch(searchTerm);
        }, 300);
    });

    async function performSearch(term) {
        searchResultsContainer.innerHTML = '<div class="search-result-item">Searching...</div>';
        searchResultsContainer.classList.remove('hidden');

        try {
            const { data: results, error } = await supabase.functions.invoke('global-search', {
                body: { searchTerm: term }
            });

            if (error) {
                throw error;
            }

            renderResults(results || []);

        } catch (error) {
            console.error("Error invoking global-search function:", error);
            searchResultsContainer.innerHTML = `<div class="search-result-item">Error: ${error.message}</div>`;
        }
    }

    function renderResults(results) {
        if (results.length === 0) {
            searchResultsContainer.innerHTML = '<div class="search-result-item">No results found.</div>';
            return;
        }

        searchResultsContainer.innerHTML = results.map(result => `
            <a href="${result.url}" class="search-result-item">
                <span class="result-type">${result.type}</span>
                <span class="result-name">${result.name}</span>
            </a>
        `).join('');
    }

    // This is the corrected event listener.
    document.addEventListener('click', (e) => {
        const searchContainer = document.querySelector('.global-search-container');
        if (searchContainer && !searchContainer.contains(e.target)) {
            searchResultsContainer.classList.add('hidden');
        }
    });
}


// --- NOTIFICATION FUNCTIONS (FINAL) ---

export function updateLastVisited(supabase, pageName) {
    supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase.from('user_page_visits')
            .upsert({
                user_id: user.id,
                page_name: pageName,
                last_visited_at: new Date().toISOString()
            }, { onConflict: 'user_id, page_name' })
            .then(({ error }) => {
                if (error) console.error(`Error updating visit for ${pageName}:`, error);
            });
    });
}

export async function checkAndSetNotifications(supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const pagesToCheck = [
        { name: 'social_hub', table: 'social_hub_posts_tw' },
        { name: 'cognito', table: 'cognito_alerts' }
    ];

    const { data: visits } = await supabase
        .from('user_page_visits')
        .select('page_name, last_visited_at')
        .eq('user_id', user.id);

    const lastVisits = new Map(visits ? visits.map(v => [v.page_name, new Date(v.last_visited_at).getTime()]) : []);

    for (const page of pagesToCheck) {
        const { data: latestItem } = await supabase
            .from(page.table)
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        const notificationDot = document.getElementById(`${page.name}-notification`);
        if (notificationDot && latestItem) {
            const lastVisitTime = lastVisits.get(page.name) || 0;
            const lastContentTime = new Date(latestItem.created_at).getTime();
            const hasNewContent = lastContentTime > lastVisitTime;
            
            notificationDot.classList.toggle('hidden', !hasNewContent);

        } else if (notificationDot) {
            notificationDot.classList.add('hidden');
        }
    }
}
