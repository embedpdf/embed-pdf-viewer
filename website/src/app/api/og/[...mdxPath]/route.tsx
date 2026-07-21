import { generateStaticParamsFor } from 'nextra/pages';

import { expandDocsStaticParams } from '@/lib/docs-route';
import { createDocsSocialImage } from '@/lib/docs-social-image';

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
