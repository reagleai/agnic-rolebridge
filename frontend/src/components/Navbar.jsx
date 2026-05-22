/**
 * RoleBridge V2 Navbar
 *
 * Unauthenticated: Logo | [Sign In] [Sign Up] | Theme toggle
 * Authenticated:   Logo | $bal (→ /wallet) | Avatar dropdown | Theme toggle
 *
 * V2: Real Agnic OAuth (replaces mock auth).
 *     Auth state is stored in localStorage (persists across tabs/refresh).
 *     Balance is fetched from the backend via v2-auth-me.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getAuthMe, authLogout } from '../lib/api';

const AGNIC_CLIENT_ID = import.meta.env.VITE_AGNIC_CLIENT_ID || '';
const AGNIC_AUTHORIZE_URL = 'https://api.agnic.ai/oauth/authorize';

export default function Navbar() {
  const [theme, setTheme] = useState('dark');
  const [scrolled, setScrolled] = useState(false);
  const [authModal, setAuthModal] = useState(null); // null | 'signin' | 'signup'
  const [signingIn, setSigningIn] = useState(false);
  const [authUser, setAuthUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rb_v2_user') || 'null'); } catch { return null; }
  });
  const [balance, setBalance] = useState(() => {
    try {
      const b = localStorage.getItem('rb_v2_balance');
      return b !== null ? parseFloat(b) : null;
    } catch { return null; }
  });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();

  /* ── Theme & scroll ── */
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const t = savedTheme || (prefersLight ? 'light' : 'dark');
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── Rehydrate auth state from backend on mount ── */
  const rehydrateAuth = useCallback(async () => {
    const token = localStorage.getItem('rb_session_token');
    if (!token) {
      setAuthUser(null);
      setBalance(null);
      return;
    }

    try {
      const data = await getAuthMe();
      setAuthUser(data.user);
      localStorage.setItem('rb_v2_user', JSON.stringify(data.user));
      if (data.balance !== null && data.balance !== undefined) {
        setBalance(data.balance);
        localStorage.setItem('rb_v2_balance', data.balance.toString());
      }
    } catch (err) {
      if (err.status === 401) {
        // Session expired — clear local auth
        localStorage.removeItem('rb_session_token');
        localStorage.removeItem('rb_v2_user');
        localStorage.removeItem('rb_v2_balance');
        setAuthUser(null);
        setBalance(null);
      }
    }
  }, []);

  useEffect(() => {
    rehydrateAuth();
  }, [rehydrateAuth]);

  /* ── Listen for auth state changes (from AuthCallback or other tabs) ── */
  useEffect(() => {
    const handler = () => {
      const u = (() => { try { return JSON.parse(localStorage.getItem('rb_v2_user') || 'null'); } catch { return null; } })();
      const b = (() => {
        try {
          const val = localStorage.getItem('rb_v2_balance');
          return val !== null ? parseFloat(val) : null;
        } catch { return null; }
      })();
      setAuthUser(u);
      setBalance(b);
    };
    window.addEventListener('rb:auth-changed', handler);
    window.addEventListener('rb:balance-updated', handler);
    // Also listen to storage events for cross-tab sync
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('rb:auth-changed', handler);
      window.removeEventListener('rb:balance-updated', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  /* ── Close dropdown on outside click ── */
  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Listen for auth modal trigger from other components (e.g. Landing CTA) ── */
  useEffect(() => {
    const handler = (e) => {
      if (!authUser) setAuthModal(e.detail || 'signup');
    };
    window.addEventListener('rb:open-auth', handler);
    return () => window.removeEventListener('rb:open-auth', handler);
  }, [authUser]);

  const toggleTheme = () => {
    const t = theme === 'light' ? 'dark' : 'light';
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
  };

  /* ── Real Agnic OAuth redirect ── */
  const handleAuth = (mode) => {
    setAuthModal(null);
    setSigningIn(true);

    if (!AGNIC_CLIENT_ID) {
      console.error('Missing VITE_AGNIC_CLIENT_ID');
      setSigningIn(false);
      return;
    }

    // Generate CSRF state token
    const state = crypto.randomUUID();
    sessionStorage.setItem('rb_oauth_state', state);
    sessionStorage.setItem('rb_oauth_mode', mode);

    const redirectUri = `${window.location.origin}/auth/callback`;
    sessionStorage.setItem('rb_oauth_redirect_uri', redirectUri);

    // Build Agnic authorization URL
    const params = new URLSearchParams({
      client_id: AGNIC_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'payments:sign balance:read',
      state,
    });

    // Redirect to Agnic
    window.location.href = `${AGNIC_AUTHORIZE_URL}?${params.toString()}`;
  };

  const handleSignOut = async () => {
    setShowUserMenu(false);

    // Fire-and-forget server-side logout
    try { await authLogout(); } catch { /* ignore */ }

    // Clear local auth state
    localStorage.removeItem('rb_session_token');
    localStorage.removeItem('rb_v2_user');
    localStorage.removeItem('rb_v2_balance');
    setAuthUser(null);
    setBalance(null);

    window.dispatchEvent(new CustomEvent('rb:auth-changed'));
    navigate('/');
  };

  /* ── Icons ── */
  const ThemeIcon = theme === 'light' ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );

  return (
    <>
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        {/* Logo */}
        <Link to="/" className="navbar-logo">
          <div className="navbar-logo-box">RB</div>
          <span className="navbar-wordmark">RoleBridge</span>
        </Link>

        {/* Right side */}
        <div className="navbar-right">
          {authUser ? (
            /* ── Authenticated ── */
            <>
              {/* Balance pill → links to /wallet */}
              <Link to="/wallet" className="navbar-balance" title="Manage wallet">
                <span className="navbar-balance-icon"></span>
                <span className="navbar-balance-val">
                  {balance !== null ? `$${balance.toFixed(2)}` : '...'}
                </span>
              </Link>

              {/* Avatar → dropdown */}
              <div className="navbar-user-menu-wrap" ref={userMenuRef}>
                <button
                  className="navbar-avatar-btn"
                  onClick={() => setShowUserMenu(v => !v)}
                  aria-label="User menu"
                  aria-expanded={showUserMenu}
                >
                  <span className="navbar-avatar-initials">
                    {authUser.display_name?.[0]?.toUpperCase() || authUser.email?.[0]?.toUpperCase() || 'U'}
                  </span>
                </button>

                {showUserMenu && (
                  <div className="navbar-user-dropdown">
                    <div className="navbar-dropdown-email">{authUser.email}</div>

                    <Link to="/profile" className="navbar-dropdown-item" onClick={() => setShowUserMenu(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '15px', height: '15px', flexShrink: 0 }}>
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                      </svg>
                      My Profile
                    </Link>

                    <Link to="/wallet" className="navbar-dropdown-item" onClick={() => setShowUserMenu(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '15px', height: '15px', flexShrink: 0 }}>
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                      Wallet · <span style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.813rem' }}>
                        {balance !== null ? `$${balance.toFixed(2)}` : '...'}
                      </span>
                    </Link>

                    <Link to="/setup/new" className="navbar-dropdown-item" onClick={() => setShowUserMenu(false)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '15px', height: '15px', flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                      New Session
                    </Link>

                    <div className="navbar-dropdown-divider" />

                    <button className="navbar-dropdown-item navbar-dropdown-item--danger" onClick={handleSignOut}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '15px', height: '15px', flexShrink: 0 }}>
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Unauthenticated ── */
            <div className="navbar-auth-btns">
              <button
                id="navbar-signin-btn"
                className="navbar-auth-btn navbar-auth-btn--ghost"
                onClick={() => setAuthModal('signin')}
                disabled={signingIn}
              >
                {signingIn ? <span className="spinner-sm spinner-sm--themed" /> : 'Sign In'}
              </button>
              <button
                id="navbar-signup-btn"
                className="navbar-auth-btn navbar-auth-btn--primary"
                onClick={() => setAuthModal('signup')}
                disabled={signingIn}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Theme toggle */}
          <button onClick={toggleTheme} className="navbar-theme-btn" aria-label="Toggle theme">
            {ThemeIcon}
          </button>
        </div>
      </nav>

      {/* ── Auth Modal ── */}
      {authModal && (
        <div className="modal-overlay" onClick={() => setAuthModal(null)}>
          <div className="modal-card auth-modal" onClick={e => e.stopPropagation()}>

            {/* Tab switcher */}
            <div className="auth-modal__tabs">
              <button
                className={`auth-modal__tab ${authModal === 'signin' ? 'active' : ''}`}
                onClick={() => setAuthModal('signin')}
              >Sign In</button>
              <button
                className={`auth-modal__tab ${authModal === 'signup' ? 'active' : ''}`}
                onClick={() => setAuthModal('signup')}
              >Sign Up</button>
            </div>

            {/* Body */}
            <div className="auth-modal__body">
              {authModal === 'signin' ? (
                <>
                  <h3 className="auth-modal__title">Welcome back</h3>
                  <p className="auth-modal__sub">Sign in with your Agnic account to access your sessions and credits.</p>
                </>
              ) : (
                <>
                  <h3 className="auth-modal__title">Create your account</h3>
                  <p className="auth-modal__sub">New Agnic users get <strong className="text-primary">$5.00 free credits</strong> — no card required.</p>
                </>
              )}

              {/* Themed Agnic OAuth button */}
              <button
                className="btn-agnic-signin"
                style={{ width: '100%', marginTop: '4px' }}
                onClick={() => handleAuth(authModal)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                {authModal === 'signin' ? 'Continue with Agnic' : 'Sign Up with Agnic'}
              </button>

              <p className="auth-modal__note">
                We never store card details.
              </p>

              {authModal === 'signin' ? (
                <p className="auth-modal__switch">
                  No account?{' '}
                  <button className="auth-modal__switch-link" onClick={() => setAuthModal('signup')}>Sign Up free</button>
                </p>
              ) : (
                <p className="auth-modal__switch">
                  Already have an account?{' '}
                  <button className="auth-modal__switch-link" onClick={() => setAuthModal('signin')}>Sign In</button>
                </p>
              )}
            </div>

            {/* Close */}
            <button className="modal-close-btn" onClick={() => setAuthModal(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
