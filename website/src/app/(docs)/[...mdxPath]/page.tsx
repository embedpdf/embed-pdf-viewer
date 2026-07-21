import { notFound } from 'next/navigation';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { Fragment } from 'react';

import { useMDXComponents as getMDXComponents } from '../../../../mdx-components';

import { getDocsPagePresentation } from '@/lib/docs-page';
import { expandDocsStaticParams, resolveDocsPath } from '@/lib/docs-route';

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
  const { mdxPath } = await props.params;
  const page = await getDocsPagePresentation(mdxPath);
  if (!page) return {};
  const socialImage = {
    url: page.socialImagePath,
    alt: `${page.title} | EmbedPDF documentation`,
    width: 1200,
    height: 630,
    type: 'image/png',
  };

  return {
    ...page.metadata,
    title: page.title,
    description: page.description,
    alternates: {
      ...(page.metadata.alternates ?? {}),
      canonical: page.canonicalUrl,
    },
    openGraph: {
      ...(page.metadata.openGraph ?? {}),
      title: page.title,
      description: page.socialDescription,
      siteName: 'EmbedPDF',
      type: 'article',
      url: page.canonicalPath,
      images: [socialImage],
    },
    twitter: {
      ...(page.metadata.twitter ?? {}),
      card: 'summary_large_image',
      title: page.title,
      description: page.socialDescription,
      images: [socialImage],
    },
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
