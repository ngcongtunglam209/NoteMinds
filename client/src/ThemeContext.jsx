import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ── Theme definitions ──────────────────────────────────
// Each theme defines: primary color scale, accent, gradient, and a label/emoji
export const THEMES = {
  rose: {
    label: 'Hồng',
    emoji: '🌸',
    primary: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337' },
    accent: { 50: '#fff3e0', 100: '#ffe0b2', 200: '#ffcc80', 300: '#ffb74d', 400: '#ffa726', 500: '#ff9800', 600: '#fb8c00', 700: '#f57c00', 800: '#ef6c00', 900: '#e65100' },
    gradient: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 50%, #ffa726 100%)',
  },
  violet: {
    label: 'Tím',
    emoji: '💜',
    primary: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95' },
    accent: { 50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e' },
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 50%, #38bdf8 100%)',
  },
  blue: {
    label: 'Xanh dương',
    emoji: '💙',
    primary: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a' },
    accent: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' },
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #34d399 100%)',
  },
  emerald: {
    label: 'Xanh lá',
    emoji: '💚',
    primary: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' },
    accent: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f' },
    gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 50%, #fbbf24 100%)',
  },
  amber: {
    label: 'Cam vàng',
    emoji: '🧡',
    primary: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f' },
    accent: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337' },
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #fb7185 100%)',
  },
  cyan: {
    label: 'Xanh ngọc',
    emoji: '🩵',
    primary: { 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63' },
    accent: { 50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87' },
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 50%, #c084fc 100%)',
  },
};

const STORAGE_KEY = 'notemind-theme';
const MODE_STORAGE_KEY = 'notemind-mode';
const DEFAULT_THEME = 'rose';
const DEFAULT_MODE = 'auto'; // 'auto', 'light', 'dark'

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME; }
    catch { return DEFAULT_THEME; }
  });

  const [mode, setModeState] = useState(() => {
    try { return localStorage.getItem(MODE_STORAGE_KEY) || DEFAULT_MODE; }
    catch { return DEFAULT_MODE; }
  });

  const applyColors = useCallback((themeKey) => {
    const t = THEMES[themeKey] || THEMES[DEFAULT_THEME];
    const root = document.documentElement;

    Object.entries(t.primary).forEach(([shade, color]) => root.style.setProperty(`--color-primary-${shade}`, color));
    Object.entries(t.accent).forEach(([shade, color]) => root.style.setProperty(`--color-accent-${shade}`, color));
    root.style.setProperty('--gradient-text', t.gradient);
    root.setAttribute('data-theme', themeKey);
  }, []);

  const applyMode = useCallback((currentMode) => {
    const root = document.documentElement;
    const isDarkOS = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (currentMode === 'dark' || (currentMode === 'auto' && isDarkOS)) {
      root.classList.remove('light');
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
  }, []);

  // Effect for color theme changes
  useEffect(() => {
    applyColors(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { }
  }, [theme, applyColors]);

  // Effect for dark/light mode changes
  useEffect(() => {
    applyMode(mode);
    try { localStorage.setItem(MODE_STORAGE_KEY, mode); } catch { }

    if (mode === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyMode('auto');
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [mode, applyMode]);

  const setTheme = (key) => {
    if (THEMES[key]) setThemeState(key);
  };

  const setMode = (newMode) => {
    if (['auto', 'light', 'dark'].includes(newMode)) setModeState(newMode);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
