// Dev-only: the study screen with the approved comp's sample content (synthetic, not a real document),
// so the design can be captured and diffed without the API. Only routed when import.meta.env.DEV.
import { useState } from 'react';
import { StudyView } from '../StudyView.tsx';

const bullets = [
  'Tần số alen là tỉ lệ giữa số alen của một loại so với tổng số alen của tất cả các loại trong quần thể tại một thời điểm.',
  'Định luật Hardy–Weinberg: Trong điều kiện lý tưởng, tần số alen và thành phần kiểu gen của quần thể ổn định qua các thế hệ; p² + 2pq + q² = 1.',
  'Quần thể tự phối làm tăng tỉ lệ kiểu gen đồng hợp, giảm tỉ lệ kiểu gen dị hợp và làm giảm đa dạng di truyền.',
  'Quần thể ngẫu phối duy trì cân bằng Hardy–Weinberg và giữ ổn định tần số alen qua các thế hệ.',
];

export function StudyFixture() {
  const [current, setCurrent] = useState(0);
  const noop = () => {};
  return (
    <StudyView
      title="Sinh học 12 — Di truyền học quần thể"
      meta="Môn Sinh • 07/10"
      steps={[
        { label: 'Tóm tắt', status: 'ready' },
        { label: 'Sơ đồ', status: 'generating' },
        { label: 'Thẻ nhớ', status: 'none' },
        { label: 'Kiểm tra', status: 'none' },
      ]}
      current={current}
      onStep={setCurrent}
      dueLabel="12 thẻ đến hạn"
      heading="Tóm tắt"
      cta={{ label: 'Học tiếp → Sơ đồ tư duy', onClick: noop }}
      chatLabel="Hỏi"
      onChat={noop}
      backLabel="Quay lại"
      onBack={noop}
      moreLabel="Thêm"
      onMore={noop}
    >
      <div className="prose">
        <ul>{bullets.map((b) => <li key={b}>{b}</li>)}</ul>
      </div>
    </StudyView>
  );
}
