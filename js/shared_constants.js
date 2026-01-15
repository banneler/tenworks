// js/shared_constants.js

// --- SHARED CONSTANTS AND FUNCTIONS ---

export const SUPABASE_URL = "https://ccrnueyxmnzqlaphqdjn.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjcm51ZXl4bW56cWxhcGhxZGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODgyOTIsImV4cCI6MjA4NDA2NDI5Mn0.fy6q89n3bzmwxjgOY9cMJoWqyynvA5M_COJqNdAQqME";

export const themes = ["dark", "light", "green", "blue", "corporate"];

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

    // --- THIS IS THE FIX ---
    // Check for manager status using the metadata, as hinted by deals.js
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
    // --- END FIX ---
    
    return appState;
}
// --- END NEW SECTION ---
/**
 * Renders the impersonation dropdown in the user menu if the user is a manager.
 */
function renderImpersonationDropdown() {
    if (!appState.isManager || appState.managedUsers.length === 0) {
        // Not a manager or has no one to manage, so do nothing.
        return;
    }

    const userMenuPopup = document.getElementById('user-menu-popup');
    if (!userMenuPopup) return;

    // 1. Create the container
    const container = document.createElement('div');
    container.className = 'impersonation-container';

    // 2. Create the "My View" option
    // We add the current user's info to the list for the "My View" option
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

    // 6. Add the event listener
    const impersonationSelect = document.getElementById('impersonation-select');
    if (impersonationSelect) {
        impersonationSelect.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        impersonationSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            const userId = selectedOption.value;
            const fullName = selectedOption.dataset.fullName;
            
            // Call your new state function. This will trigger the 'effectiveUserChanged' event.
            setEffectiveUser(userId, fullName); 
            
            // Update the main user name display to show who we are viewing as
            const userNameDisplay = document.getElementById('user-name-display');
            if (userNameDisplay) {
                if (userId === appState.currentUser.id) {
                    userNameDisplay.textContent = fullName; // Back to self
                } else {
                    userNameDisplay.textContent = `${fullName} (Viewing As)`;
                }
            }
        });
    }
}

// --- THEME MANAGEMENT ---
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
    if (!themeToggleBtn) return;

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

    if (themeToggleBtn.dataset.listenerAttached !== 'true') {
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

// --- MODAL FUNCTIONS ---
const modalBackdrop = document.getElementById("modal-backdrop");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalActions = document.getElementById("modal-actions");
let currentModalCallbacks = { onConfirm: null, onCancel: null };

export function getCurrentModalCallbacks() { return { ...currentModalCallbacks }; }
export function setCurrentModalCallbacks(callbacks) { currentModalCallbacks = { ...callbacks }; }

export function showModal(title, bodyHtml, onConfirm = null, showCancel = true, customActionsHtml = null, onCancel = null) {
    if (!modalBackdrop || !modalTitle || !modalBody || !modalActions) {
        console.error("Modal elements are missing from the DOM.");
        return;
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
    return modalBody; // Return the modal body for use in contacts.js
}

export function hideModal() {
    if (modalBackdrop) modalBackdrop.classList.add("hidden");
}

function handleBackdropClick(e) { if (e.target === modalBackdrop) hideModal(); }
function handleEscapeKey(e) { if (e.key === "Escape") hideModal(); }

export function setupModalListeners() {
    window.addEventListener("keydown", handleEscapeKey);
}

// --- TOAST NOTIFICATIONS ---
export function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 4000); 
}


// --- USER MENU & AUTH LOGIC (CORRECTED) ---
export async function setupUserMenuAndAuth(supabase, state) {
    const userMenuHeader = document.querySelector('.user-menu-header');
    if (!userMenuHeader) return;

    const userNameDisplay = document.getElementById('user-name-display');
    const userMenuPopup = document.getElementById('user-menu-popup');
    const logoutBtn = document.getElementById("logout-btn");

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
       if (userMenuHeader.dataset.listenerAttached === 'true') return;

        userMenuHeader.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenuPopup.classList.toggle('show');
        });

        window.addEventListener('click', () => {
            if (userMenuPopup.classList.contains('show')) {
                userMenuPopup.classList.remove('show');
            }
        });

        logoutBtn.addEventListener("click", async () => {
            await supabase.auth.signOut();
            window.location.href = "index.html";
        });
        
        userMenuHeader.dataset.listenerAttached = 'true';
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
                
                if (svgUrl.includes('logo.svg')) {
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
        console.warn("Global search elements not found on this page.");
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

/**
 * Updates the visit timestamp for a page in the background.
 * This is a "fire and forget" operation.
 * @param {SupabaseClient} supabase The Supabase client instance.
 * @param {string} pageName The name of the page being visited.
 */
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


/**
 * Checks for new content on all pages and updates the bells.
 * This is now an async function that can be awaited for predictable execution.
 * @param {SupabaseClient} supabase The Supabase client instance.
 */
export async function checkAndSetNotifications(supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const pagesToCheck = [
        { name: 'social_hub', table: 'social_hub_posts' },
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




