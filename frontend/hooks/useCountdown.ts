'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Countdown timer hook that counts down from initialMinutes.
 * Resets automatically when initialMinutes changes (e.g., socket update).
 * Ticks every second — synchronized with socket queue updates.
 */
export function useCountdown(initialMinutes: number) {
  const [totalSeconds, setTotalSeconds] = useState(() =>
    Math.max(0, Math.round(initialMinutes * 60)),
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset whenever the estimate changes from a socket event
  useEffect(() => {
    const newSeconds = Math.max(0, Math.round(initialMinutes * 60));
    setTotalSeconds(newSeconds);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (newSeconds <= 0) return;

    intervalRef.current = setInterval(() => {
      setTotalSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [initialMinutes]);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    totalSeconds,
    minutes,
    seconds,
    formatted: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    isExpired: totalSeconds === 0,
  };
}
