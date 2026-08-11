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
  title: 'Terms of Service — CloudPDF',
  description:
    'Terms governing CloudPDF managed services, self-hosted software, evaluations, and EmbedPDF Pro.',
};

const COMPANY = 'CloudPDF LTD';
const CONTACT_EMAIL = 'hello@cloudpdf.com';
const LAST_UPDATED = '12 August 2026';

const sections: readonly LegalSection[] = [
  {
    id: 'agreement',
    title: 'Your agreement with CloudPDF',
    content: (
      <>
        <LegalParagraph>
          These Terms of Service (the “Terms”) govern access to and use of CloudPDF websites,
          accounts, hosted services, software, APIs, templates, downloads, documentation, support,
          evaluations, and related services (collectively, the “Services”). The Services are
          supplied by {COMPANY} (“CloudPDF”, “we”, “us”, or “our”). “You” means the individual
          accepting these Terms and the organization on whose behalf that individual acts.
        </LegalParagraph>
        <LegalParagraph>
          By creating an account, accepting an offer, placing an order, downloading commercial
          materials, activating a license, or using the Services, you agree to these Terms. If you
          do not agree, do not use the Services.
        </LegalParagraph>
        <LegalCallout>
          A signed commercial agreement, order form, accepted custom offer, checkout summary, or
          other ordering document is an “Order”. If an Order conflicts with these Terms, the Order
          controls for that purchase, but it does not reduce the 14-day refund right for a
          transaction processed through Paddle. Open-source code and separately licensed software
          remain governed by their applicable license files.
        </LegalCallout>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: 'Business use and authority',
    content: (
      <>
        <LegalParagraph>
          The Services are primarily intended for businesses and professional users. You must be at
          least 18 years old and legally able to enter into a contract. If you use the Services for
          a company or other organization, you represent that you have authority to bind it.
        </LegalParagraph>
        <LegalParagraph>
          You must provide accurate information and keep it current. We may ask for reasonable
          evidence of your identity, organization, purchasing authority, or intended use, including
          to prevent fraud, abuse, sanctions violations, or unauthorized license use.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts, organizations, and offer links',
    content: (
      <>
        <LegalList>
          <li>
            Each person must use their own verified email address and must keep passwords, login
            links, verification codes, API keys, and license materials secure.
          </li>
          <li>
            An account may belong to one or more organizations. Organization owners and
            administrators may manage members, billing, offers, licenses, content, and other
            settings for that organization.
          </li>
          <li>
            You are responsible for activity under your account and for users you authorize. Tell us
            promptly at {CONTACT_EMAIL} if you suspect unauthorized access.
          </li>
          <li>
            We may reject disposable, high-risk, or abusive email domains and may rate-limit or
            block registration and sign-in attempts to protect the Services.
          </li>
        </LegalList>
        <LegalSubheading>Transferable offer links</LegalSubheading>
        <LegalParagraph>
          A custom offer link may be forwarded within your organization so that an authorized
          colleague can review, claim, and accept it. Anyone with the link may be able to view the
          commercial summary. The first eligible verified user who claims an unclaimed offer may
          associate it with an organization. Keep offer links within the intended organization and
          only accept an offer if you are authorized to bind that organization.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'products',
    title: 'Product-specific terms',
    content: (
      <>
        <LegalSubheading>EmbedPDF open-source software</LegalSubheading>
        <LegalParagraph>
          Components identified as open source are licensed under the license included with the
          applicable repository or package. Those license terms, rather than these Terms, govern
          your use of those components. References to “open source” do not include commercial or
          enterprise files that carry a different license.
        </LegalParagraph>

        <LegalSubheading>EmbedPDF Pro</LegalSubheading>
        <LegalParagraph>
          EmbedPDF Pro provides paid access to commercial examples, templates, downloads, and
          related materials (“Pro Materials”). Preview content may be public, but downloading or
          using Pro Materials requires an eligible account and an active entitlement. Unless an
          Order says otherwise, a one-time purchase grants the purchasing organization a perpetual
          right to use the version of the Pro Materials supplied under the accompanying license.
          Hosted account access, future updates, new templates, and support are available only for
          as long as we continue to offer them and are not guaranteed perpetually.
        </LegalParagraph>

        <LegalSubheading>CloudPDF managed service</LegalSubheading>
        <LegalParagraph>
          The managed service hosts PDF infrastructure for you. Your plan or Order specifies the
          features, usage allowances, billing term, support, and any implementation or one-time
          services. You are responsible for your integrations, end-user permissions, and use of the
          APIs and viewer in your applications.
        </LegalParagraph>

        <LegalSubheading>CloudPDF self-hosted software</LegalSubheading>
        <LegalParagraph>
          Self-hosted software runs in infrastructure you control and requires a valid commercial
          license. Availability of source code does not by itself grant a right to use commercial
          code. Your Order and the applicable software license define authorized environments,
          deployments, term, usage allowances, support, and whether the license is connected or
          air-gapped.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'trials',
    title: 'Trials, evaluations, and development licenses',
    content: (
      <>
        <LegalParagraph>
          We may provide a free trial, evaluation license, sandbox, proof of concept, or development
          license. Its duration and restrictions are shown at signup, in the license, or in the
          applicable Order. Unless we expressly permit otherwise, evaluations and development
          licenses are for testing and development—not production use, resale, or customer-facing
          workloads.
        </LegalParagraph>
        <LegalParagraph>
          Trial and evaluation features may be limited, provided without a service-level commitment,
          and suspended when the evaluation ends. If a trial requires a payment method and is
          described as converting automatically, the paid subscription begins at the end of the
          trial unless you cancel before then.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'payments',
    title: 'Orders, Paddle, fees, and renewal',
    content: (
      <>
        <LegalSubheading>Paddle is the reseller and Merchant of Record</LegalSubheading>
        <LegalParagraph>
          We use Paddle to sell our paid products. When Paddle is identified at checkout, Paddle is
          the authorized reseller and Merchant of Record: your purchase and payment transaction is
          with Paddle, while CloudPDF remains the supplier, licensor, and service provider. The
          transaction is also governed by the{' '}
          <LegalLink href="https://www.paddle.com/legal/buyer-terms">Paddle Buyer Terms</LegalLink>{' '}
          and Paddle’s{' '}
          <LegalLink href="https://www.paddle.com/legal/refund-policy">Refund Policy</LegalLink> and{' '}
          <LegalLink href="https://www.paddle.com/legal/privacy">Privacy Policy</LegalLink>.
        </LegalParagraph>
        <LegalParagraph>
          Paddle handles checkout, payment methods, invoicing, receipts, applicable sales tax or
          VAT, and payment-related customer service. We do not receive or store your full card
          number or card security code.
        </LegalParagraph>

        <LegalSubheading>Charges and billing periods</LegalSubheading>
        <LegalList>
          <li>
            Fees, currency, taxes, billing interval, minimum commitment, and usage allowances are
            stated in the Order or checkout. A price shown as a monthly equivalent but “billed
            annually” is an annual commitment charged at the annual billing interval.
          </li>
          <li>
            Recurring subscriptions renew automatically for the stated interval until canceled. You
            authorize Paddle to charge the payment method on file for renewals and agreed usage,
            setup, or one-time fees.
          </li>
          <li>
            You may cancel future renewal through the available billing flow or by contacting us.
            Cancellation normally takes effect at the end of the paid term and prevents future
            renewal. Cancellation and requesting a refund are separate actions.
          </li>
          <li>
            You may request a full refund within 14 calendar days of an initial purchase or renewal
            transaction, as described in our{' '}
            <LegalLink href="/refund-policy">Refund Policy</LegalLink>. Nothing in these Terms
            limits rights that cannot lawfully be limited.
          </li>
        </LegalList>
        <LegalParagraph>
          If payment is overdue, reversed, disputed, or fails, we may suspend paid access after any
          legally required notice or grace period. You remain responsible for undisputed amounts due
          under an accepted Order.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'usage-licensing',
    title: 'Usage allowances and license enforcement',
    content: (
      <>
        <LegalParagraph>
          Plans and custom Orders may limit monthly PDF views, monthly document uploads, total
          storage, deployments, environments, or other expressly stated resources. Usage is measured
          as described in the applicable product documentation or Order. We may notify you as you
          approach a limit and may restrict additional usage, require an upgrade, or apply an agreed
          overage arrangement when a limit is reached.
        </LegalParagraph>
        <LegalSubheading>Connected self-hosted licenses</LegalSubheading>
        <LegalParagraph>
          Connected licenses periodically validate license status and may report license,
          installation, and aggregate usage information needed to operate the license, including
          monthly views, monthly uploads, and current storage. Reasonable offline grace may apply to
          temporary network or validation outages. A connected license does not become an air-gapped
          license merely because it is temporarily offline.
        </LegalParagraph>
        <LegalSubheading>Air-gapped self-hosted licenses</LegalSubheading>
        <LegalParagraph>
          Air-gapped licenses use signed offline artifacts and do not automatically transmit
          telemetry. Activation, renewal, or material license changes require the manual exchange of
          an offline request and a signed response. Because an air-gapped environment cannot receive
          real-time updates, suspension, revocation, renewal, or changed limits take effect when a
          replacement artifact is installed or the current artifact expires, as applicable.
        </LegalParagraph>
        <LegalParagraph>
          You must not bypass, remove, disable, falsify, or interfere with license validation,
          metering, signed artifacts, deployment limits, or other technical controls in commercial
          software. You may not use a license in a deployment mode or environment for which it was
          not issued.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'content-data',
    title: 'Customer content and data protection',
    content: (
      <>
        <LegalParagraph>
          You retain ownership of PDFs, files, data, code, configurations, and other content you or
          your users submit to the Services (“Customer Content”). You grant us the limited rights
          needed to host, copy, process, transmit, and display Customer Content solely to provide,
          secure, support, and improve the Services and to comply with law.
        </LegalParagraph>
        <LegalList>
          <li>
            You must have all rights, notices, consents, and lawful bases needed to submit and
            process Customer Content, including personal data belonging to your end users.
          </li>
          <li>
            You control document visibility, viewer permissions, signed URLs, access tokens, API
            keys, sharing settings, retention decisions, and user access within your organization.
          </li>
          <li>
            For self-hosted deployments, you are responsible for the security, backup, operation,
            and legal compliance of your own infrastructure.
          </li>
        </LegalList>
        <LegalParagraph>
          Our handling of personal data as an independent controller is described in our{' '}
          <LegalLink href="/privacy">Privacy Policy</LegalLink>. Where we process personal data in
          Customer Content on your behalf, the applicable data processing agreement or signed
          commercial agreement governs that processing.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    content: (
      <>
        <LegalParagraph>You must not use the Services to:</LegalParagraph>
        <LegalList>
          <li>
            violate law, sanctions, export controls, privacy rights, or intellectual property;
          </li>
          <li>
            store, distribute, or facilitate malware, phishing, fraud, exploitation, or unlawful
            content;
          </li>
          <li>
            gain unauthorized access, probe security without permission, disrupt systems, or impose
            an unreasonable load;
          </li>
          <li>
            share credentials or commercial downloads outside the licensed organization, resell the
            Services except under a written partner agreement, or misrepresent affiliation with
            CloudPDF;
          </li>
          <li>
            copy, modify, reverse engineer, or create derivative works from commercial software
            except as expressly permitted by its license or by non-waivable law. This restriction
            does not override rights granted under an applicable open-source license.
          </li>
        </LegalList>
        <LegalParagraph>
          We may investigate suspected abuse and cooperate with a valid legal request. We will use
          reasonable judgment and, where practical, give notice before suspending a legitimate
          customer for an alleged violation.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'intellectual-property',
    title: 'Intellectual property',
    content: (
      <>
        <LegalParagraph>
          Except for Customer Content and third-party or open-source materials, CloudPDF and its
          licensors own the Services, software, documentation, designs, trademarks, and related
          intellectual property. Your rights are limited to those expressly granted by these Terms,
          an Order, and the applicable software license.
        </LegalParagraph>
        <LegalParagraph>
          If you voluntarily provide feedback or suggestions, you grant us a worldwide, perpetual,
          irrevocable, royalty-free right to use them without restriction or obligation. We will not
          identify you publicly as the source without permission.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'security-confidentiality',
    title: 'Security and confidentiality',
    content: (
      <>
        <LegalParagraph>
          We maintain reasonable technical and organizational safeguards designed to protect the
          Services and personal data. No online service is completely secure, and you are
          responsible for using the security features available to you and securely configuring your
          integration.
        </LegalParagraph>
        <LegalParagraph>
          Each party may receive non-public information that a reasonable person would understand to
          be confidential. The receiving party will use it only to perform or receive the Services,
          protect it using reasonable care, and disclose it only to personnel and service providers
          who need it and are bound by confidentiality obligations. These duties do not apply to
          information that is public through no breach, already lawfully known, independently
          developed, or lawfully received from another source.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'service-operation',
    title: 'Availability, support, and changes',
    content: (
      <>
        <LegalParagraph>
          We aim to provide reliable Services, but maintenance, security events, upstream provider
          failures, internet conditions, and events outside our reasonable control may cause
          interruptions. Any service levels, support response times, maintenance commitments, or
          remedies apply only if stated in an Order or signed agreement.
        </LegalParagraph>
        <LegalParagraph>
          We may improve or modify the Services. During a paid term, we will not intentionally make
          a material reduction to the core functionality you purchased without a reasonable
          alternative, migration path, credit, or termination right where appropriate. We may make
          immediate changes needed for security, law, or third-party platform requirements.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'suspension-termination',
    title: 'Suspension and termination',
    content: (
      <>
        <LegalParagraph>
          You may stop using the Services at any time and may cancel renewal as described above.
          Either party may terminate an Order for a material breach that is not cured within a
          reasonable written cure period, unless the breach cannot be cured or immediate action is
          reasonably required for security or law.
        </LegalParagraph>
        <LegalParagraph>
          We may suspend access for non-payment, an expired license, material overuse, security
          risk, unlawful conduct, or a material breach. We will limit suspension to the affected
          Service where reasonably possible. On termination or expiry, your right to use the
          affected paid Service ends, except for rights expressly stated to be perpetual and subject
          to their license.
        </LegalParagraph>
        <LegalParagraph>
          Before a managed-service subscription ends, you should export Customer Content using the
          available tools. We may delete Customer Content after termination in accordance with the
          applicable Order, data processing agreement, and our retention process. Sections that by
          their nature should survive—including payment obligations, intellectual property,
          confidentiality, disclaimers, and liability limits—will survive.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'warranties-liability',
    title: 'Warranties and liability',
    content: (
      <>
        <LegalSubheading>Limited warranty and disclaimers</LegalSubheading>
        <LegalParagraph>
          We warrant that paid Services will materially conform to their documentation during the
          paid term and that we will provide them with reasonable skill and care. Your exclusive
          remedy for a breach of this warranty is for us to correct the non-conformity or, if we
          cannot do so within a reasonable time, allow termination of the affected Order and refund
          prepaid fees for the unused remainder of its term.
        </LegalParagraph>
        <LegalParagraph>
          Except for that express warranty and to the maximum extent permitted by law, the Services
          are provided “as is” and “as available”. We disclaim implied warranties of
          merchantability, fitness for a particular purpose, non-infringement, and uninterrupted or
          error-free operation. Trials, evaluations, preview features, and open-source components
          are provided without warranty except as required by their licenses or law.
        </LegalParagraph>

        <LegalSubheading>Limitation of liability</LegalSubheading>
        <LegalParagraph>
          To the maximum extent permitted by law, neither party is liable for indirect, incidental,
          special, exemplary, punitive, or consequential loss, or for lost profits, revenue,
          business, goodwill, or data, arising from these Terms—even if advised that such loss was
          possible. Each party’s total aggregate liability arising from the affected Service will
          not exceed the amount paid or payable for that Service in the 12 months before the event
          giving rise to liability. For a one-time purchase made less than 12 months earlier, the
          cap is the amount paid for that purchase.
        </LegalParagraph>
        <LegalParagraph>
          These exclusions and caps do not apply to fraud, fraudulent misrepresentation, death or
          personal injury caused by negligence, breach of confidentiality, your misuse of our
          intellectual property or licensing controls, amounts payable under an Order, or any
          liability that cannot lawfully be excluded or limited.
        </LegalParagraph>

        <LegalSubheading>Indemnity</LegalSubheading>
        <LegalParagraph>
          You will defend and indemnify CloudPDF against a third-party claim arising from Customer
          Content, your application, your unlawful use of the Services, or your material breach of
          these Terms, to the extent caused by you. We will promptly notify you and allow you to
          control the defense, subject to our right to participate and approve any settlement that
          admits fault or imposes obligations on us.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'general',
    title: 'General terms and contact',
    content: (
      <>
        <LegalList>
          <li>
            <strong>Changes to these Terms.</strong> We may update these Terms. We will post the new
            date and give reasonable advance notice of a material change affecting an active paid
            Service. Material changes normally apply at the next renewal unless required earlier by
            law or security.
          </li>
          <li>
            <strong>Assignment.</strong> You may not assign an Order without our written consent,
            except in connection with a merger or sale of substantially all relevant assets and with
            written notice. We may assign these Terms as part of a reorganization, financing,
            merger, acquisition, or sale of our business.
          </li>
          <li>
            <strong>Notices.</strong> We may send operational and legal notices to the email
            associated with your account. Notices to us should be sent to {CONTACT_EMAIL}.
          </li>
          <li>
            <strong>Governing law.</strong> The governing law and courts stated in an Order apply.
            If an Order is silent, the laws and courts of the jurisdiction of CloudPDF’s registered
            office apply, without regard to conflict-of-laws rules. Mandatory local rights remain
            unaffected.
          </li>
          <li>
            <strong>Entire agreement.</strong> These Terms, the applicable Order, product license,
            privacy terms, and any signed agreement form the entire agreement about the Services. If
            a provision is unenforceable, the remaining provisions continue. A failure to enforce a
            provision is not a waiver.
          </li>
        </LegalList>
        <LegalCallout>
          Questions about these Terms or a commercial Order? Email{' '}
          <a
            className="text-cp-blue hover:text-cp-blue700 font-bold underline underline-offset-4"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
          .
        </LegalCallout>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      description="The rules for using CloudPDF managed services, self-hosted software, evaluations, and EmbedPDF Pro."
      lastUpdated={LAST_UPDATED}
      sections={sections}
    />
  );
}
