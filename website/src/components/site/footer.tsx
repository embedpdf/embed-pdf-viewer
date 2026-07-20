import Image from 'next/image';
import Link from 'next/link';

import { GitHubIcon } from './icons';

const COLUMNS: { head: string; links: { label: string; href: string }[] }[] = [
  {
    head: 'Product',
    links: [
      { label: 'Ready-made Viewer', href: '/docs/viewer' },
      { label: 'Headless Components', href: '/docs/headless' },
      { label: 'Live Demo', href: '/demo' },
      { label: 'EmbedPDF Pro', href: '/pro' },
    ],
  },
  {
    head: 'Developers',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Quick Start', href: '/docs' },
      { label: 'GitHub', href: 'https://github.com/embedpdf/embed-pdf-viewer' },
      { label: 'Releases', href: 'https://github.com/embedpdf/embed-pdf-viewer/releases' },
    ],
  },
  {
    head: 'Community',
    links: [
      { label: 'Become a Sponsor', href: '/sponsors' },
      {
        label: 'Contributing',
        href: 'https://github.com/embedpdf/embed-pdf-viewer/blob/main/CONTRIBUTING.md',
      },
      { label: 'Discussions', href: 'https://github.com/embedpdf/embed-pdf-viewer/discussions' },
    ],
  },
  {
    head: 'Sister brand',
    links: [{ label: 'CloudPDF — Smart PDF Workflows', href: 'https://cloudpdf.com' }],
  },
];

export function Footer() {
  return (
    <footer className="bg-ep-navy w-full text-white">
      <div className="mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,80px)] py-[clamp(48px,6vw,80px)]">
        <div className="grid gap-12 min-[901px]:grid-cols-[minmax(240px,1.2fr)_repeat(4,minmax(0,1fr))]">
          <div className="flex flex-col items-start gap-5">
            <Image
              src="/embedpdf-icon-dark.svg"
              alt="EmbedPDF"
              width={40}
              height={40}
              className="h-10 w-auto"
            />
            <p className="m-0 max-w-[260px] font-sans text-sm leading-[1.6] text-[#9FB0D8]">
              The ultimate Open Source PDF viewer for JavaScript. Free Forever. Open Source.
            </p>
            <a
              href="https://github.com/embedpdf/embed-pdf-viewer"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="EmbedPDF on GitHub"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/15 text-white transition-colors duration-150 hover:border-white/30 hover:bg-white/10"
            >
              <GitHubIcon size={20} />
            </a>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.head} className="flex flex-col gap-3.5">
              <span className="font-display text-xs font-bold uppercase tracking-[0.08em] text-[#7BB2FF]">
                {col.head}
              </span>
              {col.links.map((link) =>
                link.href.startsWith('http') ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-sans text-sm text-[#C7D3EE] transition-colors duration-150 hover:text-white"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="font-sans text-sm text-[#C7D3EE] transition-colors duration-150 hover:text-white"
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </nav>
          ))}
        </div>

        <div className="mt-[clamp(40px,5vw,64px)] flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <span className="font-sans text-[13px] text-[#9FB0D8]">
            © {new Date().getFullYear()} EmbedPDF. Apache-2.0 licensed core — you own the code. No
            black boxes.
          </span>
          <span className="font-sans text-[13px] text-[#9FB0D8]">Open. Secure. Powerful.</span>
        </div>
      </div>
    </footer>
  );
}
