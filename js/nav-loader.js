/**
 * Loads CRM or ERP nav partial into #nav-container and sets active states.
 * Requires <body data-nav="crm"> or data-nav="erp"> and <nav id="nav-container">.
 * Dispatches 'navReady' when done so page scripts can run setupGlobalSearch etc.
 */
(function () {
    const container = document.getElementById('nav-container');
    const navMode = document.body.getAttribute('data-nav') || document.documentElement.getAttribute('data-nav') || 'crm';
    if (!container) return;

    const partial = navMode === 'erp' ? 'partials/nav-erp.html' : 'partials/nav-crm.html';

    fetch(partial)
        .then(function (r) { return r.text(); })
        .then(function (html) {
            container.innerHTML = html;
            setActiveState(container, navMode);
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
