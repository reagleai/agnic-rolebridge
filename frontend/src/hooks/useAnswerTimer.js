/**
 * 60-second answer countdown timer.
 * Block D - frontend/src/hooks/useAnswerTimer.js
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export default function useAnswerTimer(onExpire) {
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const startTimer = useCallback(() => {
    setTimeRemaining(60);
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

  const stopTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const resetTimer = useCallback(() => {
    stopTimer();
    setTimeRemaining(60);
    setIsExpired(false);
  }, [stopTimer]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { timeRemaining, isExpired, startTimer, resetTimer, stopTimer };
}
