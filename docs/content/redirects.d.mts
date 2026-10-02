/** Next.js `redirects()` entries for the docs on a site of `engine` flavor. */
export function docsRedirects(
  engine: 'local' | 'cloud',
): { source: string; destination: string; permanent: boolean }[];
