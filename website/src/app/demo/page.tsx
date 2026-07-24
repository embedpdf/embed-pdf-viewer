import type { Metadata } from 'next';

import { Eyebrow, PillDivider } from '@/components/site/eyebrow';
import { ViewerFrame } from '@/components/site/viewer-frame';

export const metadata: Metadata = {
  title: 'Live PDF Viewer Demo — EmbedPDF',
  description:
    'Explore the complete open source EmbedPDF viewer with search, navigation, annotations, forms, and more.',
};

export default function DemoPage() {
  return (
    <main className="bg-ep-bg relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-220px] h-[720px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(8,118,253,0.12)_0%,rgba(151,71,255,0.045)_42%,transparent_72%)] blur-2xl"
      />

      <section className="relative z-[1] mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,80px)] pb-[clamp(60px,7vw,96px)] pt-[clamp(54px,7vw,92px)]">
        <div className="mx-auto mb-[clamp(36px,5vw,58px)] flex max-w-[800px] flex-col items-center text-center">
          <div className="mb-5">
            <Eyebrow dot>Interactive demo</Eyebrow>
          </div>
          <h1 className="font-display text-ep-navy m-0 mb-5 text-[clamp(40px,5.2vw,64px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
            Meet your new <em className="ep-grad not-italic">PDF viewer</em>
          </h1>
          <PillDivider gradient />
          <p className="text-ep-body mb-0 mt-5 max-w-[650px] font-sans text-[17px] leading-[1.6]">
            Explore the complete EmbedPDF experience. Navigate the sample, search its contents, zoom
            in, switch modes, and try the built-in tools.
          </p>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-5 rounded-[32px] border border-[rgba(8,118,253,0.08)] bg-white/60"
          />
          <div className="relative">
            <ViewerFrame variant="demo" />
          </div>
        </div>
      </section>
    </main>
  );
}
