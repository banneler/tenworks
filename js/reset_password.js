// js/reset_password.js
// No need to import modal functions here, as this page directly contains the form.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './shared_constants.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log("reset_password.js script started parsing.");
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- DOM Element Selectors ---
    const resetTitle = document.getElementById('reset-title');
    const resetError = document.getElementById('reset-error');
    const resetPasswordForm = document.getElementById('reset-password-form');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const setPasswordBtn = document.getElementById('set-password-btn');

    console.log("Reset page elements:", { resetTitle, resetError, resetPasswordForm, newPasswordInput, confirmPasswordInput, setPasswordBtn });

    // --- Auth State Handling for Password Reset Flow ---
    // This part is crucial. When a user clicks a password reset link,
    // Supabase automatically exchanges the token in the URL for a session
    // This 'SIGNED_IN' event indicates the user is now authenticated
    // and can proceed to update their password.
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth event on reset_password.js:', event);
        if (event === 'SIGNED_IN' && session) {
            // The token from the URL has been successfully exchanged.
            // User can now set their new password.
            console.log("User session detected via reset token. Ready to set new password.");
            resetTitle.textContent = "Set New Password";
            resetError.textContent = ''; // Clear any initial error messages

            // Ensure the form is visible (it should be by default now with direct HTML)
            if (resetPasswordForm) {
                resetPasswordForm.classList.remove('hidden'); // In case it was hidden by default or a previous error
                newPasswordInput.focus(); // Set focus to the first input field
            }

        } else if (event === 'SIGNED_OUT') {
            // This event might fire if the URL token is invalid, expired, or already used.
            console.warn("User signed out or no session detected on reset password page. Token likely invalid/expired.");
            resetTitle.textContent = "Invalid or Expired Link";
            resetError.textContent = "Your password reset link is invalid or has expired. Please request a new one.";
            if (resetPasswordForm) {
                resetPasswordForm.classList.add('hidden'); // Hide the form if the link is bad
            }
            // Also hide the "Back to Login" link to avoid confusion
            const backToLoginLink = document.querySelector('a[href="index.html"]');
            if (backToLoginLink) {
                backToLoginLink.classList.add('hidden'); // Optionally hide if link is bad
            }
        }
        // For other events (e.g., INITIAL_SESSION if no token, or user is already logged in for some reason)
        // the form will remain visible based on the HTML.
    });


    // --- Handle New Password Form Submission ---
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            resetError.textContent = ''; // Clear previous errors

            const newPassword = newPasswordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            // Basic client-side validation
            if (newPassword.length < 6) {
                resetError.textContent = "Password must be at least 6 characters long.";
                return;
            }
            if (newPassword !== confirmPassword) {
                resetError.textContent = "Passwords do not match.";
                return;
            }

            setPasswordBtn.disabled = true;
            setPasswordBtn.textContent = 'Setting...';

            // Update the user's password in Supabase
            // This works because the onAuthStateChange event (triggered by the URL token)
            // has already established a temporary authenticated session.
            const { error } = await supabase.auth.updateUser({ password: newPassword });

            if (error) {
                console.error("Error updating password:", error.message);
                resetError.textContent = `Error setting password: ${error.message}`;
            } else {
                console.log("Password updated successfully.");
                alert("Your password has been successfully reset! You can now log in with your new password.");
                window.location.href = 'index.html'; // Redirect to login page
            }

            setPasswordBtn.disabled = false;
            setPasswordBtn.textContent = 'Set Password';
        });
    } else {
        console.error("Reset password form not found in DOM!");
    }

    // Initial check for session (important if user refreshes page after token exchange)
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        // If a session already exists (e.g., from a previously valid reset token on page load),
        // we can assume the user is ready to set password.
        resetTitle.textContent = "Set New Password";
        newPasswordInput.focus();
    } else {
        // If no session immediately, the onAuthStateChange listener will eventually
        // catch the token exchange or indicate an invalid link.
        resetTitle.textContent = "Waiting for Link Validation..."; // Initial message
        // Optionally hide form until session confirmed (can be made visible by onAuthStateChange)
        // resetPasswordForm.classList.add('hidden');
    }
});
