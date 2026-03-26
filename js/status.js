/**
 * Client-facing project status page (punch #7).
 * Single project: ?token=<project.status_token>
 * Customer portal (multiple projects): ?portal=<contact.status_token>
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY, hideGlobalLoader } from './shared_constants.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Boilerplate TenWorks PM when no project-specific PM contact is set */
const DEFAULT_PM = {
    name: 'TenWorks Project Management',
    email: 'projects@tenworks.com',
    phone: '(555) 123-4567'
};

/** Optional: TenWorks website URL for footer link (leave empty for plain text) */
const TENWORKS_URL = '';

function getStatusClass(status) {
    if (!status) return 'status-pre';
    const s = (status || '').toLowerCase();
    if (s.includes('progress')) return 'status-in-progress';
    if (s.includes('complete')) return 'status-completed';
    if (s.includes('hold')) return 'status-hold';
    return 'status-pre';
}

function formatDate(d) {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Build the Questions card HTML (contact only; as-of and brand are rendered outside card). Used once in portal so it persists. */
function buildQuestionsCardHtml(rowOrNull) {
    const pmName = rowOrNull?.contact_name || DEFAULT_PM.name;
    const pmEmail = rowOrNull?.contact_email || DEFAULT_PM.email;
    const pmPhone = rowOrNull?.contact_phone || DEFAULT_PM.phone;
    return `
      <div class="questions-card-content">
        <div class="contact">
          <div class="contact-heading">Questions?</div>
          <div class="contact-sub">Contact your TenWorks project manager</div>
          <div class="contact-name">${escapeHtml(pmName)}</div>
          ${pmEmail ? `<div class="contact-item"><a href="mailto:${escapeAttr(pmEmail)}">${escapeHtml(pmEmail)}</a></div>` : ''}
          ${pmPhone ? `<div class="contact-item">${escapeHtml(pmPhone)}</div>` : ''}
        </div>
      </div>
    `;
}

/** Build the full status card HTML for a single project row (shared by single + portal). opts.skipFooter = true for portal (no Questions in card). */
function buildCardHtml(row, opts = {}) {
    const { skipFooter = false } = opts;
    const statusClass = getStatusClass(row.project_status);

    const summaryText = row.client_summary && row.client_summary.trim();
    const summaryHtml = summaryText
        ? `<div class="summary-block"><div class="label">Project summary</div><div>${escapeHtml(summaryText)}</div></div>`
        : '';

    let milestoneHtml = '';
    if (row.next_milestone_name || row.next_milestone_date) {
        const title = row.next_milestone_name ? `Next: ${escapeHtml(row.next_milestone_name)}` : 'Next milestone';
        const dateStr = formatDate(row.next_milestone_date);
        milestoneHtml = `<div class="milestone"><div class="label">${title}</div><div class="value">${dateStr}</div></div>`;
    }

    const hasPaymentUrl = row.payment_url && row.payment_url.trim();
    const payHtml = `
      <div class="payment-section">
        <div class="label">Payment</div>
        ${hasPaymentUrl
            ? `<a href="${escapeAttr(row.payment_url.trim())}" target="_blank" rel="noopener noreferrer" class="btn-pay"><i class="fas fa-credit-card"></i> Pay outstanding balance</a>`
            : '<p class="payment-none">No payment link set for this project.</p>'}
      </div>`;

    const leftColumn = `
        <div class="row">
            <div class="label">Status</div>
            <div class="value"><span class="status-pill ${statusClass}">${escapeHtml(row.project_status || 'Pre-Production')}</span></div>
        </div>
        <div class="row">
            <div class="label">Started</div>
            <div class="value">${formatDate(row.start_date)}</div>
        </div>
        <div class="row">
            <div class="label">Target completion</div>
            <div class="value">${formatDate(row.target_date)}</div>
        </div>
        ${milestoneHtml}
        ${payHtml}
    `;

    const footerBlock = skipFooter ? '' : `
            <div class="card-footer">
                ${buildQuestionsCardHtml(row).trim()}
            </div>`;
    return `
        <div class="result-wrap">
            <div class="card-header">
                <h1>${escapeHtml(row.project_name)}</h1>
                <p class="subtitle">Project status</p>
            </div>
            <div class="card-grid">
                <div class="card-left">${leftColumn}</div>
                <div class="card-right">${summaryHtml || '<div class="summary-block summary-empty"><div class="label">Project summary</div><p style="margin:0; color:var(--dim); font-size:0.85rem;">No summary yet.</p></div>'}</div>
            </div>
            ${footerBlock}
        </div>
    `;
}

async function initSingle(token) {
    const loadingEl = document.getElementById('loading');
    const resultEl = document.getElementById('result');
    const errorEl = document.getElementById('error');

    const { data, error } = await supabase.rpc('get_project_status', { p_token: token });
    loadingEl.style.display = 'none';

    if (error) {
        errorEl.style.display = 'block';
        errorEl.textContent = 'Unable to load project status. The link may be invalid or expired.';
        return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.project_name) {
        errorEl.style.display = 'block';
        errorEl.textContent = 'Project not found. Please check the link or contact your project manager.';
        return;
    }

    resultEl.style.display = 'block';
    resultEl.innerHTML = buildCardHtml(row);
}

async function initPortal(portalToken) {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('content');
    const errorEl = document.getElementById('error');

    const { data: projects, error: listError } = await supabase.rpc('get_portal_projects', { p_portal_token: portalToken });
    loadingEl.style.display = 'none';

    if (listError || !projects || projects.length === 0) {
        errorEl.style.display = 'block';
        errorEl.textContent = 'Unable to load projects. The link may be invalid or you have no projects assigned.';
        return;
    }

    document.body.classList.add('portal-mode');
    const projectIdParam = new URLSearchParams(window.location.search).get('project');
    const selectedId = projectIdParam ? parseInt(projectIdParam, 10) : (projects[0]?.project_id ?? null);

    const sidebarHtml = `
        <div class="portal-sidebar">
            <div class="nav-label">Projects</div>
            ${projects.map(p => `
                <button type="button" class="nav-item ${p.project_id === selectedId ? 'active' : ''}" data-project-id="${p.project_id}">
                    ${escapeHtml(p.project_name || 'Unnamed')}
                </button>
            `).join('')}
        </div>
        <div class="portal-main" id="portal-main">
            <div class="portal-project-card" id="portal-project-card">
                <div class="loading">Loading…</div>
            </div>
        </div>
    `;

    contentEl.innerHTML = '';
    const layout = document.createElement('div');
    layout.className = 'portal-layout';
    layout.innerHTML = sidebarHtml;
    contentEl.appendChild(layout);

    const footerWrap = document.createElement('div');
    footerWrap.className = 'portal-footer';

    const logoCardEl = document.createElement('div');
    logoCardEl.className = 'portal-logo-card';
    logoCardEl.innerHTML = '<img src="assets/logo.svg" alt="TenWorks" />';

    const questionsCardEl = document.createElement('div');
    questionsCardEl.id = 'portal-questions-card';
    questionsCardEl.className = 'portal-questions-card';

    footerWrap.appendChild(logoCardEl);
    footerWrap.appendChild(questionsCardEl);
    contentEl.appendChild(footerWrap);

    const asOfEl = document.createElement('p');
    asOfEl.className = 'portal-as-of';
    asOfEl.setAttribute('aria-hidden', 'true');
    contentEl.appendChild(asOfEl);

    const brandEl = document.createElement('p');
    brandEl.className = 'portal-brand';
    brandEl.innerHTML = '<a href="https://tenworksfab.com" target="_blank" rel="noopener noreferrer">TenWorks</a>';
    contentEl.appendChild(brandEl);

    const projectCardEl = document.getElementById('portal-project-card');
    const navItems = layout.querySelectorAll('.nav-item');

    async function loadProject(projectId) {
        projectCardEl.innerHTML = '<div class="loading">Loading…</div>';
        const { data, error } = await supabase.rpc('get_project_status_by_portal', {
            p_portal_token: portalToken,
            p_project_id: projectId
        });
        if (error || !data || !data[0]) {
            projectCardEl.innerHTML = '<p class="error">Unable to load this project.</p>';
            return;
        }
        const row = data[0];
        projectCardEl.innerHTML = buildCardHtml(row, { skipFooter: true });
        if (!questionsCardEl.innerHTML.trim()) {
            questionsCardEl.innerHTML = buildQuestionsCardHtml(row);
            const asOfDate = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            asOfEl.textContent = `Information as of ${asOfDate}`;
        }
        const url = new URL(window.location.href);
        url.searchParams.set('project', String(projectId));
        history.replaceState({}, '', url);
        navItems.forEach(btn => {
            const id = parseInt(btn.dataset.projectId, 10);
            btn.classList.toggle('active', id === projectId);
        });
    }

    navItems.forEach(btn => {
        btn.addEventListener('click', () => loadProject(parseInt(btn.dataset.projectId, 10)));
    });

    await loadProject(selectedId);
}

async function init() {
    try {
    const params = new URLSearchParams(window.location.search);
    const portal = params.get('portal');
    const token = params.get('token');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    if (portal) {
        await initPortal(portal);
        return;
    }
    if (token) {
        await initSingle(token);
        return;
    }

    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = 'Invalid or missing link. Please use the link shared by your project manager.';
    } finally {
        hideGlobalLoader();
    }
}

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
function escapeAttr(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

init();
