/**
 * PDF text extraction using pdf.js.
 * Block D - frontend/src/lib/pdfExtractor.js
 */
import * as pdfjsLib from 'pdfjs-dist';
import { MAX_PDF_SIZE, MIN_PDF_TEXT_LEN } from './config.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// MAX_PDF_SIZE and MIN_PDF_TEXT_LEN are imported from ./config.js

export async function extractTextFromPDF(file) {
  if (file.size > MAX_PDF_SIZE) {
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
  if (fullText.length < MIN_PDF_TEXT_LEN) {
    throw new Error('pdf_no_text');
  }

  return fullText;
}
