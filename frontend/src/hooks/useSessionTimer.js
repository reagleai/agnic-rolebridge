/**
 * 8-minute (480s) session countdown timer.
 * Block D - frontend/src/hooks/useSessionTimer.js
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export default function useSessionTimer(onExpire) {
  const [timeRemaining, setTimeRemaining] = useState(480);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const startTimer = useCallback((seconds = 480) => {
    setTimeRemaining(seconds);
    setIsExpired(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setIsExpired(true);
          onExpireRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const resetTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimeRemaining(480);
    setIsExpired(false);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { timeRemaining, isExpired, startTimer, resetTimer };
}
