/** Next.js `redirects()` entries for the engine docs on a site of `engine` flavor. */
export function engineDocsRedirects(
  engine: 'local' | 'cloud',
): { source: string; destination: string; permanent: boolean }[];
