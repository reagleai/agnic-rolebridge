/**
 * RoleBridge V2 - Setup Page
 * Block 2: Wired to real V2 backend.
 *
 * Three resume input modes: PDF upload | Paste text | Import from Profile
 * All sections unlocked. Question count slider (6–15).
 * Balance preflight check. Real backend calls via v2CreateSession + v2SetupSession.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { v2CreateSession, v2SetupSession, getBalance } from '../lib/api';
import { extractTextFromPDF } from '../lib/pdfExtractor';

const SECTION_OPTIONS = [
  { value: 'Work Experience', label: 'Work Experience' },
  { value: 'Projects', label: 'Projects' },
  { value: 'Skills', label: 'Skills' },
  { value: 'Full Resume', label: 'Full Resume' },
];

// Resume input modes
const RESUME_MODES = [
  { key: 'pdf', label: 'Upload PDF' },
  { key: 'paste', label: 'Paste Text' },
  { key: 'profile', label: 'Import from Profile' },
];

export default function SetupPage() {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  // Auth state from localStorage (V2)
  const authUser = (() => {
    try { return JSON.parse(localStorage.getItem('rb_v2_user') || 'null'); } catch { return null; }
  })();

  // Profile from localStorage cache (synced by ProfilePage from v2-profile API)
  const savedProfile = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem('rb_v2_profile') || 'null');
      if (!raw) return null;
      // Normalize: API returns snake_case, legacy was camelCase
      return {
        name: raw.name || null,
        resumeText: raw.resume_text || raw.resumeText || null,
        pdfName: raw.pdf_name || raw.pdfName || null,
      };
    } catch { return null; }
  })();

  const [balance, setBalance] = useState(() => {
    try {
      const b = localStorage.getItem('rb_v2_balance');
      return b !== null ? parseFloat(b) : 5.00;
    } catch { return 5.00; }
  });

  const [resumeMode, setResumeMode] = useState(savedProfile?.resumeText ? 'profile' : 'pdf');
  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState('');
  const [sectionName, setSectionName] = useState('Work Experience');
  const [questionCount, setQuestionCount] = useState(6);
  const [pdfName, setPdfName] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [savingPdf, setSavingPdf] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);

  useEffect(() => {
    if (!authUser) navigate('/', { replace: true });
  }, [authUser, navigate]);

  // Resolved resume text (depends on mode)
  const activeResumeText =
    resumeMode === 'profile' ? (savedProfile?.resumeText || '') : resumeText;

  // ── Fetch real balance on mount ──
  const fetchBalance = useCallback(async () => {
    try {
      const data = await getBalance();
      if (data.balance !== undefined && data.balance !== null) {
        const b = parseFloat(data.balance);
        if (!isNaN(b)) {
          setBalance(b);
          localStorage.setItem('rb_v2_balance', b.toString());
        }
      }
    } catch {
      // Use cached balance if fetch fails
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // ── Listen for top-up completion ──
  useEffect(() => {
    const onMessage = (ev) => {
      if (ev.origin !== 'https://app.agnic.ai') return;
      if (ev.data?.type === 'agnic:topup_complete') {
        fetchBalance();
        setShowTopUpModal(false);
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
      params.delete('topup');
      params.delete('session_id');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [fetchBalance]);

  const handleFile = async (file) => {
    setPdfError('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setPdfError('PDF is too large (max 5MB).');
      return;
    }
    setPdfName(file.name);
    setSavingPdf(true);

    try {
      const text = await extractTextFromPDF(file);
      setResumeText(text.trim());
    } catch (err) {
      console.error('PDF extraction error:', err);
      setPdfError('Could not extract text from this PDF. Please use "Paste Text" mode instead.');
      setPdfName('');
    } finally {
      setSavingPdf(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer?.files?.[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const finalResume = activeResumeText;
    if (!finalResume || finalResume.length < 50) {
      if (resumeMode === 'profile') {
        setError('Your profile resume is empty. Please add your resume in your profile first.');
      } else {
        setError('Please upload a resume or paste resume text (min 50 characters).');
      }
      return;
    }
    if (finalResume.length > 50000) {
      setError('Resume text is too long (max 50,000 characters). Please condense it.');
      return;
    }
    if (jdText.length < 50) {
      setError('Job description must be at least 50 characters.');
      return;
    }
    if (jdText.length > 50000) {
      setError('Job description is too long (max 50,000 characters). Please condense it.');
      return;
    }

    // Pre-flight balance check
    if (balance < 1.00) {
      setShowTopUpModal(true);
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create a new session
      const sessionData = await v2CreateSession();
      const sessionId = sessionData.session_id;

      // Step 2: Setup the session with resume, JD, section, and question count
      const setupResult = await v2SetupSession(sessionId, {
        resume_text: finalResume,
        jd_text: jdText,
        section_name: sectionName,
        question_count: questionCount,
      });

      // Navigate to interview with real data
      navigate(`/interview/${sessionId}`, {
        state: {
          email: authUser.email,
          sectionName: setupResult.section_name || sectionName,
          questionCount: setupResult.question_count || questionCount,
          firstQuestion: setupResult.first_question,
          sessionStart: setupResult.session_start,
          sessionExpiresAt: setupResult.session_expires_at,
        },
      });
    } catch (err) {
      setLoading(false);
      console.error('Setup error:', err);

      if (err.status === 402) {
        setShowTopUpModal(true);
        return;
      }
      if (err.status === 401) {
        setError('Your session has expired. Please sign in again.');
        return;
      }

      // Extract user-friendly message
      const msg = err.data?.message || err.message || 'Failed to set up session. Please try again.';
      setError(msg);
    }
  };

  const handleTopUp = () => {
    const clientId = import.meta.env.VITE_AGNIC_CLIENT_ID;
    if (!clientId) {
      setError('Top-up is not configured. Please contact support.');
      return;
    }

    const returnUrl = `${window.location.origin}${window.location.pathname}`;
    const base = 'https://app.agnic.ai/topup';
    const url = `${base}?client_id=${encodeURIComponent(clientId)}&return_url=${encodeURIComponent(returnUrl)}`;

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

  const estimatedCost =
    questionCount <= 6 ? '$0.15–0.20' :
      questionCount <= 10 ? '$0.20–0.30' : '$0.30–0.45';

  const hasProfileResume = Boolean(savedProfile?.resumeText);
  const profilePdfName = savedProfile?.pdfName || null;

  if (!authUser) return null;

  return (
    <div className="page-center">
      <div className="card setup-card">
        <h2 className="setup-title">Prepare Your Interview</h2>
        <p className="setup-subtitle">
          Add your resume, paste the target JD, pick a section and question count.
        </p>

        <form onSubmit={handleSubmit} className="setup-form">

          {/* ── Resume Input Mode Tabs ── */}
          <div className="form-group">
            <label className="form-label">Resume Source</label>
            <div className="resume-mode-tabs">
              {RESUME_MODES.map(mode => (
                <button
                  key={mode.key}
                  type="button"
                  className={`resume-mode-tab ${resumeMode === mode.key ? 'active' : ''} ${mode.key === 'profile' && !hasProfileResume ? 'resume-mode-tab--disabled' : ''}`}
                  onClick={() => {
                    if (mode.key === 'profile' && !hasProfileResume) return;
                    setResumeMode(mode.key);
                    setPdfError('');
                    setError('');
                  }}
                  title={mode.key === 'profile' && !hasProfileResume ? 'Add a resume to your profile first' : ''}
                >
                  {mode.key === 'pdf' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  )}
                  {mode.key === 'paste' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
                      <path d="M17 6.1H3M21 12.1H3M15.1 18H3" />
                    </svg>
                  )}
                  {mode.key === 'profile' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                  {mode.label}
                  {mode.key === 'profile' && !hasProfileResume && (
                    <span className="resume-mode-tab__lock">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '11px', height: '11px' }}>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                  )}
                  {mode.key === 'profile' && hasProfileResume && (
                    <span className="resume-mode-tab__ready">✓</span>
                  )}
                </button>
              ))}
            </div>

            {/* No profile resume hint */}
            {!hasProfileResume && (
              <p className="resume-mode-hint">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '13px', height: '13px', flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  Save your resume in your{' '}
                  <Link to="/profile" className="resume-mode-hint__link">Profile</Link>
                  {' '}to enable one-click import here.
                </span>
              </p>
            )}
          </div>

          {/* ── PDF Upload (pdf mode) ── */}
          {resumeMode === 'pdf' && (
            <div className="form-group">
              <div
                className={`drop-zone ${pdfName ? 'drop-zone--filled' : ''}`}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Upload PDF resume"
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files?.[0])}
                />
                {savingPdf ? (
                  <span className="drop-zone-hint">
                    <span className="spinner" style={{ width: '20px', height: '20px', margin: '0 auto 4px' }} />
                    Extracting text…
                  </span>
                ) : pdfName ? (
                  <span className="drop-zone-name">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                    {pdfName}
                    <span className="drop-zone-check">✓</span>
                  </span>
                ) : (
                  <span className="drop-zone-hint">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '24px', height: '24px', marginBottom: '8px', opacity: 0.4 }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Drop PDF here or click to upload
                  </span>
                )}
              </div>
              {pdfError && <p className="form-error">{pdfError}</p>}

              {/* Extracted preview */}
              {resumeText && pdfName && (
                <div className="form-group" style={{ marginTop: '12px', marginBottom: 0 }}>
                  <label className="form-label">Extracted text preview</label>
                  <div className="text-preview" style={{ whiteSpace: 'pre-wrap' }}>{resumeText}</div>
                </div>
              )}
            </div>
          )}

          {/* ── Paste Text (paste mode) ── */}
          {resumeMode === 'paste' && (
            <div className="form-group">
              <textarea
                className="form-textarea"
                placeholder="Paste your resume text here (min 50 characters)…"
                value={resumeText}
                maxLength={50000}
                onChange={e => setResumeText(e.target.value)}
                rows={7}
              />
              <span className="char-count">{resumeText.length} / 50000 chars</span>
            </div>
          )}

          {/* ── Import from Profile (profile mode) ── */}
          {resumeMode === 'profile' && hasProfileResume && (
            <div className="profile-import-preview">
              <div className="profile-import-preview__header">
                <div className="profile-import-preview__icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div className="profile-import-preview__info">
                  <span className="profile-import-preview__name">
                    {savedProfile?.name || authUser?.email}
                  </span>
                  {profilePdfName && (
                    <span className="profile-import-preview__file">{profilePdfName}</span>
                  )}
                </div>
                <span className="profile-import-preview__badge">✓ Imported</span>
              </div>
              <div className="profile-import-preview__text">{savedProfile.resumeText}</div>
              <Link to="/profile" className="profile-import-preview__edit">
                Edit profile resume →
              </Link>
            </div>
          )}

          {/* ── JD ── */}
          <div className="form-group">
            <label className="form-label">Target Job Description</label>
            <textarea
              className="form-textarea"
              placeholder="Paste the job description here (min 50 characters)…"
              value={jdText}
              maxLength={50000}
              onChange={e => setJdText(e.target.value)}
              rows={5}
            />
            <span className="char-count">{jdText.length} / 50000 chars</span>
          </div>

          {/* ── Section ── */}
          <div className="form-group">
            <label className="form-label">Resume Section to Focus On</label>
            <select
              className="form-select"
              value={sectionName}
              onChange={e => setSectionName(e.target.value)}
            >
              {SECTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* ── Question Count Slider ── */}
          <div className="form-group">
            <label className="form-label">
              Number of Questions
              <span className="form-label-badge">{questionCount} questions</span>
            </label>
            <div className="slider-wrapper">
              <input
                type="range"
                min={6}
                max={15}
                value={questionCount}
                onChange={e => setQuestionCount(parseInt(e.target.value))}
                className="question-slider"
                id="question-count-slider"
              />
              <div className="slider-labels">
                <span>6</span>
                <span>15</span>
              </div>
            </div>
            <div className="slider-estimate">
              Estimated cost: <strong>{estimatedCost}</strong> from your Agnic wallet
              <span className="slider-balance"> · Balance: ${typeof balance === 'number' && !isNaN(balance) ? balance.toFixed(2) : '...'}</span>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
                <span className="spinner-sm" />
                Generating {questionCount} questions…
              </span>
            ) : `Start Interview →`}
          </button>
        </form>
      </div>

      {/* ── Low Balance / Top-Up Modal ── */}
      {showTopUpModal && (
        <div className="modal-overlay" onClick={() => setShowTopUpModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-icon modal-icon--warn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '32px', height: '32px' }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="modal-title">Low Wallet Balance</h3>
            <p className="modal-body">
              Your current balance is <strong>${typeof balance === 'number' && !isNaN(balance) ? balance.toFixed(2) : '0.00'}</strong>. A minimum of <strong>$1.00</strong> is required to start a session.
            </p>
            <div className="modal-actions">
              <button className="btn-agnic-signin" onClick={handleTopUp} style={{ width: '100%' }}>
                <span className="btn-agnic-inner"> Add Credits via Agnic</span>
              </button>
              <button className="btn-ghost" onClick={() => setShowTopUpModal(false)} style={{ width: '100%', marginTop: '8px' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
