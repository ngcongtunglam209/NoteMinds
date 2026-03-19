import { useEffect } from 'react';

/**
 * Global keyboard shortcuts for the app.
 * 
 * Shortcuts:
 * - Ctrl+K  → Search (callback: onSearch)
 * - Ctrl+/  → Help/shortcuts modal (callback: onHelp)
 * - Ctrl+E  → Export (callback: onExport)
 * - Ctrl+N  → New note (callback: onNewNote)
 * - Escape  → Close modal/panel (callback: onEscape)
 */
export default function useKeyboardShortcuts(shortcuts = {}) {
  useEffect(() => {
    const handler = (e) => {
      // Don't intercept when user is typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) {
        // Allow Escape in inputs
        if (e.key === 'Escape' && shortcuts.onEscape) {
          shortcuts.onEscape();
          return;
        }
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key === 'k') {
        e.preventDefault();
        shortcuts.onSearch?.();
      } else if (isCtrl && e.key === '/') {
        e.preventDefault();
        shortcuts.onHelp?.();
      } else if (isCtrl && e.key === 'e') {
        e.preventDefault();
        shortcuts.onExport?.();
      } else if (isCtrl && e.key === 'n') {
        e.preventDefault();
        shortcuts.onNewNote?.();
      } else if (e.key === 'Escape') {
        shortcuts.onEscape?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
