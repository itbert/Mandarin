import { stemmer } from '@orama/stemmers/russian';

export interface SearchableRecord {
  content?: string;
  meta?: Record<string, unknown>;
}

function stems(value: unknown): string[] {
  const normalized = String(value ?? '').normalize('NFKC').toLowerCase().replaceAll('ё', 'е');
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.map((token) => /^[а-я]+$/.test(token) ? stemmer(token) : token);
}

/** Keep Pagefind's ranking and Russian inflections without its inverse-prefix fallback. */
export function matchesSearchQuery(query: string, record: SearchableRecord): boolean {
  const queryStems = stems(query);
  if (!queryStems.length) return false;
  // A short excerpt can omit a valid hit. Read the actual indexed body and
  // metadata; Pagefind has already removed navigation and availability notices.
  const values = [record.content, ...Object.values(record.meta ?? {})];
  const candidateStems = new Set(values.flatMap(stems));
  return queryStems.every((queryStem) => [...candidateStems].some((candidate) => candidate.startsWith(queryStem)));
}
