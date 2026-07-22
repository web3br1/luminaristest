/**
 * Unit tests for the pure JSON-repair helper extracted from OpenAIService. LLMs occasionally return
 * slightly-malformed JSON (trailing commas, unquoted keys, smart quotes); this guards the repairs.
 */
import { tryFixMalformedJson } from '../OpenAIService';

const parse = (s: string | null) => (s === null ? null : JSON.parse(s));

describe('tryFixMalformedJson', () => {
  it('returns valid JSON unchanged', () => {
    expect(tryFixMalformedJson('{"a":1,"b":[1,2]}')).toBe('{"a":1,"b":[1,2]}');
  });

  it('repairs trailing commas in objects and arrays', () => {
    expect(parse(tryFixMalformedJson('{"a":1,}'))).toEqual({ a: 1 });
    expect(parse(tryFixMalformedJson('[1,2,3,]'))).toEqual([1, 2, 3]);
  });

  it('quotes unquoted object keys', () => {
    expect(parse(tryFixMalformedJson('{a:1, b:2}'))).toEqual({ a: 1, b: 2 });
  });

  it('replaces smart quotes with straight quotes', () => {
    expect(parse(tryFixMalformedJson('{“a”:1}'))).toEqual({ a: 1 });
  });

  it('returns null for input it cannot repair', () => {
    expect(tryFixMalformedJson('this is not json at all <<<')).toBeNull();
  });
});
