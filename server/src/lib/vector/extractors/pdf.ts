import pdfParse from 'pdf-parse';

/**
 * Extracts raw text from a PDF file buffer
 * @param buffer The PDF file as ArrayBuffer
 */
export async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  const { text } = await pdfParse(Buffer.from(buffer));
  return text;
} 