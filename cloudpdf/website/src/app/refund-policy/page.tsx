import type { Metadata } from 'next';

import {
  LegalLink,
  LegalPage,
  LegalParagraph,
  type LegalSection,
} from '@/components/site/legal-page';

export const metadata: Metadata = {
  title: 'Refund Policy — CloudPDF',
  description:
    'Cancellation and refund terms for CloudPDF managed-service and self-hosted subscriptions.',
};

const CONTACT_EMAIL = 'hello@cloudpdf.com';
const LAST_UPDATED = '12 August 2026';

const sections: readonly LegalSection[] = [
  {
    id: 'refund-window',
    title: '14-day refund window',
    content: (
      <>
        <LegalParagraph>
          CloudPDF offers a 14-calendar-day refund window for CloudPDF managed-service and
          self-hosted subscriptions purchased through Paddle.
        </LegalParagraph>
        <LegalParagraph>
          You may request a full refund within 14 calendar days of the date of your initial purchase
          or any renewal transaction. You do not need to provide a reason.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'request-refund',
    title: 'How to request a refund',
    content: (
      <>
        <LegalParagraph>
          Submit your refund request no later than 14 calendar days after the transaction date shown
          on your Paddle receipt. You can use the “View receipt” or “Manage subscription” link in
          your Paddle transaction email, visit{' '}
          <LegalLink href="https://paddle.net">Paddle Buyer Support</LegalLink>, or email us at{' '}
          <LegalLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</LegalLink>.
        </LegalParagraph>
        <LegalParagraph>
          Include the email address used for the purchase and the Paddle transaction or subscription
          number if available. Do not send payment-card details by email.
        </LegalParagraph>
        <LegalParagraph>
          Paddle processes refunds to the original payment method. Bank and card processing times
          may affect when the refunded funds appear in your account.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'cancellation',
    title: 'Subscription cancellation',
    content: (
      <>
        <LegalParagraph>
          You may cancel a subscription at any time to prevent future renewal. Unless a refund is
          issued, cancellation normally takes effect at the end of the current paid billing period
          and access continues until that date.
        </LegalParagraph>
        <LegalParagraph>
          Cancellation and a refund request are separate actions. If you are within the 14-day
          refund window and want a refund as well as cancellation, submit a refund request using one
          of the methods above.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'after-refund',
    title: 'What happens after a refund',
    content: (
      <LegalParagraph>
        When a transaction is fully refunded, the corresponding CloudPDF subscription, service
        access, and commercial license end. For a refunded self-hosted subscription, you must stop
        using the commercial software and associated license materials.
      </LegalParagraph>
    ),
  },
  {
    id: 'paddle',
    title: 'Paddle and mandatory rights',
    content: (
      <>
        <LegalParagraph>
          Our order process is conducted by our online reseller Paddle.com. Paddle.com is the
          Merchant of Record for all our orders. Paddle provides all customer service inquiries and
          handles returns.
        </LegalParagraph>
        <LegalParagraph>
          Transactions outside the 14-day refund window are non-refundable except where required by
          applicable law or Paddle’s{' '}
          <LegalLink href="https://www.paddle.com/legal/refund-policy">Refund Policy</LegalLink>.
          Nothing in this policy limits mandatory consumer, cancellation, refund, or warranty
          rights.
        </LegalParagraph>
        <LegalParagraph>
          This policy should be read with our <LegalLink href="/terms">Terms of Service</LegalLink>,
          the{' '}
          <LegalLink href="https://www.paddle.com/legal/buyer-terms">Paddle Buyer Terms</LegalLink>,
          and Paddle’s{' '}
          <LegalLink href="https://www.paddle.com/legal/refund-policy">Refund Policy</LegalLink>.
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
      description="A clear 14-day refund policy for CloudPDF managed-service and self-hosted subscriptions."
      lastUpdated={LAST_UPDATED}
      sections={sections}
    />
  );
}
