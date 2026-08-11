import type { Metadata } from 'next';

import {
  LegalCallout,
  LegalLink,
  LegalList,
  LegalPage,
  LegalParagraph,
  LegalSubheading,
  type LegalSection,
} from '@/components/site/legal-page';

export const metadata: Metadata = {
  title: 'Refund Policy — CloudPDF',
  description:
    'Cancellation and refund terms for CloudPDF managed-service and self-hosted subscriptions.',
};

const COMPANY = 'CloudPDF LTD';
const CONTACT_EMAIL = 'hello@cloudpdf.com';
const LAST_UPDATED = '11 August 2026';

const sections: readonly LegalSection[] = [
  {
    id: 'scope',
    title: 'Scope and relationship with Paddle',
    content: (
      <>
        <LegalParagraph>
          This Refund Policy applies to paid CloudPDF managed-service subscriptions and CloudPDF
          self-hosted commercial subscriptions purchased through Paddle. Open-source software, free
          trials, and unpaid evaluation licenses have no purchase price to refund.
        </LegalParagraph>
        <LegalParagraph>
          Paddle is the authorized reseller and Merchant of Record for these purchases. Paddle
          processes payments, cancellations, and approved refunds, while {COMPANY} remains the
          supplier, licensor, and service provider. This policy should be read with our{' '}
          <LegalLink href="/terms">Terms of Service</LegalLink>, the{' '}
          <LegalLink href="https://www.paddle.com/legal/buyer-terms">Paddle Buyer Terms</LegalLink>,
          and Paddle’s{' '}
          <LegalLink href="https://www.paddle.com/legal/refund-policy">Refund Policy</LegalLink>.
        </LegalParagraph>
        <LegalCallout>
          A signed agreement, accepted custom offer, order form, or checkout summary is an “Order”.
          Product-specific commercial terms in an Order control if they conflict with this policy,
          while Paddle’s terms govern the payment transaction and mandatory law always applies.
        </LegalCallout>
      </>
    ),
  },
  {
    id: 'managed-service',
    title: 'CloudPDF managed-service subscriptions',
    content: (
      <>
        <LegalSubheading>Free trial</LegalSubheading>
        <LegalParagraph>
          When a 14-day free trial is offered, you may cancel before the trial ends to avoid the
          first subscription charge. The exact trial end date and the subscription that follows are
          shown at signup or checkout. If you do not cancel in time, the paid subscription begins
          and Paddle charges the payment method on file.
        </LegalParagraph>

        <LegalSubheading>Cancellation</LegalSubheading>
        <LegalParagraph>
          You may cancel renewal through the available billing flow, Paddle, or by contacting us.
          Cancellation normally takes effect at the end of the current paid billing period. You
          retain access through that period, and no further renewal is charged. Canceling a
          subscription does not by itself refund a charge already made.
        </LegalParagraph>

        <LegalSubheading>Paid subscription charges</LegalSubheading>
        <LegalParagraph>
          Monthly and annual subscription charges are generally non-refundable once the paid term
          begins, and we do not automatically provide prorated refunds or credits for unused time.
          An annual subscription is an annual commitment even if pricing is also displayed as a
          monthly equivalent. The exceptions in the refund eligibility section below still apply.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'self-hosted',
    title: 'CloudPDF self-hosted subscriptions',
    content: (
      <>
        <LegalParagraph>
          Self-hosted commercial subscriptions are normally annual and sales-assisted. The
          applicable Order specifies the license term, authorized deployments, fees, support,
          renewal, and any setup, onboarding, implementation, or other services.
        </LegalParagraph>
        <LegalList>
          <li>
            An unpaid evaluation license has no purchase price to refund and expires according to
            its stated evaluation period.
          </li>
          <li>
            You may cancel future renewal using the method stated in the Order or by contacting us.
            Unless the Order says otherwise, the license and included support remain active through
            the paid term and end when that term expires.
          </li>
          <li>
            Recurring self-hosted subscription fees are generally non-refundable after the license
            term begins, with no automatic prorated refund for an unused part of the term.
          </li>
          <li>
            Setup, onboarding, implementation, and other one-time service fees are generally
            non-refundable after the applicable work has begun or been delivered.
          </li>
        </LegalList>
        <LegalParagraph>
          These rules are subject to the refund eligibility section below, any different remedy in
          your Order, and rights that cannot lawfully be excluded.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: 'When a refund may be available',
    content: (
      <>
        <LegalParagraph>You may request a full or partial refund where:</LegalParagraph>
        <LegalList>
          <li>a charge was duplicated or processed for an incorrect amount;</li>
          <li>
            a paid Service materially fails to conform to its documentation and we cannot correct
            the problem within a reasonable time after receiving enough information to investigate;
          </li>
          <li>
            your Order expressly provides a refund, service credit, or termination remedy in the
            relevant circumstances;
          </li>
          <li>mandatory consumer, cancellation, or statutory warranty law requires one; or</li>
          <li>Paddle approves a refund under its then-current refund policy.</li>
        </LegalList>
        <LegalParagraph>
          For a technical or licensing problem, please give us a reasonable opportunity to
          investigate and correct it first. A failure to cancel before a trial conversion or
          renewal, a change of mind, unused subscription time, an unsupported environment, or a
          problem in a customer-controlled integration does not by itself guarantee a refund.
        </LegalParagraph>
        <LegalParagraph>
          Paddle may consider discretionary requests submitted within the period stated in its{' '}
          <LegalLink href="https://www.paddle.com/legal/refund-policy">Refund Policy</LegalLink>.
          Submitting a request does not guarantee approval.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'requests',
    title: 'How to cancel or request a refund',
    content: (
      <>
        <LegalParagraph>
          To cancel a subscription or request a refund, use the subscription-management link in your
          Paddle receipt or billing email, contact Paddle through{' '}
          <LegalLink href="https://paddle.net">paddle.net</LegalLink>, or email us at{' '}
          <LegalLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</LegalLink>. Include the email
          address used for the purchase, the Paddle transaction or subscription number if available,
          and the reason for your request. Do not send payment-card details by email.
        </LegalParagraph>
        <LegalParagraph>
          Cancellation and a refund request are separate actions. If you want both, say so clearly.
          Refund requests may be reviewed by CloudPDF and/or Paddle under the applicable policy.
          Paddle processes any approved refund to the original payment method. Bank and card
          processing times may delay when the funds appear.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'after-refund',
    title: 'What happens after a refund',
    content: (
      <>
        <LegalParagraph>
          If a full refund is issued, access, paid entitlements, and commercial licenses associated
          with the refunded purchase may end immediately. For a refunded self-hosted subscription,
          you must stop using the commercial software and license materials when the refund or
          termination takes effect. If a partial refund or service credit is approved, we or Paddle
          will explain its effect on the subscription and access.
        </LegalParagraph>
        <LegalParagraph>
          A cancellation without a refund normally leaves access active until the end of the paid
          billing period. We may deny or reverse a refund obtained through fraud, material
          misrepresentation, or abuse, subject to Paddle’s processes and applicable law.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'mandatory-rights',
    title: 'Mandatory rights and policy changes',
    content: (
      <>
        <LegalParagraph>
          Nothing in this Refund Policy limits cancellation, refund, or warranty rights that cannot
          lawfully be limited. Those rights vary by location and may apply despite the general rules
          above.
        </LegalParagraph>
        <LegalParagraph>
          We may update this policy as our products, billing arrangements, or legal requirements
          change. The version presented with or applicable to your purchase governs to the extent
          permitted by law. Questions may be sent to{' '}
          <LegalLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</LegalLink>.
        </LegalParagraph>
      </>
    ),
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Refund Policy"
      description="Cancellation and refund terms for CloudPDF managed-service and self-hosted subscriptions."
      lastUpdated={LAST_UPDATED}
      sections={sections}
    />
  );
}
