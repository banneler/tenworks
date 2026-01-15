// banneler/constellation-v/Constellation-V-8d825689cc599d5206d1e49b4f0dafe9c5ecc390/js/social_hub.js
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    formatDate,
    showModal,
    hideModal,
    updateActiveNavLink,
    setupUserMenuAndAuth,
    loadSVGs,
    setupGlobalSearch,
    updateLastVisited,
    checkAndSetNotifications
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let state = {
        currentUser: null,
        allPosts: [],
        products: [],
        userInteractions: new Set()
    };
    
    // --- DOM SELECTORS ---
    const aiContainer = document.getElementById('ai-articles-container');
    const marketingContainer = document.getElementById('marketing-posts-container');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalTitle = document.getElementById('modal-title');
    const modalArticleLink = document.getElementById('modal-article-link');
    const postTextArea = document.getElementById('post-text');
    const copyTextBtn = document.getElementById('copy-text-btn');
    const postToLinkedInBtn = document.getElementById('post-to-linkedin-btn');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const customPromptInput = document.getElementById('custom-prompt-input');
    const generateCustomBtn = document.getElementById('generate-custom-btn');
    const aiProductPostBtn = document.getElementById('ai-product-post-btn');

    // --- DATA FETCHING ---
    async function loadSocialContent() {
        if (!state.currentUser) return;
        try {
            const { data: posts, error: postsError } = await supabase.from('social_hub_posts').select('*').order('created_at', { ascending: false });
            if (postsError) throw postsError;
            state.allPosts = posts || [];

            const { data: interactions, error: interactionsError } = await supabase.from('user_post_interactions').select('post_id').eq('user_id', state.currentUser.id);
            if (interactionsError) throw interactionsError;
            state.userInteractions = new Set(interactions.map(i => i.post_id));

            const { data: productData, error: productError } = await supabase.from('product_knowledge').select('product_name');
            if (productError) throw productError;
            state.products = [...new Set(productData.map(p => p.product_name))].sort();

            renderSocialContent();
        } catch (error) {
            console.error("Error fetching Social Hub content:", error);
        }
    }

    // --- RENDER FUNCTIONS ---
    function renderSocialContent() {
        aiContainer.innerHTML = '';
        marketingContainer.innerHTML = '';
        const visiblePosts = state.allPosts.filter(post => !state.userInteractions.has(post.id));
        const aiArticles = visiblePosts.filter(p => p.type === 'ai_article');
        const marketingPosts = visiblePosts.filter(p => p.type === 'marketing_post');
        
        if (aiArticles.length === 0) { 
            aiContainer.innerHTML = `<p class="placeholder-text">Cognito is searching for relevant articles. Check back soon!</p>`; 
        } else { 
            aiArticles.forEach(item => aiContainer.appendChild(createSocialCard(item))); 
        }

        if (marketingPosts.length === 0) { 
            marketingContainer.innerHTML = `<p class="placeholder-text">The marketing team is busy creating content. Stay tuned for new posts!</p>`; 
        } else { 
            marketingPosts.forEach(item => marketingContainer.appendChild(createSocialCard(item))); 
        }
    }

    function createSocialCard(item) {
        const headline = item.title;
        const link = item.link;
        // Logic: Use pre-generated copy for summary if available
        const summary = item.summary || item.approved_copy || "No summary available.";
        const sourceName = item.source_name || 'Industry News';
        const triggerType = item.type === 'marketing_post' ? 'Campaign Asset' : 'News Article';
        const dynamicLinkIndicator = item.is_dynamic_link ? `<span class="dynamic-link-indicator" title="This link will generate a rich preview on LinkedIn">✨</span>` : '';

        const card = document.createElement('div');
        card.className = 'alert-card';
        card.id = `post-card-${item.id}`;

        card.innerHTML = `
            <div class="alert-header"><span class="alert-trigger-type">${triggerType}</span></div>
            <h5 class="alert-headline">${headline} ${dynamicLinkIndicator}</h5>
            <p class="alert-summary"></p> 
            <div class="alert-footer">
                <span class="alert-source">Source: <a href="${link}" target="_blank">${sourceName}</a></span>
                <span class="alert-date">${formatDate(item.created_at)}</span>
            </div>
            <div class="alert-actions">
                <button class="btn-secondary dismiss-post-btn" data-post-id="${item.id}">Dismiss</button>
                <button class="btn-primary prepare-post-btn" data-post-id="${item.id}">Prepare Post</button>
            </div>
        `;

        const summaryP = card.querySelector('.alert-summary');
        summaryP.innerHTML = summary.replace(/\n/g, '<br>');

        card.querySelector('.prepare-post-btn').addEventListener('click', () => openPostModal(item));
        card.querySelector('.dismiss-post-btn').addEventListener('click', () => handleDismissPost(item.id));
        return card;
    }

    // --- MODAL & ACTION LOGIC ---
    async function openPostModal(item) {
        modalTitle.textContent = item.title;
        modalArticleLink.href = item.link;
        modalArticleLink.textContent = item.link;
        postToLinkedInBtn.dataset.url = item.link;
        modalBackdrop.classList.remove('hidden');

        // RE-GENERATED CHECK: If we have approved_copy from our Python script, use it instantly.
        if (item.approved_copy && item.approved_copy.trim() !== "") {
            postTextArea.value = item.approved_copy;
            return;
        }

        postTextArea.value = "Generating AI suggestion...";

        if (item.type === 'marketing_post') {
            postTextArea.value = item.approved_copy || "No marketing copy provided.";
        } else {
            const { data, error } = await supabase.functions.invoke('generate-social-post', { body: { article: item } });
            if (error) {
                postTextArea.value = "Error generating suggestion. Please write your own or try again.";
                console.error("Edge function error:", error);
            } else {
                postTextArea.value = data.suggestion;
            }
        }
    }

    function hideModal() { 
        modalBackdrop.classList.add('hidden'); 
        customPromptInput.value = ''; // Reset input on close
    }

    async function handleDismissPost(postId) {
        try {
            await supabase.from('user_post_interactions').insert({ user_id: state.currentUser.id, post_id: postId, status: 'dismissed' });
            const cardToRemove = document.getElementById(`post-card-${postId}`);
            if (cardToRemove) {
                cardToRemove.style.transition = 'opacity 0.5s';
                cardToRemove.style.opacity = '0';
                setTimeout(() => cardToRemove.remove(), 500);
            }
            state.userInteractions.add(postId);
        } catch (error) {
            console.error("Error dismissing post:", error);
        }
    }

    // --- EVENT LISTENER SETUP ---
    function setupPageEventListeners() {
        modalCloseBtn.addEventListener('click', hideModal);
    
        copyTextBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(postTextArea.value).then(() => {
                copyTextBtn.textContent = 'Copied!';
                setTimeout(() => { copyTextBtn.textContent = 'Copy Text'; }, 2000);
            });
        });

        postToLinkedInBtn.addEventListener('click', function() {
            const url = this.dataset.url;
            if (!url) return;
            window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
        });

        if (aiProductPostBtn) {
            aiProductPostBtn.addEventListener('click', showAIProductPostModal);
        }

        generateCustomBtn.addEventListener('click', async () => {
            const originalText = postTextArea.value;
            const customPrompt = customPromptInput.value.trim();
            if (!customPrompt) {
                alert("Please enter a prompt to refine the text.");
                return;
            }

            generateCustomBtn.textContent = 'Regenerating...';
            generateCustomBtn.disabled = true;

            const { data, error } = await supabase.functions.invoke('refine-social-post', { body: { originalText, customPrompt } });
            
            if (error) {
                alert("Error refining post.");
                console.error(error);
            } else {
                postTextArea.value = data.suggestion;
                customPromptInput.value = ''; 
            }

            generateCustomBtn.textContent = 'Regenerate';
            generateCustomBtn.disabled = false;
        });
    }

    // --- CUSTOM PRODUCT POST MODAL LOGIC ---
    async function showAIProductPostModal() {
        const productCheckboxes = state.products.map(product => `
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
                <input type="checkbox" id="social-prod-${product.replace(/\s+/g, '-')}" class="ai-product-checkbox" value="${product}" style="margin-right: 8px;">
                <label for="social-prod-${product.replace(/\s+/g, '-')}">${product}</label>
            </div>
        `).join('');

        const industries = ['General', 'Healthcare', 'Financial', 'Retail', 'Manufacturing', 'K-12 Education'];
        const industryOptions = industries.map(ind => `<option value="${ind}">${ind}</option>`).join('');

        const modalBodyContent = `
            <div id="ai-custom-post-prompt-container">
                <label style="font-weight: 600;">Post Goal/Topic:</label>
                <textarea id="ai-post-prompt" rows="3" placeholder="e.g., 'Announce a new feature for Managed Wi-Fi'"></textarea>
                <div style="margin-top: 1.5rem;">
                    <p style="font-weight: 600; margin-bottom: 12px;">Include Product Info</p>
                    ${productCheckboxes}
                    <div style="margin-top: 20px;">
                        <label for="ai-industry-select" style="font-weight: 600;">Target Industry</label>
                        <select id="ai-industry-select">${industryOptions}</select>
                    </div>
                </div>
            </div>
        `;

        showModal(
            `Create Custom Product Post`,
            modalBodyContent,
            generateProductPostWithAI,
            true,
            `<button id="modal-confirm-btn" class="btn-primary">Generate Post</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`
        );
    }

    async function generateProductPostWithAI() {
        const userPrompt = document.getElementById('ai-post-prompt').value;
        if (!userPrompt) {
            alert("Please enter a prompt.");
            return false;
        }

        const selectedProducts = Array.from(document.querySelectorAll('.ai-product-checkbox:checked')).map(cb => cb.value);
        const selectedIndustry = document.getElementById('ai-industry-select').value;
        
        const modalBody = document.getElementById('modal-body');
        const modalActions = document.getElementById('modal-actions');
        const mTitle = document.getElementById('modal-title');
        
        modalBody.innerHTML = `<div class="loader"></div><p class="placeholder-text" style="text-align: center;">AI is drafting your post...</p>`;
        modalActions.innerHTML = ''; 

        try {
            const { data, error } = await supabase.functions.invoke('custom-user-social-post', {
                body: { userPrompt, product_names: selectedProducts, industry: selectedIndustry }
            });
            if (error) throw error;

            const postContent = `${data.post_body}\n\n${data.hashtags}`;
            const shareLink = "https://gpcom.com/business/#products-services";

            mTitle.textContent = 'AI-Generated Custom Post';
            modalBody.innerHTML = `
                <p style="margin-bottom: 15px;"><strong>Sharing Link:</strong> <a href="${shareLink}" target="_blank">${shareLink}</a></p>
                <label for="post-text-result">Generated Post Text:</label>
                <textarea id="post-text-result" rows="8" style="width: 100%;">${postContent}</textarea>
            `;
            
            modalActions.innerHTML = `
                <button id="copy-text-btn-result" class="btn-secondary">Copy Text</button>
                <button id="post-to-linkedin-btn-result" class="btn-primary">Post to LinkedIn</button>
                <button id="modal-close-btn-result" class="btn-secondary">Close</button>
            `;

            document.getElementById('copy-text-btn-result').addEventListener('click', () => {
                navigator.clipboard.writeText(document.getElementById('post-text-result').value).then(() => {
                    document.getElementById('copy-text-btn-result').textContent = 'Copied!';
                });
            });

            document.getElementById('post-to-linkedin-btn-result').addEventListener('click', () => {
                 window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareLink)}`, '_blank');
            });

            document.getElementById('modal-close-btn-result').addEventListener('click', hideModal);

        } catch (error) {
            console.error("Error:", error);
            hideModal();
        }
        return false;
    }

    // --- INITIALIZATION ---
    async function initializePage() {
        await loadSVGs();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            state.currentUser = session.user;
            await setupUserMenuAndAuth(supabase, state);
            updateActiveNavLink();
            setupPageEventListeners();
            await setupGlobalSearch(supabase, state.currentUser);
            await loadSocialContent(); 
            await checkAndSetNotifications(supabase); 
            updateLastVisited(supabase, 'social_hub'); 
        } else {
            window.location.href = "index.html";
        }
    }

    initializePage();
});
