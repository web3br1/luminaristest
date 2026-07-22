import { KpiCacheService } from '../KpiCacheService';

describe('KpiCacheService.invalidate — exact tenancy segment match (Council N9)', () => {
  let cache: KpiCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new KpiCacheService();
  });

  it('deletes every key belonging to the user (any presetKeyFilter suffix)', () => {
    cache.set('user-1:', 'a');
    cache.set('user-1:salon', 'b');
    cache.invalidate('user-1');
    expect(cache.get('user-1:')).toBeNull();
    expect(cache.get('user-1:salon')).toBeNull();
  });

  it('does NOT delete another tenant whose id merely contains this one as a substring', () => {
    // Old fuzzy `key.includes(userId)` failed both of these.
    cache.set('user-12:', 'other-tenant');
    cache.set('xuser-1:', 'other-tenant-2');
    cache.invalidate('user-1');
    expect(cache.get('user-12:')).toBe('other-tenant');
    expect(cache.get('xuser-1:')).toBe('other-tenant-2');
  });

  it('does NOT delete a key whose suffix embeds the id', () => {
    cache.set('user-2:user-1', 'suffix-embed');
    cache.invalidate('user-1');
    expect(cache.get('user-2:user-1')).toBe('suffix-embed');
  });

  it('treats a separator-less key as a bare userId key', () => {
    cache.set('user-1', 'bare');
    cache.invalidate('user-1');
    expect(cache.get('user-1')).toBeNull();
  });
});
