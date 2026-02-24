export interface PagefindSearchResult {
  id: string
  data: () => Promise<PagefindResult>
}

export interface PagefindResult {
  excerpt: string
  meta: {
    title: string
  }
  raw_url: string
  sub_results: {
    excerpt: string
    title: string
    url: string
  }[]
  url: string
}

export interface PagefindSearchResponse {
  results: PagefindSearchResult[]
}

export interface PagefindSearchOptions {
  filters?: Record<string, string | string[]>
  sort?: Record<string, 'asc' | 'desc'>
}

export interface Pagefind {
  options: (options: { baseUrl: string }) => Promise<void>
  search: (
    query: string,
    options?: PagefindSearchOptions,
  ) => Promise<PagefindSearchResponse | null>
  debouncedSearch: <T>(
    query: string,
    options?: PagefindSearchOptions,
  ) => Promise<{ results: { data: () => Promise<T> }[] } | null>
}

declare global {
  interface Window {
    pagefind?: Pagefind
  }
}
