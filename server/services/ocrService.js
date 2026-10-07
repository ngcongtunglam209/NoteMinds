import Tesseract from 'tesseract.js';

/**
 * Extracts text from an image file using Tesseract.js OCR.
 * Supports Vietnamese ('vie') by default.
 *
 * @param {string} imagePath - The physical path to the uploaded image file.
 * @returns {Promise<string>} - The extracted text.
 */
// Each recognize() spins up a worker (~100-300MB); cap how many run at once.
// ponytail: in-process semaphore, a job queue if OCR volume grows
const MAX_CONCURRENT_OCR = 2;
let running = 0;
const waiting = [];

export async function extractTextFromImage(imagePath) {
    while (running >= MAX_CONCURRENT_OCR) await new Promise(r => waiting.push(r));
    running++;
    try {
        console.log(`[OCR] Starting text extraction for: ${imagePath}`);
        // Recognize both Vietnamese and English for better accuracy on mixed documents
        const result = await Tesseract.recognize(
            imagePath,
            'vie+eng',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
                    }
                }
            }
        );

        console.log(`[OCR] Extraction complete. Found ${result.data.text.length} characters.`);
        return result.data.text;
    } catch (error) {
        console.error('[OCR] Error extracting text:', error.message);
        throw new Error('Không thể nhận dạng văn bản từ hình ảnh này (Lỗi OCR).');
    } finally {
        running--;
        waiting.shift()?.();
    }
}
