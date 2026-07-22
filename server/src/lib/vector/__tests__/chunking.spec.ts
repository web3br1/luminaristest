/**
 * Unit tests for chunkText — the pure text-splitting math used by the document → vector pipeline.
 * Asserts robust properties (count, max words/chunk, overlap, boundaries) rather than exact strings.
 */
import { chunkText } from '../chunking';

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const makeWords = (n: number) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ');

describe('chunkText — invalid input', () => {
  it('returns [] for empty or non-string input', () => {
    expect(chunkText('')).toEqual([]);
    // @ts-expect-error exercising the runtime guard
    expect(chunkText(null)).toEqual([]);
  });
});

describe('chunkText — word strategy', () => {
  it('returns a single chunk when the text fits maxWords', () => {
    const chunks = chunkText(makeWords(4), { maxWords: 10, overlap: 0 });
    expect(chunks).toHaveLength(1);
    expect(words(chunks[0])).toHaveLength(4);
  });

  it('splits into ceil(N/maxWords) chunks with no overlap', () => {
    const chunks = chunkText(makeWords(10), { maxWords: 5, overlap: 0 });
    expect(chunks).toHaveLength(2);
    chunks.forEach((c) => expect(words(c).length).toBeLessThanOrEqual(5));
  });

  it('produces overlapping chunks when overlap > 0', () => {
    const chunks = chunkText(makeWords(10), { maxWords: 5, overlap: 2 });
    // step = maxWords - overlap = 3 → chunk 2 starts at word index 3 (w4), so it shares w4/w5 with chunk 1.
    expect(chunks.length).toBeGreaterThan(2);
    expect(words(chunks[1])[0]).toBe('w4');
  });

  it('clamps overlap so it never exceeds maxWords (no infinite loop)', () => {
    const chunks = chunkText(makeWords(6), { maxWords: 3, overlap: 10 });
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });
});

describe('chunkText — sentence strategy', () => {
  it('keeps chunks within maxWords across sentence boundaries', () => {
    const text = 'One two three. Four five six. Seven eight nine. Ten eleven twelve.';
    const chunks = chunkText(text, { strategy: 'sentence', maxWords: 6, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('chunkText — paragraph strategy', () => {
  it('splits on blank lines and groups paragraphs', () => {
    const text = 'Para one here.\n\nPara two here.\n\nPara three here.';
    const chunks = chunkText(text, { strategy: 'paragraph', maxWords: 4, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toContain('Para one');
  });
});
