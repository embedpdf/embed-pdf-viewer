import type { Metadata } from 'next';

import { ContactInquiryForm } from '@/components/site/contact-inquiry-form';

export const metadata: Metadata = {
  title: 'Contact CloudPDF',
  description: 'Contact the CloudPDF team with product, technical, billing, or general questions.',
};

export default function ContactPage() {
  return (
    <main className="bg-cp-bg relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[620px] bg-[radial-gradient(circle_at_20%_15%,rgba(22,119,255,0.14),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(124,92,252,0.12),transparent_32%)]"
      />
      {/*
        Site-standard container (max-w-1440 + 4vw/78px padding) so the heading
        lines up with the logo and nav above it. The column split matches
        build-section's 0.86/1.14 — the extra width lands on the copy, the form
        keeps the width it already had.
      */}
      <section className="relative mx-auto grid w-full max-w-[1440px] gap-12 px-[clamp(20px,4vw,78px)] py-[clamp(64px,8vw,112px)] lg:grid-cols-[minmax(280px,0.86fr)_minmax(520px,1.14fr)] lg:items-start">
        <div className="lg:sticky lg:top-32">
          <span className="bg-cp-surface font-display text-cp-blue inline-flex rounded-full border border-[#D4E4FF] px-4 py-2 text-sm font-bold">
            Contact CloudPDF
          </span>
          {/*
            4.4vw, not 5vw: this h1 sits in a column ~43% of the viewport, so a
            viewport-scaled size over-reaches in the tight two-column range.
            Still hits the same 66px cap on wide screens.
          */}
          <h1 className="font-display text-cp-navy mt-6 text-[clamp(42px,4.4vw,66px)] font-extrabold leading-[1.02] tracking-[-0.045em]">
            Ask us anything about CloudPDF.
          </h1>
          <p className="text-cp-muted mt-6 max-w-xl text-lg leading-8">
            Use this form for product, technical, billing, partnership, privacy, or general
            questions. For pricing and enterprise evaluations, use Contact sales instead.
          </p>

          <div className="mt-9 grid gap-4">
            {[
              [
                'A real person answers',
                'Your message goes to the people who build CloudPDF, not a support queue.',
              ],
              [
                'A reply, not a receipt',
                'Most questions get a proper written answer within one business day.',
              ],
              [
                'No marketing spam',
                'We use your email to answer your question, not to add you to a mailing list.',
              ],
            ].map(([title, description]) => (
              <div className="flex gap-3" key={title}>
                <span className="bg-cp-blue mt-2 size-2 shrink-0 rounded-full shadow-[0_0_0_5px_rgba(22,119,255,0.1)]" />
                <div>
                  <h2 className="text-cp-navy font-bold">{title}</h2>
                  <p className="text-cp-muted mt-1 text-sm leading-6">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <ContactInquiryForm />
      </section>
    </main>
  );
}
