import { notFound } from 'next/navigation';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { Fragment } from 'react';

import { useMDXComponents as getMDXComponents } from '../../../../mdx-components';

import { expandDocsStaticParams, resolveDocsPath } from '@/lib/docs-route';
import { FRAMEWORK_LABELS } from '@/lib/frameworks';

const nextraParams = generateStaticParamsFor('mdxPath');

/**
 * One content file per headless topic fans out into a route per framework
 * (DOCS-ARCHITECTURE.md pillar 1): content lives at docs/headless/<topic>,
 * routes are /docs/headless/<fw>/<topic>. The bare content route is not
 * emitted — middleware redirects it by cookie.
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
  if (resolved.framework && metadata?.title) {
    return {
      ...metadata,
      title: `${metadata.title} — ${FRAMEWORK_LABELS[resolved.framework]}`,
    };
  }
  return metadata;
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
