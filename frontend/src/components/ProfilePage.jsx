/**
 * RoleBridge V2 — Profile Page (Prototype)
 * Saves: name, email, headline, years of experience, resume text, LinkedIn URL.
 * Persisted to sessionStorage for use in SetupPage ("Import from Profile").
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const PROFILE_KEY = 'rb_v2_profile';

function loadProfile() {
  try { return JSON.parse(sessionStorage.getItem(PROFILE_KEY) || 'null'); } catch { return null; }
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const authUser = (() => {
    try { return JSON.parse(sessionStorage.getItem('rb_v2_user') || 'null'); } catch { return null; }
  })();

  // Redirect to landing if not signed in
  useEffect(() => {
    if (!authUser) navigate('/');
  }, [authUser, navigate]);

  const existing = loadProfile();

  const [name, setName] = useState(existing?.name || '');
  const [email, setEmail] = useState(existing?.email || authUser?.email || '');
  const [headline, setHeadline] = useState(existing?.headline || '');
  const [yearsExp, setYearsExp] = useState(existing?.yearsExp || '');
  const [currentRole, setCurrentRole] = useState(existing?.currentRole || '');
  const [targetRole, setTargetRole] = useState(existing?.targetRole || '');
  const [linkedin, setLinkedin] = useState(existing?.linkedin || '');
  const [resumeText, setResumeText] = useState(existing?.resumeText || '');
  const [pdfName, setPdfName] = useState(existing?.pdfName || '');
  const [notes, setNotes] = useState(existing?.notes || '');

  const [saved, setSaved] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const handleFile = (file) => {
    if (!file) return;
    setPdfError('');
    if (file.size > 5 * 1024 * 1024) { setPdfError('PDF is too large (max 5MB).'); return; }
    setSavingPdf(true);
    setPdfName(file.name);
    setTimeout(() => {
      setResumeText(`[Extracted from ${file.name}]\n\nSenior Product Manager — Acme Corp (2021–2024)\n• Led a cross-functional team of 8 to redesign the onboarding flow, increasing activation rate by 34%.\n• Launched 3 major product features in partnership with engineering and design.\n• Defined OKRs and aligned roadmap with company strategy.\n\nProduct Manager — StartupXYZ (2018–2021)\n• Owned the analytics dashboard from 0 to 10,000 users.\n• Reduced customer churn by 18% through targeted feature improvements.\n• Worked closely with customers to define requirements and iterate on the product.`);
      setSavingPdf(false);
    }, 700);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const profile = { name, email, headline, yearsExp, currentRole, targetRole, linkedin, resumeText, pdfName, notes };
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    // Also sync email to auth user
    sessionStorage.setItem('rb_v2_user', JSON.stringify({ ...authUser, email }));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleClear = () => {
    if (!window.confirm('Clear all profile data?')) return;
    sessionStorage.removeItem(PROFILE_KEY);
    setName(''); setHeadline(''); setYearsExp(''); setCurrentRole('');
    setTargetRole(''); setLinkedin(''); setResumeText(''); setPdfName(''); setNotes('');
  };

  const completionFields = [name, email, headline, yearsExp, currentRole, targetRole, resumeText];
  const completionPct = Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100);

  return (
    <div className="profile-page">
      <div className="profile-container">

        {/* ── Header ── */}
        <div className="profile-header">
          <div className="profile-avatar">
            <span className="profile-avatar__initials">
              {name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : email?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <div className="profile-header__info">
            <h1 className="profile-header__name">{name || 'Your Profile'}</h1>
            <p className="profile-header__sub">{headline || 'Add your headline below'}</p>
          </div>
        </div>

        {/* ── Completion bar ── */}
        <div className="profile-completion">
          <div className="profile-completion__label">
            Profile completeness
            <span className="profile-completion__pct">{completionPct}%</span>
          </div>
          <div className="profile-completion__track">
            <div
              className="profile-completion__fill"
              style={{
                width: `${completionPct}%`,
                background: completionPct === 100 ? 'var(--color-primary)' : completionPct >= 60 ? 'var(--color-warning)' : 'var(--color-error)',
              }}
            />
          </div>
          {completionPct === 100 && (
            <p className="profile-completion__note profile-completion__note--done">
              ✓ Profile complete — you can import your resume in Setup
            </p>
          )}
          {completionPct < 100 && (
            <p className="profile-completion__note">
              Complete your profile to enable one-click resume import in Setup
            </p>
          )}
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSave} className="profile-form">

          {/* Section: Personal Details */}
          <div className="profile-section">
            <div className="profile-section__heading">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              Personal Details
            </div>

            <div className="profile-row">
              <div className="form-group profile-form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Alex Johnson"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div className="form-group profile-form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="alex@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Professional Headline</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Senior Product Manager transitioning to Head of Product"
                value={headline}
                onChange={e => setHeadline(e.target.value)}
              />
            </div>

            <div className="profile-row">
              <div className="form-group profile-form-group">
                <label className="form-label">Years of Experience</label>
                <select className="form-select" value={yearsExp} onChange={e => setYearsExp(e.target.value)}>
                  <option value="">Select…</option>
                  <option value="0-2">0–2 years</option>
                  <option value="3-5">3–5 years</option>
                  <option value="6-10">6–10 years</option>
                  <option value="10+">10+ years</option>
                </select>
              </div>
              <div className="form-group profile-form-group">
                <label className="form-label">LinkedIn URL</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://linkedin.com/in/yourname"
                  value={linkedin}
                  onChange={e => setLinkedin(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section: Career Focus */}
          <div className="profile-section">
            <div className="profile-section__heading">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              Career Transition Focus
            </div>

            <div className="profile-row">
              <div className="form-group profile-form-group">
                <label className="form-label">Current / Last Role</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Senior PM at Acme Corp"
                  value={currentRole}
                  onChange={e => setCurrentRole(e.target.value)}
                />
              </div>
              <div className="form-group profile-form-group">
                <label className="form-label">Target Role</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Head of Product at a Series B startup"
                  value={targetRole}
                  onChange={e => setTargetRole(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Transition Notes <span className="form-label-optional">(optional)</span></label>
              <textarea
                className="form-textarea"
                placeholder="Anything specific about your transition context — e.g. moving from IC to leadership, changing industry, returning after a gap…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {/* Section: Saved Resume */}
          <div className="profile-section">
            <div className="profile-section__heading">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              Saved Resume
              {resumeText && <span className="profile-section__badge">✓ Saved</span>}
            </div>

            <p className="profile-section__desc">
              Save your resume here once — then import it with one click in any interview setup, without re-uploading every time.
            </p>

            {/* PDF upload */}
            <div className="form-group">
              <label className="form-label">Upload Resume PDF</label>
              <div
                className={`drop-zone ${pdfName ? 'drop-zone--filled' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer?.files?.[0]); }}
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '24px', height: '24px', marginBottom: '6px', opacity: 0.4 }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Drop PDF here or click to upload
                  </span>
                )}
              </div>
              {pdfError && <p className="form-error">{pdfError}</p>}
            </div>

            {/* Resume text */}
            <div className="form-group">
              <label className="form-label">
                Resume Text
                {pdfName && resumeText && <span className="form-label-badge">Auto-extracted</span>}
              </label>
              <textarea
                className="form-textarea"
                placeholder="Your resume text will appear here after PDF upload, or paste it directly…"
                value={resumeText}
                onChange={e => setResumeText(e.target.value)}
                rows={10}
              />
              <span className="char-count">{resumeText.length} chars</span>
            </div>
          </div>

          {/* Actions */}
          <div className="profile-actions">
            <button type="submit" className="btn-primary profile-save-btn">
              {saved ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Profile Saved
                </span>
              ) : 'Save Profile'}
            </button>

            <button
              type="button"
              className="btn-primary profile-start-btn"
              onClick={() => navigate('/setup/demo-session', { state: { email } })}
              style={{ background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)' }}
            >
              Start Interview →
            </button>

            <button type="button" className="btn-ghost" onClick={handleClear} style={{ fontSize: '0.813rem', color: 'var(--color-error)' }}>
              Clear profile data
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
