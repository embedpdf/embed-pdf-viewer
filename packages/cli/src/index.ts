export interface DocEntry {
  path: string;
  title: string;
  description: string;
  url: string;
  framework: string | null;
  section: string | null;
  content: string;
}

export type { SearchResult, SearchResponse } from './lib/search';
