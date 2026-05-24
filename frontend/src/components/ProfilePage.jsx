/**
 * RoleBridge V2 - Profile Page
 * Block 6: Wired to real V2 backend.
 *
 * Features:
 * - Loads profile from v2-profile on mount
 * - Saves via PUT /v2-profile
 * - Clears via DELETE /v2-profile
 * - Real PDF extraction via pdfExtractor
 * - Auth from localStorage
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { v2GetProfile, v2SaveProfile, v2DeleteProfile } from '../lib/api';
import { extractTextFromPDF } from '../lib/pdfExtractor';

export default function ProfilePage() {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const authUser = (() => {
    try { return JSON.parse(localStorage.getItem('rb_v2_user') || 'null'); } catch { return null; }
  })();

  // ── Auth guard ──
  useEffect(() => {
    if (!authUser) navigate('/', { replace: true });
  }, [authUser, navigate]);

  // ── Form state ──
  const [name, setName] = useState('');
  const [email, setEmail] = useState(authUser?.email || '');
  const [headline, setHeadline] = useState('');
  const [yearsExp, setYearsExp] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [saveError, setSaveError] = useState('');

  // ── Load profile from API on mount ──
  const loadProfile = useCallback(async () => {
    try {
      const data = await v2GetProfile();
      const p = data.profile;
      if (p) {
        setName(p.name || '');
        setHeadline(p.headline || '');
        setYearsExp(p.years_exp || '');
        setCurrentRole(p.current_role || '');
        setTargetRole(p.target_role || '');
        setLinkedin(p.linkedin_url || '');
        setResumeText(p.resume_text || '');
        setPdfName(p.pdf_name || '');
        setNotes(p.transition_notes || '');
      }
    } catch (err) {
      console.error('Profile load error:', err);
      if (err.status === 401) {
        navigate('/', { replace: true });
        return;
      }
      // Fallback to localStorage cache
      try {
        const cached = JSON.parse(localStorage.getItem('rb_v2_profile') || 'null');
        if (cached) {
          setName(cached.name || '');
          setHeadline(cached.headline || '');
          setYearsExp(cached.years_exp || cached.yearsExp || '');
          setCurrentRole(cached.current_role || cached.currentRole || '');
          setTargetRole(cached.target_role || cached.targetRole || '');
          setLinkedin(cached.linkedin_url || cached.linkedin || '');
          setResumeText(cached.resume_text || cached.resumeText || '');
          setPdfName(cached.pdf_name || cached.pdfName || '');
          setNotes(cached.transition_notes || cached.notes || '');
        }
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ── PDF handling ──
  const handleFile = async (file) => {
    if (!file) return;
    setPdfError('');
    if (file.size > 5 * 1024 * 1024) { setPdfError('PDF is too large (max 5MB).'); return; }
    setSavingPdf(true);
    setPdfName(file.name);

    try {
      const text = await extractTextFromPDF(file);
      if (text && text.length > 20) {
        setResumeText(text);
      } else {
        setPdfError('Could not extract text from PDF. Please paste your resume manually.');
      }
    } catch (err) {
      console.error('PDF extraction error:', err);
      setPdfError('Failed to extract text from PDF. Please paste manually.');
    } finally {
      setSavingPdf(false);
    }
  };

  // ── Save profile ──
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError('');

    if (resumeText && resumeText.length > 50000) {
      setSaveError('Resume text is too long (max 50,000 characters). Please condense it.');
      setSaving(false);
      return;
    }

    const payload = {
      name: name || null,
      headline: headline || null,
      years_exp: yearsExp || null,
      current_role: currentRole || null,
      target_role: targetRole || null,
      linkedin_url: linkedin || null,
      resume_text: resumeText || null,
      pdf_name: pdfName || null,
      transition_notes: notes || null,
    };

    try {
      const data = await v2SaveProfile(payload);

      // Cache locally for offline / fast load
      localStorage.setItem('rb_v2_profile', JSON.stringify(payload));

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Profile save error:', err);
      if (err.status === 401) {
        navigate('/', { replace: true });
        return;
      }
      setSaveError(err.data?.message || 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Clear profile ──
  const handleClear = async () => {
    if (!window.confirm('Clear all profile data? This cannot be undone.')) return;

    try {
      await v2DeleteProfile();
      localStorage.removeItem('rb_v2_profile');
      setName(''); setHeadline(''); setYearsExp(''); setCurrentRole('');
      setTargetRole(''); setLinkedin(''); setResumeText(''); setPdfName(''); setNotes('');
    } catch (err) {
      console.error('Profile clear error:', err);
      // Clear locally anyway
      localStorage.removeItem('rb_v2_profile');
      setName(''); setHeadline(''); setYearsExp(''); setCurrentRole('');
      setTargetRole(''); setLinkedin(''); setResumeText(''); setPdfName(''); setNotes('');
    }
  };

  if (!authUser) return null;

  const completionFields = [name, email, headline, yearsExp, currentRole, targetRole, resumeText];
  const completionPct = Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100);

  if (loading) {
    return (
      <div className="page-center">
        <div className="card" style={{ textAlign: 'center', padding: '48px 32px', maxWidth: '420px' }}>
          <div className="evaluating-pulse" style={{ marginBottom: '20px' }}>
            <div className="evaluating-dot" style={{ animationDelay: '0ms' }} />
            <div className="evaluating-dot" style={{ animationDelay: '150ms' }} />
            <div className="evaluating-dot" style={{ animationDelay: '300ms' }} />
          </div>
          <h3 className="modal-title" style={{ marginBottom: '8px' }}>Loading profile…</h3>
        </div>
      </div>
    );
  }

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
              ✓ Profile complete - you can import your resume in Setup
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
                  value={email}
                  disabled
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                  title="Email is managed by your Agnic account"
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
                placeholder="Anything specific about your transition context - e.g. moving from IC to leadership, changing industry, returning after a gap…"
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
              Save your resume here once - then import it with one click in any interview setup, without re-uploading every time.
            </p>

            {/* PDF upload */}
            <div className="form-group">
              <label className="form-label">Upload Resume PDF</label>
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
                aria-label="Upload Resume PDF"
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
                maxLength={50000}
                onChange={e => setResumeText(e.target.value)}
                rows={10}
              />
              <span className="char-count">{resumeText.length} / 50000 chars</span>
            </div>
          </div>

          {/* Actions */}
          <div className="profile-actions">
            {saveError && <p className="form-error" style={{ marginBottom: '12px', textAlign: 'center' }}>{saveError}</p>}

            <button type="submit" className="btn-primary profile-save-btn" disabled={saving}>
              {saving ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="spinner-sm" />
                  Saving…
                </span>
              ) : saved ? (
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
              onClick={() => navigate('/setup/new')}
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
