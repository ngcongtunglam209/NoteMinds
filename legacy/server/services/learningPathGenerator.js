import { callQwen } from './qwenClient.js';
import { parseAIJson } from './jsonParser.js';
import { sanitizeDocumentText, sanitizeFileName } from './promptGuard.js';
import { buildSystemPrompt, normalizeLanguage } from './promptBuilder.js';

function toText(value, fallback = '') {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || fallback;
    }
    if (value == null) return fallback;
    return String(value).trim() || fallback;
}

function toMinutes(value, fallback = 15) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
    return fallback;
}

function toHours(value, fallback = 1.0) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 10) / 10;
    return fallback;
}

function normalizeActivities(rawActivities = []) {
    const allowed = new Set(['read_summary', 'flashcards', 'quiz', 'chat']);
    const mapped = (Array.isArray(rawActivities) ? rawActivities : [])
        .map(a => toText(a).toLowerCase())
        .map(a => {
            if (a === 'read' || a === 'summary' || a === 'mindmap') return 'read_summary';
            if (a === 'flashcard') return 'flashcards';
            return a;
        })
        .filter(a => allowed.has(a));

    if (mapped.length) return Array.from(new Set(mapped));
    return ['read_summary'];
}

function normalizeLearningPathPayload(raw, fileName, language) {
    const stepsSource = Array.isArray(raw?.steps)
        ? raw.steps
        : Array.isArray(raw?.path)
            ? raw.path
            : Array.isArray(raw?.learning_path)
                ? raw.learning_path
                : Array.isArray(raw?.learning_steps)
                    ? raw.learning_steps
                    : Array.isArray(raw?.items)
                        ? raw.items
                        : [];

    const steps = stepsSource
        .map((step, index) => ({
            id: toText(step?.id, `step_${index + 1}`),
            title: toText(step?.title || step?.name, language === 'vi' ? `Bước ${index + 1}` : `Step ${index + 1}`),
            description: toText(step?.description || step?.details, language === 'vi' ? 'Hoàn thành bước học tập này.' : 'Complete this learning step.'),
            estimated_minutes: toMinutes(step?.estimated_minutes || step?.minutes, 15),
            recommended_activities: normalizeActivities(step?.recommended_activities || step?.activities)
        }))
        .filter(step => step.title);

    return {
        name: toText(raw?.name || raw?.title, language === 'vi' ? `Lộ trình học: ${fileName}` : `Learning Path: ${fileName}`),
        description: toText(
            raw?.description,
            language === 'vi'
                ? 'Lộ trình học tập được tạo tự động từ tài liệu của bạn.'
                : 'A learning path generated automatically from your document.'
        ),
        estimated_hours: toHours(raw?.estimated_hours || raw?.total_estimated_hours || raw?.duration_hours, Math.max(1, Math.round((steps.length || 3) * 0.5 * 10) / 10)),
        steps
    };
}

/**
 * Generate a learning path from document text
 */
export async function generateLearningPath(text, fileName, options = {}) {
    const maxChars = 20000;
    const truncatedText = text.length > maxChars
        ? text.substring(0, maxChars) + '\n\n[... nội dung đã được cắt ngắn ...]'
        : text;

    const cleanDoc = sanitizeDocumentText(truncatedText);
    const cleanName = sanitizeFileName(fileName);
    const language = normalizeLanguage(options.language, options.acceptLanguage);
    const systemPrompt = buildSystemPrompt('learningPath', language);
    const userMessage = language === 'vi'
        ? `Tên tài liệu: "${cleanName}"\n\n<document>\n${cleanDoc}\n</document>\n\nThiết kế lộ trình học tập tối ưu từ nội dung trên dạng JSON.`
        : `Document name: "${cleanName}"\n\n<document>\n${cleanDoc}\n</document>\n\nDesign an optimized learning path from the content above in JSON format.`;

    const response = await callQwen(systemPrompt, userMessage, {
        temperature: 0.6,
        maxTokens: 4096,
        userId: options.userId,
        action: 'generate_learning_path'
    });

    try {
        const parsed = parseAIJson(response);
        const pathData = normalizeLearningPathPayload(parsed, cleanName, language);
        if (!pathData.steps.length) {
            throw new Error('Learning path contains no valid steps');
        }
        return pathData;
    } catch (error) {
        console.error('Failed to parse learning path JSON:', error.message);
        console.error('Raw response:', response);
        return {
            name: language === 'vi' ? `Lộ trình học: ${fileName}` : `Learning Path: ${fileName}`,
            description: language === 'vi'
                ? 'Chúng tôi không thể tự động tạo lộ trình phức tạp. Hãy sử dụng lộ trình mặc định này.'
                : 'We could not automatically build a complex learning path. Please use this default path.',
            estimated_hours: 1.0,
            steps: language === 'vi'
                ? [
                    {
                        id: "step_1",
                        title: "Khởi động: Đọc hiểu Mindmap",
                        description: "Xem sơ đồ tư duy để có cái nhìn tổng quan về tài liệu",
                        estimated_minutes: 15,
                        recommended_activities: ["read_summary"]
                    },
                    {
                        id: "step_2",
                        title: "Thực hành: Ghi nhớ Flashcards",
                        description: "Học qua các thẻ ghi nhớ để khắc sâu kiến thức",
                        estimated_minutes: 20,
                        recommended_activities: ["flashcards"]
                    },
                    {
                        id: "step_3",
                        title: "Kiểm tra: Làm bài Quiz",
                        description: "Đánh giá mức độ hiểu bài qua bài kiểm tra trắc nghiệm",
                        estimated_minutes: 15,
                        recommended_activities: ["quiz"]
                    }
                ]
                : [
                    {
                        id: "step_1",
                        title: "Start: Review the Mind Map",
                        description: "Read the mind map to get a high-level view of the document",
                        estimated_minutes: 15,
                        recommended_activities: ["read_summary"]
                    },
                    {
                        id: "step_2",
                        title: "Practice: Memorize with Flashcards",
                        description: "Use flashcards to reinforce key concepts",
                        estimated_minutes: 20,
                        recommended_activities: ["flashcards"]
                    },
                    {
                        id: "step_3",
                        title: "Check: Take the Quiz",
                        description: "Evaluate your understanding with a multiple-choice quiz",
                        estimated_minutes: 15,
                        recommended_activities: ["quiz"]
                    }
                ]
        };
    }
}
