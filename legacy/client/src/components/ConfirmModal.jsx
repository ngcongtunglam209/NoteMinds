import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';

/**
 * Reusable confirmation modal.
 * @param {object} props
 * @param {boolean}  props.open       - Show/hide
 * @param {string}   props.title      - Modal title
 * @param {string}   props.message    - Description text
 * @param {string}   [props.confirmLabel='Xác nhận'] - Confirm button text
 * @param {string}   [props.cancelLabel='Hủy']       - Cancel button text
 * @param {'danger'|'warning'|'info'} [props.variant='warning']
 * @param {boolean}  [props.loading]  - Show spinner on confirm btn
 * @param {function} props.onConfirm  - Callback on confirm
 * @param {function} props.onCancel   - Callback on cancel / close
 */
export default function ConfirmModal({
  open,
  title = 'Xác nhận',
  message = 'Bạn có chắc chắn muốn thực hiện hành động này?',
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  variant = 'warning',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const palette = {
    danger:  { bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: 'text-red-400',     btn: 'bg-red-600 hover:bg-red-700' },
    warning: { bg: 'bg-amber-500/10',    border: 'border-amber-500/30',   icon: 'text-amber-400',   btn: 'bg-amber-600 hover:bg-amber-700' },
    info:    { bg: 'bg-primary-500/10',  border: 'border-primary-500/30', icon: 'text-primary-400', btn: 'bg-primary-600 hover:bg-primary-700' },
  };

  const colors = palette[variant] || palette.warning;

  const Icon = variant === 'info' ? Info : AlertTriangle;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onCancel?.()} />
      <div className="relative w-full max-w-sm bg-surface border border-line rounded-2xl shadow-2xl animate-fade-in p-6">
        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${colors.bg} ${colors.border} border`}>
          <Icon size={22} className={colors.icon} />
        </div>
        <h3 className="text-center text-lg font-bold font-display mb-2">{title}</h3>
        <p className="text-center text-sm text-muted mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={() => !loading && onCancel?.()}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-surface-2 hover:bg-line transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={() => !loading && onConfirm?.()}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${colors.btn}`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
