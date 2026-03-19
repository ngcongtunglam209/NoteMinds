import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import { extractTextFromImage } from './ocrService.js';

/**
 * Process uploaded document and extract text content
 */
export async function processDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.pdf':
      return await extractPdfText(filePath);
    case '.docx':
    case '.doc':
      return await extractDocxText(filePath);
    case '.pptx':
      return await extractPptxText(filePath);
    case '.xlsx':
      return await extractXlsxText(filePath);
    case '.csv':
      return await extractCsvText(filePath);
    case '.png':
    case '.jpg':
    case '.jpeg':
      return await extractTextFromImage(filePath);
    case '.txt':
    case '.md':
      return fs.readFileSync(filePath, 'utf-8');
    case '.mp3':
    case '.wav':
    case '.m4a':
    case '.ogg':
    case '.webm':
      throw new Error('Tính năng chuyển đổi audio sang văn bản đang được bảo trì. Vui lòng thử lại sau.');
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

/**
 * Extract text from PDF files
 */
async function extractPdfText(filePath) {
  try {
    // Dynamic import for pdf-parse (CommonJS module)
    const pdfParse = (await import('pdf-parse')).default;
    const dataBuffer = fs.readFileSync(filePath);

    // Custom page renderer for better Vietnamese text extraction
    const options = {
      // Normalize Unicode for Vietnamese diacritics (NFC form)
      pagerender: async function (pageData) {
        const textContent = await pageData.getTextContent({
          normalizeWhitespace: true,
          disableCombineTextItems: false,
        });

        // Join text items, preserving Vietnamese characters
        let lastY = null;
        let text = '';
        for (const item of textContent.items) {
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
            text += '\n';
          } else if (text.length > 0 && !text.endsWith(' ') && !text.endsWith('\n')) {
            text += ' ';
          }
          text += item.str;
          lastY = item.transform[5];
        }
        return text;
      }
    };

    const data = await pdfParse(dataBuffer, options);

    if (!data.text || data.text.trim().length === 0) {
      throw new Error('PDF contains no extractable text. It may be an image-based PDF.');
    }

    // Normalize Unicode NFC for Vietnamese diacritics
    let cleanText = data.text.normalize('NFC');

    // Clean up common PDF artifacts
    cleanText = cleanText
      .replace(/\r\n/g, '\n')        // Normalize line endings
      .replace(/\f/g, '\n\n')        // Form feeds to double newline
      .replace(/[ \t]+/g, ' ')       // Collapse whitespace
      .replace(/\n{3,}/g, '\n\n')    // Max 2 newlines in a row
      .trim();

    return cleanText;
  } catch (error) {
    if (error.message.includes('no extractable text')) throw error;
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}

/**
 * Transcribe audio file to text using DashScope qwen3-asr-flash-filetrans
 * Uses async file transcription API with polling
 */
async function transcribeAudio(filePath) {
  try {
    const apiKey = process.env.QWEN_API_KEY || 'ollama';
    const baseURL = 'https://dashscope-intl.aliyuncs.com/api/v1';

    // Step 1: Upload file to DashScope
    const FormData = (await import('form-data')).default;
    const axios = (await import('axios')).default;

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('purpose', 'file-extract');

    const uploadRes = await axios.post(`${baseURL}/files`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 60000,
    });

    const fileId = uploadRes.data?.id;
    if (!fileId) throw new Error('File upload failed: no file ID returned');
    console.log('Audio file uploaded to DashScope, file_id:', fileId);

    // Step 2: Submit async transcription task
    const taskRes = await axios.post(
      `${baseURL}/services/aigc/speech-recognition/transcription`,
      {
        model: 'qwen3-asr-flash-filetrans',
        input: {
          file_urls: [`fileid://${fileId}`],
        },
        parameters: {
          language_hints: ['vi', 'en'],
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        timeout: 30000,
      }
    );

    const taskId = taskRes.data?.output?.task_id;
    if (!taskId) throw new Error('Transcription task submission failed: no task_id');
    console.log('ASR task submitted, task_id:', taskId);

    // Step 3: Poll for result
    const maxWait = 120000; // 2 minutes max
    const pollInterval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));

      const statusRes = await axios.get(
        `${baseURL}/tasks/${taskId}`,
        {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          timeout: 15000,
        }
      );

      const status = statusRes.data?.output?.task_status;
      console.log(`ASR task ${taskId} status: ${status}`);

      if (status === 'SUCCEEDED') {
        // Extract transcription text from results
        const results = statusRes.data?.output?.results;
        if (!results?.length) throw new Error('No transcription results');

        // Each result has a transcription_url pointing to JSON with sentences
        let fullText = '';
        for (const result of results) {
          if (result.transcription_url) {
            try {
              const transRes = await axios.get(result.transcription_url, { timeout: 15000 });
              const transcripts = transRes.data?.transcripts || transRes.data;
              if (Array.isArray(transcripts)) {
                for (const t of transcripts) {
                  if (t.sentences) {
                    fullText += t.sentences.map(s => s.text).join(' ') + '\n';
                  } else if (t.text) {
                    fullText += t.text + '\n';
                  }
                }
              } else if (typeof transcripts === 'string') {
                fullText += transcripts + '\n';
              }
            } catch (fetchErr) {
              console.warn('Failed to fetch transcription_url:', fetchErr.message);
            }
          }
          // Fallback: check subtitle_url
          if (!fullText.trim() && result.subtitle_url) {
            try {
              const subRes = await axios.get(result.subtitle_url, { timeout: 15000 });
              if (typeof subRes.data === 'string') fullText += subRes.data;
            } catch { }
          }
        }

        fullText = fullText.trim();
        if (!fullText) throw new Error('Transcription succeeded but no text extracted');
        console.log(`Audio transcription complete: ${fullText.length} chars`);
        return fullText;
      }

      if (status === 'FAILED') {
        const errMsg = statusRes.data?.output?.message || 'Unknown error';
        throw new Error(`ASR task failed: ${errMsg}`);
      }
      // PENDING or RUNNING — keep polling
    }

    throw new Error('ASR task timed out after 2 minutes');
  } catch (error) {
    console.warn('Audio transcription failed:', error.message);
    return `[Không thể chuyển đổi audio sang văn bản. Lỗi: ${error.message}]`;
  }
}

/**
 * Extract text from DOCX files using mammoth
 */
async function extractDocxText(filePath) {
  try {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ path: filePath });

    let text = result.value;
    if (!text || text.trim().length === 0) {
      throw new Error('DOCX file contains no extractable text.');
    }

    // Normalize Vietnamese diacritics
    text = text.normalize('NFC').trim();
    return text;
  } catch (error) {
    if (error.message.includes('no extractable text')) throw error;
    throw new Error(`Failed to parse DOCX: ${error.message}`);
  }
}

/**
 * Extract text from PPTX files
 */
async function extractPptxText(filePath) {
  try {
    const JSZip = (await import('jszip')).default || (await import('jszip'));
    const dataBuffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(dataBuffer);

    const slides = [];
    // PPTX slides are stored as ppt/slides/slide1.xml, slide2.xml, etc.
    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)[1]);
        const numB = parseInt(b.match(/slide(\d+)/)[1]);
        return numA - numB;
      });

    for (const slideFile of slideFiles) {
      const xmlContent = await zip.files[slideFile].async('string');
      // Extract text from XML tags <a:t>...</a:t>
      const textMatches = xmlContent.match(/<a:t>([^<]*)<\/a:t>/g);
      if (textMatches) {
        const slideTexts = textMatches
          .map(m => m.replace(/<\/?a:t>/g, '').trim())
          .filter(t => t.length > 0);
        if (slideTexts.length > 0) {
          const slideNum = slides.length + 1;
          slides.push(`--- Slide ${slideNum} ---\n${slideTexts.join('\n')}`);
        }
      }
    }

    if (slides.length === 0) {
      throw new Error('PPTX file contains no extractable text.');
    }

    return slides.join('\n\n').normalize('NFC').trim();
  } catch (error) {
    if (error.message.includes('no extractable text')) throw error;
    throw new Error(`Failed to parse PPTX: ${error.message}`);
  }
}

/**
 * Extract text from XLSX files using xlsx
 */
async function extractXlsxText(filePath) {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.readFile(filePath);

    const sheets = [];
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: '\t', blankrows: false });
      if (csv.trim()) {
        sheets.push(`=== Sheet: ${sheetName} ===\n${csv}`);
      }
    }

    if (sheets.length === 0) {
      throw new Error('XLSX file contains no data.');
    }

    return sheets.join('\n\n').normalize('NFC').trim();
  } catch (error) {
    if (error.message.includes('no data')) throw error;
    throw new Error(`Failed to parse XLSX: ${error.message}`);
  }
}

/**
 * Extract text from CSV files
 */
async function extractCsvText(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  if (!text.trim()) {
    throw new Error('CSV file is empty.');
  }
  return text.normalize('NFC').trim();
}
