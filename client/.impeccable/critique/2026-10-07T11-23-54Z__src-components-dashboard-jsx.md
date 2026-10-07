---
target: client/src/components/Dashboard.jsx
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\Administrator\\Desktop\\NoteMinds\\client\\src\\components\\Dashboard.jsx"
target_fingerprint: "sha256:a01c4d74c2aebeea7a390d0217ab2185cb9fe01b4336d896b508028c3df4fec6"
target_path: "C:\\Users\\Administrator\\Desktop\\NoteMinds\\client\\src\\components\\Dashboard.jsx"
timestamp: 2026-10-07T11-23-54Z
slug: src-components-dashboard-jsx
---
Method: dual-agent (A: design review · B: detector). Source-only review; browser skipped (no .env, screen requires login + processed document).

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Fake cycling loading steps, no ETA, no aria-live; 30s quota poll |
| 2 | Match System / Real World | 2 | English jargon (Flashcard, upload, Markdown, Focus Mode); hardcoded Summary label |
| 3 | User Control and Freedom | 2 | No regenerate (Dashboard.jsx:198), no cancel, tab switch wipes quiz progress |
| 4 | Consistency and Standards | 2 | Tour indigo #6366f1 vs rose theme (:335); Share/Public duplicate; meaningless button tints |
| 5 | Error Prevention | 2 | One-click publish without confirmation (:292-303) |
| 6 | Recognition Rather Than Recall | 2 | Labels hidden below sm, no aria-labels |
| 7 | Flexibility and Efficiency | 2 | Ctrl+N unusable; no tab/flashcard/quiz keys |
| 8 | Aesthetic and Minimalist Design | 1 | ~17 controls before content; 3 competing gradients |
| 9 | Error Recovery | 1 | alert() with raw server strings (:270,286,299,318); retry on 429 |
| 10 | Help and Documentation | 2 | One-shot tour, skips Summary, overclaims |
| **Total** | | **18/40** | **Poor** |

## Design Specificity Verdict
LLM: category-interchangeable "AI SaaS dashboard" (gradient icon tile, gradient pill CTAs, pulsing FAB, Sparkles, rotating "AI thinking" copy). No due cards, streak, next-review signal; leads with file utilities and upload quota, contradicting "learning over generating".
Detector: 0 findings (exit 0). Issues are structural/UX, outside detector scope. No false positives.
Overlays: none (browser skipped).

## Strengths
1. Source-deleted lock state designed end to end.
2. Generated artifacts persisted + offline cached (:150-184).
3. Concrete SRS feedback ("Ôn lại sau N ngày").

## Priority Issues
- [P0] No zero-prompt kit: every tab opens empty behind a "Tạo…" button; no regenerate. Fix: auto-generate summary on first open, queue others in background with per-tab status, add "Tạo lại". Command: /impeccable onboard
- [P1] Utility clutter (12 actions above content, global tools in per-doc toolbar, Share/Public duplicate). Fix: doc name + "Học tiếp" primary + "⋯" overflow; merge Public into Share; drop quota pill. Command: /impeccable distill
- [P1] Accessibility basics: no tablist/aria-selected (:470-491), no aria-labels on icon buttons, hidden chat panel focusable (opacity only, no inert), modals lack role=dialog/focus trap, click-only flashcard div, light-mode 400-tone text ~2-2.7:1. Command: /impeccable harden
- [P1] Hostile failure/quota states: alert(), raw strings, retry on 429, quiz hides reason. Fix: inline localized error cards with resetIn time + upgrade link. Command: /impeccable clarify
- [P2] State loss on tab switch; unconfirmed publish with state-like label. Command: /impeccable polish

## Persona Red Flags
Alex: Esc closes all layers; Ctrl+N swallowed; no 1-4/Space/arrow keys; no regenerate; full reload to learning paths (:284); auto tour with 75% overlay.
Sam: tab state not announced; silent loading text; focus into invisible chat panel; index.css:104-108 removes ReactFlow focus outline; SRS grades emoji + 9px, colour only.
Linh (THPT, mid Android): ~17 bare icons <640px; English jargon; 6 SRS buttons ~50px with 9px diacritics; 420px chat panel; backdrop-blur cost; 30s quota poll.

## Minor Observations
No title on truncated filename (:355); "12.3k ký tự" programmer unit; always-green quota pill; tour setTimeout not cleared (:84); 4-grade SRS strings unused in vi.json.

## Questions to Consider
1. Why is "Tải file gốc" first rather than "12 thẻ đến hạn ôn hôm nay"?
2. Dashboard with tabs, or a guided study sequence?
3. Does "one flow for four audiences" mean "every control for everyone"?
