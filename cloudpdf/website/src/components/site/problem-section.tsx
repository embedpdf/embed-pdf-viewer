import { CloudBanner } from './cloud-banner';

type ProblemCard = {
  title: string;
  body: string;
  callout: string;
  image: string;
  imageAlt: string;
};

const CARDS: ProblemCard[] = [
  {
    title: 'Annotations and collaboration',
    body: 'Teams need to highlight, comment, and collaborate inside documents.',
    callout: 'Without it, workflows break outside your product.',
    image: '/problem-section/annotations-comments.svg',
    imageAlt: 'Document with highlights and a comment bubble',
  },
  {
    title: 'Permissions and signed URLs',
    body: 'Secure access, expirations, and role-based controls are table stakes.',
    callout: 'Ad-hoc sharing and downloads create risk and support load.',
    image: '/problem-section/permissions-signed-urls.svg',
    imageAlt: 'Secure document with a link and lock',
  },
  {
    title: 'Custom UI complexity',
    body: 'Building a polished PDF experience with permissions and tools takes months.',
    callout: 'Reinventing the viewer slows down your roadmap.',
    image: '/problem-section/custom-ui-complexity.svg',
    imageAlt: 'Code editor next to a UI layout',
  },
  {
    title: 'Hosting, scale, and compliance',
    body: 'Global delivery, large files, compliance, and audit logs are hard to get right.',
    callout: 'Infrastructure distractions pull focus from your product.',
    image: '/problem-section/hosting-scale-compliance.svg',
    imageAlt: 'Cloud server with a globe and security shield',
  },
];

function InfoIcon() {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

export function ProblemSection() {
  return (
    <section className="relative w-full overflow-clip bg-[linear-gradient(180deg,#FBFCFE_0%,#F5F8FE_38%,#F3F7FE_100%)] py-[clamp(64px,8vw,112px)] pb-[clamp(72px,9vw,124px)]">
      {/* decorations */}
      <img
        src="/Cloud-3-pale.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute left-[-56px] top-[clamp(120px,16vw,200px)] z-0 h-auto w-[320px] scale-125 select-none opacity-90 max-[1080px]:hidden"
      />
      <img
        src="/Cloud-3-pale.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-10 right-[-70px] z-0 h-auto w-[280px] select-none opacity-90 max-[1080px]:hidden"
      />
      <div className="cp-dots-fine pointer-events-none absolute right-[clamp(24px,6vw,96px)] top-[clamp(72px,8vw,116px)] z-[1] h-24 w-[150px] text-[#BBD3FB] [mask-image:linear-gradient(255deg,#000_30%,transparent_92%)] max-[1080px]:hidden" />

      <div className="relative z-[2] mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,78px)]">
        <div className="text-center">
          <span className="font-display mb-[22px] inline-block whitespace-nowrap rounded-full bg-[#7A5AF8]/10 px-4 py-[9px] text-[12px] font-extrabold uppercase leading-none tracking-[0.12em] text-[#7A5AF8]">
            The problem
          </span>
        </div>
        <h2 className="font-display text-cp-navy m-0 text-balance text-center text-[clamp(34px,4.2vw,54px)] font-extrabold leading-[1.05] tracking-[-0.02em]">
          A viewer is <em className="text-cp-blue not-italic">just the beginning.</em>
        </h2>
        <p className="text-cp-muted mx-auto mt-[22px] max-w-[720px] text-pretty text-center font-sans text-[clamp(17px,1.4vw,19px)] leading-[1.6]">
          The moment PDFs hit production, basic viewing isn&apos;t enough. Teams run into the same
          roadblocks that slow down launches and add complexity.
        </p>

        <div className="mt-[clamp(44px,5vw,64px)] grid grid-cols-1 gap-[clamp(16px,1.5vw,24px)] min-[561px]:grid-cols-2 min-[1081px]:grid-cols-4">
          {CARDS.map((card) => (
            <article
              key={card.title}
              className="border-cp-border flex flex-col rounded-[18px] border bg-white p-[20px_20px_24px] shadow-[0_1px_2px_rgba(10,26,77,0.04)] transition-all duration-200 hover:border-[#D8E4FB] hover:shadow-[0_22px_44px_-22px_rgba(10,26,77,0.28),0_3px_10px_rgba(10,26,77,0.05)]"
            >
              <div className="overflow-hidden rounded-[12px]">
                <img
                  src={card.image}
                  alt={card.imageAlt}
                  loading="lazy"
                  className="block aspect-[1611/1012] w-full object-cover"
                />
              </div>
              <h3 className="font-display text-cp-navy m-0 mx-auto mt-[20px] max-w-[180px] text-balance text-center text-[18px] font-extrabold leading-[1.22] tracking-[-0.012em]">
                {card.title}
              </h3>
              <p className="text-cp-muted m-0 mt-[12px] flex-1 text-pretty text-center font-sans text-[15px] leading-[1.55]">
                {card.body}
              </p>
              <div className="mt-[20px] flex items-start gap-2.5 rounded-[12px] border border-[rgba(122,90,248,0.16)] bg-[#7A5AF8]/[0.07] p-[13px_14px]">
                <span className="mt-px inline-flex flex-shrink-0 text-[#7A5AF8]">
                  <InfoIcon />
                </span>
                <span className="font-sans text-[13px] font-semibold leading-[1.42] text-[#6A4AF0]">
                  {card.callout}
                </span>
              </div>
            </article>
          ))}
        </div>

        <CloudBanner className="mx-auto mt-[clamp(40px,4.5vw,60px)] w-fit max-w-[760px]">
          CloudPDF gives you the <em className="text-cp-blue not-italic">workflow layer</em>, not
          just the viewer.
        </CloudBanner>
      </div>
    </section>
  );
}
