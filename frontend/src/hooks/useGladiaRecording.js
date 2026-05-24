/**
 * Gladia WebSocket recording hook.
 * Block D - frontend/src/hooks/useGladiaRecording.js
 *
 * Manages mic capture -> AudioContext -> 16kHz PCM conversion -> WebSocket streaming.
 * The WebSocket can be either the current direct Gladia URL or the safer backend relay URL.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { convertFloat32ToInt16, downsampleBuffer, TARGET_SAMPLE_RATE } from '../utils/audioUtils';
import { GLADIA_HEARTBEAT_MS, GLADIA_FINAL_WAIT_MS } from '../lib/config.js';

// GLADIA_HEARTBEAT_MS and GLADIA_FINAL_WAIT_MS are imported from ../lib/config.js

function getAudioContextCtor() {
  return window.AudioContext || window.webkitAudioContext;
}

export default function useGladiaRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const heartbeatRef = useRef(null);
  const startTimeRef = useRef(null);
  const transcriptRef = useRef('');
  const isRecordingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const stopResolverRef = useRef(null);
  const stopTimeoutRef = useRef(null);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const clearStopWait = useCallback(() => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  }, []);

  const resolveStop = useCallback((elapsed) => {
    if (!stopResolverRef.current) return;
    const resolve = stopResolverRef.current;
    stopResolverRef.current = null;
    clearStopWait();
    resolve({
      elapsed,
      transcript: transcriptRef.current,
    });
  }, [clearStopWait]);

  const sendStopSignal = useCallback((reason = 'client_stop') => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      // Fix: macOS_Safari_Audit_2026 + Ghost Recording P0 - notify the active STT socket before teardown.
      ws.send(JSON.stringify({ type: 'stop_recording', reason }));
    } catch (err) {
      console.warn('Failed to send stop_recording:', err);
    }
  }, []);

  const cleanupMedia = useCallback(() => {
    if (processorRef.current) {
      try {
        processorRef.current.onaudioprocess = null;
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }

    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
  }, []);

  const cleanupSocket = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch {}
    wsRef.current = null;
  }, []);

  const teardownVoiceSession = useCallback((reason = 'client_teardown') => {
    sendStopSignal(reason);
    clearHeartbeat();
    cleanupMedia();
    cleanupSocket();
    isRecordingRef.current = false;
    isStoppingRef.current = false;
    setIsRecording(false);
    resolveStop(
      startTimeRef.current
        ? Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
        : 1
    );
  }, [cleanupMedia, cleanupSocket, clearHeartbeat, resolveStop, sendStopSignal]);

  const failRecording = useCallback((code, reason = code) => {
    const wasStopping = isStoppingRef.current;
    teardownVoiceSession(reason);
    if (!wasStopping) {
      setError(code);
    }
  }, [teardownVoiceSession]);

  const prepareAudioContext = useCallback(async () => {
    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) {
      setError('audio_unsupported');
      return false;
    }

    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContextCtor();
      }

      if (audioCtxRef.current.state === 'suspended') {
        // Fix: macOS_Safari_Audit_2026 - call resume from the user-triggered start path.
        await audioCtxRef.current.resume();
      }

      return true;
    } catch (err) {
      console.error('AudioContext preparation failed:', err);
      setError('audio_failed');
      return false;
    }
  }, []);

  const handleTranscriptMessage = useCallback((evt) => {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }

    if (msg.type === 'relay_error') {
      failRecording('ws_error', msg.error || 'relay_error');
      return;
    }

    if (msg.type === 'transcript' && msg.data?.utterance) {
      const text = msg.data.utterance.text || '';
      const isFinal = msg.data.is_final ?? msg.data.utterance.is_final ?? false;

      if (isFinal) {
        transcriptRef.current = transcriptRef.current
          ? `${transcriptRef.current} ${text}`.trim()
          : text;
        setFinalTranscript(transcriptRef.current);
        setInterimText('');
        resolveStop(
          startTimeRef.current
            ? Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
            : 1
        );
      } else {
        setInterimText(text);
      }
    }
  }, [failRecording, resolveStop]);

  const startRecording = useCallback(async (wsUrl, options = {}) => {
    const { useRelay = false } = options;

    setError(null);
    setFinalTranscript('');
    setInterimText('');
    transcriptRef.current = '';
    if (!wsUrl) {
      setError('no_ws_url');
      return false;
    }

    if (isRecordingRef.current || wsRef.current || streamRef.current) {
      teardownVoiceSession('restart_recording');
    }
    
    isStoppingRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      // Fix: Phase 4B - browsers without getUserMedia must fail cleanly and not desync UI state.
      teardownVoiceSession('get_user_media_unavailable');
      setError('mic_unavailable');
      return false;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Mic access failed:', err);
      teardownVoiceSession('mic_access_failed');
      setError(err?.name === 'NotFoundError' ? 'mic_unavailable' : 'mic_denied');
      return false;
    }
    streamRef.current = stream;

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('WebSocket init failed:', err);
      teardownVoiceSession('ws_init_failed');
      setError('ws_failed');
      return false;
    }
    wsRef.current = ws;

    return await new Promise((resolve) => {
      let startSettled = false;
      const settleStart = (value) => {
        if (startSettled) return;
        startSettled = true;
        resolve(value);
      };

      const failStart = (code, reason) => {
        failRecording(code, reason);
        settleStart(false);
      };

      ws.onopen = async () => {
        try {
          const AudioContextCtor = getAudioContextCtor();
          if (!AudioContextCtor) {
            failStart('audio_unsupported', 'audio_context_unavailable');
            return;
          }

          const audioCtx = audioCtxRef.current && audioCtxRef.current.state !== 'closed'
            ? audioCtxRef.current
            : new AudioContextCtor();
          audioCtxRef.current = audioCtx;

          if (audioCtx.state === 'suspended') {
            // Fix: macOS_Safari_Audit_2026 - resume Safari/iOS AudioContext after user-triggered start.
            await audioCtx.resume();
          }

          const source = audioCtx.createMediaStreamSource(stream);
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);
          sourceRef.current = source;
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const input = e.inputBuffer.getChannelData(0);
            // Fix: macOS_Safari_Audit_2026 - Safari ignores AudioContext({ sampleRate: 16000 }).
            const resampled = downsampleBuffer(input, audioCtx.sampleRate, TARGET_SAMPLE_RATE);
            const int16 = convertFloat32ToInt16(resampled);
            ws.send(int16.buffer);
          };

          source.connect(processor);
          processor.connect(audioCtx.destination);

          if (useRelay) {
            heartbeatRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'heartbeat', sent_at: new Date().toISOString() }));
              }
            }, GLADIA_HEARTBEAT_MS);
          }

          isRecordingRef.current = true;
          setIsRecording(true);
          startTimeRef.current = Date.now();
          settleStart(true);
        } catch (err) {
          console.error('Audio pipeline error:', err);
          failStart('audio_failed', 'audio_pipeline_failed');
        }
      };

      ws.onmessage = handleTranscriptMessage;

      ws.onerror = () => {
        console.error('Gladia WebSocket error');
        failStart('ws_error', 'ws_error');
      };

      ws.onclose = () => {
        clearHeartbeat();
        cleanupMedia();
        isRecordingRef.current = false;
        setIsRecording(false);
        settleStart(false);
        resolveStop(
          startTimeRef.current
            ? Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
            : 1
        );
      };
    });
  }, [cleanupMedia, clearHeartbeat, failRecording, handleTranscriptMessage, resolveStop, teardownVoiceSession]);

  const stopRecording = useCallback(() => {
    const elapsed = startTimeRef.current
      ? Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
      : 1;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      teardownVoiceSession('stop_without_open_socket');
      return Promise.resolve({ elapsed, transcript: transcriptRef.current });
    }

    isStoppingRef.current = true;
    sendStopSignal('client_stop');

    return new Promise((resolve) => {
      stopResolverRef.current = (result) => {
        teardownVoiceSession('stop_complete');
        resolve(result);
      };
      stopTimeoutRef.current = setTimeout(() => {
        teardownVoiceSession('final_transcript_timeout');
      }, GLADIA_FINAL_WAIT_MS);
    });
  }, [sendStopSignal, teardownVoiceSession]);

  useEffect(() => {
    return () => teardownVoiceSession('component_unmount');
  }, [teardownVoiceSession]);

  return {
    startRecording,
    stopRecording,
    prepareAudioContext,
    teardownVoiceSession,
    finalTranscript,
    interimText,
    isRecording,
    error,
    setError,
  };
}
