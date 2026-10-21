import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../src/i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('translations', () => {
  it('has English, Spanish and Catalan text for every message', () => {
    for (const [key, texts] of Object.entries(MESSAGES)) {
      expect(texts, key).toHaveLength(3);
      for (const text of texts) expect(text.trim(), key).not.toBe('');
    }
  });

  it('uses the same placeholders in every language', () => {
    for (const [key, [en, es, ca]] of Object.entries(MESSAGES)) {
      expect(placeholders(es), key).toBe(placeholders(en));
      expect(placeholders(ca), key).toBe(placeholders(en));
    }
  });
});
