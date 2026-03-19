import { useState, useEffect, useCallback } from 'react';
import {
  Map, CreditCard, MessageCircle, FileText, Loader2, Upload,
  Search, BarChart3, Share2, Tag, Settings, Star, Download, Focus, Globe, Lock, XCircle, StickyNote, FileDown, BookOpen
} from 'lucide-react';
import MindmapView from './MindmapView';
import FlashcardView from './FlashcardView';
import ChatView from './ChatView';
import QuizView from './QuizView';
import SummaryView from './SummaryView';
import PomodoroTimer from './PomodoroTimer';
import NotesPanel from './NotesPanel';
import {
  SearchModal, AnalyticsModal, ShareModal, TagsModal,
  PreferencesModal, FavoriteButton
} from './FeatureModals';
import { generateMindmap, generateFlashcards, generateQuiz, generateSummary, getRateLimit, getDocumentSessions, downloadDocument, toggleDocumentPublic, exportMarkdown } from '../api';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import Joyride, { STATUS } from 'react-joyride';
import { useLanguage } from '../LanguageContext';

export default function Dashboard({ doc, user }) {
  const { t } = useLanguage();

  const TABS = [
    { id: 'summary', label: 'Tóm tắt', icon: BookOpen },
    { id: 'mindmap', label: t('dashboard.mindmap'), icon: Map },
    { id: 'flashcard', label: t('dashboard.flashcard'), icon: CreditCard },
    { id: 'quiz', label: t('dashboard.quiz'), icon: FileText },
  ];

  const WELCOME_MESSAGE = {
    role: 'assistant',
    content: t('dashboard.welcomeMessage')
  };

  const [activeTab, setActiveTab] = useState('summary');
  const [summaryData, setSummaryData] = useState(null);
  const [mindmapData, setMindmapData] = useState(null);
  const [flashcardData, setFlashcardData] = useState(null);
  const [quizData, setQuizData] = useState(null);
  const [chatMessages, setChatMessages] = useState([WELCOME_MESSAGE]);
  const [tabLoading, setTabLoading] = useState({ summary: false, mindmap: false, flashcard: false, quiz: false });
  const [sessionLoading, setSessionLoading] = useState(true);
  const [tabErrors, setTabErrors] = useState({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [docDetails, setDocDetails] = useState({
    fileName: doc?.fileName || t('dashboard.document'),
    textLength: doc?.textLength || 0,
    isLocked: false,
  });
  const [isPublic, setIsPublic] = useState(doc?.is_public || false);
  const [isTogglingPublic, setIsTogglingPublic] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [rateLimit, setRateLimit] = useState({ uploadLimit: 10, uploadsRemaining: 10, resetIn: 0, chatLimit: 10 });

  // Tour state
  const [runTour, setRunTour] = useState(false);
  const [tourSteps] = useState([
    {
      target: '.tour-doc-info',
      content: t('dashboard.tourDocInfo'),
      disableBeacon: true,
    },
    {
      target: '.tour-tools',
      content: t('dashboard.tourTools'),
    },
    {
      target: '.tour-tabs',
      content: t('dashboard.tourTabs'),
    },
    {
      target: '.tour-chat-fab',
      content: t('dashboard.tourChat'),
    }
  ]);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('notemind_dashboard_tour_seen');
    if (!hasSeenTour) {
      // slight delay to let the UI load
      setTimeout(() => setRunTour(true), 500);
    }

    // Check if auto-opening a specific tab (from Learning Paths)
    const autoOpenTab = localStorage.getItem('notemind_auto_open_tab');
    if (autoOpenTab) {
      if (autoOpenTab === 'read_summary') setActiveTab('summary');
      else if (autoOpenTab === 'flashcards') setActiveTab('flashcard');
      else if (autoOpenTab === 'quiz') setActiveTab('quiz');
      else if (autoOpenTab === 'chat') setShowChat(true);

      localStorage.removeItem('notemind_auto_open_tab');
    }
  }, []);

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(status)) {
      setRunTour(false);
      localStorage.setItem('notemind_dashboard_tour_seen', 'true');
    }
  };

  // Feature modals state
  const [showSearch, setShowSearch] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: () => setShowSearch(true),
    onExport: () => handleExportMarkdown(),
    onNewNote: () => setShowNotes(true),
    onEscape: () => {
      setShowSearch(false);
      setShowAnalytics(false);
      setShowShare(false);
      setShowTags(false);
      setShowPreferences(false);
      setShowNotes(false);
      setShowChat(false);
    },
  });

  const fetchRateLimit = useCallback(async () => {
    try {
      const data = await getRateLimit();
      setRateLimit(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchRateLimit();
    const interval = setInterval(fetchRateLimit, 30000);
    return () => clearInterval(interval);
  }, [fetchRateLimit]);

  // Load saved sessions on mount
  useEffect(() => {
    if (!doc?.docId) { setSessionLoading(false); return; }
    setSessionLoading(true);
    getDocumentSessions(doc.docId)
      .then(({ document, sessions }) => {
        if (document) {
          setDocDetails({
            fileName: document.original_name || doc.fileName || t('dashboard.savedDoc'),
            textLength: document.text_length || doc.textLength || 0,
            isLocked: !!document.isFileDeleted
          });
          if (document.is_public !== undefined) {
            setIsPublic(!!document.is_public);
          }
        }
        if (sessions?.summary) setSummaryData(sessions.summary);
        if (sessions?.mindmap) setMindmapData(sessions.mindmap);
        if (sessions?.flashcards) setFlashcardData(sessions.flashcards);
        if (sessions?.quiz) setQuizData(sessions.quiz);
        if (sessions?.chat && sessions.chat.length > 0) setChatMessages(sessions.chat);

        // Cache sessions for offline access
        try {
          const cacheEntry = {
            document: document || { original_name: doc.fileName },
            sessions: sessions || {},
            cachedAt: new Date().toISOString()
          };
          const allCached = JSON.parse(localStorage.getItem('notemind_sessions_cache') || '{}');
          allCached[doc.docId] = cacheEntry;
          // Keep max 20 documents cached
          const keys = Object.keys(allCached);
          if (keys.length > 20) {
            const sorted = keys.sort((a, b) => new Date(allCached[a].cachedAt) - new Date(allCached[b].cachedAt));
            sorted.slice(0, keys.length - 20).forEach(k => delete allCached[k]);
          }
          localStorage.setItem('notemind_sessions_cache', JSON.stringify(allCached));
        } catch { /* localStorage full */ }
      })
      .catch(() => { /* no saved sessions, start fresh */ })
      .finally(() => setSessionLoading(false));
  }, [doc?.docId]);

  const handleRateLimitError = (err) => {
    if (err.response?.status === 429) {
      fetchRateLimit();
      return err.response.data.error;
    }
    return err.response?.data?.error || err.message;
  };

  const handleGenerateSummary = async () => {
    if (summaryData || docDetails.isLocked) return;
    setTabLoading(prev => ({ ...prev, summary: true }));
    setTabErrors(prev => ({ ...prev, summary: null }));
    try {
      const data = await generateSummary(doc.docId);
      setSummaryData(data);
    } catch (err) {
      setTabErrors(prev => ({ ...prev, summary: handleRateLimitError(err) }));
    } finally {
      setTabLoading(prev => ({ ...prev, summary: false }));
    }
  };

  const handleGenerateMindmap = async () => {
    if (mindmapData || docDetails.isLocked) return;
    setTabLoading(prev => ({ ...prev, mindmap: true }));
    setTabErrors(prev => ({ ...prev, mindmap: null }));
    try {
      const data = await generateMindmap(doc.docId);
      setMindmapData(data);
    } catch (err) {
      setTabErrors(prev => ({ ...prev, mindmap: handleRateLimitError(err) }));
    } finally {
      setTabLoading(prev => ({ ...prev, mindmap: false }));
    }
  };

  const handleGenerateFlashcards = async () => {
    if (flashcardData || docDetails.isLocked) return;
    setTabLoading(prev => ({ ...prev, flashcard: true }));
    setTabErrors(prev => ({ ...prev, flashcard: null }));
    try {
      const data = await generateFlashcards(doc.docId);
      setFlashcardData(data);
    } catch (err) {
      setTabErrors(prev => ({ ...prev, flashcard: handleRateLimitError(err) }));
    } finally {
      setTabLoading(prev => ({ ...prev, flashcard: false }));
    }
  };

  const handleGenerateQuiz = async () => {
    if (quizData || docDetails.isLocked) return;
    setTabLoading(prev => ({ ...prev, quiz: true }));
    setTabErrors(prev => ({ ...prev, quiz: null }));
    try {
      const data = await generateQuiz(doc.docId);
      setQuizData(data);
    } catch (err) {
      setTabErrors(prev => ({ ...prev, quiz: handleRateLimitError(err) }));
    } finally {
      setTabLoading(prev => ({ ...prev, quiz: false }));
    }
  };

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const { blob, filename } = await downloadDocument(doc.docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.error || t('dashboard.downloadError'));
    } finally {
      setIsDownloading(false);
    }
  };

  const [isGeneratingPath, setIsGeneratingPath] = useState(false);

  const handleGeneratePath = async () => {
    if (isGeneratingPath || !doc?.docId) return;
    setIsGeneratingPath(true);
    try {
      const { generateLearningPath } = await import('../api');
      await generateLearningPath(doc.docId);
      window.location.href = '/learning-paths';
    } catch (err) {
      alert(err.response?.data?.error || t('dashboard.learningPathError'));
    } finally {
      setIsGeneratingPath(false);
    }
  };

  const handleTogglePublic = async () => {
    if (isTogglingPublic || !doc?.docId) return;
    setIsTogglingPublic(true);
    try {
      const data = await toggleDocumentPublic(doc.docId, !isPublic);
      setIsPublic(data.is_public);
    } catch (err) {
      alert(err.response?.data?.error || t('dashboard.togglePublicError'));
    } finally {
      setIsTogglingPublic(false);
    }
  };

  const handleExportMarkdown = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const data = await exportMarkdown(doc.docId);
      const blob = new Blob([data.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || 'notemind-export.md';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.error || t('dashboard.exportError'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous={true}
        showSkipButton={true}
        showProgress={true}
        callback={handleJoyrideCallback}
        styles={{
          options: {
            primaryColor: '#6366f1',
            backgroundColor: '#1a1d27',
            textColor: '#e4e5e9',
            arrowColor: '#1a1d27',
            overlayColor: 'rgba(0, 0, 0, 0.75)',
            zIndex: 1000,
          },
          tooltipContainer: { textAlign: 'left' },
          buttonNext: { backgroundColor: '#6366f1', borderRadius: '8px' },
          buttonBack: { color: '#9496a1', marginRight: 10 }
        }}
        locale={{ back: t('dashboard.tourBack'), close: t('dashboard.tourClose'), last: t('dashboard.tourDone'), next: t('dashboard.tourNext'), skip: t('dashboard.tourSkip') }}
      />

      {/* Document info bar */}
      <div className="tour-doc-info flex items-center gap-4 mb-5 bg-gradient-to-r from-surface to-surface-2 border border-line rounded-2xl px-6 py-4 shadow-sm">
        <div className="w-10 h-10 bg-primary-600/15 border border-primary-500/20 rounded-xl flex items-center justify-center shrink-0">
          <FileText size={20} className="text-primary-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate text-txt">
            {docDetails.fileName}
            {docDetails.isLocked && <span className="ml-2 px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 text-[10px] border border-red-500/20 font-medium">{t('dashboard.deletedSource')}</span>}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {docDetails.textLength ? `${(docDetails.textLength / 1000).toFixed(1)}k ${t('dashboard.chars')}` : t('dashboard.processed')}
            {sessionLoading && <span className="ml-2 text-primary-400">• {t('dashboard.loadingData')}</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleGeneratePath}
            disabled={isGeneratingPath || docDetails.isLocked}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50
              bg-gradient-to-r from-primary-600 to-accent-600 text-white hover:shadow-lg hover:shadow-primary-500/25 border-0`}
            title={t('dashboard.createLearningPathTitle')}
          >
            {isGeneratingPath ? <Loader2 size={14} className="animate-spin" /> : <Map size={14} />}
            <span className="hidden sm:inline">{t('dashboard.createLearningPath')}</span>
          </button>

          <button
            onClick={handleTogglePublic}
            disabled={isTogglingPublic}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border rounded-xl transition-all ${isPublic
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-surface border-line hover:bg-line text-muted'
              } disabled:opacity-50`}
            title={isPublic ? t('dashboard.currentlyPublic') : t('dashboard.onlyMe')}
          >
            {isTogglingPublic ? <Loader2 size={14} className="animate-spin" /> : isPublic ? <Globe size={14} /> : <Lock size={14} />}
            <span className="hidden sm:inline">{isPublic ? t('dashboard.public') : t('dashboard.private')}</span>
          </button>

          <FavoriteButton documentId={doc.docId} />

          <button
            onClick={() => setShowPomodoro(!showPomodoro)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border rounded-xl transition-all ${showPomodoro
              ? 'bg-primary-500/10 border-primary-500/30 text-primary-400'
              : 'bg-surface border-line hover:bg-line text-muted'
              }`}
            title={t('dashboard.focusModeTitle')}
          >
            <Focus size={14} />
            <span className="hidden sm:inline">{t('dashboard.focus')}</span>
          </button>
        </div>
      </div>

      {/* Feature toolbar + upload quota */}
      <div className="tour-tools flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={handleDownload}
          disabled={isDownloading || docDetails.isLocked}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border rounded-xl transition-all disabled:opacity-50 ${docDetails.isLocked
            ? 'bg-surface border-line text-muted cursor-not-allowed'
            : 'bg-primary-600/10 border-primary-500/20 text-primary-400 hover:bg-primary-600/20'
            }`}
          title={docDetails.isLocked ? t('dashboard.sourceDeletedTitle') : ''}
        >
          {isDownloading ? <Loader2 size={14} className="animate-spin" /> : docDetails.isLocked ? <Lock size={14} /> : <Download size={14} />}
          <span className="hidden sm:inline">{isDownloading ? t('dashboard.downloading') : docDetails.isLocked ? t('dashboard.sourceDeleted') : t('dashboard.downloadOriginal')}</span>
        </button>

        <button
          onClick={handleExportMarkdown}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
        >
          {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
          <span className="hidden sm:inline">{isExporting ? t('dashboard.exporting') : t('dashboard.exportMarkdown')}</span>
        </button>

        <div className="w-px h-5 bg-line mx-0.5 hidden sm:block"></div>

        {[
          { icon: Search, label: t('dashboard.search'), onClick: () => setShowSearch(true) },
          { icon: BarChart3, label: t('dashboard.analytics'), onClick: () => setShowAnalytics(true) },
          { icon: Share2, label: t('dashboard.share'), onClick: () => setShowShare(true) },
          { icon: Tag, label: t('dashboard.tags'), onClick: () => setShowTags(true) },
          { icon: StickyNote, label: t('dashboard.notes'), onClick: () => setShowNotes(true) },
          { icon: Settings, label: t('dashboard.settings'), onClick: () => setShowPreferences(true) },
        ].map((btn, i) => (
          <button
            key={i}
            onClick={btn.onClick}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-surface border border-line rounded-xl text-muted hover:text-txt hover:border-primary-500/30 hover:bg-surface-2 transition-all"
          >
            <btn.icon size={14} />
            <span className="hidden sm:inline">{btn.label}</span>
          </button>
        ))}

        <div className="flex-1" />

        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border ${rateLimit.uploadsRemaining > 0
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
          <Upload size={12} />
          <span className="hidden sm:inline">
            {rateLimit.uploadsRemaining > 0
              ? t('dashboard.uploadsRemaining', { remaining: rateLimit.uploadsRemaining, limit: rateLimit.uploadLimit })
              : rateLimit.isGuest ? t('dashboard.guestLimitReached') : t('dashboard.limitReached')
            }
          </span>
        </div>
      </div>

      {/* Pomodoro Overlay */}
      {showPomodoro && <PomodoroTimer onClose={() => setShowPomodoro(false)} />}

      {/* Tabs */}
      <div className="tour-tabs flex gap-1 mb-6 bg-surface/80 backdrop-blur-sm border border-line rounded-2xl p-1.5">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`
                flex-1 flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200
                ${isActive
                  ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-600/20'
                  : 'text-muted hover:text-txt hover:bg-surface-2'
                }
              `}
            >
              <Icon size={17} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="bg-surface border border-line rounded-2xl min-h-[500px] overflow-hidden shadow-sm">
        {activeTab === 'summary' && (
          <SummaryView
            data={summaryData}
            loading={tabLoading.summary}
            error={tabErrors.summary}
            onGenerate={handleGenerateSummary}
            isLocked={docDetails.isLocked}
          />
        )}
        {activeTab === 'mindmap' && (
          <MindmapView
            data={mindmapData}
            loading={tabLoading.mindmap}
            error={tabErrors.mindmap}
            onGenerate={handleGenerateMindmap}
            isLocked={docDetails.isLocked}
          />
        )}
        {activeTab === 'flashcard' && (
          <FlashcardView
            data={flashcardData}
            loading={tabLoading.flashcard}
            error={tabErrors.flashcard}
            onGenerate={handleGenerateFlashcards}
            docId={doc?.docId}
            isLocked={docDetails.isLocked}
          />
        )}
        {activeTab === 'quiz' && (
          <QuizView
            data={quizData}
            loading={tabLoading.quiz}
            error={tabErrors.quiz}
            onGenerate={handleGenerateQuiz}
            isLocked={docDetails.isLocked}
          />
        )}
      </div>

      {/* Floating Chatbox */}
      <div className={`fixed bottom-6 right-6 z-40 transition-all duration-300 ${showChat ? 'w-[420px] h-[620px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-6rem)] opacity-100 translate-y-0' : 'w-14 h-14 opacity-0 pointer-events-none translate-y-10'}`}>
        <div className="w-full h-full bg-surface border border-line shadow-2xl shadow-black/20 rounded-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-surface-2 to-surface border-b border-line">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary-600/20 rounded-lg flex items-center justify-center">
                <MessageCircle size={16} className="text-primary-400" />
              </div>
              <div>
                <span className="font-semibold text-sm block leading-tight">{t('dashboard.aiAssistant')}</span>
                <span className="text-[10px] text-muted">{t('dashboard.askAboutDoc')}</span>
              </div>
            </div>
            <button onClick={() => setShowChat(false)} className="p-1.5 rounded-lg hover:bg-surface text-muted hover:text-txt transition-colors">
              <XCircle size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatView
              docId={doc.docId}
              messages={chatMessages}
              setMessages={setChatMessages}
              chatLimit={rateLimit.chatLimit}
            />
          </div>
        </div>
      </div>

      {/* Floating Action Button (FAB) for Chat */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          disabled={docDetails.isLocked && chatMessages.length <= 1}
          className={`tour-chat-fab fixed bottom-6 right-6 z-30 w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all group ${docDetails.isLocked && chatMessages.length <= 1
            ? 'bg-gray-600 cursor-not-allowed opacity-50 shadow-none'
            : 'bg-gradient-to-br from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white shadow-primary-600/30 hover:scale-105 active:scale-95'
            }`}
          title={docDetails.isLocked && chatMessages.length <= 1 ? t('dashboard.sourceDocDeleted') : t('dashboard.chatWithAI')}
        >
          <MessageCircle size={22} className="group-hover:scale-110 transition-transform" />
          {!(docDetails.isLocked && chatMessages.length <= 1) && <span className="absolute -top-1 -right-1 w-3 h-3 bg-accent-500 rounded-full ring-2 ring-bg animate-pulse" />}
        </button>
      )}

      {/* Feature Modals */}
      <SearchModal isOpen={showSearch} onClose={() => setShowSearch(false)} />
      <AnalyticsModal isOpen={showAnalytics} onClose={() => setShowAnalytics(false)} />
      <ShareModal isOpen={showShare} onClose={() => setShowShare(false)} documentId={doc.docId} />
      <TagsModal isOpen={showTags} onClose={() => setShowTags(false)} documentId={doc.docId} />
      <PreferencesModal isOpen={showPreferences} onClose={() => setShowPreferences(false)} />
      <NotesPanel docId={doc.docId} isOpen={showNotes} onClose={() => setShowNotes(false)} />
    </div>
  );
}
