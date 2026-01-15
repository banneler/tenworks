// js/auth.js
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    showModal,
    hideModal,
    setupModalListeners,
    loadSVGs
} from './shared_constants.js';

document.addEventListener("DOMContentLoaded", async () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await loadSVGs();
    setupModalListeners();

    // --- DOM SELECTORS ---
    const authForm = document.getElementById("auth-form");
    const resetForm = document.getElementById("reset-form");
    const authError = document.getElementById("auth-error");
    const authEmailInput = document.getElementById("auth-email");
    const authPasswordInput = document.getElementById("auth-password");
    const authSubmitBtn = document.getElementById("auth-submit-btn");
    const authToggleLink = document.getElementById("auth-toggle-link");
    const forgotPasswordLink = document.getElementById("forgot-password-link");
    const returnToLoginLink = document.getElementById("return-to-login-link");
    const signupFields = document.getElementById("signup-fields");
    const authConfirmPasswordInput = document.getElementById("auth-confirm-password");

    let isLoginMode = true;

    const showTemporaryMessage = (message, isSuccess = true) => {
        authError.textContent = message;
        authError.style.color = isSuccess ? 'var(--success-color)' : 'var(--error-color)';
        authError.style.display = 'block';
    };

    const clearErrorMessage = () => {
        authError.textContent = "";
        authError.style.display = 'none';
    };

    const updateAuthUI = () => {
        authSubmitBtn.textContent = isLoginMode ? "Login" : "Sign Up";
        authToggleLink.textContent = isLoginMode ? "Need an account? Sign Up" : "Have an account? Login";
        clearErrorMessage();
        authForm.reset();
        signupFields.classList.toggle('hidden', isLoginMode);
        forgotPasswordLink.classList.toggle('hidden', !isLoginMode);
        authConfirmPasswordInput.required = !isLoginMode;
    };

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('verified') === 'true') {
        showTemporaryMessage("Email successfully verified! Please log in.", true);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // --- EVENT LISTENERS ---
    authToggleLink.addEventListener("click", (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        updateAuthUI();
    });

    returnToLoginLink.addEventListener("click", (e) => {
        e.preventDefault();
        authForm.classList.remove("hidden");
        authToggleLink.classList.remove("hidden");
        forgotPasswordLink.classList.remove("hidden");
        resetForm.classList.add("hidden");
        returnToLoginLink.classList.add("hidden");
        clearErrorMessage();
    });

    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        authForm.classList.add("hidden");
        authToggleLink.classList.add("hidden");
        forgotPasswordLink.classList.add("hidden");
        resetForm.classList.remove("hidden");
        returnToLoginLink.classList.remove("hidden");
        clearErrorMessage();
    });

    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        authSubmitBtn.disabled = true;
        authSubmitBtn.textContent = isLoginMode ? "Logging in..." : "Signing up...";
        clearErrorMessage();
        const email = authEmailInput.value.trim();
        const password = authPasswordInput.value.trim();

        if (isLoginMode) {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                showTemporaryMessage(error.message, false);
            } else {
                // EXPLICIT REDIRECT: If there's no error, we are logged in. Go to the command center.
                sessionStorage.setItem('showLoadingScreen', 'true'); // <-- ADD THIS LINE
                window.location.href = "command-center.html";
            }
        } else {
            const confirmPassword = authConfirmPasswordInput.value.trim();
            if (password !== confirmPassword) {
                showTemporaryMessage("Passwords do not match.", false);
                authSubmitBtn.disabled = false;
                authSubmitBtn.textContent = "Sign Up";
                return;
            }
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) {
                showTemporaryMessage(error.message, false);
            } else if (data.user && data.user.identities && data.user.identities.length === 0) {
                 showTemporaryMessage("This email is already in use. Please try logging in.", false);
            } else {
                showTemporaryMessage("Account created! Please check your email for a verification link.", true);
                setTimeout(() => {
                    isLoginMode = true;
                    updateAuthUI();
                }, 3000);
            }
        }
        if (isLoginMode) {
             authSubmitBtn.disabled = false;
             authSubmitBtn.textContent = "Login";
        }
    });

    resetForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const resetSubmitBtn = document.getElementById("reset-submit-btn");
        resetSubmitBtn.disabled = true;
        resetSubmitBtn.textContent = "Sending...";
        clearErrorMessage();

        const email = document.getElementById("reset-email").value;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: 'https://www.constellation-crm.com/reset-password.html',
        });

        if (error) {
            showTemporaryMessage(error.message, false);
        } else {
            showTemporaryMessage("Password reset email sent! Please check your inbox.", true);
        }
        resetSubmitBtn.disabled = false;
        resetSubmitBtn.textContent = "Send Reset Link";
    });

    // --- AUTH STATE CHANGE HANDLER ---
    supabase.auth.onAuthStateChange((event, session) => {
        // This listener is still useful for auto-login if a session already exists,
        // but our form submission is now more reliable.
        if (event === "SIGNED_IN" && session) {
            if (!window.location.pathname.includes('command-center.html')) {
                window.location.href = "command-center.html";
            }
        }
    });

    updateAuthUI();
});
