'use client';

import { CpButton } from '@/components/site/button';
import { useSalesDialog } from '@/components/site/sales-dialog';
import { LICENSE_CTA_COPY } from '@/lib/license-cta-copy';

/**
 * Authored license CTA for docs pages: opens the existing contact-sales
 * dialog with the self-hosted product pre-selected. Docs pages render
 * inside the root layout's SalesDialogProvider, so the dialog is always
 * available here. Copy defaults come from the shared module so the
 * Markdown projection (`lib/license-cta-markdown.ts`) renders the same
 * content source.
 */
export function LicenseCta({
  placement = 'docs-license-cta',
  title = LICENSE_CTA_COPY.title,
  children,
}: {
  placement?: string;
  title?: string;
  children?: React.ReactNode;
}) {
  const { openSalesDialog } = useSalesDialog();
  return (
    <div className="border-cp-border my-6 flex flex-col items-start gap-4 rounded-[14px] border bg-[#F8FAFE] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-display text-cp-navy m-0 text-[15px] font-bold">{title}</p>
        <p className="text-cp-muted m-0 mt-1 font-sans text-[13.5px] leading-relaxed">
          {children ?? LICENSE_CTA_COPY.body}
        </p>
      </div>
      <CpButton
        size="sm"
        onClick={() =>
          openSalesDialog({ placement, productInterest: 'cloudpdf-self-hosted' })
        }
      >
        {LICENSE_CTA_COPY.action}
      </CpButton>
    </div>
  );
}
