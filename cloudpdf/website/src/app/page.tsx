import { ChartIncreaseIcon, SecurityCheckIcon, SourceCodeIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';

import { BuildSection } from '@/components/site/build-section';
import { CpButton } from '@/components/site/button';
import { CredibilitySection } from '@/components/site/credibility-section';
import { GuideSection } from '@/components/site/guide-section';
import { HeroScene } from '@/components/site/hero-scene';
import { ArrowRight, PlayIcon } from '@/components/site/icons';
import { ProblemSection } from '@/components/site/problem-section';

const TRUST: { label: string; icon: IconSvgElement }[] = [
  { label: 'Developer first', icon: SourceCodeIcon },
  { label: 'Built for scale', icon: ChartIncreaseIcon },
  { label: 'Secure by design', icon: SecurityCheckIcon },
];

export default function HomePage() {
  return (
    <main className="bg-cp-bg relative overflow-x-clip">
      <div className="relative mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,78px)] py-[clamp(72px,9vw,130px)]">
        <div className="grid grid-cols-1 items-center gap-12 min-[981px]:grid-cols-[minmax(400px,0.95fr)_minmax(0,1.42fr)] min-[981px]:gap-[clamp(18px,2vw,32px)]">
          {/* LEFT */}
          <div className="flex min-w-0 flex-col">
            <h1 className="font-display text-cp-navy text-[clamp(38px,4.4vw,56px)] font-extrabold leading-[1.06] tracking-[-0.02em]">
              <em className="text-cp-blue not-italic">Production-grade PDF,</em> built into your
              product.
            </h1>
            <div className="bg-cp-blue mt-7 h-[7px] w-[60px] rounded-[10px]" />
            <p className="text-cp-ink mt-[26px] max-w-[480px] font-sans text-[18px] leading-[1.6]">
              Viewing is the easy part. CloudPDF adds annotations and collaboration, permissions,
              signed URLs, and scale that production demands — as a drop-in viewer or headless
              components, hosted or self-hosted.
            </p>
            <div className="mt-[34px] flex flex-wrap gap-4">
              <CpButton href="#" variant="primary">
                <span>Start building</span>
                <ArrowRight width={20} height={20} />
              </CpButton>
              <CpButton href="/docs" variant="outline">
                <PlayIcon width={16} height={16} />
                <span>View API docs</span>
              </CpButton>
            </div>

            <div className="border-cp-border mt-9 inline-flex flex-wrap items-center gap-4 self-start rounded-full border bg-white px-[18px] py-[11px] shadow-[0_1px_2px_rgba(10,26,77,0.04)]">
              {TRUST.map((item, i) => (
                <span key={item.label} className="flex items-center">
                  {i > 0 && (
                    <span className="bg-cp-border mr-4 hidden h-4 w-px min-[481px]:block" />
                  )}
                  <span className="text-cp-navy inline-flex items-center gap-2 whitespace-nowrap font-sans text-[13px] font-semibold">
                    <HugeiconsIcon
                      icon={item.icon}
                      size={15}
                      strokeWidth={2.2}
                      className="text-cp-blue flex-shrink-0"
                    />
                    {item.label}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT SCENE */}
          <HeroScene />
        </div>

        {/* hero bottom-left dot grid */}
        <div className="cp-dots-fine pointer-events-none absolute bottom-[-104px] left-[-30px] z-0 h-[110px] w-[132px] text-[#ABC9FD] max-[980px]:hidden" />
      </div>

      <ProblemSection />
      <BuildSection />
      <GuideSection />
      <CredibilitySection />
    </main>
  );
}
