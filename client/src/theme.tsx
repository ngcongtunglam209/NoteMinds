import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { load, save } from './storage.ts';

export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'nm.theme';

const ThemeContext = createContext<{ pref: ThemePref; setPref: (pref: ThemePref) => void } | null>(null);

function initialPref(): ThemePref {
  const stored = load(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/** Resolves the preference to `data-theme="light|dark"` on <html>, following the OS while on "system". */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<ThemePref>(initialPref);

  useEffect(() => {
    save(STORAGE_KEY, pref);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = pref === 'system' ? (media.matches ? 'dark' : 'light') : pref;
    };
    apply();
    if (pref !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [pref]);

  const value = useMemo(() => ({ pref, setPref }), [pref]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme outside ThemeProvider');
  return value;
}
