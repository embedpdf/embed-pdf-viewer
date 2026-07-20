import Image from 'next/image';
import Link from 'next/link';

import { EpButton } from './button';
import { Eyebrow } from './eyebrow';
import {
  AngularIcon,
  ArrowRightIcon,
  BoltBadgeIcon,
  JsMark,
  ReactIcon,
  SvelteIcon,
  VueIcon,
} from './icons';

const CAPABILITIES = [
  {
    src: '/cap-annotation.svg',
    title: 'Annotations',
    desc: 'Highlight, underline, draw and add notes.',
  },
  { src: '/cap-forms.svg', title: 'Forms', desc: 'Fill and save interactive PDF forms.' },
  { src: '/cap-signature.svg', title: 'Signatures', desc: 'Add, save and manage e-signatures.' },
  { src: '/cap-search.svg', title: 'Search', desc: 'Find text across the entire document.' },
  { src: '/cap-redaction.svg', title: 'Redaction', desc: 'Permanently redact sensitive content.' },
  { src: '/cap-stamps.svg', title: 'Stamps', desc: 'Add and manage document stamps.' },
];

function FrameworkLink({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Link
      href="/docs"
      title={title}
      className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[rgba(7,32,76,0.08)] bg-white text-[#99A4BE] transition-all duration-150 hover:-translate-y-px hover:scale-105 hover:border-[rgba(8,118,253,0.35)] hover:shadow-[0_2px_8px_rgba(8,118,253,0.18)] [&:hover_svg]:opacity-100 [&_svg]:opacity-55"
    >
      {children}
    </Link>
  );
}

export function Capabilities() {
  return (
    <section className="relative w-full overflow-hidden bg-white py-[clamp(70px,9vw,130px)]">
      <div className="relative z-[2] mx-auto grid w-full max-w-[1440px] items-start gap-[clamp(40px,6vw,96px)] px-[clamp(20px,4vw,80px)] min-[1101px]:grid-cols-[minmax(280px,380px)_1fr]">
        <div className="flex flex-col items-start">
          <div className="mb-6">
            <Eyebrow icon={<BoltBadgeIcon size={14} className="text-ep-blue" />}>
              Capabilities
            </Eyebrow>
          </div>
          <h2 className="font-display text-ep-navy m-0 mb-6 text-[clamp(34px,3.8vw,50px)] font-bold leading-[1.08] tracking-[-0.02em]">
            Everything you need for modern PDF <em className="ep-grad not-italic">workflows</em>
          </h2>
          <div className="from-ep-blue to-ep-purple mb-6 h-[7px] w-[60px] rounded-[10px] bg-gradient-to-r" />
          <p className="text-ep-muted m-0 max-w-[360px] font-sans text-[17px] leading-[1.55]">
            Packed with features to handle real-world use cases with ease.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-5">
            <EpButton href="/docs" variant="primary" icon="arrow">
              Get Started
            </EpButton>
            <Link
              href="/docs"
              className="font-display text-ep-blue hover:text-ep-blue700 group inline-flex items-center gap-1.5 text-[15px] font-semibold transition-all duration-200 hover:gap-2.5"
            >
              Read the docs
              <ArrowRightIcon size={14} strokeWidth={2.4} />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 min-[481px]:grid-cols-2 min-[901px]:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <article
              key={c.title}
              className="border-ep-border group relative flex flex-col items-center overflow-hidden rounded-2xl border bg-white px-[18px] pb-[22px] pt-6 text-center transition-all duration-200 hover:-translate-y-[3px] hover:border-[rgba(8,118,253,0.30)] hover:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_4px_rgba(7,32,76,0.06),0_18px_36px_-16px_rgba(8,118,253,0.22)]"
            >
              <div className="mb-[18px] flex aspect-square max-h-[150px] w-full items-center justify-center overflow-hidden rounded-xl bg-[#F4F8FF]">
                <Image
                  src={c.src}
                  alt=""
                  width={160}
                  height={160}
                  className="block h-auto w-[78%] rounded-lg"
                />
              </div>
              <h3 className="font-display text-ep-navy m-0 mb-2 text-[17px] font-extrabold leading-[1.2] tracking-[-0.01em]">
                {c.title}
              </h3>
              <p className="text-ep-soft m-0 mb-4 max-w-[22ch] font-sans text-sm leading-[1.5]">
                {c.desc}
              </p>
              <div
                className="mt-auto flex w-full justify-center gap-2 border-t border-[rgba(7,32,76,0.06)] pt-3.5"
                aria-label={`${c.title} docs by framework`}
              >
                <FrameworkLink title="Vanilla JS docs">
                  <JsMark small />
                </FrameworkLink>
                <FrameworkLink title="React docs">
                  <ReactIcon size={16} />
                </FrameworkLink>
                <FrameworkLink title="Vue docs">
                  <VueIcon size={16} />
                </FrameworkLink>
                <FrameworkLink title="Svelte docs">
                  <SvelteIcon size={16} />
                </FrameworkLink>
                <FrameworkLink title="Angular docs">
                  <AngularIcon size={16} />
                </FrameworkLink>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
