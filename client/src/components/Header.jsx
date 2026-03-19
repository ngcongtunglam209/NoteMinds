import { useState } from 'react';
import { BrainCircuit, ArrowLeft, LogIn, Menu, X, History, Globe, Trophy, BarChart3, Sparkles, Map } from 'lucide-react';
import UserDropdown from './UserDropdown';
import { NotificationBell } from './NotificationBell';
import { useLanguage } from '../LanguageContext';

export default function Header({ onBackHome, showBack, user, onLoginClick, onLogout, onOpenAdmin, onOpenPricing, onUserUpdate, onOpenDocument, onOpenHistory, onOpenProfile, onOpenLeaderboard, onOpenStats, onOpenLearningPaths, onOpenCommunity, onOpenNotifications, currentView }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useLanguage();

  // Landing-page scroll links (only on home)
  const HOME_NAV = [
    { label: t('nav.features'), target: 'features' },
    { label: t('nav.pricing'), target: 'pricing' },
  ];

  // App-level page links (icon-first, compact)
  const APP_NAV = [
    { label: t('nav.community'), target: 'community', icon: Globe, requireAuth: false },
    { label: t('nav.learningPaths', 'Lộ trình AI'), target: 'learning-paths', icon: Map, requireAuth: true },
    { label: t('nav.leaderboard'), target: 'leaderboard', icon: Trophy, requireAuth: false },
    { label: t('nav.stats'), target: 'stats', icon: BarChart3, requireAuth: true },
    { label: t('nav.history'), target: 'history', icon: History, requireAuth: true },
  ];

  const handleNav = (target) => {
    setMobileOpen(false);
    if (target === 'history') { onOpenHistory?.(); return; }
    if (target === 'leaderboard') { onOpenLeaderboard?.(); return; }
    if (target === 'stats') { onOpenStats?.(); return; }
    if (target === 'learning-paths') { onOpenLearningPaths?.(); return; }
    if (target === 'community') {
      onOpenCommunity?.();
      return;
    }
    // Scroll-to-section links (home page)
    if (currentView !== 'home') {
      onBackHome?.();
      setTimeout(() => {
        document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const isActiveTarget = (target) =>
    (target === 'history' && currentView === 'history-list') ||
    (target === 'learning-paths' && currentView === 'learning-paths') ||
    (target === 'community' && currentView === 'community') ||
    (target === 'leaderboard' && currentView === 'leaderboard') ||
    (target === 'stats' && currentView === 'stats');

  const allMobileItems = [...HOME_NAV, ...APP_NAV];

  return (
    <header className="sticky top-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-2">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-1">
          {showBack && (
            <button
              onClick={onBackHome}
              className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              title={t('nav.backHome')}
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <button onClick={onBackHome} className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-500 rounded-lg flex items-center justify-center shadow-md shadow-primary-600/20 group-hover:shadow-lg group-hover:shadow-primary-600/30 transition-all group-hover:scale-105">
              <BrainCircuit size={17} className="text-white" />
            </div>
            <span className="text-lg font-bold font-display hidden sm:inline">
              Note<span className="gradient-text">Minds</span>
            </span>
          </button>
        </div>

        {/* Center nav */}
        {!showBack && (
          <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
            {/* Home scroll links */}
            {currentView === 'home' && HOME_NAV.map((item) => (
              <button
                key={item.target}
                onClick={() => handleNav(item.target)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-txt hover:bg-surface-2 transition-colors"
              >
                {item.label}
              </button>
            ))}

            {/* Separator between home & app nav */}
            {currentView === 'home' && user && (
              <div className="w-px h-4 bg-line mx-1.5" />
            )}

            {/* App page links — icon pills with label */}
            {APP_NAV.filter(item => !item.requireAuth || user).map((item) => {
              const Icon = item.icon;
              const active = isActiveTarget(item.target);
              return (
                <button
                  key={item.target}
                  onClick={() => handleNav(item.target)}
                  title={item.label}
                  className={`
                    flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all
                    ${active
                      ? 'text-primary-400 bg-primary-600/10'
                      : 'text-muted hover:text-txt hover:bg-surface-2'
                    }
                  `}
                >
                  <Icon size={15} className={active ? 'text-primary-400' : ''} />
                  <span className="hidden lg:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* Spacer when showBack (no nav) */}
        {showBack && <div className="flex-1" />}

        {/* Right side */}
        <div className="flex items-center gap-2 ml-auto">
          {user ? (
            <>
              <NotificationBell userId={user.id} onOpenManager={onOpenNotifications} />
              <UserDropdown
                user={user}
                onLogout={onLogout}
                onOpenAdmin={onOpenAdmin}
                onOpenPricing={() => handleNav('pricing')}
                onUserUpdate={onUserUpdate}
                onOpenDocument={onOpenDocument}
                onOpenProfile={onOpenProfile}
                onOpenLeaderboard={onOpenLeaderboard}
                onOpenStats={onOpenStats}
                onOpenLearningPaths={() => handleNav('learning-paths')}
              />
            </>
          ) : (
            <button
              onClick={onLoginClick}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-primary-600/25 hover:shadow-primary-500/30"
            >
              <LogIn size={15} />
              <span className="hidden sm:inline">{t('nav.login')}</span>
            </button>
          )}

          {/* Mobile hamburger */}
          {!showBack && (
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && !showBack && (
        <div className="md:hidden border-t border-line bg-surface/95 backdrop-blur-lg animate-fade-in">
          <nav className="max-w-7xl mx-auto px-4 py-2 flex flex-col gap-0.5">
            {allMobileItems.filter(item => !item.requireAuth || user).map((item) => {
              const Icon = item.icon;
              const active = isActiveTarget(item.target);
              return (
                <button
                  key={item.target}
                  onClick={() => handleNav(item.target)}
                  className={`flex items-center gap-2.5 text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${active
                    ? 'text-primary-400 bg-primary-600/10'
                    : 'text-muted hover:text-txt hover:bg-surface-2'
                    }`}
                >
                  {Icon ? <Icon size={16} /> : <Sparkles size={16} />}
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
