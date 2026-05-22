/**
 * PDF text extraction using pdf.js.
 * Block D - frontend/src/lib/pdfExtractor.js
 */
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function extractTextFromPDF(file) {
  if (file.size > MAX_SIZE) {
    throw new Error('pdf_too_large');
  }

  let pdf;
  try {
    const arrayBuffer = await file.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch {
    throw new Error('pdf_parse_failed');
  }

  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ');
    pages.push(text);
  }

  const fullText = pages.join('\n').trim();
  if (fullText.length < 200) {
    throw new Error('pdf_no_text');
  }

  return fullText;
}
