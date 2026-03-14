import { useEffect, useRef } from 'react';

interface WindowState {
  width: number;
  height: number;
}

const STORAGE_KEY = 'tablepro-window-state';
const DEBOUNCE_MS = 500;

function loadState(): WindowState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WindowState;
  } catch {
    return null;
  }
}

function saveState(state: WindowState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

/**
 * Persist window dimensions to localStorage.
 * Debounces writes to avoid excessive I/O during resize.
 */
export function useWindowState() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = loadState();
    if (saved) {
      // Can't programmatically resize webview, but state is available for Rust-side use
    }

    const handleResize = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveState({ width: window.innerWidth, height: window.innerHeight });
      }, DEBOUNCE_MS);
    };

    window.addEventListener('resize', handleResize);
    // Save initial state
    saveState({ width: window.innerWidth, height: window.innerHeight });

    return () => {
      window.removeEventListener('resize', handleResize);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
