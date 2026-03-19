# NoteMind

Nền tảng học tập thông minh, tích hợp ghi chú, AI hỗ trợ học tập, flashcard, quiz, mindmap, theo dõi tiến độ và cộng đồng trong một hệ thống full-stack.

## ⚠️ Tuyên bố bản quyền & quyền sử dụng

**Dự án này KHÔNG phải mã nguồn mở (NOT open-source).**  
Mã nguồn chỉ được sử dụng nội bộ và chỉ nhằm mục đích **chứng minh tôi là maintainer/chủ sở hữu dự án**.  
Mọi hành vi sao chép, tái phân phối, chỉnh sửa, thương mại hóa hoặc sử dụng lại khi chưa có sự chấp thuận bằng văn bản đều **không được phép**.

---

## ✨ Tổng quan

NoteMind là ứng dụng web full-stack giúp người học chuyển tài liệu thành kiến thức có cấu trúc, dễ ghi nhớ và dễ ôn tập:

- Ghi chú kết hợp AI hỗ trợ theo ngữ cảnh
- Tạo Flashcard, Quiz, Mindmap tự động
- Tải lên tài liệu đa định dạng (PDF, DOCX, PPTX, XLSX, OCR)
- Theo dõi hiệu suất học tập, lịch sử và bảng xếp hạng
- Hỗ trợ cộng đồng, hồ sơ công khai, chia sẻ tài liệu
- Bảo mật bằng JWT, mã hóa dữ liệu và middleware bảo vệ

---

## 🧱 Kiến trúc dự án

Monorepo gồm 2 phần chính:

- `client/`: React + Vite + Tailwind CSS (giao diện người dùng)
- `server/`: Node.js + Express + SQLite (API, xử lý tài liệu, dịch vụ AI)

Các thành phần triển khai:

- `Dockerfile`, `docker-compose.yml`: chạy bằng container
- `deploy/`: cấu hình Nginx/PM2 và script deploy VPS
- `ENV_SETUP.md`: hướng dẫn cấu hình môi trường chi tiết

---

## 🛠️ Công nghệ chính

- Frontend: React 18, Vite 5, Tailwind CSS
- Backend: Node.js (ESM), Express 4
- Database: SQLite (`better-sqlite3`)
- AI & tài liệu: OpenAI SDK, OCR (Tesseract), xử lý PDF/DOCX/PPTX/XLSX
- Auth/Bảo mật: JWT, bcrypt, WebAuthn, dịch vụ mã hóa dữ liệu

---

## 🚀 Chạy local nhanh

### 1) Cài dependencies

```bash
npm run install:all
```

### 2) Cấu hình môi trường

Xem hướng dẫn đầy đủ tại `ENV_SETUP.md`.

Tối thiểu cần thiết lập:

- `server/.env` (bắt buộc)
- `client/.env` (tùy chọn)

Bạn có thể bắt đầu bằng cách sao chép từ `.env.example` tương ứng.

### 3) Chạy development

```bash
npm run dev
```

- Frontend mặc định: `http://localhost:5173`
- Backend mặc định: `http://localhost:3001`

---

## 📜 Scripts chính (root)

- `npm run dev`: chạy đồng thời client + server
- `npm run dev:client`: chạy Vite frontend
- `npm run dev:server`: chạy backend ở chế độ watch
- `npm run build`: build frontend cho production
- `npm run start`: chạy backend ở production
- `npm run install:all`: cài dependencies toàn bộ workspace

---

## 🐳 Docker (tuỳ chọn)

Dự án có sẵn `Dockerfile` và `docker-compose.yml`.  
Bạn có thể dùng Docker để chuẩn hóa môi trường chạy và staging theo hạ tầng hiện tại.

---

## 🔐 Lưu ý bảo mật

- Không commit file `.env`
- Luôn thay `JWT_SECRET`, `QWEN_API_KEY` bằng giá trị thực
- Không đặt thông tin bí mật trong biến `VITE_*` phía client
- Dùng biến môi trường riêng cho dev/staging/production

---

## 👤 Maintainer

**Tài liệu README này xác nhận dự án NoteMind là tài sản riêng, không open-source, và được duy trì bởi maintainer/chủ sở hữu hợp pháp.**

Nếu bạn cần quyền truy cập, quyền sử dụng hoặc hợp tác, vui lòng liên hệ trực tiếp maintainer.

---

**Được phát triển cùng với ❤️ của đội Đèn Giao Thông.**
