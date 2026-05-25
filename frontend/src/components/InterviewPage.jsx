/**
 * RoleBridge V2 - Interview Page
 * Blocks 3+7: Wired to real V2 backend + Gladia STT.
 *
 * Fixes:
 * - Issue #1: "Quit Session" button added
 * - Issue #2: Browser back handled (pushState guard + beforeunload)
 * - Issue #3: Refresh rehydrates from v2-session-get
 *
 * Features:
 * - Real answer submission via v2-session-answers Edge Function
 * - 402 mid-session top-up with resume-after-topup
 * - Dynamic question count
 * - Real Gladia STT voice recording via useGladiaRecording hook
 * - Text input fallback
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { v2SubmitAnswer, v2GetSession, v2EndSession, v2SttSession, getBalance } from '../lib/api';
import useGladiaRecording from '../hooks/useGladiaRecording';

function formatTime(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function InterviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: sessionId } = useParams();

  // Auth check
  const authUser = (() => {
    try { return JSON.parse(localStorage.getItem('rb_v2_user') || 'null'); } catch { return null; }
  })();

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const [coreIndex, setCoreIndex] = useState(0);
  const [totalCore, setTotalCore] = useState(6);
  const [totalAsked, setTotalAsked] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState({ id: '', text: '', level: 0 });
  const [sectionName, setSectionName] = useState('Work Experience');

  const [inputMode, setInputMode] = useState('voice');
  const [textAnswer, setTextAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [sttInitializing, setSttInitializing] = useState(false);

  const [sessionSecs, setSessionSecs] = useState(0);
  const [answerSecs, setAnswerSecs] = useState(60);
  const [expiresAt, setExpiresAt] = useState(null);

  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState(null); // for 402 retry

  // ── Gladia STT hook ──
  const {
    startRecording: gladiaStart,
    stopRecording: gladiaStop,
    prepareAudioContext,
    teardownVoiceSession,
    finalTranscript,
    interimText,
    isRecording,
    error: sttError,
    setError: setSttError,
  } = useGladiaRecording();

  const sttWsUrlRef = useRef(null);
  const submittingRef = useRef(false);
  const answerTimerRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const gladiaTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  // ── Redirect if not authenticated ──
  useEffect(() => {
    if (!authUser) {
      navigate('/', { replace: true });
    }
  }, [authUser, navigate]);

  // ── Initialize session: try location.state first, then rehydrate from API ──
  useEffect(() => {
    mountedRef.current = true;

    const initFromState = () => {
      const st = location.state;
      if (st?.firstQuestion) {
        setCurrentQuestion({
          id: st.firstQuestion.id,
          text: st.firstQuestion.text,
          level: 0,
        });
        setTotalCore(st.firstQuestion.total_core || st.questionCount || 6);
        setSectionName(st.sectionName || 'Work Experience');
        setCoreIndex(0);
        setTotalAsked(0);

        if (st.sessionExpiresAt) {
          setExpiresAt(new Date(st.sessionExpiresAt));
          const remaining = Math.max(0, Math.floor((new Date(st.sessionExpiresAt).getTime() - Date.now()) / 1000));
          setSessionSecs(remaining);
        } else {
          setSessionSecs(10 * 60);
        }

        setLoading(false);
        setSessionReady(true);
        return true;
      }
      return false;
    };

    const initFromAPI = async () => {
      if (!sessionId || sessionId === 'new') {
        setSessionError('Invalid session. Please start from the setup page.');
        setLoading(false);
        return;
      }

      try {
        const data = await v2GetSession(sessionId);

        if (!mountedRef.current) return;

        if (data.status === 'setup') {
          navigate(`/setup/${sessionId}`, { replace: true });
          return;
        }
        if (data.status !== 'active') {
          setSessionError('This session is no longer active.');
          setLoading(false);
          return;
        }

        setCurrentQuestion(data.current_question || { id: '', text: 'Loading...', level: 0 });
        setTotalCore(data.total_core || 6);
        setSectionName(data.section_name || 'Work Experience');
        setCoreIndex(data.question_index || 0);
        setTotalAsked(data.total_questions || 0);

        if (data.session_expires_at) {
          setExpiresAt(new Date(data.session_expires_at));
          const remaining = Math.max(0, Math.floor((new Date(data.session_expires_at).getTime() - Date.now()) / 1000));
          setSessionSecs(remaining);
        }

        setLoading(false);
        setSessionReady(true);
      } catch (err) {
        if (!mountedRef.current) return;
        console.error('Session rehydration error:', err);

        if (err.status === 401) {
          navigate('/', { replace: true });
          return;
        }
        if (err.status === 410) {
          navigate('/complete', { state: { sessionId }, replace: true });
          return;
        }
        setSessionError(err.data?.message || 'Failed to load session. Please try again.');
        setLoading(false);
      }
    };

    if (!initFromState()) {
      initFromAPI();
    }

    return () => { mountedRef.current = false; };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session timer (countdown from expiresAt) ──
  const workerPingedRef = useRef(false);
  useEffect(() => {
    if (!sessionReady) return;

    sessionTimerRef.current = setInterval(() => {
      if (expiresAt) {
        const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
        setSessionSecs(remaining);

        // Ping worker to pre-warm it when less than 60s remain in the session
        if (remaining < 60 && !workerPingedRef.current) {
          workerPingedRef.current = true;
          fetch(`${(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}/functions/v1/v2-report-worker?ping=1`, {
            method: "GET",
          }).catch(() => {});
        }

        if (remaining <= 0) {
          clearInterval(sessionTimerRef.current);
          triggerEnd();
        }
      } else {
        setSessionSecs(s => {
          if (s <= 1) {
            clearInterval(sessionTimerRef.current);
            triggerEnd();
            return 0;
          }
          return s - 1;
        });
      }
    }, 1000);
    return () => clearInterval(sessionTimerRef.current);
  }, [sessionReady, expiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Answer timer (300s per question) ──
  useEffect(() => {
    if (!sessionReady || isSubmitting) return;

    setAnswerSecs(300);
    answerTimerRef.current = setInterval(() => {
      setAnswerSecs(s => {
        if (s <= 1) {
          clearInterval(answerTimerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(answerTimerRef.current);
  }, [currentQuestion, sessionReady, isSubmitting]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Browser back guard (Issue #2) ──
  useEffect(() => {
    if (!sessionReady) return;

    // Push a guard state so browser back shows quit modal instead of leaving
    window.history.pushState({ rbGuard: true }, '');

    const handlePopState = (e) => {
      if (submittingRef.current) {
        // If submitting, push state back and ignore
        window.history.pushState({ rbGuard: true }, '');
        return;
      }
      // Show quit modal instead of navigating away
      window.history.pushState({ rbGuard: true }, '');
      setShowQuitModal(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [sessionReady]);

  // ── Warn before tab close ──
  useEffect(() => {
    if (!sessionReady) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [sessionReady]);

  // ── End session ──
  const triggerEnd = useCallback(async () => {
    setIsFinishing(true);
    clearInterval(sessionTimerRef.current);
    clearInterval(answerTimerRef.current);
    if (isRecording) teardownVoiceSession('session_end');

    // Await to ensure backend completes before navigation (or keep it fire-and-forget but show loader)
    if (sessionId && sessionId !== 'new') {
      try { await v2EndSession(sessionId); } catch { /* ignore */ }
    }

    navigate('/complete', {
      state: {
        email: authUser?.email,
        sessionId,
        sectionName,
        questionCount: totalAsked || 1,
      },
      replace: true,
    });
  }, [authUser, sessionId, sectionName, navigate, totalAsked]);

  // ── Auto-submit when answer timer expires ──
  const handleAutoSubmit = useCallback(() => {
    if (submittingRef.current) return;
    const answer = inputMode === 'voice' ? finalTranscript : textAnswer;
    if (answer.trim().length >= 3) {
      doSubmit(answer);
    } else {
      setInputMode('text');
    }
  }, [inputMode, finalTranscript, textAnswer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit answer to backend ──
  const doSubmit = async (answerText) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    clearInterval(answerTimerRef.current);
    // Stop recording if active
    if (isRecording) teardownVoiceSession('submitting');
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const result = await v2SubmitAnswer(sessionId, {
        question_id: currentQuestion.id,
        answer_text: answerText,
        input_type: inputMode,
        duration_seconds: Math.max(1, 60 - answerSecs),
      });

      if (!mountedRef.current) return;

      const { next_action, next_question, session_stats } = result;

      // Update stats
      setTotalAsked(session_stats.total_questions_asked);
      if (session_stats.total_core) setTotalCore(session_stats.total_core);

      if (next_action === 'end_session') {
        submittingRef.current = false;
        setIsSubmitting(false);
        triggerEnd();
        return;
      }

      // Move to next question
      if (next_question) {
        setCurrentQuestion({
          id: next_question.id,
          text: next_question.text,
          level: next_question.level || 0,
        });
        if (next_action === 'next_question') {
          setCoreIndex(i => i + 1);
        }
      }

      setTextAnswer('');
      // Invalidate cached STT URL - Gladia WebSocket URLs are single-use
      sttWsUrlRef.current = null;
      setInputMode('voice'); // reset to voice mode for next question
      submittingRef.current = false;
      setIsSubmitting(false);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Answer submission error:', err);

      // ── 402: Insufficient balance → show top-up modal ──
      if (err.status === 402) {
        setPendingAnswer(answerText);
        setIsSubmitting(false);
        submittingRef.current = false;
        setShowTopUpModal(true);
        return;
      }

      // Other errors
      setIsSubmitting(false);
      submittingRef.current = false;
      setSubmitError(err.data?.message || 'Failed to submit answer. Please try again.');
    }
  };

  // ── Resume after top-up ──
  const handleTopUpAndResume = async () => {
    setShowTopUpModal(false);

    // Refetch balance
    try {
      const data = await getBalance();
      if (data.balance !== undefined) {
        localStorage.setItem('rb_v2_balance', data.balance.toString());
        window.dispatchEvent(new CustomEvent('rb:balance-updated'));
      }
    } catch { /* ignore */ }

    // Retry the pending answer
    if (pendingAnswer) {
      const answer = pendingAnswer;
      setPendingAnswer(null);
      doSubmit(answer);
    }
  };

  // ── Open Agnic top-up ──
  const openTopUp = () => {
    const clientId = import.meta.env.VITE_AGNIC_CLIENT_ID;
    if (!clientId) {
      setSubmitError('Top-up is not configured for this deployment.');
      return;
    }

    const returnUrl = window.location.href;
    const url = `https://app.agnic.ai/topup?client_id=${encodeURIComponent(clientId)}&return_url=${encodeURIComponent(returnUrl)}`;

    if (window.innerWidth < 640) {
      window.location.href = url;
      return;
    }

    const w = 480, h = 720;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    window.open(url, 'agnic-topup', `width=${w},height=${h},left=${left},top=${top},popup=yes`);
  };

  // ── Listen for top-up completion ──
  useEffect(() => {
    const onMessage = (ev) => {
      if (ev.origin !== 'https://app.agnic.ai') return;
      if (ev.data?.type === 'agnic:topup_complete') {
        handleTopUpAndResume();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pendingAnswer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real Gladia STT recording ──
  const handleStartRecording = async () => {
    setSubmitError('');
    setSttError(null);
    setSttInitializing(true);

    // Prepare AudioContext (needs user gesture)
    const audioOk = await prepareAudioContext();
    if (!audioOk) {
      setSttInitializing(false);
      setInputMode('text');
      setSubmitError('Audio is not supported on this browser. Please type your answer.');
      return;
    }

    // Get Gladia WebSocket URL from backend
    if (!sttWsUrlRef.current) {
      try {
        const sttData = await v2SttSession(sessionId);
        sttWsUrlRef.current = sttData.relay_ws_url || sttData.ws_url;
      } catch (err) {
        console.error('STT session init error:', err);
        setSttInitializing(false);
        setInputMode('text');
        setSubmitError('Voice recording is unavailable. Please type your answer.');
        return;
      }
    }

    // Start recording via Gladia
    const started = await gladiaStart(sttWsUrlRef.current, {
      useRelay: sttWsUrlRef.current?.includes('stt-relay'),
    });
    setSttInitializing(false);

    if (!started) {
      setInputMode('text');
      setSubmitError('Could not start recording. Please type your answer instead.');
    } else {
      // 3-minute max recording limit
      if (gladiaTimeoutRef.current) clearTimeout(gladiaTimeoutRef.current);
      gladiaTimeoutRef.current = setTimeout(async () => {
        const result = await gladiaStop();
        const transcript = result?.transcript || finalTranscript || '';
        if (transcript.trim().length >= 3) {
          setTextAnswer(transcript);
        }
        setInputMode('text');
        setSubmitError('Voice recording limit (3 minutes) reached. You can add more text before the question timer runs out.');
      }, 180 * 1000);
    }
  };

  const handleStopRecording = async () => {
    if (gladiaTimeoutRef.current) clearTimeout(gladiaTimeoutRef.current);
    const result = await gladiaStop();
    const transcript = result?.transcript || finalTranscript || '';
    if (transcript.trim().length >= 3) {
      doSubmit(transcript);
    } else {
      setInputMode('text');
      setSubmitError('Recording too short - please type your answer.');
    }
  };

  // ── Handle STT errors (switch to text mode) ──
  useEffect(() => {
    if (sttError && sttError !== 'mic_denied') {
      if (!submittingRef.current && !isFinishing) {
        setInputMode('text');
        setSubmitError('Voice recording error - switched to text mode.');
      }
    }
  }, [sttError, isFinishing]);

  const handleTextSubmit = () => {
    if (textAnswer.trim().length < 3) {
      setSubmitError('Answer must be at least 3 characters.');
      return;
    }
    doSubmit(textAnswer);
  };

  // ── Loading / Error states ──
  if (!authUser) return null;

  if (loading) {
    return (
      <div className="page-center">
        <div className="card" style={{ textAlign: 'center', padding: '48px 32px', maxWidth: '420px' }}>
          <div className="evaluating-pulse" style={{ marginBottom: '20px' }}>
            <div className="evaluating-dot" style={{ animationDelay: '0ms' }} />
            <div className="evaluating-dot" style={{ animationDelay: '150ms' }} />
            <div className="evaluating-dot" style={{ animationDelay: '300ms' }} />
          </div>
          <h3 className="modal-title" style={{ marginBottom: '8px' }}>Loading session…</h3>
          <p className="auth-modal__note">Retrieving your interview state</p>
        </div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="page-center">
        <div className="card" style={{ textAlign: 'center', padding: '48px 32px', maxWidth: '420px' }}>
          <div className="modal-icon modal-icon--warn" style={{ margin: '0 auto 16px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '32px', height: '32px' }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="modal-title" style={{ marginBottom: '8px' }}>Session Error</h3>
          <p className="modal-body">{sessionError}</p>
          <button className="btn-primary" onClick={() => navigate('/setup/new')} style={{ marginTop: '16px' }}>
            Start New Session
          </button>
        </div>
      </div>
    );
  }

  const progress = Math.min(100, Math.round(((coreIndex + 1) / totalCore) * 100));

  return (
    <div className="interview-page">

      {/* ── Progress bar ── */}
      <div className="interview-progress-bar">
        <div className="interview-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* ── Timer bar ── */}
      <div className="timer-bar">
        <div className="timer-item">
          <span className="timer-label">Session</span>
          <span className={`timer-value ${sessionSecs < 60 ? 'timer-warn' : ''}`}>
            {formatTime(sessionSecs)}
          </span>
        </div>
        <div className="timer-item timer-item--center">
          <span className="timer-label">Section</span>
          <span className="timer-value timer-value--section">{sectionName}</span>
        </div>
        <div className="timer-item">
          <span className="timer-label">Progress</span>
          <span className="timer-value">{Math.min(coreIndex + 1, totalCore)} / {totalCore}</span>
        </div>
      </div>

      {/* ── Question card ── */}
      <div className="card question-card">
        <div className="question-header-row">
          <div className="question-level">
            {currentQuestion.level > 0
              ? <><span className="followup-tag">Follow-up</span> · Depth {currentQuestion.level}</>
              : <><span className="core-tag">Core Question</span> · Q{coreIndex + 1} of {totalCore}</>
            }
          </div>
          {/* Quit button (Issue #1) */}
          <button
            className="btn-quit"
            onClick={() => setShowQuitModal(true)}
            disabled={isSubmitting}
            title="End session early"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Quit
          </button>
        </div>
        <h2 className="question-text">{currentQuestion.text}</h2>
      </div>

      {/* ── Answer card ── */}
      <div className="card answer-card">
        {isSubmitting ? (
          <div className="evaluating">
            <div className="evaluating-pulse">
              <div className="evaluating-dot" style={{ animationDelay: '0ms' }} />
              <div className="evaluating-dot" style={{ animationDelay: '150ms' }} />
              <div className="evaluating-dot" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="evaluating-text">Evaluating your answer…</p>
            <span className="evaluating-sub">Powered by Claude Sonnet via Agnic</span>
          </div>
        ) : (
          <>
            {/* Answer timer bar */}
            <div className="answer-timer-row">
              <span className="answer-timer-label">Time to answer</span>
              <span className={`answer-timer-val ${answerSecs <= 60 ? 'timer-warn' : ''}`}>
                {formatTime(answerSecs)}
              </span>
            </div>
            {answerSecs <= 60 && (
              <div style={{ color: 'var(--color-error)', fontSize: '0.85rem', marginBottom: '8px', textAlign: 'right' }}>
                Please wrap up your answer.
              </div>
            )}
            <div className="answer-timer-track">
              <div className="answer-timer-fill" style={{
                width: `${(answerSecs / 300) * 100}%`,
                background: answerSecs <= 60 ? 'var(--color-error)' : 'var(--color-primary)',
              }} />
            </div>

            {/* Mode toggle */}
            <div className="mode-toggle">
              <button
                className={`mode-btn ${inputMode === 'voice' ? 'active' : ''}`}
                onClick={() => {
                  if (isRecording) teardownVoiceSession('mode_switch');
                  sttWsUrlRef.current = null;
                  setInputMode('voice');
                }}
                disabled={isRecording || sttInitializing}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                Voice
              </button>
              <button
                className={`mode-btn ${inputMode === 'text' ? 'active' : ''}`}
                onClick={() => {
                  if (isRecording) teardownVoiceSession('mode_switch');
                  sttWsUrlRef.current = null;
                  setInputMode('text');
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                  <path d="M17 6.1H3M21 12.1H3M15.1 18H3" />
                </svg>
                Type
              </button>
            </div>

            {inputMode === 'voice' ? (
              <div className="voice-area">
                {!isRecording && !sttInitializing ? (
                  <button className="btn-record" onClick={handleStartRecording} disabled={isSubmitting}>
                    <span className="btn-record-icon">
                      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '20px', height: '20px' }}>
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </span>
                    Start Recording
                  </button>
                ) : sttInitializing ? (
                  <div className="recording-indicator">
                    <span className="spinner-sm" />
                    <span>Connecting to microphone…</span>
                  </div>
                ) : (
                  <>
                    <div className="recording-indicator">
                      <span className="rec-dot" />
                      <span>Recording…</span>
                      <span className="rec-wave"><span /><span /><span /><span /><span /></span>
                    </div>
                    {(finalTranscript || interimText) && (
                      <p className="transcript interim">
                        {finalTranscript}{interimText && <span style={{ opacity: 0.5 }}> {interimText}</span>}
                        <span className="transcript-cursor">|</span>
                      </p>
                    )}
                    <button className="btn-stop" onClick={handleStopRecording}>
                      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '16px', height: '16px' }}>
                        <rect x="6" y="6" width="12" height="12" rx="1" />
                      </svg>
                      Stop &amp; Submit
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="text-area">
                <textarea
                  className="form-textarea answer-textarea"
                  placeholder="Type your answer here (min 3 characters)…"
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  rows={4}
                  autoFocus
                />
                <div className="text-submit-row">
                  <span className="char-count">{textAnswer.length} chars</span>
                  <button
                    className="btn-primary"
                    onClick={handleTextSubmit}
                    disabled={textAnswer.trim().length < 3}
                  >
                    Submit Answer
                  </button>
                </div>
              </div>
            )}

            {submitError && <p className="form-error" style={{ marginTop: '12px' }}>{submitError}</p>}
          </>
        )}
      </div>

      {/* ── Mid-session Top-Up Modal ── */}
      {showTopUpModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-icon modal-icon--warn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '32px', height: '32px' }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 className="modal-title">Wallet Balance Low</h3>
            <p className="modal-body">
              Your Agnic wallet balance is too low to continue. Add credits to resume your interview,
              or end now and receive a partial report.
            </p>
            <div className="modal-actions">
              <button className="btn-agnic-signin" onClick={openTopUp} style={{ width: '100%' }}>
                <span className="btn-agnic-inner"> Add Credits &amp; Continue</span>
              </button>
              <button
                className="btn-ghost"
                onClick={triggerEnd}
                style={{ width: '100%', marginTop: '8px' }}
              >
                End Session Now (get partial report)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Finishing Overlay ── */}
      {isFinishing && (
        <div className="modal-overlay" style={{ zIndex: 9999, background: 'var(--color-bg)' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="evaluating-pulse" style={{ margin: '0 auto 24px' }}>
              <div className="evaluating-dot" style={{ animationDelay: '0ms' }} />
              <div className="evaluating-dot" style={{ animationDelay: '150ms' }} />
              <div className="evaluating-dot" style={{ animationDelay: '300ms' }} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text)', marginBottom: '8px' }}>Finalizing Interview...</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.938rem' }}>Generating your comprehensive feedback report</p>
          </div>
        </div>
      )}

      {/* ── Quit Confirmation Modal (Issue #1) ── */}
      {showQuitModal && (
        <div className="modal-overlay" onClick={() => setShowQuitModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-icon modal-icon--warn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '32px', height: '32px' }}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <h3 className="modal-title">End Session Early?</h3>
            <p className="modal-body">
              You've answered <strong>{totalAsked}</strong> of <strong>{totalCore}</strong> questions.
              {totalAsked >= 2
                ? " You'll receive a partial report based on your answers so far."
                : " You need at least 2 answers for a meaningful report."}
            </p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setShowQuitModal(false)} style={{ width: '100%' }}>
                Continue Interview
              </button>
              <button
                className="btn-ghost btn-ghost--danger"
                onClick={() => { setShowQuitModal(false); triggerEnd(); }}
                style={{ width: '100%', marginTop: '8px' }}
              >
                {totalAsked >= 2 ? 'End & Get Report' : 'End Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
