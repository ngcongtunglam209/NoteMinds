import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Check, Crown, Zap, Star, Package,
  Sparkles, Shield, Loader2, CheckCircle2, AlertCircle,
  Clock, RefreshCw, ExternalLink,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { createCheckoutSession, checkPaymentOrder } from '../api';

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    badge: '📦',
    price: 'Miễn phí',
    priceNote: 'mãi mãi',
    color: '#9496a1',
    bg: 'from-surface to-surface',
    border: 'border-line',
    popular: false,
    features: [
      '5 lượt upload / ngày',
      'Sơ đồ tư duy AI',
      'Flashcard thông minh',
      'Chat với tài liệu (10 tin/tài liệu)',
      'Hỗ trợ PDF, TXT, MD',
    ],
    limitations: [
      'Không hỗ trợ audio',
      'Giới hạn kích thước 10MB',
    ],
  },
  {
    key: 'basic',
    name: 'Basic',
    badge: '⭐',
    price: '49.000₫',
    priceNote: '/ tháng',
    color: '#fbbf24',
    bg: 'from-yellow-600/10 to-surface',
    border: 'border-yellow-500/30',
    popular: false,
    features: [
      '10 lượt upload / ngày',
      'Tất cả tính năng Free',
      'Chat với tài liệu (25 tin/tài liệu)',
      'Hỗ trợ file audio (MP3, WAV)',
      'Kích thước file lên đến 25MB',
      'Ưu tiên tốc độ xử lý',
    ],
    limitations: [],
  },
  {
    key: 'pro',
    name: 'Pro',
    badge: '💎',
    price: '99.000₫',
    priceNote: '/ tháng',
    color: '#818cf8',
    bg: 'from-indigo-600/10 to-surface',
    border: 'border-indigo-500/30',
    popular: true,
    features: [
      '30 lượt upload / ngày',
      'Tất cả tính năng Basic',
      'Chat với tài liệu (50 tin/tài liệu)',
      'Kích thước file lên đến 50MB',
      'Xử lý ưu tiên cao nhất',
      'Hỗ trợ DOCX, PPTX, XLSX',
      'Xuất Flashcard sang Anki',
    ],
    limitations: [],
  },
  {
    key: 'unlimited',
    name: 'Unlimited',
    badge: '👑',
    price: '199.000₫',
    priceNote: '/ tháng',
    color: 'var(--color-primary-500)',
    bg: 'from-primary-600/10 to-surface',
    border: 'border-primary-500/30',
    popular: false,
    features: [
      'Upload không giới hạn',
      'Tất cả tính năng Pro',
      'Không giới hạn kích thước',
      'Chat không giới hạn tin nhắn',
      'Hỗ trợ 1-1 ưu tiên',
    ],
    limitations: [],
  },
];

export default function PricingPage({ user, onLoginClick }) {
  const { t } = useLanguage();
  const currentPlan = user?.plan || 'free';
  const [contactPlan, setContactPlan] = useState(null);
  const [showContact, setShowContact] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null); // { status, orderId }

  // Detect payment return from SePay via URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment_status');
    const orderId = params.get('order_id');
    if (paymentStatus && orderId) {
      setPaymentResult({ status: paymentStatus, orderId });
      // Clean URL params without reload
      const url = new URL(window.location);
      url.searchParams.delete('payment_status');
      url.searchParams.delete('order_id');
      window.history.replaceState({}, '', url.pathname + url.hash);
    }
  }, []);

  const handleSelectPlan = (planKey) => {
    if (!user) {
      onLoginClick?.();
      return;
    }
    if (planKey === currentPlan) return;
    setContactPlan(planKey);
    setShowContact(true);
  };

  return (
    <section id="pricing" className="py-20">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold font-display mb-4">
            {t('pricing.title')} <span className="gradient-text">NoteMinds</span>
          </h2>
          <p className="text-muted">{t('pricing.subtitle')}</p>
        </div>

        {/* Current plan badge */}
        {user && (
          <div className="mb-8 flex items-center justify-center gap-2">
            <span className="text-sm text-muted">{t('pricing.currentPlan')}</span>
            <span
              className="px-3 py-1 rounded-full text-sm font-semibold"
              style={{
                backgroundColor: PLANS.find(p => p.key === currentPlan)?.color + '15',
                color: PLANS.find(p => p.key === currentPlan)?.color,
                border: `1px solid ${PLANS.find(p => p.key === currentPlan)?.color}30`,
              }}
            >
              {PLANS.find(p => p.key === currentPlan)?.badge} {PLANS.find(p => p.key === currentPlan)?.name}
            </span>
          </div>
        )}

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.key === currentPlan;
            const isDowngrade = PLANS.findIndex(p => p.key === plan.key) < PLANS.findIndex(p => p.key === currentPlan);

            return (
              <div
                key={plan.key}
                className={`relative bg-gradient-to-b ${plan.bg} border ${plan.popular ? plan.border : 'border-line'} rounded-2xl p-6 flex flex-col transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-black/10 ${isCurrent ? 'ring-2 ring-primary-500/50' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center gap-1">
                    <Sparkles size={12} /> {t('pricing.popular')}
                  </div>
                )}

                {isCurrent && (
                  <div className="absolute -top-3 right-4 px-3 py-1 bg-primary-600 text-white text-xs font-bold rounded-full">
                    {t('pricing.currentPlanBadge')}
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{plan.badge}</span>
                    <h3 className="text-lg font-bold" style={{ color: plan.color }}>{plan.name}</h3>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold">{plan.price}</span>
                    <span className="text-xs text-muted">{plan.priceNote}</span>
                  </div>
                </div>

                {/* Features */}
                <div className="flex-1 space-y-3 mb-6">
                  {plan.features.map((feat, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm">
                      <Check size={15} className="shrink-0 mt-0.5" style={{ color: plan.color }} />
                      <span className="text-muted">{feat}</span>
                    </div>
                  ))}
                  {plan.limitations.map((lim, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm text-muted/60">
                      <span className="shrink-0 mt-0.5 w-[15px] text-center">✕</span>
                      <span>{lim}</span>
                    </div>
                  ))}
                </div>

                {/* CTA button */}
                <button
                  onClick={() => handleSelectPlan(plan.key)}
                  disabled={isCurrent}
                  className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${isCurrent
                    ? 'bg-surface-2 text-muted cursor-default'
                    : isDowngrade
                      ? 'bg-surface-2 text-muted hover:bg-line'
                      : plan.popular
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25'
                        : 'bg-surface-2 hover:bg-line text-txt'
                    }`}
                >
                  {isCurrent ? t('pricing.inUse') : !user ? t('pricing.loginToSelect') : isDowngrade ? t('pricing.downgrade') : t('pricing.upgrade')}
                </button>
              </div>
            );
          })}
        </div>

        {/* FAQ / Info */}
        <div className="mt-16 max-w-3xl mx-auto" id="faq">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-extrabold font-display tracking-tight mb-2">{t('pricing.faq')}</h3>
            <p className="text-sm text-muted">{t('pricing.faqSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Cột 1 - Sản phẩm */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider px-1 mb-1">{t('pricing.aboutProduct')}</p>
              <FaqItem
                q={t('pricing.faqItems.q1')}
                a={t('pricing.faqItems.a1')}
              />
              <FaqItem
                q={t('pricing.faqItems.q2')}
                a={t('pricing.faqItems.a2')}
              />
              <FaqItem
                q={t('pricing.faqItems.q3')}
                a={t('pricing.faqItems.a3')}
              />
              <FaqItem
                q={t('pricing.faqItems.q4')}
                a={t('pricing.faqItems.a4')}
              />
            </div>

            {/* Cột 2 - Thanh toán & Tài khoản */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-accent-400 uppercase tracking-wider px-1 mb-1">{t('pricing.paymentAccount')}</p>
              <FaqItem
                q={t('pricing.faqItems.q5')}
                a={t('pricing.faqItems.a5')}
              />
              <FaqItem
                q={t('pricing.faqItems.q6')}
                a={t('pricing.faqItems.a6')}
              />
              <FaqItem
                q={t('pricing.faqItems.q7')}
                a={t('pricing.faqItems.a7')}
              />
              <FaqItem
                q={t('pricing.faqItems.q8')}
                a={t('pricing.faqItems.a8')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Contact modal */}
      {showContact && (
        <ContactModal
          plan={PLANS.find(p => p.key === contactPlan)}
          currentPlan={currentPlan}
          user={user}
          onClose={() => setShowContact(false)}
        />
      )}

      {/* Payment result modal (after returning from SePay) */}
      {paymentResult && (
        <PaymentResultModal
          result={paymentResult}
          onClose={() => setPaymentResult(null)}
        />
      )}
    </section>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bg-surface border rounded-xl overflow-hidden transition-colors duration-300 ${open ? 'border-primary-500/30 shadow-sm shadow-primary-500/5' : 'border-line'}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-3.5 text-left gap-3 group">
        <span className="text-sm font-medium group-hover:text-primary-400 transition-colors">{q}</span>
        <span className={`text-muted transition-transform duration-300 shrink-0 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-4 text-sm text-muted border-t border-line pt-3 leading-relaxed">
            {a}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactModal({ plan, currentPlan, onClose, user }) {
  const { t } = useLanguage();
  if (!plan) return null;

  const PLAN_ORDER = ['free', 'basic', 'pro', 'unlimited'];
  const isDowngrade = PLAN_ORDER.indexOf(plan.key) < PLAN_ORDER.indexOf(currentPlan);

  if (isDowngrade) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-sm bg-surface border border-line rounded-2xl shadow-2xl animate-fade-in p-6 text-center">
          <div className="text-4xl mb-3">{plan.badge}</div>
          <h3 className="text-lg font-bold mb-1">{t('pricing.downgradeToName', { name: plan.name })}</h3>
          <p className="text-muted text-sm mb-4">{plan.price} {plan.priceNote}</p>
          <div className="bg-bg rounded-xl p-4 mb-4 text-left space-y-2">
            <p className="text-sm font-medium text-yellow-400">{t('pricing.downgradeNote')}</p>
            <p className="text-xs text-muted">• {t('pricing.downgradeDesc1')}</p>
            <p className="text-xs text-muted">• {t('pricing.downgradeDesc3', { name: plan.name })}</p>
            <p className="text-xs text-muted">• {t('pricing.downgradeDesc2')}</p>
            <div className="border-t border-line pt-2 mt-2">
              <p className="text-xs text-muted">{t('pricing.downgradeContact')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors">
            {t('pricing.understood')}
          </button>
        </div>
      </div>
    );
  }

  return <PaymentModal plan={plan} user={user} onClose={onClose} />;
}

function PaymentModal({ plan, user, onClose }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const formRef = useRef(null);
  const [checkoutData, setCheckoutData] = useState(null);

  // Create checkout session on mount and auto-submit form
  useEffect(() => {
    let cancelled = false;
    async function initCheckout() {
      try {
        setLoading(true);
        setError(null);
        const session = await createCheckoutSession(plan.key);
        if (cancelled) return;
        setCheckoutData(session);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.error || err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    initCheckout();
    return () => { cancelled = true; };
  }, [plan.key]);

  // Auto-submit form once checkout data is ready
  useEffect(() => {
    if (checkoutData && formRef.current) {
      formRef.current.submit();
    }
  }, [checkoutData]);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCheckoutData(null);
    try {
      const session = await createCheckoutSession(plan.key);
      setCheckoutData(session);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [plan.key]);

  const formatPrice = (amount) => {
    return new Intl.NumberFormat('vi-VN').format(amount) + '\u20ab';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-surface border border-line rounded-2xl shadow-2xl animate-fade-in overflow-hidden">

        {/* Header */}
        <div className="p-5 pb-3 text-center border-b border-line">
          <div className="text-3xl mb-2">{plan.badge}</div>
          <h3 className="text-lg font-bold">
            {t('pricing.upgradeToName', { name: plan.name })}
          </h3>
          <p className="text-muted text-sm">{plan.price} {plan.priceNote}</p>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* Loading / redirecting */}
          {loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="animate-spin text-primary-500" size={32} />
              <p className="text-sm text-muted">{t('pricing.payment.creatingOrder')}</p>
            </div>
          )}

          {/* Redirecting to SePay */}
          {!loading && checkoutData && (
            <div className="flex flex-col items-center gap-3 py-8">
              <ExternalLink className="text-primary-500" size={32} />
              <p className="text-sm text-muted">{t('pricing.payment.redirecting')}</p>
              <p className="text-xs text-muted/60">{t('pricing.payment.redirectingDesc')}</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <AlertCircle className="text-red-400" size={32} />
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={handleRetry} className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-line rounded-lg text-sm transition-colors">
                <RefreshCw size={14} /> {t('pricing.payment.retry')}
              </button>
            </div>
          )}
        </div>

        {/* Hidden checkout form */}
        {checkoutData && (
          <form ref={formRef} action={checkoutData.checkoutUrl} method="POST" style={{ display: 'none' }}>
            {Object.entries(checkoutData.formFields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
          </form>
        )}

        {/* Footer */}
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full py-2.5 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium transition-colors text-muted">
            {t('pricing.payment.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentResultModal({ result, onClose }) {
  const { t } = useLanguage();
  const [orderStatus, setOrderStatus] = useState(null);
  const [checking, setChecking] = useState(true);
  const pollRef = useRef(null);
  const pollStartRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const order = await checkPaymentOrder(result.orderId);
        if (cancelled) return;
        setOrderStatus(order.status);
        if (result.status === 'success' && order.status === 'pending') {
          pollStartRef.current = Date.now();
          pollRef.current = setInterval(async () => {
            // Stop polling after 2 minutes
            if (Date.now() - pollStartRef.current > 120000) {
              clearInterval(pollRef.current);
              setOrderStatus('timeout');
              return;
            }
            try {
              const updated = await checkPaymentOrder(result.orderId);
              if (updated.status === 'paid') {
                setOrderStatus('paid');
                clearInterval(pollRef.current);
              } else if (updated.status === 'expired' || updated.status === 'cancelled') {
                setOrderStatus(updated.status);
                clearInterval(pollRef.current);
              }
            } catch { /* retry */ }
          }, 3000);
        }
      } catch {
        if (!cancelled) setOrderStatus('error');
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    check();
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
    };
  }, [result]);

  const handleClose = () => {
    clearInterval(pollRef.current);
    if (orderStatus === 'paid') {
      window.location.reload();
    } else {
      onClose();
    }
  };

  // Compute single display state (mutually exclusive)
  let displayState = 'checking';
  if (!checking) {
    if (orderStatus === 'paid') {
      displayState = 'paid';
    } else if (result.status === 'success' && orderStatus === 'pending') {
      displayState = 'processing';
    } else if (result.status === 'cancel' || orderStatus === 'cancelled') {
      displayState = 'cancelled';
    } else if (orderStatus === 'timeout') {
      displayState = 'timeout';
    } else {
      displayState = 'error';
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-sm bg-surface border border-line rounded-2xl shadow-2xl animate-fade-in p-6 text-center">

        {displayState === 'checking' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="animate-spin text-primary-500" size={32} />
            <p className="text-sm text-muted">{t('pricing.payment.checkingStatus')}</p>
          </div>
        )}

        {displayState === 'paid' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="text-emerald-400" size={36} />
            </div>
            <h4 className="text-lg font-bold text-emerald-400">{t('pricing.payment.success')}</h4>
            <p className="text-sm text-muted">{t('pricing.payment.successGeneric')}</p>
            <button onClick={handleClose} className="mt-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors">
              {t('pricing.payment.continue')}
            </button>
          </div>
        )}

        {displayState === 'processing' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="animate-spin text-primary-500" size={32} />
            <h4 className="text-base font-bold">{t('pricing.payment.processing')}</h4>
            <p className="text-sm text-muted">{t('pricing.payment.processingDesc')}</p>
          </div>
        )}

        {displayState === 'cancelled' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <AlertCircle className="text-yellow-400" size={32} />
            <h4 className="text-base font-bold text-yellow-400">{t('pricing.payment.cancelled')}</h4>
            <p className="text-sm text-muted">{t('pricing.payment.cancelledDesc')}</p>
            <button onClick={handleClose} className="mt-2 px-6 py-2.5 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium transition-colors">
              {t('pricing.payment.close')}
            </button>
          </div>
        )}

        {displayState === 'timeout' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Clock className="text-yellow-400" size={32} />
            <h4 className="text-base font-bold text-yellow-400">{t('pricing.payment.timeoutTitle') || 'Đang chờ xác nhận'}</h4>
            <p className="text-sm text-muted">{t('pricing.payment.timeoutDesc') || 'Thanh toán của bạn đang được xử lý. Vui lòng kiểm tra lại sau vài phút.'}</p>
            <button onClick={handleClose} className="mt-2 px-6 py-2.5 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium transition-colors">
              {t('pricing.payment.close')}
            </button>
          </div>
        )}

        {displayState === 'error' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <AlertCircle className="text-red-400" size={32} />
            <h4 className="text-base font-bold text-red-400">{t('pricing.payment.errorTitle')}</h4>
            <p className="text-sm text-muted">{t('pricing.payment.errorDesc')}</p>
            <button onClick={handleClose} className="mt-2 px-6 py-2.5 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium transition-colors">
              {t('pricing.payment.close')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
