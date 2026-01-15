document.addEventListener("DOMContentLoaded", () => {
  // --- SUPABASE SETUP ---
  const SUPABASE_URL = "https://pjxcciepfypzrfmlfchj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqeGNjaWVwZnlwenJmbWxmY2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxMTU4NDQsImV4cCI6MjA2NzY5MTg0NH0.m_jyE0e4QFevI-mGJHYlGmA12lXf8XoMDoiljUav79c";
  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  // --- STATE MANAGEMENT ---
  let state = {
    currentUser: null,
    contacts: [],
    accounts: [],
    sequences: [],
    sequence_steps: [],
    activities: [],
    contact_sequences: [],
    deals: [],
    selectedContactId: null,
    selectedAccountId: null,
    selectedSequenceId: null,
    dealsSortBy: "name",
    dealsSortDir: "asc"
  };

  // --- DOM ELEMENT SELECTORS (now we check if they exist on the page) ---
  const authContainer = document.getElementById("auth-container");
  const crmContainer = document.querySelector(".crm-container");
  const authForm = document.getElementById("auth-form");
  const authTitle = document.getElementById("auth-title");
  const authError = document.getElementById("auth-error");
  const authEmailInput = document.getElementById("auth-email");
  const authPasswordInput = document.getElementById("auth-password");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const authToggleLink = document.getElementById("auth-toggle-link");
  const logoutBtn = document.getElementById("logout-btn");
  const debugBtn = document.getElementById("debug-btn");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeNameSpan = document.getElementById("theme-name");
  
  // --- PAGE SPECIFIC VIEW SELECTORS ---
  const dashboardView = document.getElementById("dashboard");
  const contactsView = document.getElementById("contacts");
  const accountsView = document.getElementById("accounts");
  const sequencesView = document.getElementById("sequences");
  const dealsView = document.getElementById("deals");

  // --- UTILITIES ---
  const formatDate = (ds) => (ds ? new Date(ds).toLocaleString() : "");
  const formatMonthYear = (ds) => {
    if (!ds) return "";
    const date = new Date(ds);
    const adjustedDate = new Date(
      date.getTime() + date.getTimezoneOffset() * 60000
    );
    return adjustedDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long"
    });
  };
  const formatCurrencyK = (value) => {
    if (value === null || isNaN(value)) return "$0.0K";
    const valInK = value / 1000;
    return `$${valInK.toFixed(1)}K`;
  };
  const addDays = (d, days) => {
    const r = new Date(d);
    r.setDate(r.getDate() + days);
    return r;
  };
  const parseCsvRow = (row) => {
    const r = [];
    let c = "";
    let i = false;
    for (let h = 0; h < row.length; h++) {
      const a = row[h];
      if (a === '"') {
        i = !i;
      } else if (a === "," && !i) {
        r.push(c.trim());
        c = "";
      } else {
        c += a;
      }
    }
    r.push(c.trim());
    return r;
  };

  // --- DATA FETCHING ---
  async function loadAllData() {
    if (!state.currentUser) return;

    const userSpecificTables = [
      "contacts", "accounts", "sequences", 
      "activities", "contact_sequences", "deals"
    ];
    const publicTables = ["sequence_steps"];

    const userPromises = userSpecificTables.map((table) =>
      supabase
        .from(table)
        .select("*")
        .eq("user_id", state.currentUser.id)
    );
    const publicPromises = publicTables.map((table) =>
      supabase.from(table).select("*")
    );

    const allPromises = [...userPromises, ...publicPromises];
    const allTableNames = [...userSpecificTables, ...publicTables];

    try {
      const results = await Promise.allSettled(allPromises);
      results.forEach((result, index) => {
        const tableName = allTableNames[index];
        if (result.status === "fulfilled") {
          if (result.value.error) {
            console.error(
              `Supabase error fetching ${tableName}:`,
              result.value.error.message
            );
            state[tableName] = [];
          } else {
            state[tableName] = result.value.data || [];
          }
        } else {
          console.error(`Failed to fetch ${tableName}:`, result.reason);
          state[tableName] = [];
        }
      });
    } catch (error) {
      console.error("Critical error in loadAllData:", error);
    } finally {
      render();
    }
  }

  // --- RENDER FUNCTIONS (MPA VERSION) ---
  const render = () => {
    if (dashboardView) renderDashboard();
    if (contactsView) {
        renderContactList();
        renderContactDetails();
    }
    if (accountsView) {
        renderAccountList();
        renderAccountDetails();
    }
    if (sequencesView) {
        renderSequenceList();
        renderSequenceSteps();
    }
    if (dealsView) {
        renderDealsPage();
        renderDealsMetrics();
    }
  };
  
    const renderDashboard = () => {
        const dashboardTable = document.querySelector("#dashboard-table tbody");
        const recentActivitiesTable = document.querySelector("#recent-activities-table tbody");
        const allTasksTable = document.querySelector("#all-tasks-table tbody");
        if (!dashboardTable || !recentActivitiesTable || !allTasksTable) return;

        dashboardTable.innerHTML = "";
        recentActivitiesTable.innerHTML = "";
        allTasksTable.innerHTML = "";
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        state.contact_sequences
            .filter(cs => new Date(cs.next_step_due_date) <= today && cs.status === "Active")
            .sort((a, b) => new Date(a.next_step_due_date) - new Date(b.next_step_due_date))
            .forEach(cs => {
                const contact = state.contacts.find(c => c.id === cs.contact_id);
                const sequence = state.sequences.find(s => s.id === cs.sequence_id);
                if (!contact || !sequence) return;
                const step = state.sequence_steps.find(s => s.sequence_id === sequence.id && s.step_number === cs.current_step_number);
                if (!step) return;
                const row = dashboardTable.insertRow();
                const desc = step.subject || step.message || "";
                let btnHtml = `<button class="btn-primary complete-step-btn" data-id="${cs.id}">Complete</button>`;
                row.innerHTML = `<td>${formatDate(cs.next_step_due_date)}</td><td>${contact.first_name} ${contact.last_name}</td><td>${sequence.name}</td><td>${step.step_number}: ${step.type}</td><td>${desc}</td><td>${btnHtml}</td>`;
            });

        state.activities
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 20)
            .forEach(act => {
                const contact = state.contacts.find(c => c.id === act.contact_id);
                const account = contact ? state.accounts.find(a => a.id === contact.account_id) : null;
                const row = recentActivitiesTable.insertRow();
                row.innerHTML = `<td>${formatDate(act.date)}</td><td>${account ? account.name : "N/A"}</td><td>${contact ? `${contact.first_name} ${contact.last_name}` : "N/A"}</td><td>${act.type}: ${act.description}</td>`;
            });
    };

    const renderContactList = () => {
        const contactList = document.getElementById("contact-list");
        const contactSearch = document.getElementById("contact-search");
        if (!contactList || !contactSearch) return;

        const searchTerm = contactSearch.value.toLowerCase();
        const filteredContacts = state.contacts
            .filter(c => (c.first_name || "").toLowerCase().includes(searchTerm) || (c.last_name || "").toLowerCase().includes(searchTerm) || (c.email || "").toLowerCase().includes(searchTerm))
            .sort((a, b) => (a.last_name || "").localeCompare(b.last_name || ""));

        contactList.innerHTML = "";
        filteredContacts.forEach(contact => {
            const item = document.createElement("div");
            item.className = "list-item";
            item.innerHTML = `${contact.first_name} ${contact.last_name}`;
            item.dataset.id = contact.id;
            if (contact.id === state.selectedContactId) item.classList.add("selected");
            contactList.appendChild(item);
        });
    };

    const renderContactDetails = () => {
        const contactForm = document.getElementById("contact-form");
        if (!contactForm) return;

        const contact = state.contacts.find(c => c.id === state.selectedContactId);
        const accountDropdown = document.getElementById("contact-account-name");
        const lastSavedEl = document.getElementById("contact-last-saved");
        const contactActivitiesList = document.getElementById("contact-activities-list");

        if (!accountDropdown || !lastSavedEl || !contactActivitiesList) return;

        accountDropdown.innerHTML = '<option value="">-- No Account --</option>';
        state.accounts
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
            .forEach(acc => {
                const o = document.createElement("option");
                o.value = acc.id;
                o.textContent = acc.name;
                accountDropdown.appendChild(o);
            });

        if (contact) {
            contactForm.querySelector("#contact-id").value = contact.id;
            contactForm.querySelector("#contact-first-name").value = contact.first_name || "";
            contactForm.querySelector("#contact-last-name").value = contact.last_name || "";
            contactForm.querySelector("#contact-email").value = contact.email || "";
            contactForm.querySelector("#contact-phone").value = contact.phone || "";
            contactForm.querySelector("#contact-title").value = contact.title || "";
            contactForm.querySelector("#contact-notes").value = contact.notes || "";
            lastSavedEl.textContent = contact.last_saved ? `Last Saved: ${formatDate(contact.last_saved)}` : "";
            accountDropdown.value = contact.account_id || "";

            contactActivitiesList.innerHTML = "";
            state.activities
                .filter(act => act.contact_id === contact.id)
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .forEach(act => {
                    const li = document.createElement("li");
                    li.textContent = `[${formatDate(act.date)}] ${act.type}: ${act.description}`;
                    contactActivitiesList.appendChild(li);
                });
        } else {
            contactForm.reset();
            contactForm.querySelector("#contact-id").value = "";
            lastSavedEl.textContent = "";
            contactActivitiesList.innerHTML = "";
        }
    };
    
    const renderAccountList = () => {
        const accountList = document.getElementById("account-list");
        if (!accountList) return;
        accountList.innerHTML = "";
        state.accounts
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
            .forEach(account => {
                const i = document.createElement("div");
                i.className = "list-item";
                i.textContent = account.name;
                i.dataset.id = account.id;
                if (account.id === state.selectedAccountId) i.classList.add("selected");
                accountList.appendChild(i);
            });
    };
    
    const renderAccountDetails = () => {
        const accountForm = document.getElementById("account-form");
        if (!accountForm) return;

        const account = state.accounts.find(a => a.id === state.selectedAccountId);
        const accountContactsList = document.getElementById("account-contacts-list");
        const accountDealsTableBody = document.querySelector("#account-deals-table tbody");

        if (!accountContactsList || !accountDealsTableBody) return;

        accountContactsList.innerHTML = "";
        accountDealsTableBody.innerHTML = "";

        if (account) {
            accountForm.querySelector("#account-id").value = account.id;
            accountForm.querySelector("#account-name").value = account.name || "";
            accountForm.querySelector("#account-website").value = account.website || "";
            accountForm.querySelector("#account-industry").value = account.industry || "";
            accountForm.querySelector("#account-phone").value = account.phone || "";
            accountForm.querySelector("#account-address").value = account.address || "";
            accountForm.querySelector("#account-notes").value = account.notes || "";
            document.getElementById("account-last-saved").textContent = account.last_saved ? `Last Saved: ${formatDate(account.last_saved)}` : "";

            state.deals.filter(d => d.account_id === account.id).forEach(deal => {
                const row = accountDealsTableBody.insertRow();
                row.innerHTML = `<td><input type="checkbox" data-deal-id="${deal.id}" ${deal.is_committed ? "checked" : ""}></td><td>${deal.name}</td><td>${deal.stage}</td><td>$${deal.mrc}</td>`;
            });
            
            state.contacts.filter(c => c.account_id === account.id).forEach(c => {
                const li = document.createElement("li");
                li.innerHTML = `<a href="contacts.html#contact=${c.id}">${c.first_name} ${c.last_name}</a>`;
                accountContactsList.appendChild(li);
            });
        } else {
            accountForm.reset();
        }
    };

    const renderSequenceList = () => {
        const sequenceList = document.getElementById("sequence-list");
        if (!sequenceList) return;
        sequenceList.innerHTML = "";
        state.sequences
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
            .forEach(seq => {
                const i = document.createElement("div");
                i.className = "list-item";
                i.textContent = seq.name;
                i.dataset.id = seq.id;
                if (seq.id === state.selectedSequenceId) i.classList.add("selected");
                sequenceList.appendChild(i);
            });
    };

    const renderSequenceSteps = () => {
        const sequenceStepsTable = document.querySelector("#sequence-steps-table tbody");
        if (!sequenceStepsTable) return;
        sequenceStepsTable.innerHTML = "";
        if (state.selectedSequenceId) {
            const steps = state.sequence_steps.filter(s => s.sequence_id === state.selectedSequenceId);
            steps
                .sort((a, b) => a.step_number - b.step_number)
                .forEach(step => {
                    const row = sequenceStepsTable.insertRow();
                    row.innerHTML = `<td>${step.step_number}</td><td>${step.type}</td><td>${step.subject || ""}</td><td>${step.message || ""}</td><td>${step.delay_days}</td>`;
                });
        }
    };
    
    const renderDealsPage = () => {
        const dealsTableBody = document.querySelector("#deals-table tbody");
        if (!dealsTableBody) return;
        dealsTableBody.innerHTML = "";
        const dealsWithAccount = state.deals.map(deal => {
            const account = state.accounts.find(a => a.id === deal.account_id);
            return { ...deal, account_name: account ? account.name : "N/A" };
        });
        // Add sorting logic here if needed...
        dealsWithAccount.forEach(deal => {
            const row = dealsTableBody.insertRow();
            row.innerHTML = `<td><input type="checkbox" data-deal-id="${deal.id}" ${deal.is_committed ? "checked" : ""}></td><td>${deal.name}</td><td>${deal.account_name}</td><td>${deal.stage}</td><td>$${deal.mrc}</td>`;
        });
    };

    const renderDealsMetrics = () => {
        const metricCurrentCommit = document.getElementById("metric-current-commit");
        if (!metricCurrentCommit) return;
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        let currentCommit = 0, bestCase = 0, totalFunnel = 0;
        state.deals.forEach(deal => {
            const dealCloseDate = deal.close_month ? new Date(deal.close_month) : null;
            const isCurrentMonth = dealCloseDate && dealCloseDate.getMonth() === currentMonth && dealCloseDate.getFullYear() === currentYear;
            totalFunnel += deal.mrc || 0;
            if (isCurrentMonth) {
                bestCase += deal.mrc || 0;
                if (deal.is_committed) {
                    currentCommit += deal.mrc || 0;
                }
            }
        });
        const commitPercentage = MONTHLY_QUOTA > 0 ? ((currentCommit / MONTHLY_QUOTA) * 100).toFixed(1) : 0;
        metricCurrentCommit.textContent = formatCurrencyK(currentCommit);
        document.getElementById("commit-quota-percent").textContent = `${commitPercentage}%`;
        document.getElementById("metric-best-case").textContent = formatCurrencyK(bestCase);
        document.getElementById("metric-funnel").textContent = formatCurrencyK(totalFunnel);
    };


  // --- THEME TOGGLE LOGIC ---
  const themes = ['dark', 'light', 'green'];
  let currentThemeIndex = 0;

  function applyTheme(themeName) {
    if (!themeNameSpan) return;
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-green');
    document.body.classList.add(`theme-${themeName}`);
    const capitalizedThemeName = themeName.charAt(0).toUpperCase() + themeName.slice(1);
    themeNameSpan.textContent = capitalizedThemeName;
    localStorage.setItem('crm-theme', themeName);
  }

  function cycleTheme() {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    const newTheme = themes[currentThemeIndex];
    applyTheme(newTheme);
  }

  // --- PAGE INITIALIZATION ---
  function initializeApp() {
    const savedTheme = localStorage.getItem('crm-theme') || 'dark';
    const savedThemeIndex = themes.indexOf(savedTheme);
    currentThemeIndex = savedThemeIndex !== -1 ? savedThemeIndex : 0;
    applyTheme(themes[currentThemeIndex]);

    supabase.auth.onAuthStateChange(async (event, session) => {
      const isAuthPage = !!document.querySelector('#auth-container');

      if (session) {
        state.currentUser = session.user;
        if (isAuthPage) {
          window.location.replace('dashboard.html');
        } else {
          if (crmContainer) crmContainer.classList.remove('hidden');
          await loadAllData();
          setupCrmEventListeners();
        }
      } else {
        state.currentUser = null;
        if (!isAuthPage) {
          window.location.replace('auth.html');
        } else {
            if(authContainer) authContainer.classList.remove('hidden');
            setupAuthEventListeners();
        }
      }
    });
  }

  function setupAuthEventListeners() {
    if (!authForm) return;
    let isLoginMode = true;
    authToggleLink.addEventListener("click", (e) => {
      e.preventDefault();
      isLoginMode = !isLoginMode;
      authTitle.textContent = isLoginMode ? "Login" : "Sign Up";
      authSubmitBtn.textContent = isLoginMode ? "Login" : "Sign Up";
      authToggleLink.textContent = isLoginMode ? "Need an account? Sign Up" : "Have an account? Login";
      authError.textContent = "";
    });
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = authEmailInput.value;
      const password = authPasswordInput.value;
      authError.textContent = "";
      const { error } = isLoginMode ?
        await supabase.auth.signInWithPassword({ email, password }) :
        await supabase.auth.signUp({ email, password });
      if (error) {
        authError.textContent = error.message;
      } else if (!isLoginMode) {
        authError.textContent = "Check your email for a confirmation link!";
      }
    });
  }

  function setupCrmEventListeners() {
    if (!crmContainer) return;
    
    if(logoutBtn) logoutBtn.addEventListener("click", () => supabase.auth.signOut());
    if(debugBtn) debugBtn.addEventListener("click", () => {
        console.log(JSON.stringify(state, null, 2));
        alert("Current app state logged to console (F12).");
    });
    if(themeToggleBtn) themeToggleBtn.addEventListener("click", cycleTheme);

    const contactList = document.getElementById("contact-list");
    if(contactList) {
        contactList.addEventListener('click', e => {
            const item = e.target.closest('.list-item');
            if (item) {
                state.selectedContactId = Number(item.dataset.id);
                renderContactList();
                renderContactDetails();
            }
        });
    }

    const accountList = document.getElementById("account-list");
    if(accountList) {
        accountList.addEventListener('click', e => {
            const item = e.target.closest('.list-item');
            if(item) {
                state.selectedAccountId = Number(item.dataset.id);
                renderAccountList();
                renderAccountDetails();
            }
        });
    }
    
    const sequenceList = document.getElementById("sequence-list");
    if(sequenceList) {
        sequenceList.addEventListener('click', e => {
            const item = e.target.closest('.list-item');
            if(item) {
                state.selectedSequenceId = Number(item.dataset.id);
                renderSequenceList();
                renderSequenceSteps();
            }
        });
    }
    
    // ... all other event listeners from your original app go here
  }
  
  // Start the application
  initializeApp();
});
