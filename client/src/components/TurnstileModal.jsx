import { useRef, useEffect } from 'react';
import { Shield, X } from 'lucide-react';
import { useLanguage } from '../LanguageContext';

const TURNSTILE_SITE_KEY = '0x4AAAAAACCkEz_zQ397q5Sv';

export default function TurnstileModal({ isOpen, onClose, onVerified, onError }) {
  const { t } = useLanguage();
  const turnstileRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const initTurnstile = () => {
      if (!window.turnstile || !turnstileRef.current) return;

      // Remove existing widget
      if (widgetIdRef.current !== null) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          console.error('Failed to remove turnstile widget:', e);
        }
        widgetIdRef.current = null;
      }

      // Render new widget
      try {
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => {
            onVerified(token);
          },
          'expired-callback': () => {
            onError?.(t('turnstile.expired'));
          },
          'error-callback': () => {
            onError?.(t('turnstile.verifyError'));
          },
          theme: 'dark',
          size: 'normal',
        });
      } catch (e) {
        console.error('Failed to render turnstile:', e);
        onError?.(t('turnstile.loadError'));
      }
    };

    // Wait for turnstile to load
    if (window.turnstile) {
      initTurnstile();
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          initTurnstile();
        }
      }, 200);
      return () => clearInterval(interval);
    }

    // Cleanup on unmount
    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          console.error('Cleanup error:', e);
        }
        widgetIdRef.current = null;
      }
    };
  }, [isOpen, onVerified, onError, t]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-line rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-hover rounded-lg transition-colors text-text-secondary"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
            <Shield size={32} className="text-white" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-text mb-2">
              {t('turnstile.title')}
            </h2>
            <p className="text-text-secondary text-sm">
              {t('turnstile.subtitle')}
            </p>
          </div>
        </div>

        {/* Turnstile Widget */}
        <div className="flex justify-center">
          <div ref={turnstileRef} />
        </div>

        {/* Info text */}
        <p className="text-xs text-text-secondary text-center mt-6">
          {t('turnstile.protectedBy')}
        </p>
      </div>
    </div>
  );
}
