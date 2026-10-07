// Dev-only: the study screen with the approved comp's sample content (synthetic, not a real document),
// so the design can be captured and reviewed without the API. Only routed when import.meta.env.DEV.
import { useState } from 'react';
import type { ChatMessage, Flashcard, Mindmap, Quiz } from '../../../shared/study.ts';
import { StudyView } from '../StudyView.tsx';
import { ChatSheet, FlashcardStep, MindmapStep, QuizStep, SummaryStep } from '../steps.tsx';

const summary = {
  title: 'Di truyền học quần thể',
  markdown: [
    '- **Tần số alen** là tỉ lệ giữa số alen của một loại so với tổng số alen của tất cả các loại trong quần thể tại một thời điểm.',
    '- **Định luật Hardy–Weinberg**: Trong điều kiện lý tưởng, tần số alen và thành phần kiểu gen của quần thể ổn định qua các thế hệ; p² + 2pq + q² = 1.',
    '- **Quần thể tự phối** làm tăng tỉ lệ kiểu gen đồng hợp, giảm tỉ lệ kiểu gen dị hợp và làm giảm đa dạng di truyền.',
    '- **Quần thể ngẫu phối** duy trì cân bằng Hardy–Weinberg và giữ ổn định tần số alen qua các thế hệ.',
  ].join('\n'),
};

const mindmap: Mindmap = {
  title: 'Di truyền học quần thể',
  nodes: [
    { id: 'r', label: 'Di truyền học quần thể', depth: 0 },
    { id: 'a', label: 'Cấu trúc di truyền', depth: 1 },
    { id: 'a1', label: 'Tần số alen', depth: 2 },
    { id: 'a2', label: 'Tần số kiểu gen', depth: 2 },
    { id: 'b', label: 'Quần thể tự phối', depth: 1 },
    { id: 'b1', label: 'Tăng đồng hợp, giảm dị hợp', depth: 2 },
    { id: 'c', label: 'Quần thể ngẫu phối', depth: 1 },
    { id: 'c1', label: 'Định luật Hardy–Weinberg', depth: 2 },
    { id: 'c2', label: 'p² + 2pq + q² = 1', depth: 3 },
  ],
  edges: [
    { id: 'e1', source: 'r', target: 'a' }, { id: 'e2', source: 'a', target: 'a1' }, { id: 'e3', source: 'a', target: 'a2' },
    { id: 'e4', source: 'r', target: 'b' }, { id: 'e5', source: 'b', target: 'b1' },
    { id: 'e6', source: 'r', target: 'c' }, { id: 'e7', source: 'c', target: 'c1' }, { id: 'e8', source: 'c1', target: 'c2' },
  ],
};

const cards: Flashcard[] = [
  { question: 'Tần số alen là gì?', answer: 'Tỉ lệ giữa số alen của một loại so với tổng số alen của tất cả các loại trong quần thể tại một thời điểm.' },
  { question: 'Phương trình Hardy–Weinberg?', answer: 'p² + 2pq + q² = 1, với p và q là tần số hai alen.' },
  { question: 'Tự phối qua nhiều thế hệ làm gì với tỉ lệ dị hợp?', answer: 'Giảm dần, mỗi thế hệ giảm một nửa.' },
];

const quiz: Quiz = {
  title: 'Kiểm tra nhanh',
  questions: [
    {
      question: 'Một quần thể cân bằng có p = 0,6. Tần số kiểu gen dị hợp là?',
      options: ['0,24', '0,36', '0,48', '0,16'],
      correctIndex: 2,
      explanation: '2pq = 2 × 0,6 × 0,4 = 0,48.',
    },
    {
      question: 'Quần thể tự phối qua nhiều thế hệ thì?',
      options: ['Tỉ lệ dị hợp tăng', 'Tỉ lệ đồng hợp tăng', 'Tần số alen thay đổi mạnh', 'Luôn đạt cân bằng ngay'],
      correctIndex: 1,
      explanation: 'Tự phối làm tăng đồng hợp, giảm dị hợp; tần số alen không đổi.',
    },
  ],
};

const steps = ['Tóm tắt', 'Sơ đồ', 'Thẻ nhớ', 'Kiểm tra'];
const next = ['Sơ đồ tư duy', 'Thẻ nhớ', 'Kiểm tra'];

export function StudyFixture() {
  const [current, setCurrent] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const noop = () => {};

  return (
    <>
      <StudyView
        title="Sinh học 12 — Di truyền học quần thể"
        meta="Môn Sinh • 07/10"
        steps={[
          { label: steps[0]!, status: 'ready' },
          { label: steps[1]!, status: 'generating', statusText: 'Đang tạo' },
          { label: steps[2]!, status: 'none' },
          { label: steps[3]!, status: 'none' },
        ]}
        current={current}
        onStep={setCurrent}
        dueLabel="12 thẻ đến hạn"
        heading={steps[current]!}
        cta={{
          label: current < 3 ? `Học tiếp → ${next[current]}` : 'Về thư viện',
          onClick: () => setCurrent((c) => Math.min(3, c + 1)),
        }}
        chatLabel="Hỏi"
        onChat={() => setChatOpen(true)}
        backLabel="Quay lại thư viện"
        onBack={noop}
        moreLabel="Thêm tuỳ chọn"
      >
        <div hidden={current !== 0}><SummaryStep summary={summary} /></div>
        <div hidden={current !== 1}><MindmapStep mindmap={mindmap} /></div>
        <div hidden={current !== 2}><FlashcardStep cards={cards} onGrade={noop} active={current === 2} /></div>
        <div hidden={current !== 3}><QuizStep quiz={quiz} onSubmit={noop} /></div>
      </StudyView>
      <ChatSheet
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={messages}
        streaming={false}
        error={null}
        onAsk={(q) => setMessages((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: 'Theo tài liệu, **tần số alen** không đổi qua các thế hệ khi quần thể ở trạng thái cân bằng.' }])}
      />
    </>
  );
}
