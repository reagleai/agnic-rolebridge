/**
 * RoleBridge V2 - Wallet Page
 * Block 5: Wired to real V2 backend.
 *
 * Features:
 * - Real balance from Agnic Balance API (via v2-balance proxy)
 * - Real Branded Checkout for top-up (popup + postMessage)
 * - Transactions link to Agnic Dashboard (no API for tx list yet)
 * - Balance auto-refreshes after top-up
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBalance } from '../lib/api';

const PRESET_AMOUNTS = [5, 10, 25];

function truncateAddress(addr) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletPage() {
  const navigate = useNavigate();

  const authUser = (() => {
    try { return JSON.parse(localStorage.getItem('rb_v2_user') || 'null'); } catch { return null; }
  })();

  // ── Auth guard ──
  useEffect(() => {
    if (!authUser) navigate('/', { replace: true });
  }, [authUser, navigate]);

  // ── Balance state ──
  const [balance, setBalance] = useState(null);
  const [creditBalance, setCreditBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [address, setAddress] = useState(null);
  const [network, setNetwork] = useState('base-sepolia');
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState('');

  // Top-up modal state
  const [showTopUp, setShowTopUp] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [topUpSuccess, setTopUpSuccess] = useState(false);

  const finalAmount = customAmount ? parseFloat(customAmount) : selectedAmount;

  // ── Fetch balance from API ──
  const fetchBalance = useCallback(async () => {
    setBalanceError('');
    try {
      const data = await getBalance();
      const total = parseFloat(data.balance) || 0;
      setBalance(total);
      setCreditBalance(parseFloat(data.creditBalance) || 0);
      setUsdcBalance(parseFloat(data.usdcBalance) || 0);
      setAddress(data.address || null);
      setNetwork(data.network || 'base-sepolia');
      localStorage.setItem('rb_v2_balance', total.toString());
      window.dispatchEvent(new CustomEvent('rb:balance-updated'));
    } catch (err) {
      console.error('Balance fetch error:', err);
      // Fallback to cached
      try {
        const cached = parseFloat(localStorage.getItem('rb_v2_balance') || '0');
        setBalance(cached);
      } catch {
        setBalance(0);
      }
      if (err.status === 401) {
        setBalanceError('Session expired. Please sign in again.');
      } else {
        setBalanceError('Could not fetch wallet balance.');
      }
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // ── Open Agnic Branded Checkout ──
  const handleTopUp = () => {
    const clientId = import.meta.env.VITE_AGNIC_CLIENT_ID;
    if (!clientId) {
      setBalanceError('Top-up is not configured. Please contact support.');
      return;
    }

    setShowTopUp(false);

    const returnUrl = `${window.location.origin}/wallet?topup=success`;
    const base = 'https://app.agnic.ai/topup';
    const params = new URLSearchParams({
      client_id: clientId,
      return_url: returnUrl,
      ...(finalAmount > 0 && { amount: finalAmount.toString() }),
    });
    const url = `${base}?${params.toString()}`;

    // Popup on desktop, redirect on mobile
    if (window.innerWidth < 640) {
      window.location.href = url;
      return;
    }

    const w = 480, h = 720;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    window.open(url, 'agnic-topup', `width=${w},height=${h},left=${left},top=${top},popup=yes`);
  };

  // ── Listen for top-up completion (popup postMessage) ──
  useEffect(() => {
    const onMessage = (ev) => {
      if (ev.origin !== 'https://app.agnic.ai') return;
      if (ev.data?.type === 'agnic:topup_complete') {
        fetchBalance();
        setTopUpSuccess(true);
        setTimeout(() => setTopUpSuccess(false), 4000);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [fetchBalance]);

  // ── Mobile top-up return ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('topup') === 'success') {
      fetchBalance();
      setTopUpSuccess(true);
      setTimeout(() => setTopUpSuccess(false), 4000);
      // Clean URL
      params.delete('topup');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [fetchBalance]);

  if (!authUser) return null;

  const displayBalance = typeof balance === 'number' && !isNaN(balance) ? balance : 0;
  const safeCreditBalance = typeof creditBalance === 'number' && !isNaN(creditBalance) ? creditBalance : 0;
  const safeUsdcBalance = typeof usdcBalance === 'number' && !isNaN(usdcBalance) ? usdcBalance : 0;

  return (
    <div className="wallet-page">
      <div className="wallet-container">

        {/* ── Page header ── */}
        <div className="wallet-header">
          <h1 className="wallet-header__title">Wallet</h1>
          <p className="wallet-header__sub">
            Your Agnic credits power every RoleBridge session. Manage your balance here.
          </p>
        </div>

        {/* ── Top-up success toast ── */}
        {topUpSuccess && (
          <div className="wallet-toast wallet-toast--success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Credits added successfully - balance updated.
          </div>
        )}

        {/* ── Balance error ── */}
        {balanceError && (
          <div className="wallet-toast wallet-toast--error">
            {balanceError}
            <button className="wallet-toast__retry" onClick={fetchBalance}>Retry</button>
          </div>
        )}

        {/* ── Balance overview ── */}
        <div className="wallet-balance-card">
          <div className="wallet-balance-card__label">Total Balance</div>
          <div className="wallet-balance-card__total">
            {balanceLoading ? (
              <span className="spinner-sm" style={{ margin: '8px auto' }} />
            ) : (
              `$${displayBalance.toFixed(2)}`
            )}
          </div>

          <div className="wallet-balance-card__breakdown">
            <div className="wallet-balance-item">
              <span className="wallet-balance-item__label">Agnic Credits</span>
              <span className="wallet-balance-item__val">
                {balanceLoading ? '...' : `$${safeCreditBalance.toFixed(2)}`}
              </span>
            </div>
            <div className="wallet-balance-item">
              <span className="wallet-balance-item__label">USDC</span>
              <span className="wallet-balance-item__val">
                {balanceLoading ? '...' : `$${safeUsdcBalance.toFixed(2)}`}
              </span>
            </div>
          </div>

          {address && (
            <div className="wallet-balance-card__address">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '13px', height: '13px', opacity: 0.6 }}>
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              <span className="wallet-balance-card__address-val">{truncateAddress(address)}</span>
              <span className="wallet-balance-card__network">{network}</span>
            </div>
          )}

          <button className="wallet-add-btn" onClick={() => { setShowTopUp(true); setTopUpSuccess(false); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Credits
          </button>
        </div>

        {/* ── Usage context ── */}
        <div className="wallet-usage">
          <div className="wallet-usage__item">
            <div className="wallet-usage__icon-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div className="wallet-usage__text">
              <div className="wallet-usage__label">Cost per session</div>
              <div className="wallet-usage__val">$0.15 – $0.45 depending on question count</div>
            </div>
          </div>
          <div className="wallet-usage__item">
            <div className="wallet-usage__icon-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div className="wallet-usage__text">
              <div className="wallet-usage__label">Sessions remaining</div>
              <div className="wallet-usage__val">
                ~{Math.floor(displayBalance / 0.25)} sessions at average usage
              </div>
            </div>
          </div>
          <div className="wallet-usage__item">
            <div className="wallet-usage__icon-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </div>
            <div className="wallet-usage__text">
              <div className="wallet-usage__label">Payment method</div>
              <div className="wallet-usage__val">USDC via Agnic · <a href="https://app.agnic.ai" target="_blank" rel="noopener noreferrer" className="wallet-link">Manage on Agnic ↗</a></div>
            </div>
          </div>
        </div>

        {/* ── Transaction history ── */}
        <div className="wallet-section">
          <div className="wallet-section__header">
            <h2 className="wallet-section__title">Transaction History</h2>
            <a
              href="https://app.agnic.ai/transactions"
              target="_blank"
              rel="noopener noreferrer"
              className="wallet-section__action"
            >
              View on Agnic ↗
            </a>
          </div>

          <div className="wallet-tx-list">
            <div className="wallet-tx-empty">
              Transaction history is available on your{' '}
              <a href="https://app.agnic.ai/transactions" target="_blank" rel="noopener noreferrer" className="wallet-link">Agnic Dashboard</a>.
              <br />
              We show your current balance above - all usage is billed per-call through Agnic.
            </div>
          </div>
        </div>

        {/* ── Quick actions ── */}
        <div className="wallet-quick-actions">
          <button className="btn-primary wallet-cta-btn" onClick={() => navigate('/setup/new')}>
            Start New Session →
          </button>
          <a
            href="https://app.agnic.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="wallet-agnic-link"
          >
            Open Agnic Dashboard ↗
          </a>
        </div>

      </div>

      {/* ── Top-up modal ── */}
      {showTopUp && (
        <div className="modal-overlay" onClick={() => setShowTopUp(false)}>
          <div className="modal-card topup-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowTopUp(false)} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="topup-modal__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '28px', height: '28px' }}>
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </div>

            <h3 className="modal-title">Add Credits</h3>
            <p className="modal-body" style={{ marginBottom: 0 }}>
              Credits are loaded to your Agnic wallet via their secure checkout. PCI handled by Agnic.
            </p>

            <div className="topup-current">
              <span className="topup-current__label">Current balance</span>
              <span className="topup-current__val">${displayBalance.toFixed(2)}</span>
            </div>

            {/* Preset amounts */}
            <div className="topup-presets">
              {PRESET_AMOUNTS.map(amt => (
                <button
                  key={amt}
                  className={`topup-preset ${!customAmount && selectedAmount === amt ? 'active' : ''}`}
                  onClick={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                >
                  ${amt}
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div className="topup-custom">
              <span className="topup-custom__prefix">$</span>
              <input
                type="number"
                min="1"
                max="500"
                placeholder="Custom amount"
                className="form-input topup-custom__input"
                value={customAmount}
                onChange={e => { setCustomAmount(e.target.value); setSelectedAmount(0); }}
              />
            </div>

            <div className="topup-summary">
              Adding <strong>${finalAmount || '-'}</strong> → new balance will be <strong>${(displayBalance + (finalAmount || 0)).toFixed(2)}</strong>
            </div>

            <button
              className="btn-primary"
              style={{ width: '100%', marginTop: '16px' }}
              onClick={handleTopUp}
              disabled={!finalAmount || finalAmount < 1}
            >
              Continue to Agnic Checkout →
            </button>

            <p className="topup-note">
              You'll complete payment on Agnic's secure page. We never store card details.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
