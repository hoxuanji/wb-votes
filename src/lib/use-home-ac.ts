'use client';

import { useEffect, useState } from 'react';

const KEY = 'wbvotes.homeAC';
const AC_ID = /^c\d{4}$/;

function read(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && AC_ID.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function useHomeAC() {
  const [homeAC, setState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(read());
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setState(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setHomeAC = (acId: string | null) => {
    try {
      if (acId === null) localStorage.removeItem(KEY);
      else if (AC_ID.test(acId)) localStorage.setItem(KEY, acId);
      else return;
    } catch {
      // ignore
    }
    setState(acId);
  };

  return { homeAC, setHomeAC, ready };
}
