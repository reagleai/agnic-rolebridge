/**
 * RoleBridge V2 — Wallet Page (Prototype)
 *
 * Surfaces Agnic wallet features relevant to RoleBridge:
 *   - Balance overview (total / USDC / credit)
 *   - Add Credits via AgnicPay Branded Checkout
 *   - Transaction history
 *
 * All data is mocked. In production:
 *   - Balance: GET https://api.agnic.ai/api/balance (Bearer token)
 *   - Transactions: GET https://api.agnic.ai/api/transactions
 *   - Top-up: window.open('https://app.agnic.ai/topup?client_id=...&return_url=...')
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const MOCK_TRANSACTIONS = [
  { id: 1, date: '2026-05-22', desc: 'RoleBridge — Interview session (9 questions)', type: 'debit',  amount: -0.28, balance: 4.72 },
  { id: 2, date: '2026-05-21', desc: 'RoleBridge — Interview session (6 questions)', type: 'debit',  amount: -0.17, balance: 5.00 },
  { id: 3, date: '2026-05-20', desc: 'Agnic signup credit',                           type: 'credit', amount: +5.00, balance: 5.17 },
];

const PRESET_AMOUNTS = [5, 10, 25];

function truncateAddress(addr) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletPage() {
  const navigate = useNavigate();

  const authUser = (() => {
    try { return JSON.parse(sessionStorage.getItem('rb_v2_user') || 'null'); } catch { return null; }
  })();

  useEffect(() => {
    if (!authUser) navigate('/');
  }, [authUser, navigate]);

  const [balance, setBalance] = useState(() => {
    try { return parseFloat(sessionStorage.getItem('rb_v2_balance') || '5.00'); } catch { return 5.00; }
  });
  const [transactions, setTransactions] = useState(MOCK_TRANSACTIONS);

  // Top-up modal state
  const [showTopUp, setShowTopUp] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [topping, setTopping] = useState(false);
  const [topUpSuccess, setTopUpSuccess] = useState(false);

  const finalAmount = customAmount ? parseFloat(customAmount) : selectedAmount;

  const handleTopUp = () => {
    if (!finalAmount || finalAmount < 1) return;
    setTopping(true);
    // Simulate AgnicPay popup + postMessage callback (2s)
    setTimeout(() => {
      const newBalance = +(balance + finalAmount).toFixed(2);
      setBalance(newBalance);
      sessionStorage.setItem('rb_v2_balance', newBalance.toFixed(2));
      const newTx = {
        id: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        desc: `Credits added via AgnicPay`,
        type: 'credit',
        amount: +finalAmount,
        balance: newBalance,
      };
      setTransactions(tx => [newTx, ...tx]);
      setTopping(false);
      setTopUpSuccess(true);
      setShowTopUp(false);
      setTimeout(() => setTopUpSuccess(false), 4000);
    }, 2000);
  };



  const mockAddress = '0x3f2d...a8B4';

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
            Credits added successfully — balance updated.
          </div>
        )}

        {/* ── Balance overview ── */}
        <div className="wallet-balance-card">
          <div className="wallet-balance-card__label">Total Balance</div>
          <div className="wallet-balance-card__total">${balance.toFixed(2)}</div>

          <div className="wallet-balance-card__breakdown">
            <div className="wallet-balance-item">
              <span className="wallet-balance-item__label">Agnic Credits</span>
              <span className="wallet-balance-item__val">${balance.toFixed(2)}</span>
            </div>
            <div className="wallet-balance-item">
              <span className="wallet-balance-item__label">USDC</span>
              <span className="wallet-balance-item__val">$0.00</span>
            </div>
          </div>

          <div className="wallet-balance-card__address">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '13px', height: '13px', opacity: 0.6 }}>
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <span className="wallet-balance-card__address-val">{truncateAddress(mockAddress)}</span>
            <span className="wallet-balance-card__network">Base · Sepolia</span>
          </div>

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
              <div className="wallet-usage__val">~{Math.floor(balance / 0.30)} sessions at average usage</div>
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
              Full history on Agnic ↗
            </a>
          </div>

          <div className="wallet-tx-list">
            {transactions.length === 0 ? (
              <div className="wallet-tx-empty">No transactions yet. Your first session will appear here.</div>
            ) : (
              transactions.map(tx => (
                <div className="wallet-tx-item" key={tx.id}>
                  <div className={`wallet-tx-dot wallet-tx-dot--${tx.type}`} />
                  <div className="wallet-tx-info">
                    <span className="wallet-tx-desc">{tx.desc}</span>
                    <span className="wallet-tx-date">{tx.date}</span>
                  </div>
                  <div className="wallet-tx-amounts">
                    <span className={`wallet-tx-amount wallet-tx-amount--${tx.type}`}>
                      {tx.type === 'credit' ? '+' : ''}{tx.amount.toFixed(2)}
                    </span>
                    <span className="wallet-tx-balance">${tx.balance.toFixed(2)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Quick actions ── */}
        <div className="wallet-quick-actions">
          <button className="btn-primary wallet-cta-btn" onClick={() => navigate('/setup/demo-session')}>
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
        <div className="modal-overlay" onClick={() => !topping && setShowTopUp(false)}>
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
              <span className="topup-current__val">${balance.toFixed(2)}</span>
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
              Adding <strong>${finalAmount || '—'}</strong> → new balance will be <strong>${(balance + (finalAmount || 0)).toFixed(2)}</strong>
            </div>

            <button
              className="btn-primary"
              style={{ width: '100%', marginTop: '16px' }}
              onClick={handleTopUp}
              disabled={topping || !finalAmount || finalAmount < 1}
            >
              {topping ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <span className="spinner-sm" />
                  Connecting to Agnic Checkout…
                </span>
              ) : `Continue to Agnic Checkout →`}
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
