/**
 * RoleBridge V2 — Auth Callback Page
 * Block 1 - frontend/src/components/AuthCallback.jsx
 *
 * Handles the redirect from Agnic OAuth:
 *   1. Extracts ?code=... and ?state=... from URL
 *   2. Sends code to v2-auth-callback Edge Function
 *   3. Stores rb_session_token in localStorage
 *   4. Navigates to /profile (signup) or /setup/new (signin)
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeAuthCode } from '../lib/api';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const errorDesc = searchParams.get('error_description');

    // Handle Agnic error response
    if (errorParam) {
      setError(errorDesc || errorParam || 'Authorization was declined.');
      setTimeout(() => navigate('/'), 3000);
      return;
    }

    if (!code) {
      setError('No authorization code received.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    // Validate state if we stored one
    const savedState = sessionStorage.getItem('rb_oauth_state');
    if (savedState && state !== savedState) {
      setError('Invalid state parameter. Please try again.');
      sessionStorage.removeItem('rb_oauth_state');
      setTimeout(() => navigate('/'), 2000);
      return;
    }
    sessionStorage.removeItem('rb_oauth_state');

    // Retrieve the saved mode (signin/signup) and redirect_uri
    const mode = sessionStorage.getItem('rb_oauth_mode') || 'signin';
    const redirectUri = sessionStorage.getItem('rb_oauth_redirect_uri') || `${window.location.origin}/auth/callback`;
    sessionStorage.removeItem('rb_oauth_mode');
    sessionStorage.removeItem('rb_oauth_redirect_uri');

    // Exchange code for session
    (async () => {
      try {
        const result = await exchangeAuthCode(code, redirectUri, mode);

        // Store the RoleBridge session token (NOT the Agnic token)
        localStorage.setItem('rb_session_token', result.rb_session_token);

        // Store minimal user info for immediate UI rendering
        localStorage.setItem('rb_v2_user', JSON.stringify(result.user));
        if (result.balance !== null && result.balance !== undefined) {
          localStorage.setItem('rb_v2_balance', result.balance.toString());
        }

        // Dispatch event so Navbar updates immediately
        window.dispatchEvent(new CustomEvent('rb:auth-changed'));

        // Navigate based on mode
        if (mode === 'signup' || result.user.is_new_user) {
          navigate('/profile', { replace: true });
        } else {
          navigate('/setup/new', { replace: true });
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err.message || 'Authentication failed. Please try again.');
        setTimeout(() => navigate('/'), 3000);
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="page-center">
      <div className="card" style={{ textAlign: 'center', padding: '48px 32px', maxWidth: '420px' }}>
        {error ? (
          <>
            <div className="modal-icon modal-icon--warn" style={{ margin: '0 auto 16px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '32px', height: '32px' }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="modal-title" style={{ marginBottom: '8px' }}>Authentication Error</h3>
            <p className="modal-body">{error}</p>
            <p className="auth-modal__note">Redirecting to home…</p>
          </>
        ) : (
          <>
            <div className="evaluating-pulse" style={{ marginBottom: '20px' }}>
              <div className="evaluating-dot" style={{ animationDelay: '0ms' }} />
              <div className="evaluating-dot" style={{ animationDelay: '150ms' }} />
              <div className="evaluating-dot" style={{ animationDelay: '300ms' }} />
            </div>
            <h3 className="modal-title" style={{ marginBottom: '8px' }}>Signing you in…</h3>
            <p className="auth-modal__note">Connecting to your Agnic account</p>
          </>
        )}
      </div>
    </div>
  );
}
