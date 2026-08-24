import { generateStaticParamsFor } from 'nextra/pages';

import { createDocsSocialImage } from '@/lib/docs-social-image';
import { expandDocsStaticParams } from '@/lib/docs-route';

const nextraParams = generateStaticParamsFor('mdxPath');

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return expandDocsStaticParams(await nextraParams());
}

type RouteProps = {
  params: Promise<{ mdxPath: string[] }>;
};

export async function GET(_request: Request, props: RouteProps) {
  const { mdxPath } = await props.params;
  return createDocsSocialImage(mdxPath);
}
