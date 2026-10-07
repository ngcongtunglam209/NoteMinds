// Dev-only: the library with synthetic notebooks, for design review without the API.
import { LibraryView, type Notebook } from '../LibraryView.tsx';

const base = { mimeType: 'application/pdf', sizeBytes: 1, error: null, charCount: 1, updatedAt: '2026-10-07 08:00:00' } as const;
const notebooks: Notebook[] = [
  { ...base, id: 1, fileName: 'sinh12.pdf', title: 'Sinh học 12 — Di truyền học quần thể', status: 'ready', createdAt: '2026-10-07 08:00:00', dueCount: 7 },
  { ...base, id: 2, fileName: 'lichsu.pdf', title: 'Lịch sử — Chiến tranh lạnh', status: 'ready', createdAt: '2026-10-05 08:00:00', dueCount: 3 },
  { ...base, id: 3, fileName: 'unit4.docx', title: 'Tiếng Anh — Unit 4 từ vựng', status: 'ready', createdAt: '2026-10-03 08:00:00', dueCount: 2 },
  { ...base, id: 4, fileName: 'kinh-te-vi-mo-chuong-3.pdf', title: 'kinh-te-vi-mo-chuong-3.pdf', status: 'processing', createdAt: '2026-10-07 09:00:00', dueCount: 0 },
  { ...base, id: 5, fileName: 'scan.pdf', title: 'scan.pdf', status: 'failed', error: 'no_text', createdAt: '2026-10-01 08:00:00', dueCount: 0 },
];

export function LibraryFixture() {
  return (
    <LibraryView notebooks={notebooks} dueTotal={12} onReview={() => {}} onUpload={() => {}} uploading={false} error={null} accept=".pdf" />
  );
}
