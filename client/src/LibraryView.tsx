import { useRef } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import type { DocumentSummary } from '../../shared/documents.ts';
import type { ErrorCode } from '../../shared/types.ts';
import { useLang, useT } from './i18n.tsx';

export interface Notebook extends DocumentSummary {
  title: string; // summary title once known, else the file name
  dueCount: number;
}

interface Props {
  notebooks: Notebook[];
  dueTotal: number;
  onReview: () => void;
  onUpload: (file: File) => void;
  uploading: boolean;
  error: ErrorCode | null;
  accept: string;
}

/** Library / daily review home: today's due count in red pen, then the shelf of notebooks. Pure. */
export function LibraryView(p: Props) {
  const t = useT();
  const { lang } = useLang();
  const file = useRef<HTMLInputElement>(null);
  const locale = lang === 'vi' ? 'vi-VN' : 'en-GB';
  const today = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="library">
      <header className="today">
        <p className="today-date">{today}</p>
        {p.dueTotal > 0 ? (
          <>
            <p className="due due-big">{t('study.due').replace('{n}', String(p.dueTotal))}</p>
            <button type="button" className="cta" onClick={p.onReview}>
              {t('library.startReview').replace('{n}', String(p.dueTotal))}
            </button>
          </>
        ) : (
          <p className="today-clear">{t('library.nothingDue')}</p>
        )}
      </header>

      <h1 className="shelf-title">{t('library.title')}</h1>
      {p.error && <p className="pen-note" role="alert">{t(`error.${p.error}`)}</p>}

      <ul className="shelf">
        <li>
          <button type="button" className="notebook notebook-new" onClick={() => file.current?.click()} disabled={p.uploading}>
            <Plus size={28} strokeWidth={1.5} aria-hidden />
            <span>{p.uploading ? t('library.uploading') : t('library.newNotebook')}</span>
            <small>{t('library.formats')}</small>
          </button>
          <input
            ref={file}
            type="file"
            accept={p.accept}
            className="visually-hidden"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) p.onUpload(f);
              e.target.value = '';
            }}
          />
        </li>
        {p.notebooks.map((n) => (
          <li key={n.id}>
            <Link to={`/doc/${n.id}`} className={`notebook${n.dueCount > 0 ? ' is-due' : ''}`}>
              <span className="notebook-label">
                <span className="notebook-name">{n.title}</span>
                {/* server timestamps are SQLite UTC 'YYYY-MM-DD HH:MM:SS' */}
                <small>{new Date(n.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString(locale)}</small>
              </span>
              {n.status === 'processing' && <span className="notebook-state">{t('study.docProcessing')}</span>}
              {n.status === 'failed' && <span className="notebook-state pen-note">{t(`error.${n.error ?? 'extraction_failed'}`)}</span>}
              {n.dueCount > 0 && <span className="notebook-due">{n.dueCount}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {p.notebooks.length === 0 && <p className="empty-note shelf-empty">{t('library.empty')}</p>}
    </div>
  );
}
