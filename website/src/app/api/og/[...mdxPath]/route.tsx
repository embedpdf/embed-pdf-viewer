import { generateStaticParamsFor } from 'nextra/pages';

import { DOCS_OVERVIEW_PRESENTATION } from '@/lib/docs-page';
import { expandDocsStaticParams } from '@/lib/docs-route';
import { createDocsSocialImage, createSocialImageResponse } from '@/lib/docs-social-image';

const nextraParams = generateStaticParamsFor('mdxPath');

export const dynamic = 'force-static';
export const dynamicParams = false;

/** The overview (`/docs`) is a dedicated route, not part of the MDX page map. */
const OVERVIEW_PARAM = { mdxPath: ['docs'] };

function isOverview(mdxPath: string[]) {
  return mdxPath.length === 1 && mdxPath[0] === 'docs';
}

export async function generateStaticParams() {
  return [OVERVIEW_PARAM, ...expandDocsStaticParams(await nextraParams())];
}

type RouteProps = {
  params: Promise<{ mdxPath: string[] }>;
};

export async function GET(_request: Request, props: RouteProps) {
  const { mdxPath } = await props.params;
  if (isOverview(mdxPath)) return createSocialImageResponse(DOCS_OVERVIEW_PRESENTATION);
  return createDocsSocialImage(mdxPath);
}
