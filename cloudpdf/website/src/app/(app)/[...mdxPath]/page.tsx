import { notFound } from 'next/navigation';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { Fragment } from 'react';

import { useMDXComponents as getMDXComponents } from '../../../../mdx-components';

import { socialImagePath } from '@/lib/docs-social-image';
import { expandDocsStaticParams, resolveDocsPath } from '@/lib/docs-route';

const nextraParams = generateStaticParamsFor('mdxPath');

/**
 * Variant-neutral Viewer and Headless content fans out into one concrete
 * route per integration/framework. Bare content routes are not emitted;
 * middleware redirects them to the visitor's persisted choice.
 */
export async function generateStaticParams() {
  const base = await nextraParams();
  return expandDocsStaticParams(base);
}

type PageProps = Readonly<{
  params: Promise<{ mdxPath: string[] }>;
}>;

export async function generateMetadata(props: PageProps) {
  const params = await props.params;
  const resolved = resolveDocsPath(params.mdxPath);
  if (!resolved) return {};
  const { metadata } = await importPage(resolved.contentPath);

  // The card itself is rendered by /api/og and prerendered for this exact
  // route, so the fan-out siblings each advertise their own integration.
  const image = {
    url: socialImagePath(params.mdxPath),
    alt: `${metadata?.title ?? 'CloudPDF'} | CloudPDF documentation`,
    width: 1200,
    height: 630,
    type: 'image/png',
  };

  return {
    ...metadata,
    openGraph: { ...(metadata?.openGraph ?? {}), images: [image] },
    twitter: { ...(metadata?.twitter ?? {}), card: 'summary_large_image', images: [image] },
  };
}

const Wrapper = getMDXComponents().wrapper ?? Fragment;

export default async function Page(props: PageProps) {
  const params = await props.params;
  const resolved = resolveDocsPath(params.mdxPath);
  if (!resolved) notFound();
  const result = await importPage(resolved.contentPath);
  const { default: MDXContent, ...rest } = result;

  return (
    <Wrapper {...rest}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
