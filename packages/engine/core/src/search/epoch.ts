import type { DocumentManifest } from '../dto/DocumentManifest';
import { foldText } from './fold';
import type { SearchQuery } from './types';

/**
 * The search CONTENT EPOCH: a deterministic fingerprint of everything a
 * search result depends on — page order/structure (`layoutVersion`) and
 * each page's text content (`contentVersion`), nothing else. Annotation
 * and metadata churn deliberately do NOT move it, so cached search
 * responses in a collaborative document survive comment storms.
 *
 * Both sides compute it from the manifest they already hold: the client
 * to mint versioned search URLs, the server to validate them (mismatch →
 * NotFound, the standard stale-versioned-read signal). FNV-1a 64-bit —
 * dependency-free and stable; not cryptographic, and doesn't need to be:
 * an adversary can only vary his OWN authorized query results.
 */
export function searchContentEpoch(manifest: DocumentManifest): string {
  let input = `${manifest.layoutVersion}`;
  for (const page of manifest.pages) {
    input += `|${page.state.pageObjectNumber}:${page.cache.contentVersion}`;
  }
  return fnv1a64(input);
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function fnv1a64(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Canonicalize a query for CACHE KEYING: default-fold literal queries are
 * pre-folded ("Café", "café" and "CAFE" are the same search, so they
 * should be the same cache entry). Semantics are unchanged — the fold is
 * idempotent and exactly what the matcher applies to the needle anyway.
 * Case- or diacritic-sensitive literals and regex patterns pass through
 * untouched (their raw form IS the query).
 */
export function canonicalSearchQuery(query: SearchQuery): SearchQuery {
  if (query.regex || query.matchCase || query.matchDiacritics) return query;
  const canonical: SearchQuery = { text: foldText(query.text).folded };
  if (query.wholeWord) canonical.wholeWord = true;
  return canonical;
}
