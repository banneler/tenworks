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
        userInteractions: new Set()
    };
    
    // --- DOM SELECTORS ---
    const aiContainer = document.getElementById('ai-articles-container');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalTitle = document.getElementById('modal-title');
    const modalArticleLink = document.getElementById('modal-article-link');
    const postTextArea = document.getElementById('post-text');
    const copyTextBtn = document.getElementById('copy-text-btn');
    const postToLinkedInBtn = document.getElementById('post-to-linkedin-btn');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const customPromptInput = document.getElementById('custom-prompt-input');
    const generateCustomBtn = document.getElementById('generate-custom-btn');

    // --- DATA FETCHING ---
    async function loadSocialContent() {
        if (!state.currentUser) return;
        try {
            // Only fetching posts and user interactions now. Product knowledge fetch removed.
            const { data: posts, error: postsError } = await supabase
                .from('social_hub_posts_tw')
                .select('*')
                .eq('type', 'ai_article') // Optimization: Only fetch AI articles since marketing is removed
                .order('created_at', { ascending: false });

            if (postsError) throw postsError;
            state.allPosts = posts || [];

            const { data: interactions, error: interactionsError } = await supabase
                .from('user_post_interactions')
                .select('post_id')
                .eq('user_id', state.currentUser.id);

            if (interactionsError) throw interactionsError;
            state.userInteractions = new Set(interactions.map(i => i.post_id));

            renderSocialContent();
        } catch (error) {
            console.error("Error fetching Social Hub content:", error);
        }
    }

    // --- RENDER FUNCTIONS ---
    function renderSocialContent() {
        aiContainer.innerHTML = '';
        
        // Filter out dismissed posts and only show AI articles
        const visiblePosts = state.allPosts.filter(post => !state.userInteractions.has(post.id));
        const aiArticles = visiblePosts.filter(p => p.type === 'ai_article');
        
        if (aiArticles.length === 0) { 
            aiContainer.innerHTML = `<p class="placeholder-text">Cognito is searching for relevant articles. Check back soon!</p>`; 
        } else { 
            aiArticles.forEach(item => aiContainer.appendChild(createSocialCard(item))); 
        }
    }

    function createSocialCard(item) {
        const headline = item.title;
        const link = item.link;
        // Logic: Use pre-generated copy for summary if available
        const summary = item.summary || item.approved_copy || "No summary available.";
        const sourceName = item.source_name || 'Industry News';
        const triggerType = 'News Article';
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

        // IF we already have copy generated (saved in DB), use it.
        if (item.approved_copy && item.approved_copy.trim() !== "") {
            postTextArea.value = item.approved_copy;
            return;
        }

        // Otherwise, generate it now.
        postTextArea.value = "Generating AI suggestion...";

        const { data, error } = await supabase.functions.invoke('generate-social-post', { body: { article: item } });
        if (error) {
            postTextArea.value = "Error generating suggestion. Please write your own or try again.";
            console.error("Edge function error:", error);
        } else {
            postTextArea.value = data.suggestion;
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
