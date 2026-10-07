import { callQwen } from './qwenClient.js';
import { parseAIJson } from './jsonParser.js';
import { sanitizeDocumentText, sanitizeFileName } from './promptGuard.js';
import { buildSystemPrompt, normalizeLanguage } from './promptBuilder.js';

function toText(value, fallback = '') {
    if (typeof value === 'string') return value.trim();
    if (value == null) return fallback;
    return String(value).trim() || fallback;
}

function resolveCorrectAnswerIndex(question, options) {
    const direct = question?.correctAnswerIndex;
    if (Number.isInteger(direct) && direct >= 0 && direct < options.length) return direct;

    const fromStringNumber = Number.parseInt(direct, 10);
    if (Number.isInteger(fromStringNumber) && fromStringNumber >= 0 && fromStringNumber < options.length) return fromStringNumber;

    const letter = toText(question?.correctAnswer || question?.answer || '').toUpperCase();
    if (/^[A-Z]$/.test(letter)) {
        const idx = letter.charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) return idx;
    }

    const answerText = toText(question?.correctAnswer || question?.answer || question?.correct_option || '');
    if (answerText) {
        const byText = options.findIndex(opt => toText(opt).toLowerCase() === answerText.toLowerCase());
        if (byText >= 0) return byText;
    }

    return 0;
}

function normalizeQuizPayload(raw, fileName, language) {
    const list = Array.isArray(raw?.questions)
        ? raw.questions
        : Array.isArray(raw?.quiz)
            ? raw.quiz
            : Array.isArray(raw?.items)
                ? raw.items
                : [];

    const questions = list
        .map((q, index) => {
            const optionsRaw = Array.isArray(q?.options)
                ? q.options
                : [q?.optionA, q?.optionB, q?.optionC, q?.optionD].filter(v => v !== undefined && v !== null);

            const options = optionsRaw.map(opt => toText(opt)).filter(Boolean);
            if (options.length < 2) return null;

            return {
                id: Number.isInteger(q?.id) ? q.id : index + 1,
                question: toText(q?.question, language === 'vi' ? `Cau hoi ${index + 1}` : `Question ${index + 1}`),
                options,
                correctAnswerIndex: resolveCorrectAnswerIndex(q, options),
                explanation: toText(q?.explanation, '')
            };
        })
        .filter(Boolean);

    return {
        title: toText(raw?.title, language === 'vi' ? `Kiem tra: ${fileName}` : `Quiz: ${fileName}`),
        questions
    };
}

/**
 * Generate a multiple choice quiz from document text
 */
export async function generateQuiz(text, fileName, options = {}) {
    const maxChars = 15000;
    const truncatedText = text.length > maxChars
        ? text.substring(0, maxChars) + '\\n\\n[... nội dung đã được cắt ngắn ...]'
        : text;

    const cleanDoc = sanitizeDocumentText(truncatedText);
    const cleanName = sanitizeFileName(fileName);
    const language = normalizeLanguage(options.language, options.acceptLanguage);
    const systemPrompt = buildSystemPrompt('quiz', language);
    const userMessage = language === 'vi'
        ? `Tên tài liệu: "${cleanName}"\n\n<document>\n${cleanDoc}\n</document>\n\nHãy tạo bài trắc nghiệm 10 câu từ nội dung trên dưới dạng JSON.`
        : `Document name: "${cleanName}"\n\n<document>\n${cleanDoc}\n</document>\n\nPlease generate a 10-question multiple-choice quiz from the content above in JSON format.`;

    const response = await callQwen(systemPrompt, userMessage, {
        temperature: 0.5,
        maxTokens: 4096,
        userId: options.userId,
        action: options.action || 'generate_quiz'
    });

    try {
        const parsed = parseAIJson(response);
        const quiz = normalizeQuizPayload(parsed, fileName, language);
        if (!quiz.questions.length) {
            throw new Error('Quiz contains no valid questions');
        }
        return quiz;
    } catch (error) {
        console.error('Failed to parse quiz JSON:', error.message);
        console.error('Raw response:', response);
        return {
            title: language === 'vi' ? `Kiểm tra: ${fileName}` : `Quiz: ${fileName}`,
            questions: [{
                id: 1,
                question: language === 'vi' ? 'Lỗi phân tích - Vui lòng thử lại' : 'Parsing error - Please try again',
                options: language === 'vi'
                    ? ['Lỗi A', 'Lỗi B', 'Lỗi C', 'Lỗi D']
                    : ['Error A', 'Error B', 'Error C', 'Error D'],
                correctAnswerIndex: 0,
                explanation: language === 'vi'
                    ? 'Hệ thống không thể tạo bài kiểm tra. Hãy thử tải lại tài liệu.'
                    : 'The system could not generate the quiz. Please try uploading again.'
            }]
        };
    }
}
