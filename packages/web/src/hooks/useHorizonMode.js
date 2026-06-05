import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'horizon-nav';

function readStored() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.mode === 'hub' || parsed.mode === 'page') return parsed;
    }
  } catch {
    /* ignore */
  }
  return { mode: 'hub' };
}

function writeStored(mode) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ mode }));
  } catch {
    /* ignore */
  }
}

export default function useHorizonMode() {
  const [mode, setModeState] = useState(() => readStored().mode);

  useEffect(() => {
    writeStored(mode);
  }, [mode]);

  const setMode = useCallback((next) => {
    setModeState(next);
  }, []);

  const enterPage = useCallback(() => setMode('page'), [setMode]);
  const enterHub = useCallback(() => setMode('hub'), [setMode]);
  const toggleMode = useCallback(() => {
    setModeState((m) => (m === 'hub' ? 'page' : 'hub'));
  }, []);

  return { mode, setMode, enterPage, enterHub, toggleMode, isHub: mode === 'hub', isPage: mode === 'page' };
}
