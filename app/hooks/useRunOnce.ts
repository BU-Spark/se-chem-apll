'use client';

import { useEffect, useRef } from 'react';

/**
 * Runs work once when the component first appears. React's development mode runs effects twice
 * to catch bugs, which would otherwise send a request (like starting an attempt) twice.
 */
export default function useRunOnce(work: () => void) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    work();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the first render's work runs
  }, []);
}
