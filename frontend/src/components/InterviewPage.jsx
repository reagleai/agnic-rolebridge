/**
 * Interview page — live Q&A with voice/text, timers, progression.
 * Block D — frontend/src/components/InterviewPage.jsx
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getSession, getSttSession, submitAnswer, endSession } from '../lib/api';
import useGladiaRecording from '../hooks/useGladiaRecording';
import useSessionTimer from '../hooks/useSessionTimer';
import useAnswerTimer from '../hooks/useAnswerTimer';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function InterviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || '';

  // ── State ──
  const [currentQuestion, setCurrentQuestion] = useState(
    location.state?.firstQuestion || null
  );
  const [inputMode, setInputMode] = useState('voice'); // voice | text
  const [textAnswer, setTextAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isRehydrating, setIsRehydrating] = useState(!location.state?.firstQuestion);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [totalCore, setTotalCore] = useState(
    location.state?.firstQuestion?.total_core || 0
  );
  const [questionsAsked, setQuestionsAsked] = useState(0);

  const submittingRef = useRef(false);
  const sessionIdRef = useRef(id);

  // ── Hooks ──
  const gladia = useGladiaRecording();

  const triggerEnd = useCallback(async () => {
    if (sessionEnded) return;
    setSessionEnded(true);
    try {
      await endSession(id);
    } catch {
      // Best-effort — backend cron will clean up anyway
    }
    navigate('/complete', { state: { email, sessionId: id } });
  }, [id, email, navigate, sessionEnded]);

  const sessionTimer = useSessionTimer(triggerEnd);
  const answerTimer = useAnswerTimer(null); // onExpire set dynamically

  // ── Rehydration (page refresh recovery) ──
  useEffect(() => {
    if (!isRehydrating) {
      // Start session timer from state
      const expiresAt = location.state?.sessionExpiresAt;
      if (expiresAt) {
        const remaining = Math.max(
          0,
          Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
        );
        sessionTimer.startTimer(Math.min(remaining, 480));
      } else {
        sessionTimer.startTimer(480);
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await getSession(id);
        if (cancelled) return;
        setCurrentQuestion(data.current_question);
        setTotalCore(data.total_core || 0);
        setQuestionsAsked(data.total_questions || 0);

        const remaining = Math.max(
          0,
          Math.floor(
            (new Date(data.session_expires_at).getTime() - Date.now()) / 1000
          )
        );
        sessionTimer.startTimer(Math.min(remaining, 480));
      } catch (err) {
        if (!cancelled) {
          const code = err.data?.error || '';
          if (['session_not_found', 'session_expired', 'session_not_active'].includes(code)) {
            navigate('/complete', { state: { email, sessionId: id } });
          }
        }
      } finally {
        if (!cancelled) setIsRehydrating(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-submit on answer timer expiry ──
  const handleAutoSubmit = useCallback(async () => {
    if (submittingRef.current) return;

    // If voice mode, stop recording and use the returned transcript
    if (inputMode === 'voice') {
      const result = await gladia.stopRecording?.();
      const text = result?.transcript || '';
      if (text.length >= 10) {
        doSubmit(text, 'voice', 60);
      } else {
        // Too short — switch to text mode
        setInputMode('text');
        setTextAnswer(text);
      }
    } else {
      // Text mode auto-submit
      if (textAnswer.length >= 10) {
        doSubmit(textAnswer, 'text', 60);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode, textAnswer]);

  // Update answer timer's onExpire ref
  useEffect(() => {
    answerTimer.stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Submit answer ──
  const doSubmit = async (text, type, durationSec) => {
    if (submittingRef.current || !currentQuestion) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError('');
    answerTimer.stopTimer();

    try {
      const data = await submitAnswer(id, {
        question_id: currentQuestion.id,
        answer_text: text,
        input_type: type,
        duration_seconds: Math.max(1, Math.min(75, durationSec)),
      });

      setQuestionsAsked(data.session_stats.total_questions_asked);

      if (data.next_action === 'end_session') {
        await triggerEnd();
      } else {
        // followup or next_question
        setCurrentQuestion(data.next_question);
        setTextAnswer('');
        gladia.setError(null);
        answerTimer.resetTimer();
      }
    } catch (err) {
      if (err.status === 429) {
        setSubmitError('Service is busy. Retrying in 4 seconds…');
        setTimeout(() => {
          submittingRef.current = false;
          setIsSubmitting(false);
          doSubmit(text, type, durationSec);
        }, 4000);
        return;
      }
      setSubmitError(err.data?.error || 'Failed to submit answer. Please try again.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // ── Voice recording flow ──
  const handleStartRecording = async () => {
    setSubmitError('');
    try {
      const data = await getSttSession(id);
      gladia.startRecording(data.ws_url);
      answerTimer.startTimer();
    } catch (err) {
      // Gladia failed — fall back to text
      console.error('STT session init failed:', err);
      setInputMode('text');
      setSubmitError('Voice recording unavailable. Please type your answer.');
      answerTimer.startTimer();
    }
  };

  const handleStopRecording = async () => {
    const result = await gladia.stopRecording();
    const text = result?.transcript || '';
    const elapsed = result?.elapsed || 10;
    if (text.length >= 10) {
      doSubmit(text, 'voice', elapsed);
    } else {
      setSubmitError('Your answer was too short. Please try again or type your answer.');
      setInputMode('text');
      setTextAnswer(text);
      // Don't stop the answer timer — let them type
    }
  };

  const handleTextSubmit = () => {
    if (textAnswer.length < 10) {
      setSubmitError('Answer must be at least 10 characters.');
      return;
    }
    doSubmit(textAnswer, 'text', answerTimer.timeRemaining ? 60 - answerTimer.timeRemaining : 30);
  };

  // ── Switch to text on mic errors ──
  useEffect(() => {
    if (gladia.error && ['mic_denied', 'ws_failed', 'ws_error', 'audio_failed'].includes(gladia.error)) {
      setInputMode('text');
      if (gladia.error === 'mic_denied') {
        setSubmitError('Microphone access denied. Please type your answer instead.');
      } else {
        setSubmitError('Voice recording failed. Please type your answer instead.');
      }
    }
  }, [gladia.error]);

  // ── beforeunload ──
  useEffect(() => {
    const handler = () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/session-end/${id}`;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      navigator.sendBeacon?.(url) ||
        fetch(url, {
          method: 'POST',
          keepalive: true,
          headers: key ? { Authorization: `Bearer ${key}` } : {},
        });
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [id]);

  // ── Render ──
  if (isRehydrating) {
    return (
      <div className="page-center">
        <div className="card">
          <p className="loading-text">Reconnecting to your session…</p>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="page-center">
        <div className="card">
          <p className="loading-text">Loading question…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="interview-page">
      {/* Timers bar */}
      <div className="timer-bar">
        <div className="timer-item">
          <span className="timer-label">Session</span>
          <span className={`timer-value ${sessionTimer.timeRemaining < 60 ? 'timer-warn' : ''}`}>
            {formatTime(sessionTimer.timeRemaining)}
          </span>
        </div>
        <div className="timer-item">
          <span className="timer-label">Answer</span>
          <span className={`timer-value ${answerTimer.timeRemaining < 15 ? 'timer-warn' : ''}`}>
            {formatTime(answerTimer.timeRemaining)}
          </span>
        </div>
        <div className="timer-item">
          <span className="timer-label">Progress</span>
          <span className="timer-value">{questionsAsked + 1} / 5</span>
        </div>
      </div>

      {/* Question */}
      <div className="card question-card">
        <div className="question-level">
          {currentQuestion.level > 0 ? `Follow-up (depth ${currentQuestion.level})` : 'Core Question'}
        </div>
        <h2 className="question-text">{currentQuestion.text}</h2>
      </div>

      {/* Answer area */}
      <div className="card answer-card">
        {isSubmitting ? (
          <div className="evaluating">
            <div className="spinner" />
            <p>Evaluating your answer…</p>
          </div>
        ) : (
          <>
            {/* Mode toggle */}
            <div className="mode-toggle">
              <button
                className={`mode-btn ${inputMode === 'voice' ? 'active' : ''}`}
                onClick={() => setInputMode('voice')}
                disabled={gladia.isRecording}
              >
                🎙 Voice
              </button>
              <button
                className={`mode-btn ${inputMode === 'text' ? 'active' : ''}`}
                onClick={() => {
                  setInputMode('text');
                  if (gladia.isRecording) gladia.stopRecording();
                }}
              >
                ⌨ Type
              </button>
            </div>

            {inputMode === 'voice' ? (
              <div className="voice-area">
                {!gladia.isRecording ? (
                  <button className="btn-record" onClick={handleStartRecording}>
                    🎙 Start Recording
                  </button>
                ) : (
                  <>
                    <div className="recording-indicator">
                      <span className="rec-dot" /> Recording…
                    </div>
                    {gladia.interimText && (
                      <p className="transcript interim">{gladia.interimText}</p>
                    )}
                    {gladia.finalTranscript && (
                      <p className="transcript final">{gladia.finalTranscript}</p>
                    )}
                    <button className="btn-stop" onClick={handleStopRecording}>
                      ⏹ Stop & Submit
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="text-area">
                <textarea
                  className="form-textarea answer-textarea"
                  placeholder="Type your answer here (min 10 characters)…"
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
                    disabled={textAnswer.length < 10}
                  >
                    Submit Answer
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {submitError && <p className="form-error">{submitError}</p>}
      </div>
    </div>
  );
}
