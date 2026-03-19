import { useState, useMemo } from 'react';
import {
  ArrowLeft, Map, CreditCard, FileText, MessageCircle, WifiOff,
  Clock, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight,
  RotateCw, Eye
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import MindmapView from './MindmapView';
import { useLanguage } from '../LanguageContext';

const TABS = [
  { id: 'mindmap', labelKey: 'offline.tabMindmap', icon: Map },
  { id: 'flashcard', labelKey: 'offline.tabFlashcard', icon: CreditCard },
  { id: 'quiz', labelKey: 'offline.tabQuiz', icon: FileText },
  { id: 'chat', labelKey: 'offline.tabChat', icon: MessageCircle },
];

function OfflineFlashcards({ data, t }) {
  const cards = data?.cards || data || [];
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!cards.length) return <EmptyTab label={t('offline.noFlashcardForDoc')} t={t} />;

  const card = cards[idx];
  return (
    <div className="p-6 flex flex-col items-center gap-6">
      <div className="text-xs text-muted font-medium">
        {idx + 1} / {cards.length} thẻ
      </div>

      <div
        onClick={() => setFlipped(!flipped)}
        className="w-full max-w-xl min-h-[260px] cursor-pointer rounded-2xl border border-line bg-surface-2 p-8 flex items-center justify-center transition-all hover:shadow-lg hover:border-primary-500/30"
      >
        <div className="text-center max-w-full">
          <span className="text-[10px] uppercase tracking-wider text-muted font-bold mb-3 block">
            {flipped ? t('offline.answer') : t('offline.question')}
          </span>
          <div className="text-txt text-base leading-relaxed">
            {flipped
              ? (card.back || card.answer || '')
              : (card.front || card.question || '')}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => { setIdx(Math.max(0, idx - 1)); setFlipped(false); }}
          disabled={idx === 0}
          className="p-2 rounded-xl bg-surface border border-line text-muted hover:text-txt disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => setFlipped(!flipped)}
          className="px-4 py-2 rounded-xl bg-primary-600/10 border border-primary-500/20 text-primary-400 text-xs font-medium hover:bg-primary-600/20 transition-colors flex items-center gap-1.5"
        >
          <RotateCw size={13} />
          {t('offline.flipCard')}
        </button>
        <button
          onClick={() => { setIdx(Math.min(cards.length - 1, idx + 1)); setFlipped(false); }}
          disabled={idx === cards.length - 1}
          className="p-2 rounded-xl bg-surface border border-line text-muted hover:text-txt disabled:opacity-30 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

function OfflineQuiz({ data, t }) {
  const questions = data?.questions || [];
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showReview, setShowReview] = useState(false);

  if (!questions.length) return <EmptyTab label={t('offline.noQuizForDoc')} t={t} />;

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const q = questions[idx];
  const score = questions.reduce((s, q, i) => s + (answers[i] === q.correct ? 1 : 0), 0);

  if (submitted && !showReview) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="p-8 flex flex-col items-center gap-5">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-extrabold border-4 ${
          pct >= 80 ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' :
          pct >= 50 ? 'border-amber-500 text-amber-400 bg-amber-500/10' :
          'border-red-500 text-red-400 bg-red-500/10'
        }`}>
          {pct}%
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-txt">{t('offline.correctCount').replace('{score}', score).replace('{total}', questions.length)}</h3>
          <p className="text-sm text-muted mt-1">
            {pct >= 80 ? t('offline.resultExcellent') : pct >= 50 ? t('offline.resultGood') : t('offline.resultNeedReview')}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowReview(true)}
            className="px-4 py-2 rounded-xl bg-surface border border-line text-txt text-sm font-medium hover:bg-surface-2 transition-colors flex items-center gap-1.5"
          >
            <Eye size={14} /> {t('offline.review')}
          </button>
          <button
            onClick={() => { setAnswers({}); setSubmitted(false); setIdx(0); }}
            className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 transition-colors flex items-center gap-1.5"
          >
            <RotateCw size={14} /> {t('offline.retryQuiz')}
          </button>
        </div>
      </div>
    );
  }

  if (showReview) {
    return (
      <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
        <button onClick={() => setShowReview(false)} className="text-xs text-primary-400 hover:underline mb-2 flex items-center gap-1">
          <ArrowLeft size={12} /> {t('offline.backToResult')}
        </button>
        {questions.map((q, i) => (
          <div key={i} className={`p-4 rounded-xl border ${answers[i] === q.correct ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
            <p className="text-sm font-medium text-txt mb-2">{t('offline.questionNumber').replace('{number}', i + 1)}: {q.question}</p>
            <div className="space-y-1">
              {q.options.map((opt, oi) => (
                <div key={oi} className={`text-xs px-3 py-1.5 rounded-lg ${oi === q.correct ? 'text-emerald-400 font-medium' : oi === answers[i] && oi !== q.correct ? 'text-red-400 line-through' : 'text-muted'}`}>
                  {LETTERS[oi]}. {opt}
                </div>
              ))}
            </div>
            {q.explanation && <p className="text-[11px] text-muted mt-2 italic">{q.explanation}</p>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted font-medium">{t('offline.questionProgress').replace('{current}', idx + 1).replace('{total}', questions.length)}</span>
        <div className="h-1.5 flex-1 mx-4 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
        </div>
      </div>

      <h3 className="text-sm font-semibold text-txt">{q.question}</h3>

      <div className="space-y-2">
        {q.options.map((opt, oi) => (
          <button
            key={oi}
            onClick={() => setAnswers(prev => ({ ...prev, [idx]: oi }))}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm border transition-all ${
              answers[idx] === oi
                ? 'bg-primary-600/10 border-primary-500/40 text-txt font-medium'
                : 'bg-surface border-line text-muted hover:text-txt hover:border-line'
            }`}
          >
            <span className="font-bold mr-2 text-xs">{LETTERS[oi]}.</span>
            {opt}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mt-2">
        <button
          onClick={() => setIdx(Math.max(0, idx - 1))}
          disabled={idx === 0}
          className="px-3 py-2 rounded-xl bg-surface border border-line text-muted text-xs font-medium disabled:opacity-30 hover:text-txt transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        {idx === questions.length - 1 ? (
          <button
            onClick={() => setSubmitted(true)}
            disabled={Object.keys(answers).length < questions.length}
            className="px-5 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-500 disabled:opacity-40 transition-colors"
          >
            {t('offline.submitQuiz')}
          </button>
        ) : (
          <button
            onClick={() => setIdx(Math.min(questions.length - 1, idx + 1))}
            className="px-3 py-2 rounded-xl bg-surface border border-line text-muted text-xs font-medium hover:text-txt transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function OfflineChat({ messages, t }) {
  if (!messages || messages.length <= 1) return <EmptyTab label={t('offline.noChatForDoc')} t={t} />;

  return (
    <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
      {messages.map((msg, i) => (
        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            msg.role === 'user'
              ? 'bg-primary-600 text-white rounded-br-md'
              : 'bg-surface-2 border border-line text-txt rounded-bl-md'
          }`}>
            {msg.role === 'assistant' ? (
              <MarkdownRenderer content={msg.content} />
            ) : (
              msg.content
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyTab({ label, t }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <WifiOff size={28} className="text-muted/30 mb-3" />
      <p className="text-sm text-muted">{label}</p>
      <p className="text-xs text-muted/60 mt-1">{t('offline.needsOnlineGeneration')}</p>
    </div>
  );
}

export default function OfflineDocViewer({ docId, docName, onBack }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('mindmap');

  const cached = useMemo(() => {
    try {
      const all = JSON.parse(localStorage.getItem('notemind_sessions_cache') || '{}');
      return all[docId] || null;
    } catch { return null; }
  }, [docId]);

  const sessions = cached?.sessions || {};
  const hasMindmap = !!sessions.mindmap;
  const hasFlashcards = !!(sessions.flashcards?.cards?.length || (Array.isArray(sessions.flashcards) && sessions.flashcards.length));
  const hasQuiz = !!sessions.quiz?.questions?.length;
  const hasChat = !!(sessions.chat?.length > 1);

  const availableTabs = TABS.filter(t => {
    if (t.id === 'mindmap') return hasMindmap;
    if (t.id === 'flashcard') return hasFlashcards;
    if (t.id === 'quiz') return hasQuiz;
    if (t.id === 'chat') return hasChat;
    return false;
  });

  // Auto-select first available tab
  const effectiveTab = availableTabs.find(t => t.id === activeTab)
    ? activeTab
    : (availableTabs[0]?.id || 'mindmap');

  return (
    <div className="min-h-screen bg-bg">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-bg/80 backdrop-blur-xl border-b border-line">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-xl text-muted hover:text-txt hover:bg-surface transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-txt truncate">{docName}</h1>
            <p className="text-[10px] text-muted flex items-center gap-1">
              <WifiOff size={9} />
              {t('offline.title')}
              {cached?.cachedAt && (
                <span className="ml-1">• {t('offline.savedAt')} {new Date(cached.cachedAt).toLocaleString('vi-VN')}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">
        {!cached ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-surface border border-line flex items-center justify-center mb-5">
              <WifiOff size={32} className="text-muted/40" />
            </div>
            <h3 className="text-lg font-bold text-txt mb-2">{t('offline.noOfflineDataTitle')}</h3>
            <p className="text-sm text-muted max-w-sm leading-relaxed">
              {t('offline.noOfflineDataDesc')}
            </p>
          </div>
        ) : availableTabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-surface border border-line flex items-center justify-center mb-5">
              <FileText size={32} className="text-muted/40" />
            </div>
            <h3 className="text-lg font-bold text-txt mb-2">{t('offline.noGeneratedContentTitle')}</h3>
            <p className="text-sm text-muted max-w-sm leading-relaxed">
              {t('offline.noGeneratedContentDesc')}
            </p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-5 bg-surface/80 backdrop-blur-sm border border-line rounded-2xl p-1.5">
              {availableTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = effectiveTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-600/20'
                        : 'text-muted hover:text-txt hover:bg-surface-2'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="hidden sm:inline">{t(tab.labelKey)}</span>
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="bg-surface border border-line rounded-2xl min-h-[400px] overflow-hidden shadow-sm">
              {effectiveTab === 'mindmap' && hasMindmap && (
                <MindmapView
                  data={sessions.mindmap}
                  loading={false}
                  error={null}
                  onGenerate={() => {}}
                  isLocked={true}
                />
              )}
              {effectiveTab === 'flashcard' && hasFlashcards && (
                <OfflineFlashcards data={sessions.flashcards} t={t} />
              )}
              {effectiveTab === 'quiz' && hasQuiz && (
                <OfflineQuiz data={sessions.quiz} t={t} />
              )}
              {effectiveTab === 'chat' && hasChat && (
                <OfflineChat messages={sessions.chat} t={t} />
              )}
            </div>

            {/* Offline notice */}
            <div className="mt-4 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
              <WifiOff size={14} className="text-amber-400 shrink-0" />
              <p className="text-[11px] text-muted leading-relaxed">
                {t('offline.notice')}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
