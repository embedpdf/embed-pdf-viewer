import { DOCS_INTEGRATIONS, isDocsIntegration } from '@/lib/docs-integrations';
import { llmsResponse } from '@/lib/llms';

export const dynamic = 'force-static';
export const dynamicParams = false;

/** One file per integration, `/llms/react.txt`: every page that integration has (`@/lib/llms`). */
export function generateStaticParams() {
  return DOCS_INTEGRATIONS.map((integration) => ({ file: `${integration}.txt` }));
}

type RouteProps = {
  params: Promise<{ file: string }>;
};

export async function GET(_request: Request, props: RouteProps) {
  const { file } = await props.params;
  const integration = file.endsWith('.txt') ? file.slice(0, -4) : undefined;
  if (!isDocsIntegration(integration)) return new Response('Not found.', { status: 404 });
  return llmsResponse(integration);
}
