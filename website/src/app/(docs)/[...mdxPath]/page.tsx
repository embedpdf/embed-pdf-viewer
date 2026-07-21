import { notFound } from 'next/navigation';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { Fragment } from 'react';

import { useMDXComponents as getMDXComponents } from '../../../../mdx-components';

import { FRAMEWORK_LABELS, FRAMEWORKS, isFramework } from '@/lib/frameworks';

const nextraParams = generateStaticParamsFor('mdxPath');

/**
 * One content file per headless topic fans out into a route per framework
 * (DOCS-ARCHITECTURE.md pillar 1): content lives at docs/headless/<topic>,
 * routes are /docs/headless/<fw>/<topic>. The bare content route is not
 * emitted — middleware redirects it by cookie.
 */
export async function generateStaticParams() {
  const base = await nextraParams();
  return base.flatMap((entry) => {
    const mdxPath = Array.isArray(entry.mdxPath) ? entry.mdxPath : [entry.mdxPath];
    if (mdxPath?.[0] === 'docs' && mdxPath[1] === 'headless' && mdxPath.length > 2) {
      return FRAMEWORKS.map((fw) => ({
        mdxPath: [mdxPath[0], mdxPath[1], fw, ...mdxPath.slice(2)],
      }));
    }
    return [{ mdxPath }];
  });
}

type PageProps = Readonly<{
  params: Promise<{ mdxPath: string[] }>;
}>;

/** '/docs/headless/vue/zoom' → { contentPath: ['docs','headless','zoom'], fw: 'vue' } */
function resolvePath(mdxPath: string[]) {
  if (mdxPath[0] === 'docs' && mdxPath[1] === 'headless' && mdxPath.length > 2) {
    const fw = mdxPath[2];
    if (!isFramework(fw)) return null;
    return { contentPath: [mdxPath[0], mdxPath[1], ...mdxPath.slice(3)], fw };
  }
  return { contentPath: mdxPath, fw: undefined };
}

export async function generateMetadata(props: PageProps) {
  const params = await props.params;
  const resolved = resolvePath(params.mdxPath);
  if (!resolved) return {};
  const { metadata } = await importPage(resolved.contentPath);
  if (resolved.fw && metadata?.title) {
    return { ...metadata, title: `${metadata.title} — ${FRAMEWORK_LABELS[resolved.fw]}` };
  }
  return metadata;
}

const Wrapper = getMDXComponents().wrapper ?? Fragment;

export default async function Page(props: PageProps) {
  const params = await props.params;
  const resolved = resolvePath(params.mdxPath);
  if (!resolved) notFound();
  const result = await importPage(resolved.contentPath);
  const { default: MDXContent, ...rest } = result;

  return (
    <Wrapper {...rest}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
