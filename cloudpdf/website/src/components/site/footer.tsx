import Link from 'next/link';

const FOOTER_GROUPS = [
  {
    title: 'Product',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Contact', href: '/contact' },
      { label: 'EmbedPDF', href: 'https://www.embedpdf.com' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-[#142651] bg-[#07163E] text-white">
      <div className="mx-auto grid w-full max-w-[1440px] gap-12 px-[clamp(20px,4vw,78px)] py-14 min-[760px]:grid-cols-[minmax(280px,1.5fr)_1fr_1fr]">
        <div className="max-w-[460px]">
          <Link href="/" aria-label="CloudPDF home" className="inline-flex py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cloudpdf-logo-dark.svg" alt="CloudPDF" className="h-[34px] w-auto" />
          </Link>
          <p className="mt-5 text-[15px] leading-[1.7] text-[#B8C5E2]">
            Production-grade PDF infrastructure for modern applications, available as a managed
            service or self-hosted software.
          </p>
          <Link
            href="/contact"
            className="mt-5 inline-block font-semibold text-[#8FC3FF] underline decoration-[#3F6CA6] underline-offset-4 transition-colors hover:text-white"
          >
            Contact our team
          </Link>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="font-display text-sm font-extrabold uppercase tracking-[0.12em] text-[#7FA9DF]">
              {group.title}
            </p>
            <ul className="mt-4 space-y-3">
              {group.links.map((link) => {
                const external = link.href.startsWith('http');
                return (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[15px] font-medium text-[#D8E2F5] no-underline transition-colors hover:text-white"
                      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[#1A2C58]">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 px-[clamp(20px,4vw,78px)] py-5 text-xs text-[#8FA0C3] min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
          <p>© {new Date().getFullYear()} CloudPDF LTD. All rights reserved.</p>
          <p>Payments are securely processed by Paddle.</p>
        </div>
      </div>
    </footer>
  );
}
