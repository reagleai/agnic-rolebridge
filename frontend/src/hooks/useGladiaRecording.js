/**
 * Gladia WebSocket recording hook.
 * Block D - frontend/src/hooks/useGladiaRecording.js
 *
 * Manages mic capture → AudioContext (16kHz) → PCM conversion → WebSocket streaming.
 * Returns live partial/final transcripts for UI rendering.
 *
 * FIX: Uses a ref to track transcript text so stopRecording can return the
 * actual accumulated text (avoids stale React state closure).
 * FIX: Gladia V2 uses `msg.data.is_final` NOT `msg.data.utterance.is_final`.
 */
import { useState, useRef, useCallback } from 'react';
import { convertFloat32ToInt16 } from '../utils/audioUtils';

export default function useGladiaRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const startTimeRef = useRef(null);

  // ── Ref that always holds the latest accumulated transcript ──
  const transcriptRef = useRef('');

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async (wsUrl) => {
    setError(null);
    setFinalTranscript('');
    setInterimText('');
    transcriptRef.current = '';

    if (!wsUrl) {
      setError('no_ws_url');
      return;
    }

    // ── Request mic access ──
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Mic access denied:', err);
      setError('mic_denied');
      return;
    }
    streamRef.current = stream;

    // ── WebSocket to Gladia ──
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('WebSocket init failed:', err);
      cleanup();
      setError('ws_failed');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // ── Audio pipeline: mic → 16kHz context → ScriptProcessor → PCM → WS ──
      try {
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const float32 = e.inputBuffer.getChannelData(0);
            const int16 = convertFloat32ToInt16(float32);
            ws.send(int16.buffer);
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      } catch (err) {
        console.error('Audio pipeline error:', err);
        cleanup();
        setError('audio_failed');
      }
    };

    // ── Gladia V2 message format ──
    // {
    //   "type": "transcript",
    //   "data": {
    //     "id": "...",
    //     "is_final": true|false,          <-- at data level, NOT inside utterance
    //     "utterance": { "text": "...", ... }
    //   }
    // }
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        console.log('[Gladia WS]', msg.type, msg);

        if (msg.type === 'transcript' && msg.data?.utterance) {
          const text = msg.data.utterance.text || '';
          // Gladia V2: is_final lives on msg.data, not msg.data.utterance
          const isFinal = msg.data.is_final ?? msg.data.utterance.is_final ?? false;

          if (isFinal) {
            transcriptRef.current = transcriptRef.current
              ? transcriptRef.current + ' ' + text
              : text;
            setFinalTranscript(transcriptRef.current);
            setInterimText('');
          } else {
            setInterimText(text);
          }
        }
      } catch {
        // Non-JSON or malformed - ignore
      }
    };

    ws.onerror = () => {
      console.error('Gladia WebSocket error');
      cleanup();
      setError('ws_error');
    };

    ws.onclose = () => {
      setIsRecording(false);
    };
  }, [cleanup]);

  /**
   * Stop recording and return { elapsed, transcript }.
   * Uses transcriptRef to avoid stale closure issues.
   */
  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      const elapsed = startTimeRef.current
        ? Math.round((Date.now() - startTimeRef.current) / 1000)
        : 1;

      // Tell Gladia to finalize
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'stop_recording' }));
      }

      // Wait up to 2 seconds for a final transcript, then clean up
      const timeout = setTimeout(() => {
        const text = transcriptRef.current;
        cleanup();
        resolve({ elapsed, transcript: text });
      }, 2000);

      // If we get a final before timeout, clean up early
      if (wsRef.current) {
        const origOnMessage = wsRef.current.onmessage;
        wsRef.current.onmessage = (evt) => {
          if (origOnMessage) origOnMessage(evt);
          try {
            const msg = JSON.parse(evt.data);
            const isFinal = msg.data?.is_final ?? msg.data?.utterance?.is_final ?? false;
            if (msg.type === 'transcript' && isFinal) {
              clearTimeout(timeout);
              setTimeout(() => {
                const text = transcriptRef.current;
                cleanup();
                resolve({ elapsed, transcript: text });
              }, 200);
            }
          } catch {}
        };
      }
    });
  }, [cleanup]);

  return {
    startRecording,
    stopRecording,
    finalTranscript,
    interimText,
    isRecording,
    error,
    setError,
  };
}
