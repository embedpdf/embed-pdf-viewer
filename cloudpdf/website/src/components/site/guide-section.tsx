import {
  ArrowRight01Icon,
  Flag02Icon,
  Notebook01Icon,
  PencilEdit02Icon,
  ServerStack01Icon,
  SignatureIcon,
  SquareLock02Icon,
  UserMultipleIcon,
  ViewOffSlashIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import Link from 'next/link';

import { CloudBanner, CloudMark } from './cloud-banner';

const STEPS = [
  {
    n: 1,
    title: 'Drop in the viewer',
    desc: 'Use the ready-made viewer or go headless with components and APIs.',
  },
  {
    n: 2,
    title: 'Add the workflow layer',
    desc: 'Add annotations, permissions, signing, and collaboration without custom infrastructure.',
  },
  {
    n: 3,
    title: 'Deploy your way',
    desc: 'Pick managed SaaS or self-hosted, depending on your team and compliance needs.',
  },
];

const CHIPS: { label: string; icon: IconSvgElement; color: string }[] = [
  { label: 'Annotations', icon: PencilEdit02Icon, color: 'text-[#7A5AF8]' },
  { label: 'Permissions', icon: SquareLock02Icon, color: 'text-cp-blue' },
  { label: 'eSign', icon: SignatureIcon, color: 'text-[#1FAE6B]' },
  { label: 'Collaboration', icon: UserMultipleIcon, color: 'text-cp-blue' },
  { label: 'Redaction', icon: ViewOffSlashIcon, color: 'text-[#EE5A52]' },
  { label: 'Audit Logs', icon: Notebook01Icon, color: 'text-cp-blue' },
];

function StepViewer() {
  return (
    <div className="relative pb-[clamp(96px,11vw,124px)]">
      {/* viewer card */}
      <div className="border-cp-border overflow-hidden rounded-[16px] border bg-white shadow-[0_26px_54px_-30px_rgba(10,26,77,0.35),0_2px_8px_rgba(10,26,77,0.05)]">
        <div className="border-cp-borderSoft flex items-center gap-[9px] border-b px-4 py-3">
          <CloudMark width={18} height={12} />
          <span className="font-display text-cp-navy text-[13.5px] font-bold">
            Ready-made Viewer
          </span>
        </div>
        <div className="p-3.5">
          <img
            src="/build-section/viewer-example.svg"
            alt="PDF viewer interface"
            width={1070}
            height={706}
            loading="lazy"
            className="border-cp-borderSoft block w-full rounded-[8px] border"
          />
        </div>
      </div>

      {/* code card */}
      <div className="absolute bottom-0 left-[-14px] w-[80%] overflow-hidden rounded-[14px] bg-[#0E1E45] shadow-[0_26px_54px_-26px_rgba(10,26,77,0.55)]">
        <div className="flex items-center gap-[9px] border-b border-white/10 px-[15px] py-[11px]">
          <svg
            viewBox="0 0 24 24"
            width={18}
            height={18}
            fill="none"
            stroke="#7FB4FF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m8 8-4 4 4 4" />
            <path d="m16 8 4 4-4 4" />
          </svg>
          <span className="font-display text-[13px] font-bold text-[#EAF1FF]">
            Headless &amp; APIs
          </span>
        </div>
        <pre className="m-0 overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-[1.7] text-[#C7D3EC] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="text-[#C792EA]">const</span> instance ={' '}
          <span className="text-[#C792EA]">await</span> CloudPDF.create({'{'}
          {'\n'} document: <span className="text-[#7DD3A0]">&quot;contract.pdf&quot;</span>,{'\n'}{' '}
          features: [<span className="text-[#7DD3A0]">&quot;annotate&quot;</span>,{' '}
          <span className="text-[#7DD3A0]">&quot;sign&quot;</span>]{'\n'}
          {'}'});{'\n'}instance.load();
        </pre>
      </div>
    </div>
  );
}

function StepChips() {
  return (
    <div className="grid grid-cols-2 gap-3.5 max-[460px]:grid-cols-1">
      {CHIPS.map((chip) => (
        <div
          key={chip.label}
          className="border-cp-border text-cp-navy font-display flex items-center gap-3 rounded-[14px] border bg-white px-[18px] py-4 text-[14.5px] font-bold shadow-[0_14px_30px_-24px_rgba(10,26,77,0.3)] transition-all duration-150 hover:-translate-y-[3px] hover:shadow-[0_22px_40px_-26px_rgba(10,26,77,0.4)]"
        >
          <HugeiconsIcon
            icon={chip.icon}
            size={22}
            strokeWidth={2}
            className={`flex-shrink-0 ${chip.color}`}
          />
          {chip.label}
        </div>
      ))}
    </div>
  );
}

function DeployCard({
  icon,
  iconWrap,
  title,
  desc,
  href,
}: {
  icon: React.ReactNode;
  iconWrap: string;
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <div className="border-cp-border flex flex-col items-center rounded-[18px] border bg-white p-[clamp(18px,1.8vw,24px)] text-center shadow-[0_22px_44px_-30px_rgba(10,26,77,0.3)]">
      <span
        className={`mb-[18px] inline-flex h-[60px] w-[60px] items-center justify-center rounded-full ${iconWrap}`}
      >
        {icon}
      </span>
      <h4 className="font-display text-cp-navy m-0 text-[18px] font-extrabold tracking-[-0.012em]">
        {title}
      </h4>
      <p className="text-cp-muted m-0 mb-[18px] mt-3 font-sans text-[13.5px] leading-[1.55]">
        {desc}
      </p>
      <Link
        href={href}
        className="text-cp-blue hover:text-cp-blue600 group/link font-display mt-auto inline-flex items-center gap-1.5 text-[14px] font-bold no-underline transition-colors"
      >
        Learn more
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={15}
          strokeWidth={2.4}
          className="transition-transform duration-150 group-hover/link:translate-x-[3px]"
        />
      </Link>
    </div>
  );
}

export function GuideSection() {
  return (
    <section className="relative w-full overflow-clip bg-[linear-gradient(180deg,#FBFCFE_0%,#F4F8FE_100%)] py-[clamp(64px,8vw,110px)] pb-[clamp(72px,9vw,116px)]">
      {/* decorations */}
      <div className="cp-dots-fine pointer-events-none absolute left-[clamp(16px,3vw,70px)] top-[clamp(40px,6vw,96px)] z-[1] h-[96px] w-[132px] text-[#C3D6F5] max-[1180px]:hidden" />
      <div className="cp-dots-fine pointer-events-none absolute right-[clamp(16px,3vw,70px)] top-[clamp(40px,6vw,96px)] z-[1] h-[96px] w-[132px] text-[#C3D6F5] [mask-image:linear-gradient(255deg,#000_30%,transparent_92%)] max-[1180px]:hidden" />

      <div className="relative z-[2] mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,78px)]">
        {/* head */}
        <div className="text-center">
          <span className="font-display mb-[22px] inline-block whitespace-nowrap rounded-full bg-[#7A5AF8]/10 px-4 py-[9px] text-[12px] font-extrabold uppercase leading-none tracking-[0.12em] text-[#7A5AF8]">
            The plan
          </span>
          <h2 className="font-display text-cp-navy m-0 text-balance text-[clamp(34px,4.4vw,56px)] font-extrabold leading-[1.05] tracking-[-0.022em]">
            CloudPDF <em className="text-cp-blue not-italic">handles the hard parts.</em>
          </h2>
          <p className="text-cp-muted mx-auto mt-5 max-w-[640px] text-pretty font-sans text-[clamp(16px,1.35vw,19px)] leading-[1.6]">
            A simple 3-step plan to go from viewer to production-grade workflow.
          </p>
        </div>

        {/* desktop stepper — clean dashed journey line + finish flag */}
        <div className="relative mb-[clamp(28px,3.5vw,46px)] mt-[clamp(40px,5vw,64px)] hidden min-[981px]:block">
          <div className="absolute left-[16.666%] right-[24px] top-[23px] border-t-2 border-dashed border-[#C2D3F0]" />
          <span className="border-cp-border text-cp-blue absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-full border bg-white shadow-[0_10px_24px_-12px_rgba(10,26,77,0.4)]">
            <HugeiconsIcon icon={Flag02Icon} size={22} strokeWidth={2} />
          </span>
          <div className="relative grid grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n} className="flex justify-center">
                <span className="border-cp-blue text-cp-blue font-display inline-flex h-12 w-12 items-center justify-center rounded-full border-2 bg-white text-[20px] font-extrabold leading-none shadow-[0_2px_6px_rgba(22,119,255,0.14)]">
                  {step.n}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* steps */}
        <div className="grid grid-cols-1 gap-[clamp(40px,6vw,56px)] min-[981px]:mt-0 min-[981px]:grid-cols-3 min-[981px]:grid-rows-[auto_auto_1fr] min-[981px]:gap-x-[clamp(20px,2.5vw,40px)] min-[981px]:gap-y-0">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="flex flex-col min-[981px]:row-span-3 min-[981px]:grid min-[981px]:grid-rows-subgrid"
            >
              {/* mobile number */}
              <span className="border-cp-blue text-cp-blue font-display mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full border-2 bg-white text-[18px] font-extrabold leading-none min-[981px]:hidden">
                {step.n}
              </span>
              <h3 className="font-display text-cp-navy m-0 text-center text-[clamp(18px,1.6vw,21px)] font-extrabold leading-[1.2] tracking-[-0.012em]">
                {step.title}
              </h3>
              <p className="text-cp-muted mx-auto mt-2 max-w-[300px] text-pretty text-center font-sans text-[14.5px] leading-[1.55]">
                {step.desc}
              </p>
              <div className="mt-[clamp(26px,3vw,38px)]">
                {step.n === 1 && <StepViewer />}
                {step.n === 2 && <StepChips />}
                {step.n === 3 && (
                  <div className="grid grid-cols-2 gap-4 max-[460px]:grid-cols-1">
                    <DeployCard
                      icon={<CloudMark width={28} height={18} />}
                      iconWrap="bg-cp-blue/10"
                      title="Managed SaaS"
                      desc="Fully managed by CloudPDF. Scale instantly. Always up to date."
                      href="/docs/engine/getting-started"
                    />
                    <DeployCard
                      icon={<HugeiconsIcon icon={ServerStack01Icon} size={28} strokeWidth={1.9} />}
                      iconWrap="bg-[#7A5AF8]/10 text-[#7A5AF8]"
                      title="Self-hosted"
                      desc="Deploy in your environment. Full control and data residency."
                      href="/docs/server/getting-started"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* closing banner */}
        <CloudBanner className="mx-auto mt-[clamp(40px,5vw,60px)] w-max max-w-full">
          From first integration to <em className="text-cp-blue not-italic">production rollout.</em>
        </CloudBanner>
      </div>
    </section>
  );
}
