import { PreviewBanner, UnreleasedNotice } from '@embedpdf/docs-kit';
import { notFound } from 'next/navigation';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { Fragment, type HTMLAttributes } from 'react';

import { useMDXComponents as getMDXComponents } from '../../../../mdx-components';

import { PageTitle } from '@/components/docs/mdx';
import { isHeadlessIntegration, type HeadlessIntegration } from '@/lib/docs-integrations';
import { docsRelease, reactVersionHref } from '@/lib/docs-release';
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
    // A page held back for this framework stays out of search engines until it's live.
    ...(docsRelease(resolved.contentPath, resolved.integration).live
      ? {}
      : { robots: { index: false } }),
  };
}

const Wrapper = getMDXComponents().wrapper ?? Fragment;

export default async function Page(props: PageProps) {
  const params = await props.params;
  const resolved = resolveDocsPath(params.mdxPath);
  if (!resolved) notFound();
  const result = await importPage(resolved.contentPath);
  const { default: MDXContent, ...rest } = result;
  const release = docsRelease(resolved.contentPath, resolved.integration);

  // The publish gate holds this page back for its framework: the title, and why.
  if (!release.live && isHeadlessIntegration(resolved.integration)) {
    return (
      <Wrapper {...rest} toc={[]}>
        <PageTitle>{rest.metadata?.title}</PageTitle>
        <UnreleasedNotice
          framework={resolved.integration}
          reactHref={reactVersionHref(`/${params.mdxPath.join('/')}`, release)}
        />
      </Wrapper>
    );
  }

  // The preview site shows a page production holds back with a banner under its title.
  const components =
    release.preview && isHeadlessIntegration(resolved.integration)
      ? { h1: withPreviewBanner(resolved.integration) }
      : undefined;
  return (
    <Wrapper {...rest}>
      <MDXContent {...props} params={params} components={components} />
    </Wrapper>
  );
}

/** The page's title with the preview banner under it. */
function withPreviewBanner(framework: HeadlessIntegration) {
  return function TitleWithPreviewBanner(props: HTMLAttributes<HTMLHeadingElement>) {
    return (
      <>
        <PageTitle {...props} />
        <PreviewBanner framework={framework} />
      </>
    );
  };
}
