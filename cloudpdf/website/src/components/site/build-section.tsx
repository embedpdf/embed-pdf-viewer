import {
  CheckmarkBadge01Icon,
  File02Icon,
  GlobalIcon,
  Link01Icon,
  Notebook01Icon,
  PuzzleIcon,
  ServerStack01Icon,
  UserLockIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';

import { CloudBanner } from './cloud-banner';

type Feature = {
  label: string;
  icon: IconSvgElement;
};

const FEATURES: Feature[] = [
  { label: 'Collaboration', icon: UserMultipleIcon },
  { label: 'Audit logs', icon: Notebook01Icon },
  { label: 'Permissions', icon: UserLockIcon },
  { label: 'Compliance', icon: CheckmarkBadge01Icon },
  { label: 'Self-hosting', icon: ServerStack01Icon },
  { label: 'Signed URLs', icon: Link01Icon },
  { label: 'Global scale', icon: GlobalIcon },
  { label: 'Huge files', icon: File02Icon },
  { label: 'Edge cases', icon: PuzzleIcon },
];

const EASY_CHECKS = ['Basic viewer', 'First demo', 'Ship it'];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-cp-blue h-5 w-5 flex-shrink-0"
    >
      <circle cx="12" cy="12" r="10" fill="rgba(22,119,255,0.12)" stroke="none" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

export function BuildSection() {
  return (
    <section className="relative w-full overflow-clip bg-[linear-gradient(180deg,#F3F7FE_0%,#FBFCFE_100%)] py-[clamp(64px,8vw,108px)]">
      <div className="relative z-[2] mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-[clamp(36px,4.5vw,72px)] px-[clamp(20px,4vw,78px)] min-[981px]:grid-cols-[0.86fr_1.14fr]">
        {/* LEFT */}
        <div className="min-w-0">
          <span className="font-display mb-[22px] inline-block whitespace-nowrap rounded-full bg-[#7A5AF8]/10 px-4 py-[9px] text-[12px] font-extrabold uppercase leading-none tracking-[0.12em] text-[#7A5AF8]">
            The hard part
          </span>
          <h2 className="font-display text-cp-navy m-0 text-balance text-[clamp(34px,4.2vw,56px)] font-extrabold leading-[1.04] tracking-[-0.022em]">
            You could build
            <br />
            it <em className="text-cp-blue not-italic">yourself.</em>
          </h2>
          <p className="font-display text-cp-ink mt-[22px] text-balance text-[clamp(18px,1.5vw,21px)] font-bold leading-[1.4]">
            The demo is easy. The production reality is not.
          </p>
          <p className="text-cp-muted mt-4 max-w-[520px] text-pretty font-sans text-[clamp(15px,1.25vw,16.5px)] leading-[1.62]">
            Start with pdf.js, wire up a viewer, and ship the first demo fast. Then the hard part
            begins: annotations and collaboration, permissions, signed URLs, audit logs, compliance,
            huge files, global scale, and self-hosting.
          </p>
          <div className="bg-cp-blue my-[30px] h-[7px] w-[60px] rounded-[10px]" />
          <p className="font-display text-cp-navy m-0 text-pretty rounded-[22px] border border-[rgba(22,119,255,0.12)] bg-[rgba(22,119,255,0.07)] px-[26px] py-[26px] text-[clamp(19px,1.6vw,21px)] font-extrabold leading-[1.35] tracking-[-0.015em]">
            The first <em className="text-cp-blue not-italic">20%</em> is a weekend.
            <br />
            The last <em className="text-cp-blue not-italic">80%</em> is where roadmaps go to die.
          </p>
          <CloudBanner className="mt-[22px]">
            We know — we&apos;ve handled every one of these edge cases{' '}
            <em className="text-cp-blue not-italic">inside CloudPDF.</em>
          </CloudBanner>
        </div>

        {/* RIGHT */}
        <div className="border-cp-border rounded-[30px] border bg-white p-[clamp(18px,1.8vw,26px)] shadow-[0_40px_80px_-40px_rgba(10,26,77,0.35),0_3px_10px_rgba(10,26,77,0.05)]">
          <div className="grid grid-cols-1 items-end gap-[clamp(14px,1.4vw,20px)] min-[561px]:grid-cols-[0.74fr_1.26fr]">
            {/* easy part */}
            <div className="border-cp-border flex flex-col gap-[14px] rounded-[20px] border bg-white p-[clamp(16px,1.4vw,20px)] shadow-[0_14px_34px_-26px_rgba(10,26,77,0.28)]">
              <div>
                <div className="font-display text-cp-blue text-[clamp(30px,3vw,38px)] font-extrabold leading-none tracking-[-0.02em]">
                  20%
                </div>
                <div className="font-display text-cp-navy mt-[5px] text-[15px] font-extrabold leading-[1.2]">
                  The easy part
                </div>
              </div>
              <img
                src="/build-section/viewer-example.svg"
                alt="PDF viewer interface"
                width={1070}
                height={706}
                loading="lazy"
                className="border-cp-border block h-auto w-full rounded-[12px] border bg-white"
              />
              <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
                {EASY_CHECKS.map((check) => (
                  <li
                    key={check}
                    className="text-cp-ink flex items-center gap-[11px] font-sans text-[14px] font-semibold leading-[1.2]"
                  >
                    <CheckIcon />
                    {check}
                  </li>
                ))}
              </ul>
            </div>

            {/* hidden complexity */}
            <div className="flex flex-col overflow-hidden rounded-[22px] border border-[#DCE5F6] bg-[#ECF0FC]">
              <div className="bg-[url(/build-section/mountain.png)] bg-[length:96%_auto] bg-[center_bottom] bg-no-repeat px-6 pb-[clamp(140px,17vw,196px)] pt-[clamp(20px,2vw,26px)] text-center">
                <div className="font-display text-cp-blue text-[clamp(36px,3.6vw,46px)] font-extrabold leading-none tracking-[-0.02em]">
                  80%
                </div>
                <div className="font-display text-cp-navy mt-[6px] text-[clamp(16px,1.5vw,19px)] font-extrabold leading-[1.2]">
                  The hidden complexity
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-[clamp(16px,2vw,30px)] gap-y-[12px] p-[clamp(18px,1.8vw,24px)_clamp(20px,2vw,28px)_clamp(20px,2vw,26px)] min-[421px]:grid-cols-2">
                {FEATURES.map((feature) => (
                  <div
                    key={feature.label}
                    className="text-cp-ink flex items-center gap-[11px] whitespace-nowrap font-sans text-[14px] font-semibold leading-[1.25]"
                  >
                    <span className="text-cp-blue inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-white shadow-[0_2px_6px_rgba(10,26,77,0.07)]">
                      <HugeiconsIcon icon={feature.icon} size={16} strokeWidth={2} />
                    </span>
                    {feature.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* effort bar — segments mirror the cards grid so the blue fill matches the easy-part card */}
          <div className="mt-[clamp(18px,1.8vw,24px)] grid grid-cols-1 gap-[clamp(14px,1.4vw,20px)] min-[561px]:grid-cols-[0.74fr_1.26fr]">
            <div className="h-3 rounded-full bg-[linear-gradient(90deg,#1677FF,#0F62E0)]" />
            <div className="h-3 rounded-full bg-[#E2EAF7]" />
          </div>
          <div className="mt-[10px] grid grid-cols-1 gap-[clamp(14px,1.4vw,20px)] min-[561px]:grid-cols-[0.74fr_1.26fr]">
            <span className="font-display text-cp-blue text-[14px] font-extrabold leading-none">
              20%
            </span>
            <span className="font-display text-cp-blue text-right text-[14px] font-extrabold leading-none">
              80%
            </span>
          </div>
          <p className="text-cp-muted mt-[14px] text-center font-sans text-[14px] font-medium leading-none">
            Effort over time
          </p>
        </div>
      </div>
    </section>
  );
}
