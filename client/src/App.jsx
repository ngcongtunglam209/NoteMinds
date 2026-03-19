import { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';
import PricingPage from './components/PricingPage';
import SharedDocViewer from './components/SharedDocViewer';
import HistoryPage from './components/HistoryPage';
import ProfilePage from './components/ProfilePage';
import CommunityFeed from './components/CommunityFeed';
import PublicDocViewer from './components/PublicDocViewer';
import PublicProfilePage from './components/PublicProfilePage';
import LeaderboardPage from './components/LeaderboardPage';
import StatsPage from './components/StatsPage';
import LearningPathsPage from './components/LearningPathsPage';
import NotificationManager from './components/NotificationManager';
import AnnouncementBanner from './components/AnnouncementBanner';
import OfflinePage from './components/OfflinePage';
import { getStoredUser, logout as apiLogout, getMe, verifyEmailToken, resetPassword, getSystemSettings, getDocumentHistory, getFolders, sendPresenceHeartbeat } from './api';
import { CheckCircle2, XCircle, Loader2, Lock, Eye, EyeOff, ArrowLeft, Wrench, WifiOff } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export default function App() {
  const [currentDoc, setCurrentDoc] = useState(null);
  const [view, setView] = useState('home'); // 'home' | 'dashboard' | 'admin' | 'pricing' | 'shared' | 'history' | 'history-list' | 'verify-email' | 'reset-password' | 'leaderboard' | 'stats' | 'learning-paths'
  const [historyDoc, setHistoryDoc] = useState(null);
  const [user, setUser] = useState(getStoredUser);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('login');
  const [shareToken, setShareToken] = useState(null);
  const [emailToken, setEmailToken] = useState(null);
  const [publicUsername, setPublicUsername] = useState(null);
  const [maintenance, setMaintenance] = useState(null);
  const [maintenanceChecked, setMaintenanceChecked] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const heartbeatInFlightRef = useRef(false);
  const { t } = useLanguage();

  // Online/Offline detection
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Auto-cache history for offline access when user is online & logged in
  useEffect(() => {
    if (isOffline || !user) return;
    const cacheHistory = async () => {
      try {
        const [docs, folders] = await Promise.all([getDocumentHistory(), getFolders()]);
        localStorage.setItem('notemind_history_cache', JSON.stringify(docs || []));
        localStorage.setItem('notemind_folders_cache', JSON.stringify(folders || []));
        localStorage.setItem('notemind_history_cache_time', new Date().toISOString());
      } catch { /* offline or error — skip */ }
    };
    cacheHistory();
  }, [isOffline, user]);

  const syncViewWithLocation = useCallback(() => {
    const path = window.location.pathname;
    const search = new URLSearchParams(window.location.search);
    const shareMatch = path.match(/^\/share\/([a-f0-9]+)$/i);
    const historyDocMatch = path.match(/^\/history\/([a-f0-9-]+)$/i);
    const sessionMatch = path.match(/^\/session\/([a-f0-9-]+)$/i);
    const publicDocMatch = path.match(/^\/public\/([a-f0-9-]+)$/i);
    const publicProfileMatch = path.match(/^\/profile\/@([a-zA-Z0-9_.-]+)$/i);
    if (shareMatch) {
      setShareToken(shareMatch[1]);
      setCurrentDoc(null);
      setPublicUsername(null);
      setView('shared');
    } else if (publicDocMatch) {
      setShareToken(null);
      setPublicUsername(null);
      setCurrentDoc({ docId: publicDocMatch[1], fileName: t('app.publicDoc') });
      setView('public');
    } else if (historyDocMatch) {
      setShareToken(null);
      setPublicUsername(null);
      setCurrentDoc({ docId: historyDocMatch[1], fileName: t('app.savedDoc') });
      setView('dashboard');
    } else if (path === '/history') {
      setShareToken(null);
      setPublicUsername(null);
      setView('history-list');
    } else if (sessionMatch) {
      setShareToken(null);
      setPublicUsername(null);
      setCurrentDoc({ docId: sessionMatch[1], fileName: t('app.newSession') });
      setView('dashboard');
    } else if (path === '/price') {
      setShareToken(null);
      setCurrentDoc(null);
      setPublicUsername(null);
      setView('home');
      setTimeout(() => {
        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    } else if (path === '/verify-email' && search.get('token')) {
      setShareToken(null);
      setCurrentDoc(null);
      setPublicUsername(null);
      setEmailToken(search.get('token'));
      setView('verify-email');
    } else if (path === '/reset-password' && search.get('token')) {
      setShareToken(null);
      setCurrentDoc(null);
      setPublicUsername(null);
      setEmailToken(search.get('token'));
      setView('reset-password');
    } else if (path === '/profile') {
      setShareToken(null);
      setCurrentDoc(null);
      setPublicUsername(null);
      setView('profile');
    } else if (publicProfileMatch) {
      setShareToken(null);
      setCurrentDoc(null);
      setPublicUsername(publicProfileMatch[1]);
      setView('public-profile');
    } else if (path === '/community') {
      setShareToken(null);
      setCurrentDoc(null);
      setPublicUsername(null);
      setView('community');
    } else if (path === '/admin') {
      // Only allow admin users to access admin panel
      const storedUser = getStoredUser();
      if (storedUser && storedUser.role === 'admin') {
        setShareToken(null);
        setCurrentDoc(null);
        setPublicUsername(null);
        setView('admin');
      } else {
        setView('home');
      }
    } else if (path === '/leaderboard') {
      setShareToken(null);
      setCurrentDoc(null);
      setPublicUsername(null);
      setView('leaderboard');
    } else if (path === '/stats') {
      setShareToken(null);
      setCurrentDoc(null);
      setPublicUsername(null);
      setView('stats');
    } else if (path === '/learning-paths') {
      setShareToken(null);
      setCurrentDoc(null);
      setPublicUsername(null);
      setView('learning-paths');
    } else if (path === '/notifications') {
      setShareToken(null);
      setCurrentDoc(null);
      setPublicUsername(null);
      setView('notifications');
    } else {
      setShareToken(null);
      setCurrentDoc(null);
      setPublicUsername(null);
      setView('home');
    }
  }, [t]);

  // Keep app view in sync with browser navigation (back/forward) and initial URL.
  useEffect(() => {
    syncViewWithLocation();
    window.addEventListener('popstate', syncViewWithLocation);
    return () => window.removeEventListener('popstate', syncViewWithLocation);
  }, [syncViewWithLocation]);

  const navigateTo = useCallback((path) => {
    const targetPath = path || '/';
    if (window.location.pathname !== targetPath || window.location.search) {
      window.history.pushState({}, '', targetPath);
    }
    syncViewWithLocation();
  }, [syncViewWithLocation]);

  // Verify stored token on mount
  useEffect(() => {
    if (user) {
      getMe().then(u => setUser(u)).catch(() => {
        apiLogout();
        setUser(null);
      });
    }
  }, []);

  // Presence heartbeat: keep online status fresh while user is active
  useEffect(() => {
    if (!user) return;

    const sendHeartbeat = async () => {
      if (heartbeatInFlightRef.current || !navigator.onLine) return;
      heartbeatInFlightRef.current = true;
      try {
        await sendPresenceHeartbeat();
      } catch {
        // Ignore heartbeat failures silently
      } finally {
        heartbeatInFlightRef.current = false;
      }
    };

    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, 10 * 1000);
    const onFocus = () => sendHeartbeat();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user]);

  // Check maintenance mode
  useEffect(() => {
    getSystemSettings().then(s => {
      if (s.maintenance_mode) {
        setMaintenance(s.maintenance_message || t('app.defaultMaintenance'));
      } else {
        setMaintenance(null);
      }
    }).catch((err) => {
      // If fetch failed due to network, mark as offline
      if (!navigator.onLine || (err && err.message && /network|fetch|timeout/i.test(err.message))) {
        setIsOffline(true);
      }
    }).finally(() => setMaintenanceChecked(true));
  }, []);

  // Documents are auto-deleted after 7 days on the server — no instant cleanup needed

  const handleUploadComplete = (docInfo) => {
    navigateTo(`/session/${docInfo.docId}`);
    setCurrentDoc(docInfo);
  };

  const handleBackHome = () => {
    setHistoryDoc(null);
    navigateTo('/');
  };

  const handleOpenDocument = (doc) => {
    navigateTo(`/history/${doc.id}`);
    setCurrentDoc({
      docId: doc.id,
      fileName: doc.original_name || doc.title || t('app.savedDoc'),
      textLength: doc.text_length || 0,
      is_public: !!doc.is_public
    });
  };

  const handleLogout = () => {
    apiLogout();
    setUser(null);
  };

  const openAuthModal = (tab = 'login') => {
    setAuthModalTab(tab);
    setShowAuthModal(true);
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData);
  };

  // Block rendering until maintenance check completes (prevents flash)
  if (!maintenanceChecked && !isOffline) {
    return <div className="min-h-screen bg-bg" />;
  }

  // Show offline UI when no network
  if (isOffline) {
    const offlineEnabled = (() => { try { return localStorage.getItem('notemind_offline_page_enabled') === 'true'; } catch { return false; } })();
    if (offlineEnabled) {
      return (
        <OfflinePage
          onBack={null}
          onRetry={() => {
            if (navigator.onLine) setIsOffline(false);
            else window.location.reload();
          }}
          onDisable={() => {
            try { localStorage.removeItem('notemind_offline_page_enabled'); } catch { }
            setIsOffline(prev => !prev);
            setTimeout(() => setIsOffline(true), 0);
          }}
        />
      );
    }
    // Simple offline banner
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-surface border border-line rounded-2xl p-10 space-y-6">
            <div className="w-20 h-20 mx-auto bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center">
              <WifiOff size={36} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-2">{t('app.offlineTitle')}</h1>
              <p className="text-muted text-sm leading-relaxed">{t('app.offlineDesc')}</p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { if (navigator.onLine) setIsOffline(false); else window.location.reload(); }}
                className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors"
              >
                {t('app.retryConnection')}
              </button>
              <button
                onClick={() => {
                  try { localStorage.setItem('notemind_offline_page_enabled', 'true'); } catch { }
                  setIsOffline(prev => !prev); // force re-render
                  setTimeout(() => setIsOffline(true), 0);
                }}
                className="w-full py-2.5 rounded-xl bg-surface-2 hover:bg-line border border-line text-txt text-sm font-medium transition-colors"
              >
                {t('app.viewSavedHistory')}
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              {t('app.waitingConnection')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show maintenance screen for non-admin users
  if (maintenance && (!user || user.role !== 'admin')) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg">
          <div className="bg-surface border border-line rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  {t('app.maintenanceMode')}
              </div>
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center shrink-0">
                <Wrench size={22} className="text-amber-400" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{t('app.maintenanceTitle')}</h1>
              <p className="text-muted text-sm leading-relaxed">{maintenance}</p>
              <p className="text-xs text-muted/90">{t('app.maintenanceSubtitle')}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors"
              >
                {t('app.refreshPage')}
              </button>
              <button
                onClick={() => openAuthModal('login')}
                className="w-full py-2.5 rounded-xl bg-surface-2 hover:bg-line border border-line text-txt text-sm font-medium transition-colors"
              >
                {t('app.loginAdmin')}
              </button>
            </div>

            <div className="text-xs text-muted border-t border-line pt-4">
              {t('app.maintenancePersist')}
            </div>
          </div>

          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onAuthSuccess={handleAuthSuccess}
            defaultTab={authModalTab}
            loginOnly
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {view === 'shared' && shareToken ? (
        <SharedDocViewer shareToken={shareToken} onBack={handleBackHome} />
      ) : (
        <>
          {view !== 'admin' && view !== 'profile' && view !== 'public-profile' && view !== 'notifications' && (
            <Header
              onBackHome={handleBackHome}
              showBack={view === 'dashboard' || view === 'history-list'}
              user={user}
              onLoginClick={() => openAuthModal('login')}
              onLogout={handleLogout}
              onOpenAdmin={() => {
                if (user && user.role === 'admin') {
                  navigateTo('/admin');
                }
              }}
              onUserUpdate={(updated) => setUser(updated)}
              onOpenDocument={handleOpenDocument}
              onOpenCommunity={() => navigateTo('/community')}
              onOpenHistory={() => navigateTo('/history')}
              onOpenProfile={() => navigateTo('/profile')}
              onOpenLeaderboard={() => navigateTo('/leaderboard')}
              onOpenStats={() => navigateTo('/stats')}
              onOpenLearningPaths={() => navigateTo('/learning-paths')}
              onOpenNotifications={() => navigateTo('/notifications')}
              currentView={view}
            />
          )}

          {/* Announcement Banner (show on major views for all users) */}
          {['home', 'dashboard', 'history-list', 'community'].includes(view) && (
            <div className="max-w-7xl mx-auto px-4 pt-3">
              <AnnouncementBanner user={user} />
            </div>
          )}

          {view === 'home' && (
            <main>
              <Hero 
                onUploadComplete={handleUploadComplete}
                user={user}
                onAuthRequired={() => openAuthModal('register')}
              />
              <section id="why">
                <WhySection />
              </section>
              <section id="features">
                <Features />
              </section>
              <PricingPage user={user} onLoginClick={() => openAuthModal('login')} />
            </main>
          )}

          {view === 'dashboard' && currentDoc && (
            <Dashboard doc={currentDoc} user={user} />
          )}

          {view === 'history-list' && (
            <HistoryPage onOpenDocument={handleOpenDocument} />
          )}

          {view === 'admin' && user && user.role === 'admin' && (
            <AdminPanel onBack={handleBackHome} />
          )}

          {view === 'verify-email' && emailToken && (
            <VerifyEmailPage token={emailToken} onGoHome={handleBackHome} onUserUpdate={setUser} />
          )}

          {view === 'reset-password' && emailToken && (
            <ResetPasswordPage token={emailToken} onGoHome={handleBackHome} />
          )}

          {view === 'profile' && (
            <ProfilePage
              user={user}
              onBack={handleBackHome}
              onUserUpdate={(updated) => setUser(updated)}
              onOpenAuth={(tab) => openAuthModal(tab)}
            />
          )}

          {view === 'community' && (
            <CommunityFeed user={user} />
          )}

          {view === 'leaderboard' && (
            <LeaderboardPage onBack={handleBackHome} />
          )}

          {view === 'stats' && (
            <StatsPage onBack={handleBackHome} user={user} />
          )}

          {view === 'learning-paths' && (
            <LearningPathsPage
              onBack={handleBackHome}
              onOpenDocument={handleOpenDocument}
              currentDocId={currentDoc?.docId}
            />
          )}

          {view === 'notifications' && (
            <NotificationManager onBack={handleBackHome} />
          )}

          {view === 'public' && currentDoc && (
            <PublicDocViewer documentId={currentDoc.docId} onBack={handleBackHome} />
          )}

          {view === 'public-profile' && publicUsername && (
            <PublicProfilePage username={publicUsername} onBack={handleBackHome} user={user} />
          )}

          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onAuthSuccess={handleAuthSuccess}
            defaultTab={authModalTab}
          />

          {/* Footer */}
          {view === 'home' && (
            <footer className="border-t border-line mt-16 bg-surface/50">
              <div className="max-w-6xl mx-auto px-4 py-12">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
                  {/* Brand */}
                  <div className="col-span-2 sm:col-span-1">
                    <h3 className="text-lg font-extrabold tracking-tight mb-3">
                      <span className="gradient-text">NoteMinds</span>
                    </h3>
                    <p className="text-xs text-muted leading-relaxed">
                      {t('app.footerDesc')}
                    </p>
                  </div>

                  {/* Sản phẩm */}
                  <div>
                    <h4 className="text-sm font-bold mb-3 text-txt">{t('app.footerProduct')}</h4>
                    <ul className="space-y-2 text-xs text-muted">
                      <li><button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-txt transition-colors">{t('app.footerFeatures')}</button></li>
                      <li><button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-txt transition-colors">{t('app.footerPricing')}</button></li>
                      <li><button onClick={() => document.getElementById('upload')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-txt transition-colors">{t('app.footerGetStarted')}</button></li>
                    </ul>
                  </div>

                  {/* Cộng đồng */}
                  <div>
                    <h4 className="text-sm font-bold mb-3 text-txt">{t('app.footerCommunity')}</h4>
                    <ul className="space-y-2 text-xs text-muted">
                      <li><button onClick={() => navigateTo('/community')} className="hover:text-txt transition-colors">{t('app.footerPosts')}</button></li>
                      <li><button onClick={() => navigateTo('/leaderboard')} className="hover:text-txt transition-colors">{t('app.footerLeaderboard')}</button></li>
                      <li><button onClick={() => navigateTo('/stats')} className="hover:text-txt transition-colors">{t('app.footerStats')}</button></li>
                    </ul>
                  </div>

                  {/* Liên kết */}
                  <div>
                    <h4 className="text-sm font-bold mb-3 text-txt">{t('app.footerLinks')}</h4>
                    <ul className="space-y-2 text-xs text-muted">
                      <li><a href="mailto:admin@notemind.tech" className="hover:text-txt transition-colors">{t('app.footerContact')}</a></li>
                      <li><a href="//www.dmca.com/Protection/Status.aspx?ID=ead8dfc7-7685-44c0-a909-f4072ff1ce07&refurl=https://notemind.tech" target="_blank" rel="noopener noreferrer" className="hover:text-txt transition-colors">DMCA Protection</a></li>
                    </ul>
                  </div>
                </div>

                {/* Divider + bottom bar */}
                <div className="border-t border-line pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-xs text-muted">&copy; 2026 NoteMind @ Đội Đèn Giao Thông. All rights reserved.</p>
                  <div className="flex items-center gap-4">
                    <a href="//www.dmca.com/Protection/Status.aspx?ID=ead8dfc7-7685-44c0-a909-f4072ff1ce07&refurl=https://notemind.tech" title={t('app.dmcaStatusTitle')} className="dmca-badge" target="_blank" rel="noopener noreferrer">
                      <img src="https://images.dmca.com/Badges/DMCA_badge_trn_60w.png?ID=ead8dfc7-7685-44c0-a909-f4072ff1ce07" alt="DMCA.com Protection Status" className="h-5 opacity-70 hover:opacity-100 transition-opacity" />
                    </a>
                    <button
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      className="text-xs text-muted hover:text-txt transition-colors flex items-center gap-1"
                      title={t('app.scrollToTopTitle')}
                    >
                      ↑ {t('app.footerScrollTop')}
                    </button>
                  </div>
                </div>
              </div>
            </footer>
          )}
        </>
      )}
    </div>
  );
}

function Features() {
  const { t } = useLanguage();
  const features = [
    {
      icon: '🧠',
      title: t('app.feature1Title'),
      desc: t('app.feature1Desc'),
      color: 'from-primary-600/15 to-primary-600/5',
    },
    {
      icon: '📇',
      title: t('app.feature2Title'),
      desc: t('app.feature2Desc'),
      color: 'from-accent-600/15 to-accent-600/5',
    },
    {
      icon: '💬',
      title: t('app.feature3Title'),
      desc: t('app.feature3Desc'),
      color: 'from-blue-600/15 to-blue-600/5',
    },
    {
      icon: '📄',
      title: t('app.feature4Title'),
      desc: t('app.feature4Desc'),
      color: 'from-emerald-600/15 to-emerald-600/5',
    },
  ];

  return (
    <section className="max-w-6xl mx-auto px-4 py-24">
      <h2 className="text-3xl font-extrabold text-center mb-4 font-display tracking-tight">
        {t('app.featuresTitle')} <span className="gradient-text">{t('app.featuresHighlight')}</span>
      </h2>
      <p className="text-center text-muted mb-14 max-w-2xl mx-auto">
        {t('app.featuresSubtitle')}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {features.map((f, i) => (
          <div
            key={i}
            className="group relative bg-surface border border-line rounded-2xl p-7 transition-all duration-500 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/10 overflow-hidden"
          >
            {/* Gradient overlay on hover */}
            <div className={`absolute inset-0 bg-gradient-to-br ${f.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

            <div className="relative z-10">
              <div className="w-14 h-14 bg-surface-2 border border-line rounded-2xl flex items-center justify-center text-2xl mb-5 group-hover:scale-110 group-hover:border-primary-500/30 transition-all duration-500">
                {f.icon}
              </div>
              <h3 className="text-lg font-bold mb-2.5 group-hover:text-primary-400 transition-colors duration-300">{f.title}</h3>
              <p className="text-sm text-muted leading-relaxed group-hover:text-txt transition-colors">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhySection() {
  const { t } = useLanguage();
  const reasons = [
    { icon: '⏰', title: t('app.why1Title'), desc: t('app.why1Desc') },
    { icon: '🎯', title: t('app.why2Title'), desc: t('app.why2Desc') },
    { icon: '🧪', title: t('app.why3Title'), desc: t('app.why3Desc') },
    { icon: '🌐', title: t('app.why4Title'), desc: t('app.why4Desc') },
    { icon: '💡', title: t('app.why5Title'), desc: t('app.why5Desc') },
    { icon: '🚀', title: t('app.why6Title'), desc: t('app.why6Desc') },
  ];

  return (
    <section className="max-w-6xl mx-auto px-4 py-24">
      <h2 className="text-3xl font-extrabold text-center mb-4 font-display tracking-tight">
        {t('app.whyTitle')} <span className="gradient-text">NoteMinds</span>?
      </h2>
      <p className="text-center text-muted mb-14 max-w-2xl mx-auto">
        {t('app.whySubtitle')}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {reasons.map((r, i) => (
          <div
            key={i}
            className="group relative bg-surface border border-line rounded-2xl p-7 hover:-translate-y-1.5 transition-all duration-500 overflow-hidden hover:shadow-xl hover:shadow-black/10"
          >
            {/* Subtle gradient background on hover */}
            <div className="absolute inset-0 bg-gradient-to-tr from-primary-900/5 via-transparent to-accent-900/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10">
              <div className="w-14 h-14 bg-surface-2 border border-line rounded-2xl flex items-center justify-center text-2xl mb-5 group-hover:scale-110 group-hover:border-primary-500/30 transition-all duration-500">
                {r.icon}
              </div>
              <h3 className="text-lg font-bold mb-2.5 group-hover:gradient-text transition-all duration-300">{r.title}</h3>
              <p className="text-sm text-muted leading-relaxed group-hover:text-txt transition-colors">{r.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Verify Email Page ─────────────────────────────────
function VerifyEmailPage({ token, onGoHome, onUserUpdate }) {
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    verifyEmailToken(token)
      .then((data) => {
        setStatus('success');
        setMessage(data.message || t('app.emailVerified'));
        if (data.user) {
          onUserUpdate?.(data.user);
        }
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.error || t('app.emailVerifyFailed'));
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 size={48} className="mx-auto mb-4 text-primary-400 animate-spin" />
            <h2 className="text-xl font-bold mb-2">{t('app.verifyingEmail')}</h2>
            <p className="text-sm text-muted">{t('app.pleaseWait')}</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">{t('app.verifySuccess')}</h2>
            <p className="text-sm text-muted mb-6">{message}</p>
            <button
              onClick={onGoHome}
              className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors"
            >
              {t('app.backToHome')}
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <XCircle size={32} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">{t('app.verifyFailed')}</h2>
            <p className="text-sm text-red-400 mb-6">{message}</p>
            <button
              onClick={onGoHome}
              className="px-6 py-2.5 bg-surface-2 hover:bg-line rounded-xl text-sm font-medium transition-colors"
            >
              {t('app.backToHome')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Reset Password Page ───────────────────────────────
function ResetPasswordPage({ token, onGoHome }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      return setError(t('app.passwordTooShort'));
    }
    if (newPassword !== confirmPassword) {
      return setError(t('app.passwordMismatch'));
    }
    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || t('app.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 size={32} className="text-green-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">{t('app.resetSuccess')}</h2>
          <p className="text-sm text-muted mb-6">{t('app.resetSuccessDesc')}</p>
          <button
            onClick={onGoHome}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors"
          >
            {t('app.backToHomeLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-8">
        <button
          onClick={onGoHome}
          className="flex items-center gap-1 text-sm text-muted hover:text-txt transition-colors mb-4"
        >
          <ArrowLeft size={14} /> {t('app.backToHome')}
        </button>
        <h2 className="text-xl font-bold mb-1">{t('app.resetPassword')}</h2>
        <p className="text-sm text-muted mb-6">{t('app.resetPasswordDesc')}</p>

        {error && (
          <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative flex items-center">
            <span className="absolute left-3 text-muted"><Lock size={16} /></span>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder={t('app.newPasswordPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-bg border border-line rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-primary-500/50 transition-colors placeholder:text-muted/50"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 text-muted hover:text-txt transition-colors"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="relative flex items-center">
            <span className="absolute left-3 text-muted"><Lock size={16} /></span>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder={t('app.confirmNewPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-bg border border-line rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-primary-500/50 transition-colors placeholder:text-muted/50"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !newPassword || !confirmPassword}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary-600/25 mt-4"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> {t('auth.processing')}</>
            ) : (
              <><Lock size={16} /> {t('app.setNewPassword')}</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
