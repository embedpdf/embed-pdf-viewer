import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ExamplePageView } from '@/components/site/example-page-view';
import { examplePage, examplePages } from '@/lib/example-pages';
import { examplePageHref } from '@/lib/examples';

/** An example's page (`lib/examples.ts`): one per example that has one, and nothing else. */
export async function exampleParams() {
  return (await examplePages()).filter((page) => page.demo).map(({ slug }) => ({ slug }));
}

export async function exampleMetadata(slug: string): Promise<Metadata> {
  const page = await examplePage(slug);
  if (!page) return {};
  return {
    title: `${page.title}: a viewer example | EmbedPDF`,
    description: page.description,
    alternates: { canonical: examplePageHref(slug) },
  };
}

export async function ExampleRoute({ slug }: { slug: string }) {
  const page = await examplePage(slug);
  if (!page?.demo) notFound();
  return (
    <ExamplePageView
      slug={slug}
      title={page.title}
      demo={page.demo}
      integrations={page.integrations}
    />
  );
}
