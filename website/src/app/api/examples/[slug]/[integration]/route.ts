import { isDocsIntegration } from '@/lib/docs-integrations';
import { exampleCode, examplePages } from '@/lib/example-pages';

/**
 * An example's code in one integration, highlighted (`lib/examples.ts`): its page fetches it when
 * the reader opens the code, so the page itself carries none of the five versions. Built once.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await examplePages())
    .filter((page) => page.demo)
    .flatMap(({ slug, integrations }) =>
      integrations.map((integration) => ({ slug, integration })),
    );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; integration: string }> },
) {
  const { slug, integration } = await params;
  const files = isDocsIntegration(integration) ? await exampleCode(slug, integration) : null;
  return files ? Response.json(files) : new Response('Not found', { status: 404 });
}
