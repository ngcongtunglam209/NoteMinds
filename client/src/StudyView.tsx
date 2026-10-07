import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Ellipsis, MessageCircleMore } from 'lucide-react';
import type { ArtifactStatus } from '../../shared/study-api.ts';

export interface StepInfo {
  label: string;
  status: ArtifactStatus;
  statusText?: string; // e.g. "Đang tạo", shown under the mark
}

interface Props {
  title: string;
  meta: string;
  steps: StepInfo[];
  current: number;
  onStep: (index: number) => void;
  dueLabel: string | null; // red ballpoint, e.g. "12 thẻ đến hạn"; null when nothing is due
  heading: string;
  children: ReactNode;
  cta: { label: string; onClick: () => void; disabled?: boolean };
  chatLabel: string;
  onChat: () => void;
  backLabel: string;
  onBack: () => void;
  moreLabel: string;
  onMore: () => void;
}

/** The study screen in the Vở ô li world. Pure: StudyPage feeds it data. */
export function StudyView(p: Props) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Tablist keyboard model: arrows move between steps, Home/End jump to the ends.
  const onKeyDown = (e: KeyboardEvent) => {
    const last = p.steps.length - 1;
    const next = { ArrowRight: p.current + 1, ArrowLeft: p.current - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const i = (next + p.steps.length) % p.steps.length;
    p.onStep(i);
    tabs.current[i]?.focus();
  };

  return (
    <div className="study">
      <div className="study-top">
        <button type="button" className="icon-btn" onClick={p.onBack} aria-label={p.backLabel}>
          <ArrowLeft size={24} strokeWidth={1.75} />
        </button>
        <button type="button" className="icon-btn" onClick={p.onMore} aria-label={p.moreLabel}>
          <Ellipsis size={24} strokeWidth={2.5} />
        </button>
      </div>

      <header className="label">
        <h1>{p.title}</h1>
        <p>{p.meta}</p>
      </header>

      <div className="steps" role="tablist" onKeyDown={onKeyDown}>
        {p.steps.map((s, i) => (
          <button
            key={s.label}
            ref={(el) => { tabs.current[i] = el; }}
            type="button"
            role="tab"
            id={`step-${i}`}
            aria-controls="step-panel"
            aria-selected={i === p.current}
            tabIndex={i === p.current ? 0 : -1}
            className="step"
            onClick={() => p.onStep(i)}
          >
            <span>{i + 1}</span>
            <span className="step-label">{s.label}</span>
            <span className="step-state">
              <StepMark status={s.status} />
              {s.statusText && <span className="step-status">{s.statusText}</span>}
            </span>
          </button>
        ))}
      </div>

      <main className="page" id="step-panel" role="tabpanel" aria-labelledby={`step-${p.current}`}>
        {p.dueLabel && <p className="due">{p.dueLabel}</p>}
        <h2>{p.heading}</h2>
        {p.children}
      </main>

      <div className="thumb">
        <button type="button" className="cta" onClick={p.cta.onClick} disabled={p.cta.disabled}>
          {p.cta.label.split('→').map((part, i, all) => (
            <span key={i} style={{ display: 'contents' }}>
              {part.trim()}
              {i < all.length - 1 && <ArrowRight size={22} strokeWidth={2} aria-hidden />}
            </span>
          ))}
        </button>
        <button type="button" className="chat-btn" onClick={p.onChat}>
          <span><MessageCircleMore size={24} strokeWidth={1.75} /></span>
          <span>{p.chatLabel}</span>
        </button>
      </div>
    </div>
  );
}

/** Status in a fixed cell: filled = ready, half = generating, hollow = not yet, red slash = failed. */
function StepMark({ status }: { status: ArtifactStatus }) {
  return (
    <svg className="step-mark" width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="7.5" fill={status === 'ready' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
      {status === 'generating' && <path d="M9 1.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" />}
      {status === 'failed' && <path d="M3.5 14.5l11-11" stroke="var(--pen)" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
