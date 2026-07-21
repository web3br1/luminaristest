import { validateMagicBytes, DEFAULT_ATTACHMENT_MIME_TYPES } from '../uploadSecurity';

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]); // PK.. (docx/xlsx)
const JUNK = Buffer.from([0x00, 0x01, 0x02, 0x03]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // \x89PNG\r\n\x1a\n
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG SOI + APP0

describe('uploadSecurity.validateMagicBytes', () => {
  it('accepts a real PDF signature and rejects a spoofed one', () => {
    expect(validateMagicBytes(PDF, 'application/pdf')).toBe(true);
    expect(validateMagicBytes(JUNK, 'application/pdf')).toBe(false);
  });

  it('requires the ZIP signature for office documents', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(validateMagicBytes(ZIP, docx)).toBe(true);
    expect(validateMagicBytes(PDF, docx)).toBe(false);
  });

  it('does not blindly trust octet-stream — demands a known binary signature', () => {
    expect(validateMagicBytes(ZIP, 'application/octet-stream')).toBe(true);
    expect(validateMagicBytes(PDF, 'application/octet-stream')).toBe(true);
    expect(validateMagicBytes(JUNK, 'application/octet-stream')).toBe(false);
  });

  it('enforces the image signature — spoofed image bytes are rejected', () => {
    expect(validateMagicBytes(PNG, 'image/png')).toBe(true);
    expect(validateMagicBytes(JUNK, 'image/png')).toBe(false);
    expect(validateMagicBytes(JPEG, 'image/jpeg')).toBe(true);
    expect(validateMagicBytes(JUNK, 'image/jpeg')).toBe(false);
  });

  it('allows text types the allowlist already guards (no reliable magic)', () => {
    expect(validateMagicBytes(JUNK, 'text/csv')).toBe(true);
    expect(validateMagicBytes(JUNK, 'text/plain')).toBe(true);
  });

  it('exposes the documented MIME allowlist', () => {
    expect(DEFAULT_ATTACHMENT_MIME_TYPES.has('application/pdf')).toBe(true);
    expect(DEFAULT_ATTACHMENT_MIME_TYPES.has('application/x-msdownload')).toBe(false); // .exe rejected
  });
});
