import Image from 'next/image';

import { EpButton } from './button';
import { DotGrid } from './dot-grid';
import { HeroCode } from './hero-code';
import { CheckIcon, DownloadIcon, ShieldCheckIcon, StarIcon } from './icons';

const CHECKLIST = ['Copy a few lines of code', 'Configure your options', "You're live! 🚀"];

export function Hero() {
  return (
    <section className="bg-ep-bg relative w-full overflow-x-clip pb-[clamp(60px,8vw,110px)] pt-[clamp(72px,9vw,130px)]">
      <div className="relative mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,92px)]">
        {/* soft circles + dot grids */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute left-[40%] top-[25%] hidden h-[555px] w-[633px] rounded-full bg-[#F7F9FE] min-[641px]:block" />
          <div className="absolute left-[60%] top-[-10%] hidden h-[555px] w-[633px] rounded-full bg-[#F7F9FE] min-[641px]:block" />
        </div>
        <div
          aria-hidden
          className="absolute right-[90px] top-[-50px] z-0 origin-top-right scale-75"
        >
          <DotGrid />
        </div>
        <div aria-hidden className="absolute bottom-[-170px] left-[-40px] z-0">
          <DotGrid />
        </div>

        <div className="relative z-[1] grid items-center gap-[clamp(24px,3vw,48px)] min-[961px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)]">
          {/* LEFT */}
          <div className="flex min-w-0 flex-col gap-6">
            <h1 className="font-display text-ep-navy m-0 text-[clamp(36px,5vw,60px)] font-extrabold leading-[1.05] tracking-[-0.01em]">
              Embed <em className="ep-grad not-italic">PDF files</em> without the pain
            </h1>
            <div className="bg-ep-blue h-[7px] w-[60px] rounded-[10px]" />
            <p className="text-ep-body m-0 max-w-[520px] font-sans text-[17px] leading-[1.55]">
              The ultimate Open Source PDF viewer for JavaScript. Choose our drop-in component for
              instant results, or use our headless library to build a completely custom UI.
            </p>
            <div className="mt-2 flex flex-wrap gap-3.5">
              <EpButton href="/docs" variant="primary" icon="arrow">
                Get Started
              </EpButton>
              <EpButton href="/demo" variant="outline" icon="play">
                Live demo
              </EpButton>
            </div>
            <div className="mt-4 inline-flex flex-wrap items-center gap-x-5 gap-y-1.5 self-start rounded-2xl border border-[#E9EEFF] bg-white px-4 py-2.5">
              <a
                href="https://github.com/embedpdf/embed-pdf-viewer"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ep-navy inline-flex items-center gap-1.5 whitespace-nowrap font-sans text-[13px] font-medium text-[#3D4E75]"
              >
                <StarIcon size={14} className="text-ep-blue" />
                <b className="text-ep-navy font-bold">4K+</b>
                <span>stars</span>
              </a>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-sans text-[13px] font-medium text-[#3D4E75]">
                <DownloadIcon size={14} className="text-ep-blue" />
                <b className="text-ep-navy font-bold">1M+</b>
                <span>downloads</span>
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-sans text-[13px] font-medium text-[#3D4E75]">
                <ShieldCheckIcon size={14} className="text-[#22C55E]" />
                <span>Apache-2.0 licensed</span>
              </span>
            </div>
          </div>

          {/* RIGHT scene */}
          <div className="relative flex min-w-0 justify-start max-[960px]:mt-6">
            <Image
              src="/PDF-Viewer.svg"
              alt="EmbedPDF viewer"
              width={646}
              height={511}
              className="border-ep-border block aspect-[646/511] w-full max-w-[590px] rounded-[10px] border bg-white shadow-[0_4px_10px_rgba(163,163,163,0.22)]"
              priority
            />
            <div className="absolute right-[clamp(-30px,0vw,30px)] top-[14%] z-[3] w-[clamp(240px,28vw,340px)] rounded-[10px] shadow-[0_8px_24px_rgba(14,26,64,0.18)] max-[960px]:right-0 max-[960px]:top-[-16px] max-[640px]:hidden">
              <HeroCode />
            </div>
            <div className="absolute bottom-[-40px] right-10 z-[3] w-[clamp(200px,20vw,250px)] rounded-xl border border-[#E9EEFF] bg-white p-[18px] shadow-[0_8px_28px_rgba(14,26,64,0.14)] max-[960px]:bottom-[-16px] max-[960px]:right-0 max-[640px]:hidden">
              <div className="font-display text-ep-navy mb-3.5 text-sm font-extrabold tracking-[-0.005em]">
                Start embedding in minutes
              </div>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {CHECKLIST.map((item) => (
                  <li
                    key={item}
                    className="text-ep-ink flex items-center gap-2.5 font-sans text-[13px] font-medium leading-[1.35]"
                  >
                    <span className="text-ep-blue inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(8,118,253,0.12)]">
                      <CheckIcon size={12} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
