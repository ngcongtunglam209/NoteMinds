// The four study steps and the chat sheet, drawn in the Vở ô li world. Pure: data comes in as props.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import { RotateCcw, Send, X } from 'lucide-react';
import type { ChatMessage, Flashcard, Mindmap, Quiz, SrsGrade, Summary } from '../../shared/study.ts';
import type { ErrorCode } from '../../shared/types.ts';
import { useT } from './i18n.tsx';

// ── Summary: markdown on the ruling; **bold** becomes an ink underline for key terms ──

export function SummaryStep({ summary }: { summary: Summary }) {
  return (
    <div className="prose">
      <Markdown>{summary.markdown}</Markdown>
    </div>
  );
}

// ── Mind map: branches drawn down the page, the way students sketch them in a notebook ──

export function MindmapStep({ mindmap }: { mindmap: Mindmap }) {
  const children = new Map<string, string[]>();
  for (const e of mindmap.edges) children.set(e.source, [...(children.get(e.source) ?? []), e.target]);
  const byId = new Map(mindmap.nodes.map((n) => [n.id, n]));
  const root = mindmap.nodes.find((n) => n.depth === 0) ?? mindmap.nodes[0];
  if (!root) return null;

  const branch = (id: string): ReactNode => {
    const kids = children.get(id) ?? [];
    return kids.length ? (
      <ul>
        {kids.map((k) => (
          <li key={k}>
            <span className={`node depth-${Math.min(byId.get(k)?.depth ?? 1, 3)}`}>{byId.get(k)?.label}</span>
            {branch(k)}
          </li>
        ))}
      </ul>
    ) : null;
  };

  return (
    <div className="mindmap">
      <p className="mindmap-root">{root.label}</p>
      {branch(root.id)}
    </div>
  );
}

// ── Flashcards: an index card on the page; flip, then grade 1–4 ──

const GRADES: SrsGrade[] = ['again', 'hard', 'good', 'easy'];

export function FlashcardStep({ cards, onGrade, active = true }: {
  cards: Flashcard[];
  onGrade: (index: number, grade: SrsGrade) => void;
  active?: boolean; // keyboard shortcuts only while this step is on screen
}) {
  const t = useT();
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[i];

  const go = (next: number) => {
    setI(Math.max(0, Math.min(cards.length - 1, next)));
    setFlipped(false);
  };
  const grade = (g: SrsGrade) => {
    onGrade(i, g);
    if (i < cards.length - 1) go(i + 1);
  };

  // Keyboard: Space flips, arrows move, 1–4 grade once flipped. Ignored while typing or in the chat sheet.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, [role="dialog"]')) return;
      if (e.key === ' ') { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'ArrowLeft') go(i - 1);
      else if (flipped && ['1', '2', '3', '4'].includes(e.key)) grade(GRADES[Number(e.key) - 1]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!card) return <p className="empty-note">{t('study.noCards')}</p>;

  return (
    <div className="flash">
      <p className="flash-count" aria-live="polite">{t('study.cardOf').replace('{n}', String(i + 1)).replace('{total}', String(cards.length))}</p>
      <button
        type="button"
        className={`flash-card${flipped ? ' is-flipped' : ''}`}
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? t('study.showQuestion') : t('study.showAnswer')}
      >
        <span className="flash-face flash-front">{card.question}</span>
        <span className="flash-face flash-back" aria-hidden={!flipped}>{card.answer}</span>
      </button>
      {flipped ? (
        <div className="grades" role="group" aria-label={t('study.gradeLabel')}>
          {GRADES.map((g, n) => (
            <button key={g} type="button" className={`grade grade-${g}`} onClick={() => grade(g)}>
              <kbd>{n + 1}</kbd>
              {t(`grade.${g}`)}
            </button>
          ))}
        </div>
      ) : (
        <p className="flash-hint">{t('study.flipHint')}</p>
      )}
    </div>
  );
}

// ── Quiz: answer-sheet bubbles A–D; graded in red pen ──

export function QuizStep({ quiz, onSubmit }: { quiz: Quiz; onSubmit: (answers: (number | null)[]) => void }) {
  const t = useT();
  const [answers, setAnswers] = useState<(number | null)[]>(() => quiz.questions.map(() => null));
  const [done, setDone] = useState(false);
  const score = answers.filter((a, q) => a === quiz.questions[q]?.correctIndex).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setDone(true);
    onSubmit(answers);
  };

  return (
    <form className="quiz" onSubmit={submit}>
      {done && <p className="score" role="status">{score}/{quiz.questions.length}</p>}
      <ol>
        {quiz.questions.map((q, qi) => (
          <li key={qi}>
            <fieldset disabled={done}>
              <legend>{qi + 1}. {q.question}</legend>
              {q.options.map((opt, oi) => {
                const chosen = answers[qi] === oi;
                const verdict = done && (oi === q.correctIndex ? 'right' : chosen ? 'wrong' : '');
                return (
                  <label key={oi} className={`option ${verdict || ''}`}>
                    <input
                      type="radio"
                      name={`q${qi}`}
                      checked={chosen}
                      onChange={() => setAnswers((a) => a.map((v, k) => (k === qi ? oi : v)))}
                    />
                    <span className="bubble" aria-hidden>{'ABCD'[oi]}</span>
                    <span>{opt}</span>
                  </label>
                );
              })}
              {done && <p className="explain">{q.explanation}</p>}
            </fieldset>
          </li>
        ))}
      </ol>
      {!done && <button type="submit" className="cta quiz-submit">{t('study.submitQuiz')}</button>}
      {done && (
        <button type="button" className="text-btn" onClick={() => { setAnswers(quiz.questions.map(() => null)); setDone(false); }}>
          <RotateCcw size={16} aria-hidden /> {t('study.retryQuiz')}
        </button>
      )}
    </form>
  );
}

// ── Generating / failed states, honest about what is happening ──

export function GeneratingNote({ label, onCancel }: { label: string; onCancel?: () => void }) {
  const t = useT();
  return (
    <div className="state-note" role="status">
      <p className="writing">{label}</p>
      {onCancel && <button type="button" className="text-btn" onClick={onCancel}>{t('study.cancel')}</button>}
    </div>
  );
}

export function FailedNote({ code, onRetry }: { code: ErrorCode; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="state-note" role="alert">
      <p className="pen-note">{t(`error.${code}`)}</p>
      {onRetry && <button type="button" className="text-btn" onClick={onRetry}><RotateCcw size={16} aria-hidden /> {t('study.retry')}</button>}
    </div>
  );
}

// ── Chat: a sheet over the page (bottom on phones, a column on wide screens) ──

export function ChatSheet(p: {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  streaming: boolean;
  error: ErrorCode | null;
  onAsk: (q: string) => void;
}) {
  const t = useT();
  const [q, setQ] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const { open, onClose } = p;

  // Focus the input on open, Esc closes, focus returns to the opener on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [p.messages]);

  if (!open) return null;
  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (!text || p.streaming) return;
    p.onAsk(text);
    setQ('');
  };

  return (
    <>
    <div className="scrim" onClick={onClose} aria-hidden />
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="chat-title">
      <div className="sheet-head">
        <h2 id="chat-title">{t('study.chatTitle')}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('study.close')}><X size={22} /></button>
      </div>
      <div className="sheet-log" ref={log} aria-live="polite">
        {p.messages.length === 0 && <p className="empty-note">{t('study.chatEmpty')}</p>}
        {p.messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === 'assistant' ? <div className="prose"><Markdown>{m.content}</Markdown></div> : <p>{m.content}</p>}
          </div>
        ))}
        {p.error && <p className="pen-note">{t(`error.${p.error}`)}</p>}
      </div>
      <form className="sheet-input" onSubmit={send}>
        <label htmlFor="chat-q" className="visually-hidden">{t('study.chatPlaceholder')}</label>
        <textarea
          id="chat-q"
          ref={input}
          rows={1}
          maxLength={2000}
          value={q}
          placeholder={t('study.chatPlaceholder')}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
        />
        <button type="submit" className="icon-btn send" disabled={!q.trim() || p.streaming} aria-label={t('study.send')}>
          <Send size={20} />
        </button>
      </form>
    </div>
    </>
  );
}
