---
version: 1
slug: "src-studypage-tsx"
primary_target: "src/StudyPage.tsx"
related_targets: ["src/LibraryPage.tsx"]
---

# Surface: document-study + library

## Scope and mode
Operate. Two screens of the rewrite client: the document study screen (`src/StudyPage.tsx`) and the library / daily review home (`src/LibraryPage.tsx`). Mobile-first (360px), expands to tablet and desktop. Production-ready.

## Audience, job, action
Vietnamese learners (THPT students, university students, working self-learners, teachers) who just uploaded a document or return to review. Job: learn and remember, not manage files.
- Study screen primary action: "Học tiếp" (next step). Summary is generated automatically on first open; mindmap, flashcards and quiz generate when reached (next step prefetched). Regenerate and cancel available.
- Library primary action: "Bắt đầu ôn · N thẻ" (start today's review).

## Content and ranges
Document name 10–120 chars; summary 150–1500 words; 5–200 cards; 0–300 due; 0–500 documents. No original-file download (text only is stored). No fabricated stats, testimonials or accuracy claims.

## States
First open while summary generates (honest per-stage progress), step not generated yet (auto-generate on arrival), generation failed (error code → localized message), AI unavailable, chat quota exceeded (reset time + upgrade link), upload quota exceeded, offline, 0 due, empty library (invite to upload "Vở mới"), regenerate, cancel.

## Interaction and layout
- Study, mobile: compact nhãn vở label on top; 4 steps (Tóm tắt, Sơ đồ, Thẻ nhớ, Kiểm tra) as a horizontal strip of 4 cells with fixed status marks; becomes the red-margin step column at ≥768px. "Học tiếp" fixed in the thumb zone. Chat ("Hỏi tài liệu") is a bottom sheet on mobile, a right column at ≥1280px. All steps stay mounted (no lost progress). Overflow "⋯": Xuất, Chia sẻ (public merged in, with confirmation), Xóa.
- Flashcards: 4 grades again/hard/good/easy, ≥44px targets, keys 1–4, Space flips, arrows move. Steps are a tablist; Esc closes only the top layer.
- Library: today's date + red-circled due count; "Bắt đầu ôn · N thẻ"; whole-cell grid of notebooks (2 cols mobile, 4–5 desktop), first cell is "Vở mới" (upload); due notebooks circled in red ballpoint.

## Constraints and open decisions
Vietnamese default + English, all strings in locale files; WCAG AA; fonts with full Vietnamese diacritics (chosen with font-match at build). Open: dark-mode rendering of the notebook world (decide once light exists); whether the mindmap canvas uses square-grid paper; subject-coloured notebook covers (no subject field yet).

## Direction contract
THESIS: Each document is a Vietnamese school notebook (vở ô li) used as a working typographic system: the ô li ruling is the baseline grid, the learner writes in purple ink, and red ballpoint belongs only to review. It refuses the AI-SaaS dashboard (gradient tiles, sparkles, a 12-button toolbar over tabs).
OWN-WORLD: Cool white page #FAFAF7 (never cream), purple-black ink #2E2A6B for all text and the primary action, ô li violet #9C8BD9 rules (one strong line + three faint per row) carrying every text baseline, a single red margin rule, red ballpoint #E0281F reserved for due counts, review marks and lapses. A nhãn vở name label with a thin double border identifies each document. Hand-drawn strokes only for red-pen marks, never for body text. Raises: one fixed frame and baseline for all four steps; nothing labelled twice; SRS state as marks in a fixed margin cell (filled = known, hollow = not yet, red strike = forgotten); library as whole notebook cells with due ones circled in ballpoint; ink and paper only, every text AA.
STORY: The learner opens a document and is already reading its summary on the page; they see how much is due, move step by step with one button, and come back tomorrow because the red circle says so.
FIRST VIEWPORT: Mobile 390×844. Top: compact nhãn vở (document name, subject/date) with back and ⋯. Under it the 4-step strip with status marks, current step underlined in purple. Right margin: "12 thẻ đến hạn hôm nay" circled in red ballpoint. Body: summary set on the ô li grid. Bottom thumb zone: full-width purple-ink "Học tiếp → Sơ đồ tư duy" button plus a round "Hỏi tài liệu" chat button.
FORM: Vở ô li, candidate 5 of 7 on the ordered list; seed key fa50a369.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Approved comp
.impeccable/mocks/study-a-strip.png, combined with: purple hand underline on key terms in the summary body (from study-b-tabs.png) and text status labels inside the step cells such as "Đang tạo" (from study-c-contents.png). Not to literalize: the comp text is sample content; the 4 bullets are real summary output at build time.
