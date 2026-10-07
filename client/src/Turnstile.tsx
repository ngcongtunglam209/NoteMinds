import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

/** No site key configured (local dev) = no widget, and requests go without a token. */
export const turnstileEnabled = Boolean(SITE_KEY);

let script: Promise<void> | undefined;

function loadScript() {
  script ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      script = undefined; // let a later mount retry
      el.remove();
      reject(new Error('turnstile script failed to load'));
    };
    document.head.append(el);
  });
  return script;
}

/**
 * Cloudflare Turnstile widget. Tokens are single-use: remount it (change its `key`)
 * after every failed submit to get a fresh one. `onToken` must be stable (e.g. a state setter).
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    loadScript().then(
      () => {
        if (cancelled || !ref.current) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      },
      () => onToken(null),
    );
    return () => {
      cancelled = true;
      if (widgetId) window.turnstile.remove(widgetId);
    };
  }, [onToken]);

  return <div ref={ref} />;
}
