/**
 * RoleBridge V2 — End Page
 * Block 4: Wired to real V2 backend.
 *
 * Fixes:
 * - Issue #4: Direct URL access shows redirect if no valid session
 * - Issue #8: Auth guard — redirects unauthenticated users
 *
 * Features:
 * - Polls v2-report endpoint until report is ready
 * - Renders real 6-dimension report on-screen
 * - Shows email confirmation when report is sent
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { v2GetReport, v2RetryReport } from '../lib/api';

function ScoreRing({ score, size = 64 }) {
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  const pct = score / 10;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--color-primary-highlight)" strokeWidth="5" />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={score >= 8 ? 'var(--color-primary)' : score >= 6 ? 'var(--color-warning)' : 'var(--color-error)'}
        strokeWidth="5"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
    </svg>
  );
}

export default function EndPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const email = location.state?.email || '';
  const sessionId = location.state?.sessionId || null;
  const sectionName = location.state?.sectionName || 'Work Experience';
  const questionCount = location.state?.questionCount || 0;

  // Auth check
  const authUser = (() => {
    try { return JSON.parse(localStorage.getItem('rb_v2_user') || 'null'); } catch { return null; }
  })();

  const [report, setReport] = useState(null);
  const [reportStatus, setReportStatus] = useState('loading'); // loading | pending | processing | ready | failed | no_session
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');
  const [pollCount, setPollCount] = useState(0);

  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  // ── Auth guard (Issue #8) ──
  useEffect(() => {
    if (!authUser) {
      navigate('/', { replace: true });
    }
  }, [authUser, navigate]);

  // ── Direct URL access guard ──
  useEffect(() => {
    if (!sessionId) {
      navigate(authUser ? '/setup/new' : '/', { replace: true });
    }
  }, [authUser, sessionId, navigate]);

  // ── Poll for report ──
  const fetchReport = useCallback(async () => {
    if (!sessionId || !mountedRef.current) return;

    try {
      const data = await v2GetReport(sessionId);
      if (!mountedRef.current) return;

      if (data.status === 'ready' && data.report) {
        setReport(data.report);
        setReportStatus('ready');
        setEmailSent(data.email_sent || false);
        // Stop polling
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else if (data.status === 'failed') {
        setReportStatus('failed');
        setError('Report generation failed. Please try again or contact support.');
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else {
        setReportStatus(data.status || 'pending');
      }
    } catch (err) {
      if (!mountedRef.current) return;

      if (err.status === 404) {
        // Report not yet created — keep polling
        setReportStatus('pending');
      } else if (err.status === 401) {
        navigate('/', { replace: true });
      } else {
        console.error('Report fetch error:', err);
        // Keep polling — may be transient
      }
      setPollCount(c => c + 1);
    }
  }, [sessionId, navigate]);

  useEffect(() => {
    mountedRef.current = true;

    if (!sessionId) return;

    // ── FRONTEND SAFEGUARD ──
    // Forcefully start the worker from the frontend.
    // If the backend background task failed to start, this explicitly catches it.
    // If the backend task already started, this gracefully returns 202 immediately.
    v2RetryReport(sessionId).catch(() => {});

    // Initial fetch
    fetchReport();

    // Poll every 3 seconds until report is ready
    pollRef.current = setInterval(fetchReport, 3000);

    // Stop polling after 90 seconds (safety)
    const timeout = setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (mountedRef.current && reportStatus !== 'ready') {
        setReportStatus('failed');
        setError('Report generation timed out. It may still be processing — check your email.');
      }
    }, 90_000);

    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
      clearTimeout(timeout);
    };
  }, [sessionId, fetchReport]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetryReport = async () => {
    setReportStatus('pending');
    setError('');
    setPollCount(0);

    // Directly invoke report worker with session_id (retry support)
    try {
      await v2RetryReport(sessionId);
    } catch (err) {
      console.warn('Retry report request failed:', err);
    }

    // Re-start polling
    fetchReport();
    if (!pollRef.current) {
      pollRef.current = setInterval(fetchReport, 3000);
      // Safety timeout
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (mountedRef.current && reportStatus !== 'ready') {
          setReportStatus('failed');
          setError('Report generation timed out. It may still be processing — check your email.');
        }
      }, 90_000);
    }
  };

  const handleRestart = () => {
    navigate('/setup/new', { state: { email: authUser?.email || email } });
  };

  if (!authUser) return null;

  // ── No session guard (Issue #4) ──
  if (reportStatus === 'no_session') {
    return (
      <div className="page-center">
        <div className="card" style={{ textAlign: 'center', padding: '48px 32px', maxWidth: '420px' }}>
          <div className="modal-icon modal-icon--warn" style={{ margin: '0 auto 16px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '32px', height: '32px' }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="modal-title" style={{ marginBottom: '8px' }}>No Session Found</h3>
          <p className="modal-body">
            This page requires a completed interview session. Start a new session to get your report.
          </p>
          <button className="btn-primary" onClick={() => navigate('/setup/new')} style={{ marginTop: '16px' }}>
            Start New Session
          </button>
        </div>
      </div>
    );
  }

  // ── Normalize report data for rendering ──
  const dims = report ? [
    { name: "Clarity", key: "clarity", ...report.dimensions?.clarity },
    { name: "Evidence", key: "evidence", ...report.dimensions?.evidence },
    { name: "Ownership", key: "ownership", ...report.dimensions?.ownership },
    { name: "Role-Language Transition", key: "role_language_transition", ...report.dimensions?.role_language_transition },
    { name: "Relevance", key: "relevance", ...report.dimensions?.relevance },
    { name: "Coherence", key: "coherence", ...report.dimensions?.coherence },
  ] : [];

  return (
    <div className="end-page">
      {/* ── Header ── */}
      <div className="end-header">
        <div className="end-header__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '40px', height: '40px' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h1 className="end-header__title">Interview Complete</h1>
        <p className="end-header__meta">
          Section: <strong>{sectionName}</strong>
          {questionCount > 0 && <> · {questionCount} questions answered</>}
        </p>
        {emailSent && (
          <div className="end-email-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
            </svg>
            Report sent to {authUser.email || email}
          </div>
        )}
      </div>

      {/* ── Report loading ── */}
      {(reportStatus === 'loading' || reportStatus === 'pending' || reportStatus === 'processing') && (
        <div className="report-loading">
          <div className="evaluating-pulse">
            <div className="evaluating-dot" style={{ animationDelay: '0ms' }} />
            <div className="evaluating-dot" style={{ animationDelay: '150ms' }} />
            <div className="evaluating-dot" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="evaluating-text">
            {reportStatus === 'processing'
              ? 'Generating your evaluation report…'
              : pollCount > 10
                ? 'Still working on your report — this is taking longer than usual…'
                : 'Preparing report generation…'}
          </p>
          <span className="evaluating-sub">Gemini Flash · Agnic AI Gateway</span>
          {pollCount > 10 && (
            <button className="btn-ghost" onClick={handleRetryReport} style={{ marginTop: '16px' }}>
              Retry Report Generation
            </button>
          )}
        </div>
      )}

      {/* ── Report failed ── */}
      {reportStatus === 'failed' && (
        <div className="report-loading">
          <div className="modal-icon modal-icon--warn" style={{ margin: '0 auto 16px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '32px', height: '32px' }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="evaluating-text">{error || 'Report generation failed.'}</p>
          <button className="btn-primary" onClick={handleRetryReport} style={{ marginTop: '16px' }}>
            Retry Report Generation
          </button>
          <button className="btn-ghost" onClick={handleRestart} style={{ marginTop: '8px' }}>
            Start New Session
          </button>
        </div>
      )}

      {/* ── Full Report ── */}
      {reportStatus === 'ready' && report && (
        <div className="report-container report-container--visible">

          {/* Summary */}
          <div className="report-summary">
            <p className="report-summary__text">"{report.opening_summary}"</p>
          </div>

          {/* Overall score */}
          <div className="report-overall">
            <div className="report-overall__ring">
              <ScoreRing score={report.overall_impression?.score || 0} size={120} />
              <div className="report-overall__score-overlay">
                <span className="report-overall__num">{report.overall_impression?.score || 0}</span>
                <span className="report-overall__denom">/10</span>
              </div>
            </div>
            <div className="report-overall__label">Overall Impression</div>
          </div>

          {/* 6 Dimensions */}
          <h3 className="report-section-heading">Dimension Scores</h3>
          <div className="report-dimensions">
            {dims.map((d, i) => (
              <div key={i} className={`report-dim ${d.flag === 'soft_flag' || d.flag === 'hard_flag' ? 'report-dim--flagged' : ''}`}>
                <div className="report-dim__header">
                  <div className="report-dim__score-row">
                    <ScoreRing score={d.score || 0} size={64} />
                    <div className="report-dim__score-num-wrap">
                      <span className="report-dim__score-num">{d.score || 0}</span>
                      <span className="report-dim__score-denom">/10</span>
                    </div>
                  </div>
                  <div className="report-dim__info">
                    <div className="report-dim__name">
                      {d.name}
                      {(d.flag === 'soft_flag' || d.flag === 'hard_flag') && (
                        <span className="report-dim__flag">
                          ⚑ {d.flag === 'hard_flag' ? 'Critical' : 'Needs work'}
                        </span>
                      )}
                    </div>
                    <p className="report-dim__why">{d.why}</p>
                  </div>
                </div>
                {d.transcript_evidence && (
                  <div className="report-dim__evidence">
                    <span className="report-dim__evidence-label">Evidence from transcript:</span>
                    <span className="report-dim__evidence-text">{d.transcript_evidence}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Strengths / Weaknesses / Improvements */}
          <div className="report-swi">
            <div className="report-swi__col">
              <h4 className="report-swi__heading report-swi__heading--strength">Strengths</h4>
              <ul className="report-swi__list">
                {(report.overall_impression?.strengths || []).map((s, i) => (
                  <li key={i} className="report-swi__item">
                    <span className="report-swi__marker report-swi__marker--strength">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="report-swi__col">
              <h4 className="report-swi__heading report-swi__heading--weak">Weaknesses</h4>
              <ul className="report-swi__list">
                {(report.overall_impression?.weaknesses || []).map((w, i) => (
                  <li key={i} className="report-swi__item">
                    <span className="report-swi__marker report-swi__marker--weak">✗</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
            <div className="report-swi__col">
              <h4 className="report-swi__heading report-swi__heading--improve">Points to Improve</h4>
              <ul className="report-swi__list">
                {(report.overall_impression?.points_to_improve || []).map((p, i) => (
                  <li key={i} className="report-swi__item">
                    <span className="report-swi__marker report-swi__marker--improve">→</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Actions */}
          <div className="report-actions">
            <button className="btn-agnic-signin" onClick={handleRestart} style={{ minWidth: '200px' }}>
              <span className="btn-agnic-inner">Run Another Session</span>
            </button>
            <p className="report-actions__note">
              Report saved to your account
              {emailSent && <> · Also sent to {authUser.email || email}</>}
            </p>
          </div>
        </div>
      )}

      <footer className="landing-footer">
        <div className="landing-footer__main">RoleBridge — Interview pressure-testing for career-transition candidates.</div>
        <div className="landing-footer__sub">
          Powered by Agnic · Built by Ajay Sharma ·{' '}
          <a href="https://www.linkedin.com/in/workwithajay/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </div>
      </footer>
    </div>
  );
}
