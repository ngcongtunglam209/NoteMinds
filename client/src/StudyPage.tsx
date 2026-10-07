import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { ArtifactKind, ArtifactState } from '../../shared/study-api.ts';
import type { ErrorCode } from '../../shared/types.ts';
import { deleteDocument } from './api.ts';
import { useLang, useT, type MessageKey } from './i18n.tsx';
import { ChatSheet, FailedNote, FlashcardStep, GeneratingNote, MindmapStep, QuizStep, SummaryStep } from './steps.tsx';
import { useArtifact, useChat, useDocument, useDueCards, usePrefetch, useQuizAttempts, useStudy } from './study-data.ts';
import { StudyView } from './StudyView.tsx';

const KINDS: ArtifactKind[] = ['summary', 'mindmap', 'flashcards', 'quiz'];
const LABEL: Record<ArtifactKind, MessageKey> = { summary: 'study.stepSummary', mindmap: 'study.stepMindmap', flashcards: 'study.stepFlashcards', quiz: 'study.stepQuiz' };
const NEXT: Partial<Record<ArtifactKind, MessageKey>> = { summary: 'study.nextMindmap', mindmap: 'study.nextFlashcards', flashcards: 'study.nextQuiz' };
const WRITING: Record<ArtifactKind, MessageKey> = { summary: 'study.writingSummary', mindmap: 'study.writingMindmap', flashcards: 'study.writingFlashcards', quiz: 'study.writingQuiz' };

export function StudyPage() {
  const { id } = useParams();
  const docId = Number(id);
  // The data hooks assume one document per mount.
  return <StudyScreen key={docId} docId={docId} />;
}

function StudyScreen({ docId }: { docId: number }) {
  const t = useT();
  const { lang } = useLang();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);

  const { document, error: docError } = useDocument(docId);
  const study = useStudy(docId, document?.status);
  const artifacts = {
    summary: useArtifact(study, 'summary', { auto: current === 0 }),
    mindmap: useArtifact(study, 'mindmap', { auto: current === 1 }),
    flashcards: useArtifact(study, 'flashcards', { auto: current === 2 }),
    quiz: useArtifact(study, 'quiz', { auto: current === 3 }),
  };
  usePrefetch(study, KINDS[current + 1]);
  const due = useDueCards(docId);
  const attempts = useQuizAttempts(docId);
  const chat = useChat(docId);

  // New flashcards are due at once; a regenerated quiz clears its attempts.
  const cardsVersion = artifacts.flashcards.state?.status === 'ready' ? artifacts.flashcards.state.updatedAt : null;
  const quizVersion = artifacts.quiz.state?.status === 'ready' ? artifacts.quiz.state.updatedAt : null;
  useEffect(() => { if (cardsVersion) due.refresh(); }, [cardsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (quizVersion) attempts.refresh(); }, [quizVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileTitle = document?.fileName.replace(/\.[^.]+$/, '') ?? '';
  const title = artifacts.summary.payload?.title ?? fileTitle;
  const date = document ? new Date(document.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB') : '';
  const kind = KINDS[current]!;
  const dueCount = study.status?.dueCount ?? 0;

  const statusText = (s: ArtifactState | null) =>
    s?.status === 'generating' ? t('study.statusGenerating') : s?.status === 'failed' ? t('study.statusFailed') : undefined;

  // One step's body: its payload, or an honest note about why it isn't there yet.
  const body = (k: ArtifactKind, render: () => ReactNode) => {
    const a = artifacts[k];
    if (a.payload) return render();
    if (a.state?.status === 'failed') return <FailedNote code={a.state.error ?? 'internal'} onRetry={() => study.generate(k)} />;
    if (a.error) return <FailedNote code={a.error.code} onRetry={() => study.generate(k)} />;
    return <GeneratingNote label={t(WRITING[k])} onCancel={a.state?.status === 'generating' ? () => study.cancel(k) : undefined} />;
  };

  let content: ReactNode;
  if (docError) content = <FailedNote code={docError.code} />;
  else if (!document || document.status === 'processing') content = <GeneratingNote label={t('study.docProcessing')} />;
  else if (document.status === 'failed') content = <FailedNote code={(document.error ?? 'extraction_failed') as ErrorCode} />;
  else {
    const deck = artifacts.flashcards.payload?.cards ?? [];
    content = KINDS.map((k, i) => (
      // All steps stay mounted so moving between them never loses progress.
      <div key={k} hidden={i !== current}>
        {k === 'summary' && body(k, () => <SummaryStep summary={artifacts.summary.payload!} />)}
        {k === 'mindmap' && body(k, () => <MindmapStep mindmap={artifacts.mindmap.payload!} />)}
        {k === 'flashcards' && body(k, () => due.cards && due.cards.length > 0 ? (
          <FlashcardStep review active={i === current} cards={due.cards} onGrade={(at, g) => { const c = due.cards?.[at]; if (c) due.review(c.id, g).catch(() => {}); }} />
        ) : (
          <FlashcardStep active={i === current} cards={deck} />
        ))}
        {k === 'quiz' && body(k, () => <QuizStep key={quizVersion ?? ''} quiz={artifacts.quiz.payload!} onSubmit={(a) => { attempts.submit(a).catch(() => {}); }} />)}
      </div>
    ));
  }

  const next = NEXT[kind];
  return (
    <>
      <StudyView
        title={title || '…'}
        meta={[title !== fileTitle ? document?.fileName : null, date].filter(Boolean).join(' • ')}
        steps={KINDS.map((k) => ({ label: t(LABEL[k]), status: artifacts[k].state?.status ?? 'none', statusText: statusText(artifacts[k].state) }))}
        current={current}
        onStep={setCurrent}
        dueLabel={dueCount > 0 ? t('study.due').replace('{n}', String(dueCount)) : null}
        heading={t(LABEL[kind])}
        cta={next
          ? { label: t('study.nextTo').replace('{step}', t(next)), onClick: () => { setCurrent((c) => c + 1); window.scrollTo({ top: 0 }); } }
          : { label: t('study.finish'), onClick: () => navigate('/') }}
        chatLabel={t('study.ask')}
        onChat={() => setChatOpen(true)}
        backLabel={t('study.back')}
        onBack={() => navigate('/')}
        moreLabel={t('study.more')}
        moreMenu={
          <StudyMenu
            onRegenerate={document?.status === 'ready' ? () => study.generate(kind) : undefined}
            onDelete={async () => { await deleteDocument(docId); navigate('/'); }}
          />
        }
      >
        {content}
      </StudyView>
      <ChatSheet
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={chat.messages ?? []}
        streaming={chat.streaming}
        error={chat.error?.code ?? null}
        onAsk={(q) => { chat.ask(q); }}
      />
    </>
  );
}

/** The ⋯ menu: regenerate this step, delete the notebook (confirmed). */
function StudyMenu({ onRegenerate, onDelete }: { onRegenerate?: () => void; onDelete: () => Promise<void> }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <div className="menu" role="menu">
      {onRegenerate && <button ref={first} type="button" role="menuitem" onClick={onRegenerate}>{t('study.regenerate')}</button>}
      {confirming ? (
        <button type="button" role="menuitem" className="danger" onClick={() => { onDelete().catch(() => setConfirming(false)); }}>{t('study.deleteConfirm')}</button>
      ) : (
        <button type="button" role="menuitem" onClick={() => setConfirming(true)}>{t('study.delete')}</button>
      )}
    </div>
  );
}
