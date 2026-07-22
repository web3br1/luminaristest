import mammoth from 'mammoth';

/**
 * Extracts raw text from a Word (.docx) file buffer
 * @param buffer The Word file as ArrayBuffer
 */
export async function extractTextFromWord(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
} 