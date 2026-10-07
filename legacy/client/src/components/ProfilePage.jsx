import { useState, useEffect, useRef } from 'react';
import {
    ArrowLeft, User, Mail, Shield, ShieldCheck, Crown, Calendar, Clock,
    CheckCircle2, XCircle, Fingerprint, KeyRound, Loader2, Edit3,
    Save, X, Lock, ShieldOff, RefreshCw, Copy, Palette, AlertCircle, Plus, Trash2, Download, Moon, Sun, Monitor, Camera, Send, Languages
} from 'lucide-react';
import {
    updateProfile, get2FAStatus, getPasskeyList, changePassword,
    setup2FA, enable2FA, disable2FA, regenerateRecoveryCodes,
    getPasskeyRegisterOptions, verifyPasskeyRegistration, deletePasskey,
    resendVerification, getApiBaseUrl, updatePresenceStatus, updatePlanBadgeVisibility
} from '../api';
import { useTheme, THEMES } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import ConfirmModal from './ConfirmModal';
import TurnstileModal from './TurnstileModal';
import { startRegistration } from '@simplewebauthn/browser';

export default function ProfilePage({ user, onBack, onUserUpdate, onOpenAuth }) {
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'security' | 'theme' | 'language'
    const { t, language: currentLang, setLanguage } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Profile editing
    const [editing, setEditing] = useState(false);
    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

    // Email editing
    const [editingEmail, setEditingEmail] = useState(false);
    const [newEmail, setNewEmail] = useState(user?.email || '');
    const [emailSaving, setEmailSaving] = useState(false);
    const [verificationSending, setVerificationSending] = useState(false);
    const [presenceStatus, setPresenceStatus] = useState(user?.presenceStatus || 'online');
    const [presenceSaving, setPresenceSaving] = useState(false);
    const [showPlanBadge, setShowPlanBadge] = useState(user?.showPlanBadge !== false);
    const [planBadgeSaving, setPlanBadgeSaving] = useState(false);

    // Password
    const [oldPw, setOldPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [showPwConfirm, setShowPwConfirm] = useState(false);

    // 2FA
    const [twoFAStatus, setTwoFAStatus] = useState(null);
    const [twoFAStep, setTwoFAStep] = useState('status'); // 'status' | 'setup' | 'recovery-codes' | 'disable' | 'regen'
    const [setupData, setSetupData] = useState(null);
    const [totpCode, setTotpCode] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState(null);
    const [disablePassword, setDisablePassword] = useState('');
    const [regenPassword, setRegenPassword] = useState('');

    // Passkeys
    const [passkeys, setPasskeys] = useState([]);
    const [passkeyName, setPasskeyName] = useState('');
    const [loadingPasskeys, setLoadingPasskeys] = useState(false);

    // Theme
    const { theme: currentTheme, setTheme, mode, setMode } = useTheme();

    // Turnstile verification
    const [showTurnstile, setShowTurnstile] = useState(false);
    const pendingEmailRef = useRef(null);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        Promise.all([
            get2FAStatus().catch(() => ({ enabled: false, recoveryCodesRemaining: 0 })),
            getPasskeyList().catch(() => ({ passkeys: [] })),
        ]).then(([status, pkData]) => {
            setTwoFAStatus(status);
            setPasskeys(pkData.passkeys || []);
        }).finally(() => setLoading(false));
    }, [user]);

    useEffect(() => {
        setPresenceStatus(user?.presenceStatus || 'online');
    }, [user?.presenceStatus]);

    useEffect(() => {
        setShowPlanBadge(user?.showPlanBadge !== false);
    }, [user?.showPlanBadge]);

    const handlePresenceChange = async (nextStatus) => {
        if (!user || nextStatus === presenceStatus || presenceSaving) return;
        setError('');
        setSuccess('');
        setPresenceSaving(true);
        try {
            const result = await updatePresenceStatus(nextStatus);
            onUserUpdate?.(result.user);
            setPresenceStatus(result.user?.presenceStatus || nextStatus);
            setSuccess(t('profile.presenceUpdateSuccess'));
            setTimeout(() => setSuccess(''), 2500);
        } catch (err) {
            setError(err.response?.data?.error || err.message || t('profile.presenceUpdateError'));
        } finally {
            setPresenceSaving(false);
        }
    };

    const handlePlanBadgeVisibilityChange = async (visible) => {
        if (!user || planBadgeSaving || visible === showPlanBadge) return;
        setError('');
        setSuccess('');
        setPlanBadgeSaving(true);
        try {
            const result = await updatePlanBadgeVisibility(visible);
            onUserUpdate?.(result.user);
            setShowPlanBadge(result.user?.showPlanBadge !== false);
            setSuccess(t('profile.planBadgeUpdateSuccess'));
            setTimeout(() => setSuccess(''), 2500);
        } catch (err) {
            setError(err.response?.data?.error || err.message || t('profile.planBadgeUpdateError'));
        } finally {
            setPlanBadgeSaving(false);
        }
    };

    const load2FAStatus = async () => {
        try {
            const status = await get2FAStatus();
            setTwoFAStatus(status);
        } catch {
            setTwoFAStatus({ enabled: false, recoveryCodesRemaining: 0 });
        }
    };

    const loadPasskeys = async () => {
        setLoadingPasskeys(true);
        try {
            const data = await getPasskeyList();
            setPasskeys(data.passkeys || []);
        } catch {
            setPasskeys([]);
        } finally {
            setLoadingPasskeys(false);
        }
    };

    const handleSaveProfile = async () => {
        setError(''); setSuccess('');
        try {
            // Need to handle both regular profile and avatar uploads.
            // For now, we'll build a standard updateProfile call, assuming backend handles avatar separately or via multipart.
            // Let's implement an avatar upload endpoint if needed, or assume updateProfile handles multipart.
            // Given the original api.js, updateProfile sends JSON. Let's create an uploadAvatar api call.

            if (avatarFile) {
                const formData = new FormData();
                formData.append('avatar', avatarFile);
                const token = localStorage.getItem('notemind_token');
                const response = await fetch(`${getApiBaseUrl()}/users/profile/avatar`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData,
                    credentials: 'include'
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || t('profile.avatarUploadError'));
                }
                const data = await response.json();
                onUserUpdate?.(data.user);
            }

            if (displayName !== user?.displayName) {
                const result = await updateProfile(displayName);
                onUserUpdate?.(result.user);
            }

            setSuccess(t('profile.profileUpdateSuccess'));
            setEditing(false);
            setAvatarFile(null);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        }
    };

    const handleChangeEmail = async () => {
        setError(''); setSuccess('');
        const trimmed = newEmail.trim().toLowerCase();
        if (!trimmed) return setError(t('profile.emailEmpty'));
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return setError(t('profile.emailInvalid'));
        if (trimmed === user?.email?.toLowerCase()) {
            setEditingEmail(false);
            return;
        }
        // Show Turnstile modal for verification
        pendingEmailRef.current = trimmed;
        setShowTurnstile(true);
    };

    const handleTurnstileVerified = async (token) => {
        setShowTurnstile(false);
        const trimmed = pendingEmailRef.current;
        if (!trimmed) return;

        setEmailSaving(true);
        try {
            const result = await updateProfile(undefined, trimmed);
            onUserUpdate?.(result.user);
            setSuccess(t('profile.emailUpdateSuccess'));
            setEditingEmail(false);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setEmailSaving(false);
            pendingEmailRef.current = null;
        }
    };

    const handleTurnstileError = (errorMsg) => {
        setError(errorMsg);
        setShowTurnstile(false);
        pendingEmailRef.current = null;
    };

    const handleResendVerification = async () => {
        setError(''); setSuccess('');
        setVerificationSending(true);
        try {
            await resendVerification(user.email);
            setSuccess(t('profile.verificationEmailSent'));
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setVerificationSending(false);
        }
    };

    const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) return setError(t('profile.avatarTooLarge'));
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleQuickAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) return setError(t('profile.avatarTooLarge'));
        setAvatarUploading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('avatar', file);
            const token = localStorage.getItem('notemind_token');
            const response = await fetch(`${getApiBaseUrl()}/users/profile/avatar`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
                credentials: 'include'
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || t('profile.avatarUploadError'));
            }
            const data = await response.json();
            onUserUpdate?.(data.user);
            setSuccess(t('profile.avatarUpdateSuccess'));
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setAvatarUploading(false);
            e.target.value = '';
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setError(''); setSuccess('');
        if (newPw !== confirmPw) return setError(t('profile.passwordMismatch'));
        if (newPw.length < 6) return setError(t('profile.passwordTooShort'));
        setShowPwConfirm(true);
    };

    const executeChangePassword = async () => {
        setShowPwConfirm(false);
        setLoading(true); setError(''); setSuccess('');
        try {
            await changePassword(oldPw, newPw);
            setSuccess(t('profile.passwordChanged'));
            setOldPw(''); setNewPw(''); setConfirmPw('');
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setLoading(false); }
    };

    // 2FA Handlers
    const handleSetup2FA = async () => {
        setLoading(true); setError(''); setSuccess('');
        try {
            const data = await setup2FA();
            setSetupData(data);
            setTwoFAStep('setup');
            setTotpCode('');
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setLoading(false); }
    };

    const handleEnable2FA = async () => {
        setLoading(true); setError(''); setSuccess('');
        try {
            const result = await enable2FA(totpCode);
            setRecoveryCodes(result.recoveryCodes);
            setTwoFAStep('recovery-codes');
            setSetupData(null);
            setTotpCode('');
            load2FAStatus(); // refresh status in background
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setLoading(false); }
    };

    const handleDisable2FA = async () => {
        setLoading(true); setError(''); setSuccess('');
        try {
            const result = await disable2FA(disablePassword);
            setTwoFAStatus({ enabled: false, recoveryCodesRemaining: 0 });
            setTwoFAStep('status');
            setDisablePassword('');
            setSuccess(t('profile.disabled2faSuccess'));
            onUserUpdate?.(result.user);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setLoading(false); }
    };

    const handleRegenCodes = async () => {
        setLoading(true); setError(''); setSuccess('');
        try {
            const result = await regenerateRecoveryCodes(regenPassword);
            setRecoveryCodes(result.recoveryCodes);
            setTwoFAStep('recovery-codes');
            setRegenPassword('');
            load2FAStatus();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setLoading(false); }
    };

    // Passkey Handlers
    const handleRegisterPasskey = async () => {
        setLoading(true); setError(''); setSuccess('');
        try {
            const options = await getPasskeyRegisterOptions();
            const regResponse = await startRegistration({ optionsJSON: options });
            await verifyPasskeyRegistration(regResponse, passkeyName || 'Passkey');
            setSuccess(t('profile.passkeyAdded'));
            setPasskeyName('');
            loadPasskeys();
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                setError(t('profile.passkeyRegisterCanceled'));
            } else {
                setError(err.response?.data?.error || err.message || t('profile.passkeyRegisterFailed'));
            }
        } finally { setLoading(false); }
    };

    const handleDeletePasskey = async (id) => {
        setLoading(true); setError(''); setSuccess('');
        try {
            await deletePasskey(id);
            setSuccess(t('profile.passkeyDeleted'));
            loadPasskeys();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally { setLoading(false); }
    };

    if (!user) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-surface border border-line flex items-center justify-center">
                        <User size={36} className="text-muted" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">{t('profile.notLoggedIn')}</h2>
                    <p className="text-sm text-muted mb-6">{t('profile.loginToView')}</p>
                    <button
                        onClick={() => onOpenAuth?.('login')}
                        className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors"
                    >
                        {t('auth.login')}
                    </button>
                </div>
            </div>
        );
    }

    const initials = (user.displayName || user.username || '?').slice(0, 2).toUpperCase();
    const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString(currentLang === 'vi' ? 'vi-VN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
    const lastLogin = user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString(currentLang === 'vi' ? 'vi-VN' : 'en-US') : 'N/A';
    const planColors = {
        free: 'from-gray-400 to-gray-500',
        pro: 'from-blue-400 to-blue-600',
        premium: 'from-amber-400 to-orange-500',
        admin: 'from-purple-400 to-purple-600',
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted hover:text-txt transition-colors mb-6 group">
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                {t('profile.goBack')}
            </button>

            {/* ── Profile Header ── */}
            <div className="relative bg-surface border border-line rounded-2xl overflow-hidden mb-6">
                <div className={`h-32 bg-gradient-to-r relative ${user.plan === 'premium' || user.plan === 'pro' ? 'from-amber-500/30 via-primary-500/20 to-purple-600/30' : 'from-primary-600/30 via-primary-500/20 to-purple-600/30'}`}>
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE4YzMuMzEgMCA2LTIuNjkgNi02cy0yLjY5LTYtNi02LTYgMi42OS02IDYgMi42OSA2IDYgNnptMTIgMGMzLjMxIDAgNi0yLjY5IDYtNnMtMi42OS02LTYtNi02IDIuNjktNiA2IDIuNjkgNiA2IDZ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />
                </div>
                <div className="px-6 pb-6 -mt-12 relative">
                    <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                        <div className="relative group">
                            <div className={`w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-bold border-4 border-surface shadow-xl overflow-hidden ${user.plan === 'premium' || user.plan === 'pro' ? 'bg-gradient-to-br from-amber-400 to-primary-600 shadow-amber-500/20' : 'bg-gradient-to-br from-primary-500 to-purple-600'}`}>
                                {avatarPreview || user.avatar_url ? (
                                    <img src={avatarPreview || (user.avatar_url.startsWith('http') ? user.avatar_url : `${getApiBaseUrl()}${user.avatar_url}`)} alt={t('profile.avatarAlt')} className="w-full h-full object-cover" />
                                ) : (
                                    initials
                                )}
                            </div>

                            {/* Quick avatar upload button */}
                            <label className="absolute -top-1 -right-1 w-7 h-7 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center cursor-pointer shadow-lg transition-colors z-10" title={t('profile.changeAvatar')}>
                                {avatarUploading ? <Loader2 size={14} className="text-white animate-spin" /> : <Camera size={14} className="text-white" />}
                                <input type="file" accept="image/png, image/jpeg, image/jpg, image/webp" className="hidden" onChange={handleQuickAvatarUpload} disabled={avatarUploading} />
                            </label>

                            {editing && (
                                <label className="absolute inset-0 bg-black/60 rounded-2xl flex flex-col items-center justify-center text-white cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Edit3 size={20} className="mb-1" />
                                    <span className="text-[10px] uppercase font-bold tracking-wider">{t('profile.changePhoto')}</span>
                                    <input type="file" accept="image/png, image/jpeg, image/jpg" className="hidden" onChange={handleAvatarChange} />
                                </label>
                            )}

                            <div className={`absolute -bottom-1 -right-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r flex items-center gap-1 ${planColors[user.plan] || planColors.free} shadow-lg`}>
                                {(user.plan === 'premium' || user.plan === 'pro' || user.plan === 'admin') && <Crown size={10} />}
                                {user.planBadge || user.plan}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                {editing ? (
                                    <div className="flex items-center gap-2">
                                        <input autoFocus type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                                            className="bg-bg border border-line rounded-lg px-3 py-1.5 text-lg font-bold focus:outline-none focus:border-primary-500" />
                                        <button onClick={handleSaveProfile} className="p-1.5 bg-green-500/20 hover:bg-green-500/30 rounded-lg text-green-400"><Save size={16} /></button>
                                        <button onClick={() => { setEditing(false); setDisplayName(user.displayName || ''); }} className="p-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400"><X size={16} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <h1 className="text-2xl font-bold truncate">{user.displayName || user.username}</h1>
                                        <button onClick={() => setEditing(true)} className="p-1.5 hover:bg-surface-2 rounded-lg text-muted hover:text-txt"><Edit3 size={14} /></button>
                                    </>
                                )}
                                {user.role === 'admin' && <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-500/30 rounded-md text-[10px] font-bold text-purple-400 uppercase">{t('profile.admin')}</span>}
                                {user.role === 'admin' && <span className="px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 rounded-md text-[10px] font-bold text-emerald-400 uppercase">{t('profile.verified')}</span>}
                            </div>
                            <p className="text-sm text-muted mt-0.5">@{user.username}</p>
                            <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-muted">
                                <span className="flex items-center gap-1"><Mail size={12} /> {user.email} {user.emailVerified ? <CheckCircle2 size={12} className="text-green-400" /> : <XCircle size={12} className="text-amber-400" />}</span>
                                <span className="flex items-center gap-1"><Calendar size={12} /> {t('profile.joinedDate')} {memberSince}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Global Notifications */}
            {error && <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 flex items-center gap-2"><AlertCircle size={16} /> {error}</div>}
            {success && <div className="mb-6 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-400 flex items-center gap-2"><CheckCircle2 size={16} /> {success}</div>}

            {/* ── Tabs ── */}
            <div className="flex border-b border-line mb-6 overflow-x-auto hide-scrollbar">
                <button onClick={() => { setActiveTab('overview'); setError(''); setSuccess(''); }}
                    className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'overview' ? 'border-primary-500 text-primary-400' : 'border-transparent text-muted hover:text-txt'}`}>
                    <User size={16} /> {t('profile.overview')}
                </button>
                <button onClick={() => { setActiveTab('security'); setError(''); setSuccess(''); setTwoFAStep('status'); }}
                    className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'security' ? 'border-primary-500 text-primary-400' : 'border-transparent text-muted hover:text-txt'}`}>
                    <Shield size={16} /> {t('profile.security')}
                </button>
                <button onClick={() => { setActiveTab('theme'); setError(''); setSuccess(''); }}
                    className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'theme' ? 'border-primary-500 text-primary-400' : 'border-transparent text-muted hover:text-txt'}`}>
                    <Palette size={16} /> {t('profile.appearance')}
                </button>
                <button onClick={() => { setActiveTab('language'); setError(''); setSuccess(''); }}
                    className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'language' ? 'border-primary-500 text-primary-400' : 'border-transparent text-muted hover:text-txt'}`}>
                    <Languages size={16} /> {t('profile.language')}
                </button>
            </div>

            {/* ── Tab Content: Overview ── */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="bg-surface border border-line rounded-xl p-5 hover:border-primary-500/30 transition-colors">
                            <div className="flex items-center justify-between mb-3"><span className="text-xs text-muted uppercase tracking-wider font-medium">{t('profile.currentPlan')}</span><Crown size={16} className="text-amber-400" /></div>
                            <p className={`text-2xl font-bold bg-gradient-to-r ${planColors[user.plan] || planColors.free} bg-clip-text text-transparent`}>{user.planLabel || 'Free'}</p>
                            {user.planExpiresAt && <p className="text-[11px] text-muted mt-1">{t('profile.expiresAt')} {new Date(user.planExpiresAt).toLocaleDateString('vi-VN')}</p>}
                        </div>
                        <div className="bg-surface border border-line rounded-xl p-5 hover:border-primary-500/30 transition-colors">
                            <div className="flex items-center justify-between mb-3"><span className="text-xs text-muted uppercase tracking-wider font-medium">{t('profile.securityLabel')}</span><Shield size={16} className="text-primary-400" /></div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted">{t('profile.totp2fa')}</span>
                                    {twoFAStatus?.enabled ? <span className="flex items-center gap-1 text-xs text-green-400"><ShieldCheck size={12} /> {t('profile.enabled')}</span> : <span className="flex items-center gap-1 text-xs text-muted"><XCircle size={12} /> {t('profile.disabled')}</span>}
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted">{t('profile.passkeys')}</span>
                                    {passkeys.length > 0 ? <span className="flex items-center gap-1 text-xs text-green-400"><Fingerprint size={12} /> {passkeys.length}</span> : <span className="flex items-center gap-1 text-xs text-muted"><XCircle size={12} /> {t('profile.noneYet')}</span>}
                                </div>
                            </div>
                        </div>
                        <div className="bg-surface border border-line rounded-xl p-5 hover:border-primary-500/30 transition-colors">
                            <div className="flex items-center justify-between mb-3"><span className="text-xs text-muted uppercase tracking-wider font-medium">{t('profile.activity')}</span><Clock size={16} className="text-primary-400" /></div>
                            <div className="space-y-2">
                                <div><p className="text-[11px] text-muted mb-0.5">{t('profile.lastLogin')}</p><p className="text-sm font-medium">{lastLogin}</p></div>
                                {user.lastIp && <div><p className="text-[11px] text-muted mb-0.5">{t('profile.latestIp')}</p><p className="text-sm font-medium font-mono">{user.lastIp}</p></div>}
                            </div>
                        </div>
                    </div>
                    <div className="bg-surface border border-line rounded-xl p-5">
                        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><User size={16} className="text-primary-400" /> {t('profile.accountInfo')}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <InfoRow label={t('profile.id')} value={`#${user.id}`} />
                            <InfoRow label={t('profile.username')} value={`@${user.username}`} />
                            <InfoRow label={t('profile.displayNameLabel')} value={user.displayName || '—'} />
                        </div>
                    </div>

                    <div className="bg-surface border border-line rounded-xl p-5">
                        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Clock size={16} className="text-primary-400" /> {t('profile.presenceStatus')}</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                                { key: 'online', label: t('profile.statusOnline'), active: 'bg-green-500/15 border-green-500/30 text-green-400' },
                                { key: 'idle', label: t('profile.statusIdle'), active: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' },
                                { key: 'dnd', label: t('profile.statusDnd'), active: 'bg-rose-500/15 border-rose-500/30 text-rose-400' },
                                { key: 'invisible', label: t('profile.statusInvisible'), active: 'bg-zinc-500/15 border-zinc-500/30 text-zinc-300' },
                            ].map((option) => (
                                <button
                                    key={option.key}
                                    onClick={() => handlePresenceChange(option.key)}
                                    disabled={presenceSaving}
                                    className={`py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-60 ${presenceStatus === option.key ? option.active : 'border-line bg-bg text-muted hover:text-txt hover:border-primary-500/30'}`}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${presenceStatus === option.key ? 'bg-current' : 'bg-muted'}`} />
                                        {option.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-muted mt-3">{t('profile.presenceDesc')}</p>
                    </div>

                    <div className="bg-surface border border-line rounded-xl p-5">
                        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Crown size={16} className="text-primary-400" /> {t('profile.planBadge')}</h3>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium">{t('profile.planBadgeOnProfile')}</p>
                                <p className="text-[11px] text-muted mt-1">{t('profile.planBadgeDesc')}</p>
                            </div>
                            <button
                                onClick={() => handlePlanBadgeVisibilityChange(!showPlanBadge)}
                                disabled={planBadgeSaving}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-60 ${showPlanBadge ? 'bg-primary-600' : 'bg-surface-2 border border-line'}`}
                            >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${showPlanBadge ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>

                    {/* ── Email Change ── */}
                    <div className="bg-surface border border-line rounded-xl p-5">
                        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Mail size={16} className="text-primary-400" /> {t('profile.emailAddress')}</h3>
                        {editingEmail ? (
                            <div className="max-w-md space-y-3">
                                <div className="relative flex items-center">
                                    <span className="absolute left-3 text-muted"><Mail size={16} /></span>
                                    <input
                                        autoFocus
                                        type="email"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleChangeEmail(); if (e.key === 'Escape') { setEditingEmail(false); setNewEmail(user?.email || ''); } }}
                                        className="w-full bg-bg border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 transition-colors"
                                        placeholder={t('profile.emailPlaceholder')}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleChangeEmail}
                                        disabled={emailSaving}
                                        className="py-2 px-5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {emailSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {t('profile.saveEmail')}
                                    </button>
                                    <button
                                        onClick={() => { setEditingEmail(false); setNewEmail(user?.email || ''); setError(''); }}
                                        className="py-2 px-4 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium text-muted transition-colors"
                                    >
                                        {t('profile.cancel')}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-surface-2 rounded-xl flex items-center justify-center">
                                        <Mail size={18} className="text-muted" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium flex items-center gap-1.5">
                                            {user.email}
                                            {user.emailVerified ? <CheckCircle2 size={14} className="text-green-400" /> : <XCircle size={14} className="text-amber-400" />}
                                        </p>
                                        <p className="text-[11px] text-muted">{user.emailVerified ? t('profile.verified') : t('profile.unverified')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!user.emailVerified && (
                                        <button
                                            onClick={handleResendVerification}
                                            disabled={verificationSending}
                                            className="py-2 px-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            {verificationSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {t('profile.sendVerification')}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { setEditingEmail(true); setNewEmail(user?.email || ''); setError(''); setSuccess(''); }}
                                        className="py-2 px-4 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium text-muted hover:text-txt transition-colors flex items-center gap-1.5"
                                    >
                                        <Edit3 size={14} /> {t('profile.changeEmail')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Tab Content: Security & 2FA ── */}
            {activeTab === 'security' && (
                <div className="space-y-6">
                    {/* Change Password */}
                    <div className="bg-surface border border-line rounded-xl p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Lock size={18} className="text-primary-400" /> {t('profile.changePassword')}</h3>
                        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                            <div>
                                <label className="text-xs text-muted mb-1.5 block">{t('profile.currentPassword')}</label>
                                <div className="relative flex items-center">
                                    <span className="absolute left-3 text-muted"><Lock size={16} /></span>
                                    <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)}
                                        className="w-full bg-bg border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary-500" required />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-muted mb-1.5 block">{t('profile.newPassword')}</label>
                                <div className="relative flex items-center">
                                    <span className="absolute left-3 text-muted"><Lock size={16} /></span>
                                    <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder={t('profile.newPasswordPlaceholder')}
                                        className="w-full bg-bg border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary-500" required />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-muted mb-1.5 block">{t('profile.confirmNewPassword')}</label>
                                <div className="relative flex items-center">
                                    <span className="absolute left-3 text-muted"><Lock size={16} /></span>
                                    <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                                        className="w-full bg-bg border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary-500" required />
                                </div>
                            </div>
                            <button type="submit" disabled={loading} className="py-2.5 px-6 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t('profile.updatePassword')}
                            </button>
                        </form>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* TOTP 2FA */}
                        <div className="bg-surface border border-line rounded-xl p-6">
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><ShieldCheck size={18} className="text-primary-400" /> {t('profile.totp')}</h3>

                            {twoFAStep === 'status' && (
                                <div className="space-y-4">
                                    <div className={`flex items-center gap-3 p-4 rounded-xl border ${twoFAStatus?.enabled ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-bg border-line'}`}>
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${twoFAStatus?.enabled ? 'bg-emerald-500/20' : 'bg-surface-2'}`}>
                                            {twoFAStatus?.enabled ? <ShieldCheck size={20} className="text-emerald-400" /> : <ShieldOff size={20} className="text-muted" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{twoFAStatus?.enabled ? t('profile.totpEnabled') : t('profile.totpDisabled')}</p>
                                            <p className="text-xs text-muted">{twoFAStatus?.enabled ? t('profile.totpRecoveryRemaining', { count: twoFAStatus.recoveryCodesRemaining }) : t('profile.totpUseApp')}</p>
                                        </div>
                                    </div>

                                    {twoFAStatus?.enabled ? (
                                        <div className="flex gap-2">
                                            <button onClick={() => { setTwoFAStep('regen'); setRegenPassword(''); }} className="flex-1 py-2bg-surface-2 bg-line hover:bg-surface-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1">
                                                <RefreshCw size={14} /> {t('profile.recoveryCodes')}
                                            </button>
                                            <button onClick={() => { setTwoFAStep('disable'); setDisablePassword(''); }} className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1">
                                                <ShieldOff size={14} /> {t('profile.disable2fa')}
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={handleSetup2FA} disabled={loading} className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                                            {t('profile.setup2fa')}
                                        </button>
                                    )}
                                </div>
                            )}

                            {twoFAStep === 'setup' && setupData && (
                                <div className="space-y-4">
                                    <div className="bg-white p-3 rounded-xl mx-auto w-max"><img src={setupData.qrCode} alt={t('profile.qrCodeAlt')} className="w-40 h-40" /></div>
                                    <div className="bg-bg border border-line rounded-xl p-3 flex items-center gap-2">
                                        <code className="flex-1 text-xs font-mono text-primary-400 break-all">{setupData.secret}</code>
                                        <button onClick={() => navigator.clipboard.writeText(setupData.secret)} className="p-1.5 hover:bg-surface-2 rounded-lg text-muted"><Copy size={14} /></button>
                                    </div>
                                    <input type="text" maxLength={6} value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('profile.totpCodePlaceholder')}
                                        className="w-full bg-bg border border-line rounded-xl px-4 py-3 text-center text-lg font-mono tracking-[0.5em] focus:outline-none focus:border-primary-500" autoFocus />
                                    <div className="flex gap-2">
                                        <button onClick={() => { setTwoFAStep('status'); setSetupData(null); }} className="flex-1 py-2 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium">{t('profile.cancelSetup')}</button>
                                        <button onClick={handleEnable2FA} disabled={loading || totpCode.length !== 6} className="flex-1 py-2 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold">{t('profile.confirm')}</button>
                                    </div>
                                </div>
                            )}

                            {twoFAStep === 'recovery-codes' && recoveryCodes && (
                                <div className="space-y-4">
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-emerald-400">{t('profile.saveRecoveryCodes')}</p>
                                        <p className="text-xs text-muted mt-1">{t('profile.recoveryCodesWarning')} <strong className="text-red-400">{t('profile.recoveryCodesNever')}</strong> {t('profile.recoveryCodesAfterClose')}</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        {recoveryCodes.map((code, i) => <code key={i} className="text-sm tracking-wider font-mono text-center py-2 bg-bg border border-line rounded-lg">{code}</code>)}
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <button
                                            onClick={() => {
                                                const blob = new Blob([recoveryCodes.join('\n')], { type: 'text/plain' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = 'notemind-recovery-codes.txt';
                                                a.click();
                                                URL.revokeObjectURL(url);
                                                setSuccess(t('profile.downloadedRecoveryCodes'));
                                                setTimeout(() => setSuccess(''), 3000);
                                            }}
                                            className="flex-1 py-2.5 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors border border-line"
                                        >
                                            <Download size={15} /> {t('profile.downloadTxt')}
                                        </button>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(recoveryCodes.join('\n'));
                                                setSuccess(t('profile.copiedToClipboard'));
                                                setTimeout(() => setSuccess(''), 3000);
                                            }}
                                            className="flex-1 py-2.5 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors border border-line"
                                        >
                                            <Copy size={15} /> {t('profile.copy')}
                                        </button>
                                    </div>

                                    <button onClick={() => { setTwoFAStep('status'); load2FAStatus(); setRecoveryCodes(null); }} className="w-full py-2.5 hover:opacity-90 transition-opacity bg-primary-600 rounded-xl text-sm font-bold text-white shadow-lg shadow-primary-500/20">
                                        {t('profile.savedCloseWindow')}
                                    </button>
                                </div>
                            )}

                            {twoFAStep === 'disable' && (
                                <div className="space-y-3">
                                    <p className="text-sm font-bold text-red-400">{t('profile.disable2faTitle')}</p>
                                    <input type="password" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} placeholder={t('profile.enterPassword')} className="w-full bg-bg border border-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-500" />
                                    <div className="flex gap-2">
                                        <button onClick={() => { setTwoFAStep('status'); setDisablePassword(''); }} className="flex-1 py-2 bg-surface-2 rounded-xl text-sm font-medium">{t('profile.cancel')}</button>
                                        <button onClick={handleDisable2FA} disabled={!disablePassword} className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-semibold">{t('profile.confirmDisable')}</button>
                                    </div>
                                </div>
                            )}

                            {twoFAStep === 'regen' && (
                                <div className="space-y-3">
                                    <p className="text-sm font-bold text-amber-400">{t('profile.recoveryCodes')}</p>
                                    <input type="password" value={regenPassword} onChange={e => setRegenPassword(e.target.value)} placeholder={t('profile.enterPassword')} className="w-full bg-bg border border-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500" />
                                    <div className="flex gap-2">
                                        <button onClick={() => { setTwoFAStep('status'); setRegenPassword(''); }} className="flex-1 py-2 bg-surface-2 rounded-xl text-sm font-medium">{t('profile.cancel')}</button>
                                        <button onClick={handleRegenCodes} disabled={!regenPassword} className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 rounded-xl text-sm font-semibold">{t('profile.saveRecoveryCodes')}</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Passkeys */}
                        <div className="bg-surface border border-line rounded-xl p-6">
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Fingerprint size={18} className="text-primary-400" /> {t('profile.passkeys')}</h3>

                            <div className="space-y-3 mb-4">
                                {passkeys.length === 0 ? (
                                    <p className="text-sm text-muted">{t('profile.passkeysEmptyDesc')}</p>
                                ) : (
                                    passkeys.map(pk => (
                                        <div key={pk.id} className="flex items-center gap-3 bg-bg border border-line rounded-lg px-3 py-2.5">
                                            <Fingerprint size={16} className="text-primary-400 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{pk.name}</p>
                                                <p className="text-[10px] text-muted truncate">{pk.deviceType === 'multiDevice' ? t('profile.multiDevice') : t('profile.singleDevice')}</p>
                                            </div>
                                            <button onClick={() => handleDeletePasskey(pk.id)} className="p-1.5 hover:bg-red-500/10 rounded-md text-muted hover:text-red-400"><Trash2 size={14} /></button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex gap-2">
                                <input type="text" value={passkeyName} onChange={e => setPasskeyName(e.target.value)} placeholder={t('profile.passkeyNamePlaceholder')}
                                    className="flex-1 bg-bg border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500" />
                                <button onClick={handleRegisterPasskey} disabled={loading} className="px-4 py-2 bg-surface-2 hover:bg-line rounded-lg text-sm font-medium flex items-center gap-1.5 border border-line">
                                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t('profile.addPasskey')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Tab Content: Theme ── */}
            {activeTab === 'theme' && (
                <div className="bg-surface border border-line rounded-xl p-6">
                            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Palette size={18} className="text-primary-400" /> {t('profile.appearance')}</h3>

                    <div className="mb-8 p-4 bg-bg border border-line rounded-xl flex items-center justify-between flex-wrap gap-4">
                        <div>
                            <h4 className="text-sm font-medium">{t('theme.displayMode')}</h4>
                            <p className="text-xs text-muted">{t('profile.displayModeDesc')}</p>
                        </div>
                        <div className="flex bg-surface border border-line rounded-lg p-1">
                            <button
                                onClick={() => setMode('light')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'light' ? 'bg-primary-600 text-white shadow-sm' : 'text-muted hover:text-txt hover:bg-surface-2'}`}
                            >
                                <Sun size={14} /> {t('theme.light')}
                            </button>
                            <button
                                onClick={() => setMode('dark')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'dark' ? 'bg-primary-600 text-white shadow-sm' : 'text-muted hover:text-txt hover:bg-surface-2'}`}
                            >
                                <Moon size={14} /> {t('theme.dark')}
                            </button>
                            <button
                                onClick={() => setMode('auto')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'auto' ? 'bg-primary-600 text-white shadow-sm' : 'text-muted hover:text-txt hover:bg-surface-2'}`}
                            >
                                <Monitor size={14} /> {t('theme.auto')}
                            </button>
                        </div>
                    </div>

                    <h4 className="text-sm font-medium mb-1">{t('theme.colorTheme')}</h4>
                    <p className="text-xs text-muted mb-4">{t('profile.colorThemeDesc')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {Object.entries(THEMES).map(([key, thm]) => (
                            <button
                                key={key}
                                onClick={() => setTheme(key)}
                                className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all hover:scale-105 ${currentTheme === key ? 'border-primary-500 bg-primary-600/10 shadow-lg shadow-primary-500/10' : 'border-line bg-bg hover:border-line'}`}
                            >
                                <div className="flex gap-1">
                                    <div className="w-5 h-5 rounded-full shadow-sm" style={{ background: thm.primary['500'] }} />
                                    <div className="w-3 h-3 rounded-full opacity-70" style={{ background: thm.primary['400'] }} />
                                </div>
                                <span className="text-sm font-medium flex items-center gap-1.5">{thm.emoji} {thm.label}</span>
                                {currentTheme === key && <CheckCircle2 size={14} className="text-primary-400 absolute top-2 right-2" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Tab Content: Language ── */}
            {activeTab === 'language' && (
                <div className="bg-surface border border-line rounded-xl p-6">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Languages size={18} className="text-primary-400" /> {t('profile.languageLabel')}</h3>
                    <p className="text-xs text-muted mb-6">{t('profile.languageDesc')}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                        <button
                            onClick={() => setLanguage('vi')}
                            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] ${currentLang === 'vi'
                                    ? 'border-primary-500 bg-primary-600/10 shadow-lg shadow-primary-500/10'
                                    : 'border-line bg-bg hover:border-primary-500/30'
                                }`}
                        >
                            <span className="text-2xl">🇻🇳</span>
                            <div className="text-left">
                                <p className="text-sm font-semibold">{t('profile.languageVietnameseNative')}</p>
                                <p className="text-[11px] text-muted">{t('profile.languageVietnameseEnglish')}</p>
                            </div>
                            {currentLang === 'vi' && <CheckCircle2 size={16} className="text-primary-400 ml-auto" />}
                        </button>
                        <button
                            onClick={() => setLanguage('en')}
                            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] ${currentLang === 'en'
                                    ? 'border-primary-500 bg-primary-600/10 shadow-lg shadow-primary-500/10'
                                    : 'border-line bg-bg hover:border-primary-500/30'
                                }`}
                        >
                            <span className="text-2xl">🇬🇧</span>
                            <div className="text-left">
                                <p className="text-sm font-semibold">{t('profile.languageEnglishNative')}</p>
                                <p className="text-[11px] text-muted">{t('profile.languageEnglishEnglish')}</p>
                            </div>
                            {currentLang === 'en' && <CheckCircle2 size={16} className="text-primary-400 ml-auto" />}
                        </button>
                    </div>
                </div>
            )}

            <ConfirmModal
                open={showPwConfirm}
                title={t('profile.changePassword')}
                message={t('profile.changePasswordConfirm')}
                confirmLabel={t('profile.changePassword')}
                variant="warning"
                onConfirm={executeChangePassword}
                onCancel={() => setShowPwConfirm(false)}
            />

            {/* Turnstile Verification Modal */}
            <TurnstileModal
                isOpen={showTurnstile}
                onClose={() => {
                    setShowTurnstile(false);
                    pendingEmailRef.current = null;
                }}
                onVerified={handleTurnstileVerified}
                onError={handleTurnstileError}
            />
        </div>
    );
}

function InfoRow({ label, value, verified }) {
    return (
        <div className="bg-bg border border-line/50 rounded-lg px-4 py-3">
            <p className="text-[11px] text-muted uppercase tracking-wider mb-1">{label}</p>
            <p className="text-sm font-medium flex items-center gap-1.5 truncate">
                {value}
                {verified !== undefined && (verified ? <CheckCircle2 size={14} className="text-green-400 shrink-0" /> : <XCircle size={14} className="text-amber-400 shrink-0" />)}
            </p>
        </div>
    );
}
