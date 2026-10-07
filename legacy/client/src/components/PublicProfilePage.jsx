import { useState, useEffect } from 'react';
import { getPublicProfile, getApiBaseUrl } from '../api';
import { ArrowLeft, FileText, Brain, BookOpen, MessageCircle, Flame, Trophy, Calendar, Crown, Loader2, UserX, Globe, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../LanguageContext';

const PLAN_BADGES = {
  free: { label: 'Free', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  basic: { label: 'Basic', color: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  pro: { label: 'Pro', color: 'bg-primary-500/15 text-primary-400 border-primary-500/30' },
  ultimate: { label: 'Ultimate', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  unlimited: { label: 'Unlimited', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
};

export default function PublicProfilePage({ username, onBack, user: currentUser }) {
  const { t, language } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username) return;
    let alive = true;
    setLoading(true);
    setError('');

    const loadProfile = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await getPublicProfile(username);
        if (!alive) return;
        setProfile(data);
        setError('');
      } catch (err) {
        if (!alive) return;
        setError(err.response?.data?.error || t('publicProfile.notFound'));
      } finally {
        if (!silent && alive) setLoading(false);
      }
    };

    loadProfile(false);
    const intervalId = setInterval(() => loadProfile(true), 30 * 1000);

    return () => {
      alive = false;
      clearInterval(intervalId);
    };
  }, [username, t]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <Loader2 size={32} className="animate-spin text-primary-500" />
          <p className="text-sm">{t('publicProfile.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-surface border border-line rounded-2xl p-10 space-y-5">
            <div className="w-20 h-20 mx-auto bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center">
              <UserX size={36} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight mb-1">{t('publicProfile.notFoundTitle')}</h2>
              <p className="text-sm text-muted">{error || t('publicProfile.notFoundDesc')}</p>
            </div>
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium transition-colors"
            >
              <ArrowLeft size={15} /> {t('common.back')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { user: u, stats, recentDocs } = profile;
  const badge = PLAN_BADGES[u.plan] || PLAN_BADGES.free;
  const statusMap = {
    online: { label: t('publicProfile.statusOnline'), dot: 'bg-green-400' },
    idle: { label: t('publicProfile.statusIdle'), dot: 'bg-yellow-400' },
    dnd: { label: t('publicProfile.statusDnd'), dot: 'bg-rose-400' },
    offline: { label: t('publicProfile.statusOffline'), dot: 'bg-zinc-300' },
    invisible: { label: t('publicProfile.statusOffline'), dot: 'bg-zinc-300' },
  };
  const presenceStatus = statusMap[u.presenceStatus] ? u.presenceStatus : (u.isOnline ? 'online' : 'offline');
  const statusMeta = statusMap[presenceStatus];
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const lastSeenText = u.lastSeenAt
    ? new Date(u.lastSeenAt).toLocaleString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    : null;

  const statCards = [
    { icon: FileText, label: t('publicProfile.statPublicDocs'), value: stats.publicDocs, color: 'text-primary-400 bg-primary-500/10' },
    { icon: Brain, label: t('publicProfile.statFlashcards'), value: stats.totalFlashcards, color: 'text-accent-400 bg-accent-500/10' },
    { icon: BookOpen, label: t('publicProfile.statQuizzes'), value: stats.totalQuizzes, color: 'text-blue-400 bg-blue-500/10' },
    { icon: MessageCircle, label: t('publicProfile.statAiMessages'), value: stats.totalChats, color: 'text-emerald-400 bg-emerald-500/10' },
    { icon: Flame, label: t('publicProfile.statCurrentStreak'), value: `${stats.currentStreak} ${t('publicProfile.days')}`, color: 'text-orange-400 bg-orange-500/10' },
    { icon: Trophy, label: t('publicProfile.statLongestStreak'), value: `${stats.longestStreak} ${t('publicProfile.days')}`, color: 'text-amber-400 bg-amber-500/10' },
  ];

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-bg/80 backdrop-blur-xl border-b border-line">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-sm font-medium text-muted">{t('publicProfile.userProfile')}</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-fade-in">
        {/* Profile header */}
        <div className="bg-surface border border-line rounded-2xl p-8 relative overflow-hidden">
          {/* Decorative gradient */}
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-primary-600/20 via-accent-600/10 to-primary-600/5 rounded-t-2xl" />

          <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-5 pt-4">
            {/* Avatar */}
            <div className="relative">
              {u.avatarUrl ? (
                <img
                  src={u.avatarUrl.startsWith('http') ? u.avatarUrl : `${getApiBaseUrl()}${u.avatarUrl}`}
                  alt={u.displayName}
                  className="w-24 h-24 rounded-2xl object-cover border-4 border-surface ring-2 ring-primary-500/30 shadow-xl"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-primary-500 to-accent-500 flex items-center justify-center text-3xl font-extrabold text-white border-4 border-surface shadow-xl">
                  {(u.displayName || u.username || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="group absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-surface border-2 border-surface flex items-center justify-center cursor-default">
                <span className={`w-2.5 h-2.5 rounded-full ${statusMeta.dot}`} />
                <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-txt opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                  {statusMeta.label}
                </span>
              </div>
            </div>

            <div className="text-center sm:text-left flex-1">
              <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2 mb-1">
                <h1 className="text-2xl font-extrabold tracking-tight">{u.displayName || u.username}</h1>
                {u.showPlanBadge !== false && (
                  <span className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${badge.color} flex items-center gap-1`}>
                    {(u.plan === 'ultimate' || u.plan === 'unlimited') && <Crown size={11} />}
                    {badge.label}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center justify-center sm:justify-start gap-1.5 text-sm text-muted">
                <span>@{u.username}</span>
                {u.isVerified && (
                  <span className="group relative inline-flex items-center cursor-default">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-txt opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                      {t('publicProfile.verified')}
                    </span>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-1.5 flex items-center gap-1.5 justify-center sm:justify-start">
                <Calendar size={12} />
                {t('publicProfile.joined')} {new Date(u.joinedAt).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              {presenceStatus === 'offline' && lastSeenText && (
                <p className="text-xs text-muted mt-1">{t('publicProfile.lastActive')}: {lastSeenText}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div>
          <h2 className="text-lg font-bold mb-4">{t('publicProfile.activity')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {statCards.map((s, i) => (
              <div key={i} className="bg-surface border border-line rounded-xl p-4 flex items-center gap-3.5 hover:border-primary-500/30 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.color}`}>
                  <s.icon size={18} />
                </div>
                <div>
                  <div className="text-lg font-bold leading-tight">{s.value}</div>
                  <div className="text-xs text-muted">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent public documents */}
        {recentDocs && recentDocs.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Globe size={18} className="text-primary-400" />
              {t('publicProfile.publicDocuments')}
            </h2>
            <div className="space-y-2">
              {recentDocs.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => {
                    window.location.href = `/public/${doc.id}`;
                  }}
                  className="w-full bg-surface border border-line rounded-xl p-4 flex items-center gap-3.5 hover:border-primary-500/30 hover:bg-surface-2 transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary-500/10 flex items-center justify-center text-primary-400 group-hover:bg-primary-500 group-hover:text-white transition-all shrink-0">
                    <FileText size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate group-hover:text-primary-400 transition-colors">{doc.title}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {new Date(doc.created_at).toLocaleDateString(locale)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
