import Link from 'next/link';
import type { ReactNode } from 'react';

type CloudPdfCalloutProps = {
  /** The one-line point, in the author's words. */
  title: string;
  /** Where the link goes, on cloudpdf.com. */
  href: string;
  /** The link's words. */
  cta: string;
  children: ReactNode;
};

/**
 * A pointer from the local engine's docs to CloudPDF, where the cloud engine
 * does something the local one can't. Every word is the author's (title,
 * body, link); this component adds only the mark and the look. Content uses
 * it inside `<Engine local>`, so the cloud site never compiles it.
 */
export function CloudPdfCallout({ title, href, cta, children }: CloudPdfCalloutProps) {
  return (
    <aside className="mt-7 max-w-[72ch] overflow-hidden rounded-[14px] border border-[#CFE3FB] bg-gradient-to-br from-[#F4F9FF] to-white">
      <div className="flex gap-4 px-5 py-[18px]">
        <span className="mt-0.5 inline-flex h-[30px] w-[42px] flex-shrink-0 items-center justify-center">
          <CloudMark />
        </span>
        <div className="min-w-0">
          <p className="font-display m-0 text-[15.5px] font-bold leading-[1.35] text-[#23278A]">
            {title}
          </p>
          <div className="mt-1.5 font-sans text-[15px] leading-[1.6] text-[#2A4574] [&>:first-child]:mt-0 [&_code]:text-[13.5px] [&_p]:mt-2">
            {children}
          </div>
          <Link
            href={href}
            className="mt-3 inline-flex items-center gap-1.5 font-sans text-[14.5px] font-semibold text-[#1189FA] no-underline hover:underline"
          >
            {cta}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}

/** The CloudPDF cloud, as on cloudpdf.com's favicon. */
function CloudMark() {
  return (
    <svg width={42} height={28} viewBox="0 0 160 107" fill="none" role="img" aria-label="CloudPDF">
      <path
        d="M71.1094 71.1094H142.224C142.224 51.474 126.302 35.5573 106.667 35.5573C106.667 15.9167 90.75 0 71.1094 0C51.474 0 35.5573 15.9167 35.5573 35.5573C15.9167 35.5573 0 51.474 0 71.1094C0 90.75 15.9167 106.667 35.5573 106.667C55.1927 106.667 71.1094 90.75 71.1094 71.1094Z"
        fill="#23278A"
      />
      <path
        d="M142.225 71.1094C142.225 90.75 126.303 106.667 106.668 106.667H124.444C144.085 106.667 160.001 90.75 160.001 71.1094H142.225Z"
        fill="#2CADF4"
      />
      <path
        d="M142.225 71.1094H71.1107C71.1107 90.75 55.194 106.667 35.5586 106.667H106.668C126.303 106.667 142.225 90.75 142.225 71.1094Z"
        fill="#1189FA"
      />
    </svg>
  );
}
