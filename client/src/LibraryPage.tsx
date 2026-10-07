import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { ErrorCode } from '../../shared/types.ts';
import { ApiError } from './api.ts';
import { useT } from './i18n.tsx';
import { LibraryView } from './LibraryView.tsx';
import { FlashcardStep } from './steps.tsx';
import { useDocuments, useDueCards } from './study-data.ts';

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.webp';

export function LibraryPage() {
  const navigate = useNavigate();
  const { documents, upload, uploading, error } = useDocuments();
  const due = useDueCards();
  const [uploadError, setUploadError] = useState<ErrorCode | null>(null);

  // Per-notebook due counts from the first page of due cards (oldest 100): enough to circle the right notebooks.
  const notebooks = useMemo(() => {
    const counts = new Map<number, number>();
    for (const c of due.cards ?? []) counts.set(c.documentId, (counts.get(c.documentId) ?? 0) + 1);
    return (documents ?? []).map((d) => ({ ...d, title: d.fileName.replace(/\.[^.]+$/, ''), dueCount: counts.get(d.id) ?? 0 }));
  }, [documents, due.cards]);

  return (
    <LibraryView
      notebooks={notebooks}
      dueTotal={due.dueCount}
      onReview={() => navigate('/review')}
      onUpload={(file) => {
        setUploadError(null);
        upload(file).then((doc) => navigate(`/doc/${doc.id}`), (err) => setUploadError(err instanceof ApiError ? err.code : 'internal'));
      }}
      uploading={uploading}
      error={uploadError ?? error?.code ?? null}
      accept={ACCEPT}
    />
  );
}

/** Today's review across every notebook. */
export function ReviewPage() {
  const t = useT();
  const due = useDueCards();
  const cards = due.cards ?? [];

  return (
    <div className="library review">
      <Link to="/" className="icon-btn" aria-label={t('study.back')}><ArrowLeft size={24} strokeWidth={1.75} /></Link>
      <h1 className="shelf-title">{t('review.title')}</h1>
      {due.cards === null ? (
        <p className="empty-note">{t('auth.loading')}</p>
      ) : cards.length === 0 ? (
        <p className="pen-note">{t('review.done')}</p>
      ) : (
        <FlashcardStep review cards={cards} onGrade={(at, g) => { const c = cards[at]; if (c) due.review(c.id, g).catch(() => {}); }} />
      )}
    </div>
  );
}
