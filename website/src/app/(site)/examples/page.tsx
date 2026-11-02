import { ExamplePoster } from '@embedpdf/docs-kit';
import type { Metadata } from 'next';
import Link from 'next/link';

import { examplePages } from '@/lib/example-pages';
import { exampleDocsHref, examplePageHref, exampleScreenshot } from '@/lib/examples';

export const metadata: Metadata = {
  title: 'Viewer examples | EmbedPDF',
  description:
    'Apps made from the ready-made EmbedPDF viewer, each with a design of its own: open one to use it, or read how it’s built.',
  alternates: { canonical: '/examples' },
};

/** The examples that open on a page of their own (`lib/examples.ts`), each a picture of it. */
export default async function ExamplesPage() {
  const pages = (await examplePages()).filter((page) => page.demo);
  return (
    <main className="bg-ep-bg">
      <section className="mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,78px)] pb-[clamp(64px,8vw,120px)] pt-[clamp(48px,6vw,96px)]">
        <h1 className="font-display text-ep-navy m-0 text-[clamp(36px,5vw,58px)] font-extrabold leading-[1.05] tracking-[-0.02em]">
          Viewer examples
        </h1>
        <p className="text-ep-muted mb-0 mt-4 max-w-[640px] font-sans text-[17px] leading-[1.6]">
          Apps made from the ready-made viewer, each with a design of its own. Open one to use it,
          or read how it’s built.
        </p>
        <ul className="m-0 mt-[clamp(32px,4vw,56px)] grid list-none gap-x-8 gap-y-12 p-0 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((page) => {
            const href = examplePageHref(page.slug);
            return (
              <li key={page.slug} className="flex flex-col">
                <ExamplePoster {...exampleScreenshot(page.name)} href={href} />
                <h2 className="font-display text-ep-navy mb-0 mt-5 text-[22px] font-bold">
                  <Link href={href} className="hover:text-ep-blue transition-colors">
                    {page.title}
                  </Link>
                </h2>
                <p className="text-ep-muted mb-0 mt-2 font-sans text-[15.5px] leading-[1.6]">
                  {page.description}
                </p>
                <Link
                  href={exampleDocsHref(page.slug)}
                  className="text-ep-blue mt-3 self-start font-sans text-[14.5px] font-semibold underline-offset-[3px] hover:underline"
                >
                  How it’s built
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
