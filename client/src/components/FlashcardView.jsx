import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Loader2, AlertCircle, CreditCard, RefreshCw,
  ChevronLeft, ChevronRight, RotateCw, Download, Tag, Star, Volume2, Lock,
  Layers, List, BookOpen, Sparkles, Brain,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { reviewFlashcard } from '../api';
import { useLanguage } from '../LanguageContext';

/* ─── colour palette (shared with mindmap style) ─── */
const CARD_PALETTE = [
  { bg: '#ef444420', fg: '#ef4444', glow: '#ef444440', accent: '#fca5a5' },
  { bg: '#8b5cf620', fg: '#8b5cf6', glow: '#8b5cf640', accent: '#c4b5fd' },
  { bg: '#06b6d420', fg: '#06b6d4', glow: '#06b6d440', accent: '#67e8f9' },
  { bg: '#f59e0b20', fg: '#f59e0b', glow: '#f59e0b40', accent: '#fcd34d' },
  { bg: '#10b98120', fg: '#10b981', glow: '#10b98140', accent: '#6ee7b7' },
  { bg: '#ec489920', fg: '#ec4899', glow: '#ec489940', accent: '#f9a8d4' },
  { bg: '#3b82f620', fg: '#3b82f6', glow: '#3b82f640', accent: '#93c5fd' },
  { bg: '#f9731620', fg: '#f97316', glow: '#f9731640', accent: '#fdba74' },
];

const SR_GRADES = [
  { grade: 0, labelKey: 'gradeForgot', color: 'bg-red-500/80', emoji: '😞', ring: 'ring-red-500/30' },
  { grade: 1, labelKey: 'gradeHard', color: 'bg-orange-500/80', emoji: '😟', ring: 'ring-orange-500/30' },
  { grade: 2, labelKey: 'gradeBlurred', color: 'bg-amber-500/80', emoji: '🤔', ring: 'ring-amber-500/30' },
  { grade: 3, labelKey: 'gradeFair', color: 'bg-yellow-500/80', emoji: '😐', ring: 'ring-yellow-500/30' },
  { grade: 4, labelKey: 'gradeGood', color: 'bg-green-500/80', emoji: '😊', ring: 'ring-green-500/30' },
  { grade: 5, labelKey: 'gradeExcellent', color: 'bg-emerald-500/80', emoji: '🤩', ring: 'ring-emerald-500/30' },
];

export default function FlashcardView({ data, loading, error, onGenerate, docId, isLocked }) {
  const { t } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [viewMode, setViewMode] = useState('card'); // 'card' | 'list'
  const [showGrading, setShowGrading] = useState(false);
  const [reviewResult, setReviewResult] = useState(null);
  const cardStartTime = useRef(Date.now());

  const [loadingText, setLoadingText] = useState(() => t('flashcard.loadingStep1'));

  useEffect(() => {
    if (!loading) return;
    const texts = [
      t('flashcard.loadingStep1'),
      t('flashcard.loadingStep2'),
      t('flashcard.loadingStep3'),
      t('flashcard.loadingStep4')
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % texts.length;
      setLoadingText(texts[i]);
    }, 2500);
    return () => clearInterval(interval);
  }, [loading, t]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] h-full relative overflow-hidden bg-surface">
        {/* Animated background skeleton — flashcard stack */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg className="w-[420px] h-[360px] opacity-20" viewBox="0 0 420 360">
            {/* Stacked card shadows */}
            <rect x="115" y="45" width="200" height="130" rx="16" className="fill-line animate-pulse" transform="rotate(4 215 110)" style={{ animationDelay: '0ms' }} />
            <rect x="110" y="40" width="200" height="130" rx="16" className="fill-surface-2 animate-pulse" transform="rotate(-2 210 105)" style={{ animationDelay: '150ms' }} />
            <rect x="105" y="35" width="200" height="130" rx="16" className="fill-surface-2 animate-pulse" style={{ animationDelay: '300ms' }} />
            {/* Card content lines */}
            <rect x="130" y="60" width="60" height="8" rx="4" className="fill-line animate-pulse" style={{ animationDelay: '400ms' }} />
            <rect x="130" y="80" width="150" height="8" rx="4" className="fill-line animate-pulse" style={{ animationDelay: '500ms' }} />
            <rect x="130" y="100" width="120" height="8" rx="4" className="fill-line animate-pulse" style={{ animationDelay: '600ms' }} />
            <rect x="130" y="130" width="80" height="6" rx="3" className="fill-line animate-pulse" style={{ animationDelay: '700ms' }} />
            {/* Bottom dots */}
            {[0, 1, 2, 3, 4].map(i => (
              <circle key={i} cx={175 + i * 18} cy="210" r="4" className="fill-line animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
            {/* Navigation arrows */}
            <rect x="90" y="230" width="40" height="40" rx="10" className="fill-surface-2 animate-pulse" style={{ animationDelay: '200ms' }} />
            <rect x="290" y="230" width="40" height="40" rx="10" className="fill-surface-2 animate-pulse" style={{ animationDelay: '400ms' }} />
          </svg>
        </div>

        {/* Foreground card */}
        <div className="relative z-20 flex flex-col items-center bg-surface/90 backdrop-blur-xl px-10 py-8 rounded-3xl border border-line shadow-2xl">
          <div className="relative">
            <div className="absolute -inset-4 bg-accent-500/10 rounded-full blur-2xl animate-pulse" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-lg shadow-accent-600/20">
              <Brain size={28} className="text-white animate-pulse" />
            </div>
          </div>
          <p className="mt-5 font-semibold text-sm bg-clip-text text-transparent bg-gradient-to-r from-accent-400 to-accent-600 transition-all duration-500 text-center min-h-[24px] flex items-center justify-center">
            {loadingText}
          </p>
          <div className="w-56 bg-line/50 h-1.5 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-accent-500 to-accent-400 rounded-full animate-[slide_2.5s_ease-in-out_infinite_alternate]" style={{ width: '40%' }} />
          </div>
          <p className="text-[11px] text-muted mt-3">{t('flashcard.generating')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] gap-5 animate-fade-in">
        <div className="relative group">
          <div className="absolute -inset-2 rounded-2xl bg-red-500/15 blur-lg opacity-60" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-500 shadow-lg shadow-red-600/25 border border-red-400/20 flex items-center justify-center">
            <AlertCircle size={28} className="text-white" />
          </div>
        </div>
        <div className="text-center">
          <p className="font-bold text-lg text-red-400 mb-1">{t('flashcard.errorGenerating')}</p>
          <p className="text-sm text-muted max-w-md">{error}</p>
        </div>
        <button
          onClick={onGenerate}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 rounded-xl text-sm font-semibold text-white hover:shadow-lg hover:shadow-primary-600/20 transition-all active:scale-95"
        >
          <RefreshCw size={14} /> {t('quiz.tryAgain')}
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] gap-5 animate-fade-in">
        {/* Pulsing glow icon */}
        <div className="relative group">
          <div className={`absolute -inset-2 rounded-2xl blur-lg opacity-40 transition-opacity duration-500 ${isLocked ? 'bg-gray-500/15' : 'bg-accent-500/15 group-hover:opacity-70'}`} />
          <div className={`relative w-16 h-16 rounded-2xl shadow-lg border flex items-center justify-center ${isLocked
              ? 'bg-gradient-to-br from-gray-600 to-gray-500 shadow-gray-600/25 border-gray-400/20'
              : 'bg-gradient-to-br from-accent-600 to-accent-500 shadow-accent-600/25 border-accent-400/20'
            }`}>
            {isLocked ? <Lock size={28} className="text-white" /> : <CreditCard size={28} className="text-white" />}
          </div>
        </div>
        <div className="text-center">
          <p className="font-bold text-lg text-txt mb-1">{isLocked ? t('flashcard.sourceDeletedTitle') : t('flashcard.emptyTitle')}</p>
          <p className="text-sm text-muted">{isLocked ? t('flashcard.sourceDeletedDesc') : t('flashcard.emptyDesc')}</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={isLocked}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all font-semibold text-white text-sm active:scale-95 ${isLocked
              ? 'bg-gray-600 cursor-not-allowed opacity-50'
              : 'bg-gradient-to-r from-accent-600 to-accent-500 hover:shadow-lg hover:shadow-accent-600/20'
            }`}
        >
          <RefreshCw size={14} /> {t('flashcard.generateButton')}
        </button>
      </div>
    );
  }

  const cards = Array.isArray(data?.cards) ? data.cards : [];
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] gap-5 animate-fade-in">
        <div className="relative group">
          <div className="absolute -inset-2 rounded-2xl bg-accent-500/15 blur-lg opacity-50" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-600 to-accent-500 shadow-lg shadow-accent-600/25 border border-accent-400/20 flex items-center justify-center">
            <CreditCard size={28} className="text-white" />
          </div>
        </div>
        <div className="text-center">
          <p className="font-bold text-lg text-txt mb-1">{t('flashcard.emptyTitle')}</p>
          <p className="text-sm text-muted">{t('flashcard.emptyDesc')}</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={isLocked}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all font-semibold text-white text-sm active:scale-95 ${isLocked
            ? 'bg-gray-600 cursor-not-allowed opacity-50'
            : 'bg-gradient-to-r from-accent-600 to-accent-500 hover:shadow-lg hover:shadow-accent-600/20'
            }`}
        >
          <RefreshCw size={14} /> {t('flashcard.generateButton')}
        </button>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  const total = cards.length;

  const goNext = () => {
    setFlipped(false);
    setShowGrading(false);
    setReviewResult(null);
    cardStartTime.current = Date.now();
    setCurrentIndex((prev) => (prev + 1) % total);
  };

  const goPrev = () => {
    setFlipped(false);
    setShowGrading(false);
    setReviewResult(null);
    cardStartTime.current = Date.now();
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  };

  const handleGrade = async (grade) => {
    if (!currentCard || !docId) return;
    const timeMs = Date.now() - cardStartTime.current;

    // Map numeric grade (0-5) to difficulty string expected by backend
    const difficultyMap = {
      0: 'again',  // Quên
      1: 'hard',   // Khó
      2: 'hard',   // Nhớ mờ
      3: 'good',   // Khá
      4: 'good',   // Tốt
      5: 'easy',   // Xuất sắc
    };
    const difficulty = difficultyMap[grade];

    try {
      const result = await reviewFlashcard(docId, currentIndex, difficulty, timeMs);
      setReviewResult(result);
      setTimeout(() => {
        goNext();
      }, 1200);
    } catch (err) {
      console.error('Review failed:', err);
    }
  };

  const exportAnki = () => {
    const content = cards.map(c => `${c.question}\t${c.answer}\t${c.tag || ''}`).join('\n');
    downloadFile(content, `${data.title || t('flashcard.defaultFileName')}_anki.txt`, 'text/plain');
  };

  const exportQuizlet = () => {
    const content = cards.map(c => `${c.question}\t${c.answer}`).join('\n');
    downloadFile(content, `${data.title || t('flashcard.defaultFileName')}_quizlet.txt`, 'text/plain');
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const speakText = (e, text) => {
    e.stopPropagation(); // Prevent card flip
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop any currently playing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = t('flashcard.speechLang');
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } else {
      alert(t('flashcard.speechNotSupported'));
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* ─── Toolbar (matches mindmap style) ─── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-600 to-accent-500 flex items-center justify-center shadow-sm shadow-accent-600/20">
            <Brain size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm truncate">{data.title || t('flashcard.defaultTitle')}</h3>
            <p className="text-[11px] text-muted">{t('flashcard.cardOf').replace('{current}', currentIndex + 1).replace('{total}', total)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* View toggle */}
          <button
            onClick={() => setViewMode(viewMode === 'card' ? 'list' : 'card')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-2 border border-line rounded-lg hover:bg-line hover:border-primary-500/30 transition-all"
            title={viewMode === 'card' ? t('flashcard.viewList') : t('flashcard.viewCard')}
          >
            {viewMode === 'card' ? <List size={13} /> : <Layers size={13} />}
            {viewMode === 'card' ? t('flashcard.list') : t('flashcard.card')}
          </button>
          {/* Export dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-2 border border-line rounded-lg hover:bg-line hover:border-primary-500/30 transition-all">
              <Download size={12} /> {t('flashcard.export')}
            </button>
            <div className="absolute right-0 top-full mt-1 bg-surface border border-line rounded-xl overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[140px] shadow-xl shadow-black/20">
              <button onClick={exportAnki} className="w-full px-4 py-2.5 text-xs text-left hover:bg-line transition-colors font-medium flex items-center gap-2">
                <BookOpen size={11} className="text-muted" /> Anki (.txt)
              </button>
              <button onClick={exportQuizlet} className="w-full px-4 py-2.5 text-xs text-left hover:bg-line transition-colors font-medium flex items-center gap-2">
                <Sparkles size={11} className="text-muted" /> Quizlet (.txt)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto p-5">
        {viewMode === 'card' ? (
          /* ═══ Card mode ═══ */
          <div className="flex flex-col items-center">
            {/* Progress bar */}
            <div className="w-full max-w-lg mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-muted">{t('flashcard.progress')}</span>
                <span className="text-[11px] font-bold text-primary-400">{currentIndex + 1} / {total}</span>
              </div>
              <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent-500 to-primary-500 rounded-full transition-all duration-500"
                  style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
                />
              </div>
            </div>

            {/* Flashcard */}
            <div
              className={`flip-card w-full max-w-lg h-80 cursor-pointer mb-5 ${flipped ? 'flipped' : ''}`}
              onClick={() => setFlipped(!flipped)}
            >
              <div className="flip-card-inner">
                {/* Front — Question */}
                <div className="flip-card-front bg-gradient-to-br from-surface to-surface-2 border border-line/60 rounded-2xl p-8 flex flex-col items-center justify-center relative shadow-lg shadow-black/5">
                  <span className="absolute top-4 left-4 text-[10px] font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                    style={{ background: CARD_PALETTE[currentIndex % CARD_PALETTE.length].bg, color: CARD_PALETTE[currentIndex % CARD_PALETTE.length].fg }}>
                    <Tag size={10} /> {currentCard?.tag || t('flashcard.questionNumber', { number: currentIndex + 1 })}
                  </span>
                  <button
                    onClick={(e) => speakText(e, currentCard?.question || '')}
                    className="absolute top-4 right-4 p-2 text-muted hover:text-txt bg-surface-2/80 hover:bg-line rounded-lg transition-all"
                    title={t('flashcard.readQuestion')}
                  >
                    <Volume2 size={14} />
                  </button>
                  <div className="text-base font-medium text-center leading-relaxed max-h-[180px] overflow-y-auto px-4">
                    <MarkdownRenderer content={currentCard?.question || ''} />
                  </div>
                  <span className="absolute bottom-4 text-[10px] text-muted/50 font-medium tracking-wide">{t('flashcard.clickToFlip')}</span>
                </div>
                {/* Back — Answer */}
                <div className="flip-card-back rounded-2xl p-8 flex flex-col items-center justify-center relative shadow-lg border"
                  style={{
                    background: `linear-gradient(135deg, ${CARD_PALETTE[currentIndex % CARD_PALETTE.length].bg}, transparent)`,
                    borderColor: CARD_PALETTE[currentIndex % CARD_PALETTE.length].fg + '30',
                    boxShadow: `0 4px 24px ${CARD_PALETTE[currentIndex % CARD_PALETTE.length].glow}`,
                  }}>
                  <span className="absolute top-4 left-4 text-[10px] font-bold px-2.5 py-1 rounded-lg"
                    style={{ background: CARD_PALETTE[currentIndex % CARD_PALETTE.length].fg + '15', color: CARD_PALETTE[currentIndex % CARD_PALETTE.length].fg }}>
                    {t('flashcard.answer')}
                  </span>
                  <button
                    onClick={(e) => speakText(e, currentCard?.answer || '')}
                    className="absolute top-4 right-4 p-2 rounded-lg transition-all"
                    style={{ color: CARD_PALETTE[currentIndex % CARD_PALETTE.length].fg, background: CARD_PALETTE[currentIndex % CARD_PALETTE.length].bg }}
                    title={t('flashcard.readAnswer')}
                  >
                    <Volume2 size={14} />
                  </button>
                  <div className="text-sm text-center leading-relaxed max-h-[180px] overflow-y-auto px-4">
                    <MarkdownRenderer content={currentCard?.answer || ''} />
                  </div>
                  <span className="absolute bottom-4 text-[10px] text-muted/50 font-medium tracking-wide">{t('flashcard.clickToSeeQuestion')}</span>
                </div>
              </div>
            </div>

            {/* Spaced Repetition Grading */}
            {flipped && (
              <div className="w-full max-w-lg mb-4 animate-fade-in">
                {reviewResult ? (
                  <div className="text-center py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <p className="text-sm text-emerald-400 font-semibold">✓ {t('flashcard.reviewSaved', { days: reviewResult.interval || 1 })}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] text-muted text-center mb-2.5 font-medium">{t('flashcard.howWellRemember')}</p>
                    <div className="grid grid-cols-6 gap-1.5">
                      {SR_GRADES.map(g => (
                        <button
                          key={g.grade}
                          onClick={() => handleGrade(g.grade)}
                          className={`${g.color} ${g.ring} ring-1 hover:opacity-90 rounded-xl py-2 text-center transition-all hover:scale-105 active:scale-95`}
                        >
                          <div className="text-base">{g.emoji}</div>
                          <div className="text-[9px] font-bold mt-0.5 text-white/90">{t(`flashcard.${g.labelKey}`)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-4">
              <button
                onClick={goPrev}
                className="p-3 bg-surface-2 border border-line rounded-xl hover:bg-line hover:border-primary-500/30 transition-all active:scale-95"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={goNext}
                className="p-3 bg-surface-2 border border-line rounded-xl hover:bg-line hover:border-primary-500/30 transition-all active:scale-95"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Progress dots */}
            <div className="flex gap-1 mt-4 flex-wrap justify-center max-w-md">
              {cards.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setCurrentIndex(i); setFlipped(false); }}
                  className={`rounded-full transition-all duration-300 ${i === currentIndex
                      ? 'w-5 h-1.5 bg-primary-400'
                      : 'w-1.5 h-1.5 bg-line hover:bg-muted'
                    }`}
                />
              ))}
            </div>
          </div>
        ) : (
          /* ═══ List mode ═══ */
          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {cards.map((card, i) => {
              const c = CARD_PALETTE[i % CARD_PALETTE.length];
              return (
                <div
                  key={card.id || i}
                  className="bg-surface border border-line/50 rounded-xl p-4 hover:border-line transition-all group"
                  style={{ borderLeftWidth: 3, borderLeftColor: c.fg }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: c.bg, color: c.fg }}>
                      #{i + 1}
                    </span>
                    {card.tag && (
                      <span className="text-[10px] text-muted bg-surface-2 px-2 py-0.5 rounded-md font-medium">
                        {card.tag}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium mb-2"><MarkdownRenderer content={card.question} /></div>
                  <div className="text-sm text-muted leading-relaxed border-t border-line/40 pt-2 mt-2"><MarkdownRenderer content={card.answer} /></div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Hint bar at bottom ─── */}
      {viewMode === 'card' && (
        <div className="px-5 py-2 border-t border-line bg-surface-2/50 text-center">
          <p className="text-[10px] text-muted font-medium">
            <kbd className="px-1.5 py-0.5 bg-surface border border-line rounded text-[9px] font-mono">←</kbd>
            <kbd className="px-1.5 py-0.5 bg-surface border border-line rounded text-[9px] font-mono ml-1">→</kbd>
            <span className="ml-2">{t('flashcard.navigate')}</span>
            <span className="mx-2 text-line">|</span>
            <span>{t('flashcard.clickCardToFlip')}</span>
          </p>
        </div>
      )}
    </div>
  );
}
