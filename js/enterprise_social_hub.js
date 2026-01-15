import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    formatDate,
    showModal,
    hideModal,
    setupUserMenuAndAuth,
    loadSVGs,
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
    const authContainer = document.getElementById('auth-container');
    const enterpriseHubContent = document.getElementById('enterprise-hub-content');
    const authForm = document.getElementById('auth-form');
    const authError = document.getElementById('auth-error');
    const authEmailInput = document.getElementById('auth-email');
    const authPasswordInput = document.getElementById('auth-password');
    const authSubmitBtn = document.getElementById('auth-submit-btn');

    const marketingContainer = document.getElementById('marketing-posts-container');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalTitle = document.getElementById('modal-title');
    const aiProductPostBtn = document.getElementById('ai-product-post-btn');
    const aiContainer = document.getElementById('ai-articles-container');

    // --- ADDED DOM SELECTORS ---
    const modalArticleLink = document.getElementById('modal-article-link');
    const postTextArea = document.getElementById('post-text');
    const copyTextBtn = document.getElementById('copy-text-btn');
    const postToLinkedInBtn = document.getElementById('post-to-linkedin-btn');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const customPromptInput = document.getElementById('custom-prompt-input');
    const generateCustomBtn = document.getElementById('generate-custom-btn');
    // --- END ADD ---


    // --- MAIN APP LOGIC (runs after login) ---
    async function showAppContent(user) {
        // Hide login form, show app content
        authContainer.classList.add('hidden');
        enterpriseHubContent.classList.remove('hidden');

        state.currentUser = user;
        
        // Setup the main app features
        await setupUserMenuAndAuth(supabase, state);
        setupPageEventListeners();
        await loadSocialContent();
    }

    // --- DATA FETCHING ---
    async function loadSocialContent() {
        if (!state.currentUser) return;
        try {
            // 1. Calculate the cutoff date
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
            const isoDateString = sixtyDaysAgo.toISOString();

            // 2. Fetch all marketing posts (no age limit)
            const { data: marketingPosts, error: marketingError } = await supabase
                .from('social_hub_posts')
                .select('*')
                .eq('type', 'marketing_post')
                .order('created_at', { ascending: false });

            // 3. Fetch only recent AI articles (created_at > 60 days ago)
            const { data: aiArticles, error: aiError } = await supabase
                .from('social_hub_posts')
                .select('*')
                .eq('type', 'ai_article')
                .gt('created_at', isoDateString) // <-- This is the 60-day filter
                .order('created_at', { ascending: false });

            if (marketingError || aiError) {
                throw marketingError || aiError;
            }

            // 4. Combine the results
            state.allPosts = (marketingPosts || []).concat(aiArticles || []);
            
            // 5. Sort the combined list by date
            state.allPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            // 6. Fetch products (this stays the same)
            const { data: productData, error: productError } = await supabase.from('product_knowledge').select('product_name');
            if (productError) throw productError;
            state.products = [...new Set(productData.map(p => p.product_name))].sort();

            // 7. Render
            renderSocialContent();
        } catch (error) {
            console.error("Error fetching Social Hub content:", error);
        }
    }

    // --- RENDER FUNCTIONS ---
    function renderSocialContent() {
        aiContainer.innerHTML = ''; // Clear AI container
        marketingContainer.innerHTML = ''; // Clear Marketing container
        
        // Filter posts into their respective types
        const aiArticles = state.allPosts.filter(p => p.type === 'ai_article');
        const marketingPosts = state.allPosts.filter(p => p.type === 'marketing_post');

        // Render AI-Curated Content
        if (aiArticles.length === 0) { 
            aiContainer.innerHTML = `<p class="placeholder-text">Cognito is searching for relevant articles. Check back soon!</p>`; 
        } else { 
            aiArticles.forEach(item => aiContainer.appendChild(createSocialCard(item))); 
        }

        // Render Marketing Team Content
        if (marketingPosts.length === 0) {
            marketingContainer.innerHTML = `<p class="placeholder-text">The marketing team is busy creating content. Stay tuned for new posts!</p>`;
        } else {
            marketingPosts.forEach(item => marketingContainer.appendChild(createSocialCard(item)));
        }
    }

   function createSocialCard(item) {
        const card = document.createElement('div');
        card.className = 'alert-card';
        card.id = `post-card-${item.id}`;

        // This logic dynamically handles both AI and Marketing post types
        const headline = item.title;
        const link = item.link;
        const summary = item.summary || item.approved_copy;
        const sourceName = item.source_name || 'Marketing Team';
        const triggerType = item.type === 'marketing_post' ? 'Campaign Asset' : 'News Article';
        const dynamicLinkIndicator = item.is_dynamic_link ? `<span class="dynamic-link-indicator" title="This link generates a rich preview on LinkedIn">✨</span>` : '';

        card.innerHTML = `
            <div class="alert-header"><span class="alert-trigger-type">${triggerType}</span></div>
            <h5 class="alert-headline">${headline} ${dynamicLinkIndicator}</h5>
            <p class="alert-summary">${(summary || '').replace(/\n/g, '<br>')}</p>
            <div class="alert-footer">
                <span class="alert-source">Source: <a href="${link}" target="_blank">${sourceName}</a></span>
                <span class="alert-date">${formatDate(item.created_at)}</span>
            </div>
            <div class="alert-actions">
                <button class="btn-primary prepare-post-btn" data-post-id="${item.id}">Prepare Post</button>
            </div>
        `;
        
        // This button does *not* have the dismiss listener
        card.querySelector('.prepare-post-btn').addEventListener('click', () => openPostModal(item));
        return card;
    }

    async function showAIProductPostModal() {
        const productCheckboxes = state.products.map(product => `
            <div style="display: flex; align-items: center; margin-bottom: 12px; padding: 0;">
                <input type="checkbox" id="social-prod-${product.replace(/\s+/g, '-')}" class="ai-product-checkbox" value="${product}" style="margin: 0 8px 0 0; width: auto; height: auto;">
                <label for="social-prod-${product.replace(/\s+/g, '-')}" style="margin: 0; padding: 0; font-weight: normal;">${product}</label>
            </div>
        `).join('');

        const industries = ['General', 'Healthcare', 'Financial', 'Retail', 'Manufacturing', 'K-12 Education'];
        const industryOptions = industries.map(ind => `<option value="${ind}">${ind}</option>`).join('');

        const modalBody = `
            <div id="ai-custom-post-prompt-container">
                <label style="font-weight: 600;">Post Goal/Topic:</label>
                <textarea id="ai-post-prompt" rows="3" placeholder="e.g., 'Announce a new feature for Managed Wi-Fi'"></textarea>
                <div style="margin-top: 1.5rem;">
                    <div style="border: none; padding: 0; margin: 0;">
                        <p style="font-weight: 600; margin-bottom: 12px;">Include Product Info</p>
                        ${productCheckboxes}
                    </div>
                    <div style="margin-top: 20px;">
                        <label for="ai-industry-select" style="font-weight: 600; display: block; margin-bottom: 10px;">Target Industry</label>
                        <select id="ai-industry-select">${industryOptions}</select>
                    </div>
                </div>
            </div>
        `;

        showModal('Create Custom Product Post', modalBody, generateProductPostWithAI, true, `<button id="modal-confirm-btn" class="btn-primary">Generate Post</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`);
    }

    async function generateProductPostWithAI() {
        const userPrompt = document.getElementById('ai-post-prompt').value;
        if (!userPrompt) {
            alert("Please enter a prompt for the post topic.");
            return false;
        }

        const selectedProducts = Array.from(document.querySelectorAll('.ai-product-checkbox:checked')).map(cb => cb.value);
        const selectedIndustry = document.getElementById('ai-industry-select').value;
        
        const modalBody = document.getElementById('modal-body');
        const modalActions = document.getElementById('modal-actions');
        modalBody.innerHTML = `<div class="loader"></div><p class="placeholder-text" style="text-align: center;">AI is drafting your post...</p>`;
        modalActions.innerHTML = ''; 

        try {
            const { data, error } = await supabase.functions.invoke('custom-user-social-post', {
                body: { userPrompt, product_names: selectedProducts, industry: selectedIndustry }
            });

            if (error) throw error;
            hideModal();
            
            const generatedPost = {
                title: "AI-Generated Custom Post",
                link: "https://gpcom.com/business/#products-services",
                approved_copy: `${data.post_body}\n\n${data.hashtags}`,
                isPreGenerated: true // This flag tells openPostModal to just display the text
            };
            openPostModal(generatedPost);

        } catch (error) {
            console.error("Error generating custom post:", error);
            hideModal();
            alert("Sorry, there was an error generating the post. Please try again.");
        }
        
        return false;
    }

    // --- REPLACED FUNCTION ---
    // This now includes the AI call for 'ai_article'
    async function openPostModal(item) {
        modalTitle.textContent = item.title;
        modalArticleLink.href = item.link;
        modalArticleLink.textContent = item.link;
        postToLinkedInBtn.dataset.url = item.link;
        modalBackdrop.classList.remove('hidden');

        // This handles the "Create Custom Product Post" flow
        if (item.isPreGenerated) {
            postTextArea.value = item.approved_copy;
            return; 
        }

        postTextArea.value = "Generating AI suggestion...";

        // This is the logic you were missing:
        if (item.type === 'marketing_post') {
            postTextArea.value = item.approved_copy;
        } else {
            // It's an 'ai_article', so we call the function
            const { data, error } = await supabase.functions.invoke('generate-social-post', { body: { article: item } });
            if (error) {
                postTextArea.value = "Error generating suggestion. Please write your own or try again.";
                console.error("Edge function error:", error);
            } else {
                postTextArea.value = data.suggestion;
            }
        }
    }

   
    // --- REPLACED FUNCTION ---
    // This now includes listeners for the refine button
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
        
        // --- THIS IS THE NEW, CRITICAL LOGIC ---
        // Event listener for the "Refine" button
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
                alert("Error refining post. Please check the console.");
            } else {
                postTextArea.value = data.suggestion;
                customPromptInput.value = ''; // Clear prompt input
            }

            generateCustomBtn.textContent = 'Regenerate';
            generateCustomBtn.disabled = false;
        });
        // --- END NEW LOGIC ---

        // It overrides the default logout behavior from setupUserMenuAndAuth
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault(); // Stop the default redirect
                await supabase.auth.signOut();
                window.location.reload(); // Reload this page to show the login form
            });
        }
    }
    
    // --- INITIALIZATION ---
    async function initializePage() {
        await loadSVGs();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session && session.user) {
            // If session exists, show the app
            await showAppContent(session.user);
        } else {
            // If no session, show the login form and set up its listener
            enterpriseHubContent.classList.add('hidden');
            authContainer.classList.remove('hidden');

            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = authEmailInput.value.trim();
                const password = authPasswordInput.value.trim();
                
                authSubmitBtn.disabled = true;
                authSubmitBtn.textContent = "Logging in...";
                authError.textContent = "";

                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                
                if (error) {
                    authError.textContent = error.message;
                    authSubmitBtn.disabled = false;
                    authSubmitBtn.textContent = "Login";
                } else if (data.user) {
                    // On successful login, show the app
                    await showAppContent(data.user);
                }
            });
        }
    }
    initializePage();
});
