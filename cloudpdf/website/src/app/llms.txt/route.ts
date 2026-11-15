import { llmsResponse } from '@/lib/llms';

export const dynamic = 'force-static';

/** The site's entry map for AI agents: each page once, in its default integration (`@/lib/llms`). */
export function GET() {
  return llmsResponse(null);
}
