/**
 * Loads CRM or ERP nav partial into #nav-container and sets active states.
 * Requires <body data-nav="crm"> or data-nav="erp"> and <nav id="nav-container">.
 * Dispatches 'navReady' when done so page scripts can run setupGlobalSearch etc.
 * Includes Constellation-style: sidebar collapse (minimize) and user menu toggle.
 */
(function () {
    const NAV_COLLAPSED_KEY = 'crm-nav-collapsed';

    const container = document.getElementById('nav-container');
    const navMode = document.body.getAttribute('data-nav') || document.documentElement.getAttribute('data-nav') || 'crm';
    if (!container) return;

    const partial = navMode === 'erp' ? 'partials/nav-erp.html' : 'partials/nav-crm.html';

    fetch(partial)
        .then(function (r) { return r.text(); })
        .then(function (html) {
            container.innerHTML = html;
            setActiveState(container, navMode);
            applyInitialCollapsedState(container);
            wireCollapseToggle(container);
            wireUserMenuToggle(container);
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('navReady'));
            }
        })
        .catch(function () {
            container.innerHTML = '<p class="nav-fallback" style="padding:1rem;color:var(--text-medium);font-size:0.85rem;">Navigation could not be loaded.</p>';
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('navReady'));
            }
        });

    function isCollapsed() {
        try { return localStorage.getItem(NAV_COLLAPSED_KEY) === '1'; } catch (_) { return false; }
    }

    function applyInitialCollapsedState(container) {
        if (isCollapsed()) {
            container.classList.add('nav-sidebar-collapsed');
        }
    }

    function setCollapsed(collapsed) {
        if (collapsed) {
            container.classList.add('nav-sidebar-collapsed');
            try { localStorage.setItem(NAV_COLLAPSED_KEY, '1'); } catch (_) {}
        } else {
            container.classList.remove('nav-sidebar-collapsed');
            try { localStorage.removeItem(NAV_COLLAPSED_KEY); } catch (_) {}
        }
        var toggleBtn = document.getElementById('nav-collapse-toggle');
        if (toggleBtn) {
            var icon = toggleBtn.querySelector('.nav-collapse-icon');
            if (icon) {
                icon.className = 'fa-solid ' + (collapsed ? 'fa-chevron-right' : 'fa-chevron-left') + ' nav-collapse-icon';
            }
            toggleBtn.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
            toggleBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
        }
    }

    function wireCollapseToggle(container) {
        var toggleBtn = document.getElementById('nav-collapse-toggle');
        if (!toggleBtn) return;
        toggleBtn.addEventListener('click', function () {
            var collapsed = !container.classList.contains('nav-sidebar-collapsed');
            setCollapsed(collapsed);
        });
    }

    function wireUserMenuToggle(container) {
        var menuToggle = document.getElementById('nav-menu-toggle');
        var userMenuContent = document.getElementById('user-menu-popup');
        var userMenu = (container && container.querySelector('.user-menu')) || document.querySelector('.user-menu');
        var navSidebar = container || document.querySelector('.nav-sidebar');
        if (!menuToggle || !userMenuContent) return;

        function closeUserMenu() {
            if (userMenuContent && !userMenuContent.classList.contains('user-menu-collapsed')) {
                userMenuContent.classList.add('user-menu-collapsed');
                menuToggle.setAttribute('aria-expanded', 'false');
                var chevron = menuToggle.querySelector('.nav-menu-chevron');
                if (chevron) chevron.className = 'fa-solid fa-chevron-down nav-menu-chevron';
                if (navSidebar) navSidebar.classList.remove('user-menu-open');
            }
        }

        menuToggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            userMenuContent.classList.toggle('user-menu-collapsed');
            var isOpen = !userMenuContent.classList.contains('user-menu-collapsed');
            menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            var chevron = menuToggle.querySelector('.nav-menu-chevron');
            if (chevron) {
                chevron.className = 'fa-solid fa-chevron-' + (isOpen ? 'up' : 'down') + ' nav-menu-chevron';
            }
            if (navSidebar) navSidebar.classList.toggle('user-menu-open', isOpen);
        });

        document.addEventListener('click', function (e) {
            if (!userMenuContent.classList.contains('user-menu-collapsed') && userMenu && !userMenu.contains(e.target)) {
                closeUserMenu();
            }
        });
    }

    function setActiveState(container, navMode) {
        var page = currentPage();
        container.querySelectorAll('.nav-button[data-nav-page]').forEach(function (a) {
            if ((a.getAttribute('data-nav-page') || '').replace('.html', '') === page) {
                a.classList.add('active');
            } else {
                a.classList.remove('active');
            }
        });
        container.querySelectorAll('.nav-pill').forEach(function (a) {
            var pill = a.getAttribute('data-pill');
            if (pill === navMode) {
                a.classList.add('active');
            } else {
                a.classList.remove('active');
            }
        });
    }

    function currentPage() {
        var path = window.location.pathname || '';
        var name = path.split('/').pop() || window.location.href.split('/').pop() || '';
        return name.replace('.html', '').replace(/\?.*$/, '') || 'command-center';
    }
})();
