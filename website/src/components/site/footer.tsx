import Image from 'next/image';
import Link from 'next/link';

import { ArrowRightIcon, DiscordIcon, GitHubIcon } from './icons';
import { PRO_LAUNCHED } from './launch';
import { TOOLS } from '../tools/content';

const COLUMNS: { head: string; links: { label: string; href: string }[] }[] = [
  {
    head: 'Product',
    links: [
      { label: 'Ready-made Viewer', href: '/docs/viewer' },
      { label: 'Headless Components', href: '/docs/headless' },
      { label: 'Live Demo', href: '/demo' },
      ...(PRO_LAUNCHED ? [{ label: 'EmbedPDF Pro', href: '/pro' }] : []),
    ],
  },
  {
    head: 'Frameworks',
    links: [
      { label: 'React PDF Viewer', href: '/react-pdf-viewer' },
      { label: 'Vue PDF Viewer', href: '/vue-pdf-viewer' },
      { label: 'Svelte PDF Viewer', href: '/svelte-pdf-viewer' },
      { label: 'Angular PDF Viewer', href: '/angular-pdf-viewer' },
    ],
  },
  {
    head: 'Developers',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Quick Start', href: '/docs' },
      { label: 'Docs for EmbedPDF 2.x', href: 'https://v2.embedpdf.com/docs' },
      { label: 'GitHub', href: 'https://github.com/embedpdf/embed-pdf-viewer' },
      { label: 'Releases', href: 'https://github.com/embedpdf/embed-pdf-viewer/releases' },
    ],
  },
  {
    head: 'Community',
    links: [
      { label: 'Become a Sponsor', href: '/sponsorship' },
      { label: 'Our Sponsors', href: '/sponsors' },
      {
        label: 'Contributing',
        href: 'https://github.com/embedpdf/embed-pdf-viewer/blob/main/CONTRIBUTING.md',
      },
      { label: 'Discussions', href: 'https://github.com/embedpdf/embed-pdf-viewer/discussions' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-ep-navy w-full text-white">
      <div className="mx-auto w-full max-w-[1440px] px-[clamp(20px,4vw,80px)] py-[clamp(48px,6vw,80px)]">
        <div className="grid gap-12 min-[901px]:grid-cols-3 min-[1181px]:grid-cols-[minmax(220px,1.1fr)_repeat(4,minmax(0,1fr))]">
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
            <div className="flex items-center gap-2.5">
              <a
                href="https://github.com/embedpdf/embed-pdf-viewer"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="EmbedPDF on GitHub"
                className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/15 text-white transition-colors duration-150 hover:border-white/30 hover:bg-white/10"
              >
                <GitHubIcon size={20} />
              </a>
              <a
                href="https://discord.com/invite/mHHABmmuVU"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="EmbedPDF on Discord"
                className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/15 text-white transition-colors duration-150 hover:border-white/30 hover:bg-white/10"
              >
                <DiscordIcon size={20} />
              </a>
            </div>
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

        {/* The free tools get a row of their own: the full name fits, and the columns keep their width. */}
        <nav
          aria-label="Open source PDF tools"
          className="mt-[clamp(40px,5vw,64px)] flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6"
        >
          <Link
            href="/tools"
            className="font-display w-full text-xs font-bold uppercase tracking-[0.08em] text-[#7BB2FF] transition-colors duration-150 hover:text-white min-[761px]:w-auto"
          >
            Open source PDF tools
          </Link>
          {TOOLS.map((tool) => (
            <Link
              key={tool.slug}
              href={tool.href}
              className="font-sans text-sm text-[#C7D3EE] transition-colors duration-150 hover:text-white"
            >
              {tool.name}
            </Link>
          ))}
        </nav>

        {/* CloudPDF made EmbedPDF: say so, and point to the product for apps that need a backend.
            Its own band, so it doesn't read as part of the tools row. */}
        <div className="mt-6 border-t border-white/10 pt-6">
          <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6 min-[761px]:flex-row min-[761px]:items-center min-[761px]:justify-between min-[761px]:gap-10">
            <div className="flex flex-col items-start gap-3">
              <Image
                src="/cloudpdf-logo-dark.svg"
                alt="CloudPDF"
                width={156}
                height={24}
                className="h-6 w-auto"
              />
              <p className="m-0 max-w-[640px] font-sans text-sm leading-[1.6] text-[#C7D3EE]">
                EmbedPDF is created and maintained by CloudPDF. When your app needs a backend for
                its PDFs, CloudPDF adds storage, permissions, real-time collaboration and
                server-side processing, hosted or self-hosted.
              </p>
            </div>
            <a
              href="https://cloudpdf.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-shrink-0 items-center gap-2 self-start rounded-[10px] border border-white/15 px-4 py-2.5 font-sans text-sm font-semibold text-white transition-colors duration-150 hover:border-white/30 hover:bg-white/10 min-[761px]:self-center"
            >
              Explore CloudPDF
              <ArrowRightIcon size={16} />
            </a>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <span className="font-sans text-[13px] text-[#9FB0D8]">
            © {new Date().getFullYear()} CloudPDF LTD. EmbedPDF is open source under the Apache-2.0
            license.
          </span>
          <span className="font-sans text-[13px] text-[#9FB0D8]">Open. Secure. Powerful.</span>
        </div>
      </div>
    </footer>
  );
}
