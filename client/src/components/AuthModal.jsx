import { useState, useRef, useEffect, useCallback } from 'react';
import { X, User, Mail, Lock, Eye, EyeOff, LogIn, UserPlus, Loader2, ArrowLeft, CheckCircle2, MailCheck, ShieldCheck, KeyRound, Fingerprint } from 'lucide-react';
import { register, login, forgotPassword, resendVerification, verify2FA, verify2FARecovery, getPasskeyAuthOptions, verifyPasskeyAuth, getPasskeyLoginOptions, verifyPasskeyLogin } from '../api';
import { startAuthentication } from '@simplewebauthn/browser';
import TurnstileModal from './TurnstileModal';
import { useLanguage } from '../LanguageContext';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, defaultTab = 'login', loginOnly = false }) {
  const initialTab = loginOnly && defaultTab === 'register' ? 'login' : defaultTab;
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const { t } = useLanguage();

  // 2FA code input (6 digits)
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  // Recovery code
  const [recoveryCode, setRecoveryCode] = useState('');

  // Turnstile modal
  const [showTurnstile, setShowTurnstile] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const pendingActionRef = useRef(null);

  // Form fields
  const [formData, setFormData] = useState({
    login: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    forgotEmail: '',
  });

  useEffect(() => {
    if (loginOnly && tab === 'register') {
      setTab('login');
    }
  }, [loginOnly, tab]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
    setSuccess('');
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    setError('');

    if (value && index < 5) {
      otpRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (paste.length > 0) {
      const newDigits = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = paste[i] || '';
      }
      setOtpDigits(newDigits);
      const focusIndex = Math.min(paste.length, 5);
      otpRefs[focusIndex].current?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Show Turnstile modal for verification
    pendingActionRef.current = { type: tab, formData: { ...formData } };
    setShowTurnstile(true);
  };

  const handleTurnstileVerified = async (token) => {
    setShowTurnstile(false);
    setTurnstileToken(token);
    setLoading(true);

    try {
      const action = pendingActionRef.current;
      if (!action) return;

      let result;
      if (action.type === 'login') {
        result = await login(action.formData.login, action.formData.password, token);

        if (result.requires2FA) {
          setTempToken(result.tempToken);
          setTotpEnabled(result.totpEnabled);
          setPasskeyEnabled(result.passkeyEnabled);
          setOtpDigits(['', '', '', '', '', '']);
          setTab('2fa-verify');
          setLoading(false);
          setTimeout(() => otpRefs[0].current?.focus(), 100);
          return;
        }

        onAuthSuccess(result.user);
        onClose();
      } else if (action.type === 'register') {
        if (loginOnly) {
          setError(t('auth.registerNotAvailable'));
          setLoading(false);
          return;
        }
        if (action.formData.password !== action.formData.confirmPassword) {
          setError(t('auth.passwordMismatch'));
          setLoading(false);
          return;
        }
        result = await register(
          action.formData.username,
          action.formData.email,
          action.formData.password,
          action.formData.displayName || action.formData.username,
          token
        );
        setRegisteredEmail(action.formData.email);
        onAuthSuccess(result.user);
        setTab('verify-notice');
      } else if (action.type === 'forgot') {
        const resp = await forgotPassword(action.formData.forgotEmail, token);
        setSuccess(resp.message);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('auth.errorOccurred'));
      setTurnstileToken(null);
    } finally {
      setLoading(false);
      pendingActionRef.current = null;
    }
  };

  const handleTurnstileError = (errorMsg) => {
    setError(errorMsg);
    setShowTurnstile(false);
    setTurnstileToken(null);
    pendingActionRef.current = null;
  };

  const handle2FAVerify = async () => {
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError(t('auth.enterOtp'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await verify2FA(tempToken, code);
      onAuthSuccess(result.user);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('auth.authCodeInvalid'));
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyAuth = async () => {
    setError('');
    setLoading(true);
    try {
      const options = await getPasskeyAuthOptions(tempToken);
      const authResponse = await startAuthentication({ optionsJSON: options });
      const result = await verifyPasskeyAuth(tempToken, authResponse);
      onAuthSuccess(result.user);
      onClose();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError(t('auth.passkeyAuthCanceled'));
      } else {
        setError(err.response?.data?.error || err.message || t('auth.passkeyAuthFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const options = await getPasskeyLoginOptions();
      const authResponse = await startAuthentication({ optionsJSON: options });
      const result = await verifyPasskeyLogin(authResponse);
      onAuthSuccess(result.user);
      onClose();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError(t('auth.passkeyLoginCanceled'));
      } else {
        setError(err.response?.data?.error || err.message || t('auth.passkeyLoginFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FARecovery = async () => {
    if (!recoveryCode.trim()) {
      setError(t('auth.enterRecoveryCode'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await verify2FARecovery(tempToken, recoveryCode.trim());
      onAuthSuccess(result.user);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('auth.recoveryCodeInvalid'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await resendVerification(registeredEmail);
      setSuccess(resp.message);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (newTab) => {
    setTab(newTab);
    setError('');
    setSuccess('');
    setFormData({ login: '', username: '', email: '', password: '', confirmPassword: '', displayName: '', forgotEmail: '' });
    setOtpDigits(['', '', '', '', '', '']);
    setRecoveryCode('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-surface border border-line rounded-2xl shadow-2xl animate-fade-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface-2 transition-colors text-muted hover:text-txt"
        >
          <X size={18} />
        </button>

        {/* 2FA Verification View */}
        {tab === '2fa-verify' && (
          <div className="px-6 py-8">
            <button
              onClick={() => switchTab('login')}
              className="flex items-center gap-1 text-sm text-muted hover:text-txt transition-colors mb-4"
            >
              <ArrowLeft size={14} /> {t('auth.backToLogin')}
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-600/20 flex items-center justify-center">
                <ShieldCheck size={32} className="text-primary-400" />
              </div>
              <h2 className="text-xl font-bold mb-1">{t('auth.twoFactor')}</h2>
              <p className="text-sm text-muted">
                {totpEnabled ? t('auth.twoFactorOtpDesc') : t('auth.twoFactorPasskeyDesc')}
              </p>
            </div>

            {error && (
              <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Passkey button (shown first if available) */}
            {passkeyEnabled && (
              <>
                <button
                  onClick={handlePasskeyAuth}
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary-600/25 mb-3"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {t('auth.verifying')}
                    </>
                  ) : (
                    <>
                      <Fingerprint size={18} /> {t('auth.verifyWithPasskey')}
                    </>
                  )}
                </button>

                {totpEnabled && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-line" />
                    <span className="text-xs text-muted">{t('auth.orEnterOtp')}</span>
                    <div className="flex-1 h-px bg-line" />
                  </div>
                )}
              </>
            )}

            {/* OTP Input (shown if TOTP is enabled) */}
            {totpEnabled && (
              <>
                <div className="flex gap-2 justify-center mb-6" onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={otpRefs[i]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-12 h-14 text-center text-xl font-bold bg-bg border border-line rounded-xl focus:outline-none focus:border-primary-500 transition-colors"
                      autoFocus={i === 0 && !passkeyEnabled}
                    />
                  ))}
                </div>

                <button
                  onClick={handle2FAVerify}
                  disabled={loading || otpDigits.join('').length !== 6}
                  className="w-full py-3 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary-600/25"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {t('auth.verifying')}
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} /> {t('auth.verify')}
                    </>
                  )}
                </button>
              </>
            )}

            <div className="mt-4 text-center">
              {totpEnabled && (
                <button
                  onClick={() => { setTab('2fa-recovery'); setError(''); }}
                  className="text-xs text-primary-400 hover:text-primary-300 transition-colors flex items-center justify-center gap-1 mx-auto"
                >
                  <KeyRound size={12} /> {t('auth.useRecoveryCode')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2FA Recovery Code View */}
        {tab === '2fa-recovery' && (
          <div className="px-6 py-8">
            <button
              onClick={() => { setTab('2fa-verify'); setError(''); setOtpDigits(['', '', '', '', '', '']); }}
              className="flex items-center gap-1 text-sm text-muted hover:text-txt transition-colors mb-4"
            >
              <ArrowLeft size={14} /> {t('auth.backToOtp')}
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                <KeyRound size={32} className="text-amber-400" />
              </div>
              <h2 className="text-xl font-bold mb-1">{t('auth.recoveryCode')}</h2>
              <p className="text-sm text-muted">
                {t('auth.recoveryCodeDesc')}
              </p>
            </div>

            {error && (
              <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="mb-4">
              <input
                type="text"
                value={recoveryCode}
                onChange={(e) => { setRecoveryCode(e.target.value); setError(''); }}
                placeholder={t('auth.recoveryCodePlaceholder')}
                className="w-full bg-bg border border-line rounded-xl px-4 py-3 text-sm text-center font-mono tracking-wider focus:outline-none focus:border-primary-500 transition-colors placeholder:text-muted/50"
                autoFocus
              />
            </div>

            <button
              onClick={handle2FARecovery}
              disabled={loading || !recoveryCode.trim()}
              className="w-full py-3 bg-amber-600 hover:bg-amber-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-amber-600/25"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('auth.verifying')}
                </>
              ) : (
                <>
                  <KeyRound size={16} /> {t('auth.verifyRecoveryCode')}
                </>
              )}
            </button>

            <p className="mt-3 text-xs text-muted text-center">
              {t('auth.recoveryCodeOneTime')}
            </p>
          </div>
        )}

        {/* Verify Notice View */}
        {tab === 'verify-notice' && (
          <div className="px-6 py-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-600/20 flex items-center justify-center">
              <MailCheck size={32} className="text-primary-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">{t('auth.checkEmail')}</h2>
            <p className="text-sm text-muted mb-4 leading-relaxed">
              {t('auth.verificationSent')} <strong className="text-primary-400">{registeredEmail}</strong>.
              {' '}{t('auth.checkSpam')}
            </p>
            {error && (
              <div className="mb-3 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-3 px-4 py-2.5 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400">
                {success}
              </div>
            )}
            <button
              onClick={handleResendVerification}
              disabled={loading}
              className="w-full py-2.5 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              {t('auth.resendVerification')}
            </button>
            <button
              onClick={onClose}
              className="mt-3 text-sm text-muted hover:text-txt transition-colors"
            >
              {t('auth.close')}
            </button>
          </div>
        )}

        {/* Forgot Password View */}
        {tab === 'forgot' && (
          <>
            <div className="px-6 pt-6 pb-4">
              <button
                onClick={() => switchTab('login')}
                className="flex items-center gap-1 text-sm text-muted hover:text-txt transition-colors mb-3"
              >
                <ArrowLeft size={14} /> {t('auth.backToLogin')}
              </button>
              <h2 className="text-xl font-bold font-display">{t('auth.forgotPasswordTitle')}</h2>
              <p className="text-sm text-muted mt-1">
                {t('auth.forgotPasswordSubtitle')}
              </p>
            </div>

            {error && (
              <div className="mx-6 mb-3 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}
            {success && (
              <div className="mx-6 mb-3 px-4 py-2.5 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400 flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
              <InputField
                icon={<Mail size={16} />}
                name="forgotEmail"
                type="email"
                placeholder={t('auth.forgotEmailPlaceholder')}
                value={formData.forgotEmail}
                onChange={handleChange}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || !formData.forgotEmail}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary-600/25 mt-4"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {t('auth.sending')}
                  </>
                ) : (
                  <>
                    <Mail size={16} /> {t('auth.sendResetLink')}
                  </>
                )}
              </button>
            </form>
          </>
        )}

        {/* Login / Register Views */}
        {(tab === 'login' || tab === 'register') && (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <h2 className="text-xl font-bold font-display text-center">
                {tab === 'login' ? t('auth.login') : t('auth.registerAccount')}
              </h2>
              <p className="text-sm text-muted text-center mt-1">
                {tab === 'login'
                  ? (loginOnly ? t('auth.loginAdminSubtitle') : t('auth.loginSubtitle'))
                  : t('auth.registerSubtitle')}
              </p>
            </div>

            {/* Tabs */}
            <div className="flex mx-6 mb-4 bg-bg rounded-lg p-1">
              <button
                onClick={() => switchTab('login')}
                className={`${loginOnly ? 'w-full' : 'flex-1'} flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${tab === 'login'
                  ? 'bg-primary-600 text-white shadow-lg'
                  : 'text-muted hover:text-txt'
                  }`}
              >
                <LogIn size={15} /> {t('auth.login')}
              </button>
              {!loginOnly && (
                <button
                  onClick={() => switchTab('register')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${tab === 'register'
                    ? 'bg-primary-600 text-white shadow-lg'
                    : 'text-muted hover:text-txt'
                    }`}
                >
                  <UserPlus size={15} /> {t('auth.register')}
                </button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mx-6 mb-3 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
              {tab === 'login' ? (
                <>
                  <InputField
                    icon={<User size={16} />}
                    name="login"
                    placeholder={t('auth.usernameOrEmail')}
                    value={formData.login}
                    onChange={handleChange}
                    autoFocus
                  />
                  <InputField
                    icon={<Lock size={16} />}
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth.password')}
                    value={formData.password}
                    onChange={handleChange}
                    suffix={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-muted hover:text-txt transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    }
                  />
                  <button
                    type="button"
                    onClick={() => switchTab('forgot')}
                    className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </>
              ) : (
                <>
                  <InputField
                    icon={<User size={16} />}
                    name="username"
                    placeholder={t('auth.usernamePlaceholder')}
                    value={formData.username}
                    onChange={handleChange}
                    autoFocus
                  />
                  <InputField
                    icon={<Mail size={16} />}
                    name="email"
                    type="email"
                    placeholder={t('auth.email')}
                    value={formData.email}
                    onChange={handleChange}
                  />
                  <InputField
                    icon={<User size={16} />}
                    name="displayName"
                    placeholder={t('auth.displayName')}
                    value={formData.displayName}
                    onChange={handleChange}
                  />
                  <InputField
                    icon={<Lock size={16} />}
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth.passwordMinLength')}
                    value={formData.password}
                    onChange={handleChange}
                    suffix={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-muted hover:text-txt transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    }
                  />
                  <InputField
                    icon={<Lock size={16} />}
                    name="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth.confirmPassword')}
                    value={formData.confirmPassword}
                    onChange={handleChange}
                  />
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary-600/25 mt-4"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {t('auth.processing')}
                  </>
                ) : tab === 'login' ? (
                  <>
                    <LogIn size={16} /> {t('auth.login')}
                  </>
                ) : (
                  <>
                    <UserPlus size={16} /> {t('auth.register')}
                  </>
                )}
              </button>

              {tab === 'login' && (
                <>
                  <div className="flex items-center gap-3 mt-4">
                    <div className="flex-1 h-px bg-line" />
                    <span className="text-xs text-muted">{t('auth.or')}</span>
                    <div className="flex-1 h-px bg-line" />
                  </div>
                  <button
                    type="button"
                    onClick={handlePasskeyLogin}
                    disabled={loading}
                    className="w-full py-3 mt-3 bg-surface-2 border border-line hover:bg-line rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        {t('auth.verifying')}
                      </>
                    ) : (
                      <>
                        <Fingerprint size={18} /> {t('auth.loginWithPasskey')}
                      </>
                    )}
                  </button>
                </>
              )}
            </form>
          </>
        )}
      </div>

      {/* Turnstile Verification Modal */}
      <TurnstileModal
        isOpen={showTurnstile}
        onClose={() => {
          setShowTurnstile(false);
          pendingActionRef.current = null;
        }}
        onVerified={handleTurnstileVerified}
        onError={handleTurnstileError}
      />
    </div>
  );
}

function InputField({ icon, suffix, ...props }) {
  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 text-muted">{icon}</span>
      <input
        {...props}
        className="w-full bg-bg border border-line rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-primary-500/50 transition-colors placeholder:text-muted/50"
      />
      {suffix && <span className="absolute right-3">{suffix}</span>}
    </div>
  );
}
