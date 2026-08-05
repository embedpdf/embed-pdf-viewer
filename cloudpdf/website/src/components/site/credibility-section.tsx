import Link from 'next/link';

// Card base shared across the bento. Padding is applied per-card because the
// deploy card uses a larger, asymmetric padding. The "hover-up" translateY has
// been intentionally dropped — hover only shifts border + shadow, matching the
// other home sections.
const CARD =
  'border-cp-border relative overflow-hidden rounded-[22px] border bg-white shadow-[0_1px_2px_rgba(10,26,77,0.04)] transition-all duration-200 hover:border-[#D8E4FB] hover:shadow-[0_24px_46px_-24px_rgba(10,26,77,0.26),0_3px_10px_rgba(10,26,77,0.05)]';
const CARD_PAD = 'p-[clamp(26px,2.4vw,34px)]';

const GITHUB_PATH =
  'M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.21 11.16.6.11.82-.25.82-.56v-2.16c-3.34.71-4.04-1.57-4.04-1.57-.55-1.36-1.34-1.72-1.34-1.72-1.09-.72.08-.71.08-.71 1.2.08 1.84 1.21 1.84 1.21 1.07 1.78 2.81 1.27 3.49.97.11-.76.42-1.27.76-1.56-2.67-.29-5.47-1.29-5.47-5.74 0-1.27.46-2.31 1.21-3.12-.12-.29-.53-1.46.11-3.05 0 0 .98-.31 3.2 1.19a11.5 11.5 0 0 1 5.83 0c2.22-1.5 3.2-1.19 3.2-1.19.64 1.59.24 2.76.12 3.05.76.81 1.21 1.85 1.21 3.12 0 4.46-2.81 5.45-5.49 5.73.43.36.81 1.09.81 2.2v3.26c0 .31.22.68.83.56C20.57 21.88 24 17.48 24 12.29 24 5.78 18.63.5 12 .5z';
const STAR_PATH = 'M12 2.5l2.7 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16.9 6.3 19.6l1.4-6.3L2.9 9l6.4-.6z';

/**
 * Decorative dotted grid for the bento cards. The home-wide `cp-dots-fine`
 * utility is too coarse for these small in-card accents, so we inline the
 * radial-gradient pattern and size it per use.
 */
function CredDots({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute bg-repeat [background-image:radial-gradient(circle,currentColor_2.2px,transparent_2.6px)] ${className ?? ''}`}
    />
  );
}

export function CredibilitySection() {
  return (
    <section className="relative w-full overflow-clip bg-[linear-gradient(180deg,#FBFCFE_0%,#F4F7FE_52%,#F1F5FE_100%)] py-[clamp(64px,8vw,112px)] pb-[clamp(72px,9vw,124px)]">
      {/* decorations */}
      <div className="cp-dots-fine pointer-events-none absolute left-[clamp(16px,3vw,64px)] top-[clamp(96px,11vw,150px)] z-[1] h-24 w-[120px] text-[#C2D6F7] max-[1180px]:hidden" />
      <div className="cp-dots-fine pointer-events-none absolute right-[clamp(16px,3vw,64px)] top-[clamp(220px,24vw,300px)] z-[1] h-24 w-[120px] text-[#C2D6F7] [mask-image:linear-gradient(255deg,#000_30%,transparent_92%)] max-[1180px]:hidden" />

      <div className="relative z-[2] mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,78px)]">
        {/* heading */}
        <div className="text-center">
          <span className="font-display mb-[22px] inline-block rounded-full bg-[#7A5AF8]/10 px-4 py-[9px] text-[12px] font-extrabold uppercase leading-none tracking-[0.12em] text-[#7A5AF8]">
            Proof &amp; Trust
          </span>
          <h2 className="font-display text-cp-navy m-0 text-balance text-[clamp(34px,4.4vw,56px)] font-extrabold leading-[1.04] tracking-[-0.02em]">
            The credibility
            <br />
            behind <em className="text-cp-blue not-italic">CloudPDF.</em>
          </h2>
          <p className="text-cp-muted mx-auto mt-5 max-w-[540px] text-pretty font-sans text-[clamp(16px,1.3vw,18px)] leading-[1.6]">
            Open source at our core. Trusted by developers. Built for production. Backed by a
            growing community.
          </p>
        </div>

        {/* bento */}
        <div className="mt-[clamp(40px,5vw,60px)] flex flex-col gap-[clamp(16px,1.6vw,22px)]">
          {/* ROW 1: GitHub + npm */}
          <div className="grid gap-[clamp(16px,1.6vw,22px)] min-[881px]:grid-cols-2">
            {/* GitHub stars */}
            <article
              className={`${CARD} ${CARD_PAD} grid grid-cols-[1fr_auto] items-center gap-5 max-[480px]:grid-cols-1`}
            >
              <div className="relative z-[2] min-w-0">
                <div className="font-display text-cp-blue text-[clamp(46px,4.4vw,58px)] font-extrabold leading-[0.95] tracking-[-0.03em]">
                  4k+
                </div>
                <h3 className="font-display text-cp-navy mt-[7px] text-[21px] font-extrabold leading-[1.18] tracking-[-0.014em]">
                  GitHub stars
                </h3>
                <p className="text-cp-ink mt-[13px] font-sans text-[14.5px] leading-[1.55]">
                  Join thousands of developers building with CloudPDF.
                </p>
                <Link
                  href="#"
                  className="border-cp-border text-cp-blue hover:text-cp-blue600 group mt-[22px] inline-flex h-11 items-center gap-2.5 whitespace-nowrap rounded-[10px] border-[1.5px] bg-white px-5 font-sans text-[14px] font-bold no-underline transition-all duration-200 hover:border-[#BCD2FB] hover:shadow-[0_10px_22px_-12px_rgba(22,119,255,0.4)]"
                >
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
                    <path d={GITHUB_PATH} />
                  </svg>
                  <span>Star on GitHub</span>
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-transform group-hover:translate-x-[3px]"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </div>
              <div className="relative shrink-0 self-center max-[480px]:hidden">
                <div className="relative h-[188px] w-[196px]">
                  <span className="absolute right-1.5 top-[-6px] z-0 h-24 w-24 rounded-full bg-[#F4F8FE]" />
                  <span className="absolute right-[70px] top-[30px] z-0 h-16 w-16 rounded-full bg-[#EDF3FD]" />
                  <span className="absolute bottom-[-4px] right-[18px] z-0 h-[78px] w-[78px] rounded-full bg-[#F6FAFE]" />
                  <CredDots className="bottom-0.5 right-2 z-[1] h-11 w-16 text-[#B9CFF7] [background-size:14px_14px]" />
                  <div className="absolute right-[26px] top-[42px] z-[2] flex h-[108px] w-[108px] items-center justify-center rounded-full border border-[#EEF2FA] bg-white shadow-[0_16px_34px_-14px_rgba(10,26,77,0.30),0_2px_6px_rgba(10,26,77,0.06)]">
                    <svg
                      width={60}
                      height={60}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="text-[#18181B]"
                    >
                      <path d={GITHUB_PATH} />
                    </svg>
                  </div>
                  <svg
                    width={26}
                    height={26}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="text-cp-blue absolute left-2.5 top-[30px] z-[3] [filter:drop-shadow(0_6px_12px_rgba(22,119,255,0.35))]"
                  >
                    <path d={STAR_PATH} />
                  </svg>
                  <svg
                    width={20}
                    height={20}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="text-cp-blue absolute bottom-[26px] left-[30px] z-[3] [filter:drop-shadow(0_6px_12px_rgba(22,119,255,0.35))]"
                  >
                    <path d={STAR_PATH} />
                  </svg>
                </div>
              </div>
            </article>

            {/* npm downloads */}
            <article
              className={`${CARD} ${CARD_PAD} grid grid-cols-[1fr_auto] items-center gap-5 max-[480px]:grid-cols-1`}
            >
              <div className="relative z-[2] min-w-0">
                <div className="font-display text-cp-blue text-[clamp(46px,4.4vw,58px)] font-extrabold leading-[0.95] tracking-[-0.03em]">
                  1M
                </div>
                <h3 className="font-display text-cp-navy mt-[7px] text-[21px] font-extrabold leading-[1.18] tracking-[-0.014em]">
                  monthly
                  <br />
                  npm downloads
                </h3>
                <p className="text-cp-ink mt-[13px] font-sans text-[14.5px] leading-[1.55]">
                  Consistent adoption and active usage by developers worldwide.
                </p>
              </div>
              <div className="relative shrink-0 self-center max-[480px]:hidden">
                <div className="relative h-[168px] w-[152px]">
                  <CredDots className="left-[-2px] top-0 z-[1] h-10 w-[46px] text-[#C7D9F9] [background-size:13px_13px]" />
                  <span className="absolute right-[-4px] top-2 z-0 h-[120px] w-[120px] rotate-[8deg] rounded-[30px] bg-[#F4F8FE]" />
                  <div className="absolute right-2 top-[18px] z-[2] flex h-[90px] w-[108px] items-center justify-center rounded-[18px] border border-[#EEF2FA] bg-white shadow-[0_16px_34px_-14px_rgba(10,26,77,0.28),0_2px_6px_rgba(10,26,77,0.06)]">
                    <svg
                      width={62}
                      viewBox="-90 -90 960 380"
                      aria-label="npm"
                      className="block h-auto"
                    >
                      <rect x="-90" y="-90" width="960" height="380" fill="#CB3837" rx="32" />
                      <path
                        fill="#fff"
                        d="M240,250h100v-50h100V0H240V250z M340,50h50v100h-50V50z M480,0v200h100V50h50v150h50V50h50v150h50V0H480z M0,200h100V50h50v150h50V0H0V200z"
                      />
                    </svg>
                  </div>
                  <div className="text-cp-blue absolute bottom-1.5 right-[-2px] z-[3] flex h-10 w-10 items-center justify-center rounded-full border border-[#EEF2FA] bg-white shadow-[0_10px_22px_-10px_rgba(22,119,255,0.4)]">
                    <svg
                      width={18}
                      height={18}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 4v12M7 11l5 5 5-5" />
                      <path d="M5 20h14" />
                    </svg>
                  </div>
                </div>
              </div>
            </article>
          </div>

          {/* ROW 2: PDF Association + testimonial + PDFium */}
          <div className="grid gap-[clamp(16px,1.6vw,22px)] min-[881px]:grid-cols-[1fr_1fr_1.3fr]">
            {/* PDF Association member */}
            <article className={`${CARD} ${CARD_PAD}`}>
              <CredDots className="right-[22px] top-[26px] z-[1] h-10 w-[52px] text-[#CBDBF8] [background-size:13px_13px]" />
              <span className="text-cp-blue flex h-[60px] w-[60px] items-center justify-center rounded-full border border-[#EEF2FA] bg-white shadow-[0_12px_26px_-12px_rgba(22,119,255,0.34),0_2px_6px_rgba(10,26,77,0.05)]">
                <img
                  src="/credibility-section/pdf-association.svg"
                  alt="PDF Association"
                  className="block h-[30px] w-[30px]"
                />
              </span>
              <div className="font-display text-cp-blue mt-[30px] text-[clamp(38px,3.6vw,46px)] font-extrabold leading-[0.95] tracking-[-0.03em]">
                PDF
              </div>
              <h3 className="font-display text-cp-navy mt-[7px] text-[21px] font-extrabold leading-[1.18] tracking-[-0.014em]">
                Association
                <br />
                member
              </h3>
              <p className="text-cp-ink mt-[13px] font-sans text-[14.5px] leading-[1.55]">
                Proud member of the PDF Association, advancing the future of PDF.
              </p>
              <Link
                href="https://pdfa.org"
                className="text-cp-blue hover:text-cp-blue600 group/link mt-4 inline-flex items-center gap-1.5 font-sans text-[14px] font-bold no-underline transition-colors"
              >
                pdfa.org
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform group-hover/link:translate-x-[2px]"
                >
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </Link>
            </article>

            {/* testimonial */}
            <article className={`${CARD} ${CARD_PAD} flex h-full flex-col`}>
              <div className="font-serif text-[64px] font-extrabold leading-[0.6] text-[#C3B4F4]">
                &ldquo;
              </div>
              <p className="text-cp-ink mt-4 flex-[1_0_auto] font-sans text-[15px] font-medium leading-[1.6] tracking-[-0.005em]">
                CloudPDF has been rock solid in our stack. The API is clean, reliable, and the team
                ships incredibly fast.
              </p>
              <div className="mt-[22px] flex items-center gap-3">
                <img
                  src="/avatar-1.png"
                  alt="Alex M."
                  className="h-[42px] w-[42px] rounded-full border-2 border-white bg-[#E4EAF4] object-cover shadow-[0_2px_8px_rgba(10,26,77,0.12)]"
                />
                <div>
                  <div className="font-display text-cp-navy text-[14px] font-extrabold leading-[1.2]">
                    Alex M.
                  </div>
                  <div className="text-cp-muted mt-0.5 font-sans text-[12.5px] font-medium leading-[1.2]">
                    Lead Engineer
                  </div>
                </div>
              </div>
            </article>

            {/* Built on PDFium */}
            <article
              className={`${CARD} ${CARD_PAD} grid grid-cols-[1fr_auto] items-center gap-4 max-[460px]:grid-cols-1 min-[881px]:min-h-[200px]`}
            >
              <div className="relative z-[2] min-w-0">
                <div className="font-display text-cp-navy text-[26px] font-extrabold leading-[1.15] tracking-[-0.018em]">
                  Built on <em className="text-cp-blue not-italic">PDFium</em>
                </div>
                <p className="text-cp-ink mt-[13px] font-sans text-[14.5px] leading-[1.55]">
                  Powered by the Chromium PDF engine for speed, fidelity, and compatibility.
                </p>
              </div>
              <CredDots className="right-[26px] top-6 z-0 h-[38px] w-[50px] text-[#C5D6F6] [background-size:13px_13px] max-[460px]:hidden" />
              <img
                src="/credibility-section/pdfium.svg"
                alt=""
                className="relative z-[1] h-auto w-[clamp(150px,11vw,184px)] select-none self-center [pointer-events:none] max-[460px]:hidden"
              />
            </article>
          </div>

          {/* ROW 3: Deploy SaaS or self-hosted */}
          <article
            className={`${CARD} grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)] items-center gap-[clamp(24px,3vw,44px)] p-[clamp(28px,3vw,40px)_clamp(28px,3.4vw,46px)] max-[760px]:grid-cols-1`}
          >
            <div>
              <div className="font-display text-cp-navy text-[clamp(26px,2.4vw,32px)] font-extrabold leading-[1.12] tracking-[-0.018em]">
                Deploy <em className="text-cp-blue not-italic">SaaS</em> or{' '}
                <em className="text-cp-blue not-italic">self-hosted</em>
              </div>
              <p className="text-cp-ink mt-[13px] max-w-[340px] font-sans text-[clamp(14.5px,1.1vw,16px)] leading-[1.55]">
                Use our managed SaaS or deploy anywhere with full control.
              </p>
            </div>
            <div className="flex items-center justify-center">
              <img
                src="/credibility-section/deploy-flow.svg"
                alt="Managed SaaS connects through CloudPDF to your self-hosted deployment"
                className="block h-auto w-full max-w-[660px]"
              />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
