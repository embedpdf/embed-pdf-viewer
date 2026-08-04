import type { Metadata } from 'next';

import {
  LegalCallout,
  LegalLink,
  LegalList,
  LegalPage,
  LegalParagraph,
  LegalSubheading,
  LegalTable,
  type LegalSection,
} from '@/components/site/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy — CloudPDF',
  description:
    'How CloudPDF collects, uses, shares, and protects personal data across its websites and products.',
};

const COMPANY = 'CloudPDF LTD';
const CONTACT_EMAIL = 'hello@cloudpdf.com';
const LAST_UPDATED = '4 August 2026';

const sections: readonly LegalSection[] = [
  {
    id: 'scope',
    title: 'Who we are and what this policy covers',
    content: (
      <>
        <LegalParagraph>
          {COMPANY} (“CloudPDF”, “we”, “us”, or “our”) provides the CloudPDF managed service,
          CloudPDF self-hosted software, EmbedPDF Pro, related websites, account and commercial
          portals, APIs, support, evaluations, and licensing services (collectively, the
          “Services”).
        </LegalParagraph>
        <LegalParagraph>
          This Privacy Policy explains how we handle personal data when we decide why and how it is
          processed—for example, account, sales, licensing, website, security, and support data. In
          those situations, CloudPDF is the controller or business responsible for the personal
          data.
        </LegalParagraph>
        <LegalCallout>
          When a CloudPDF customer uses the managed service to process PDFs or end-user information
          on its own behalf, that customer normally decides why and how the data is used. CloudPDF
          acts as its processor or service provider under the applicable agreement. Requests about
          that Customer Content should first be directed to the relevant customer.
        </LegalCallout>
        <LegalParagraph>
          This Policy does not govern third-party websites or separately licensed open-source code
          that does not send personal data to CloudPDF.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'data-collected',
    title: 'Personal data we collect',
    content: (
      <>
        <LegalTable
          columns={['Category', 'Examples']}
          rows={[
            [
              'Account and identity',
              'Name, business email address, password hash, email-verification status, account identifiers, login and password-reset events, and authentication session information.',
            ],
            [
              'Organization and commercial',
              'Company or workspace name, organization type, memberships, roles, billing contact, offer recipients, accepted offers, evaluations, support plan, internal customer reference, and communications with sales or support.',
            ],
            [
              'Billing and transaction',
              'Billing name, company details, country, address, VAT or tax ID, Paddle customer, transaction and subscription identifiers, product, amount, currency, invoice status, and payment or refund status. CloudPDF does not receive or store full payment-card numbers or card security codes.',
            ],
            [
              'Technical and security',
              'IP address, browser and device information, requested URLs, timestamps, cookies, session identifiers, API and authentication activity, rate-limit events, error logs, security events, and audit records.',
            ],
            [
              'Managed-service content and usage',
              'PDFs and related files, document names and metadata, annotations, comments, forms, signatures, viewer and access configuration, API requests, monthly views, monthly uploads, total storage, and other information submitted by the customer or its users.',
            ],
            [
              'Self-hosted licensing and usage',
              'License and organization identifiers, deployment or installation identifiers, activation and validation status, license term and mode, aggregate monthly views and uploads, current storage, threshold status, timestamps, and diagnostics needed to operate and support the license.',
            ],
            [
              'Communications',
              'Emails, support requests, product feedback, meeting notes, survey responses, and records of transactional or marketing email delivery and engagement where supported and permitted.',
            ],
          ]}
        />
        <LegalSubheading>Customer Content may contain personal data</LegalSubheading>
        <LegalParagraph>
          We do not require sensitive personal data to create an account. A customer may choose to
          place personal or sensitive data inside PDFs or other Customer Content. The customer is
          responsible for deciding whether that is appropriate and lawful, and we process it only to
          provide the Services and as instructed under the customer agreement.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'sources',
    title: 'Where the data comes from',
    content: (
      <LegalList>
        <li>
          <strong>From you:</strong> when you register, verify your email, create or join an
          organization, request a trial, accept an offer, configure a product, contact us, or use
          the Services.
        </li>
        <li>
          <strong>From your organization:</strong> when an owner or administrator invites you,
          assigns a role, identifies you as a contact, forwards an offer, or manages your access.
        </li>
        <li>
          <strong>Automatically:</strong> from browsers, applications, APIs, servers, security
          controls, and connected self-hosted installations when they interact with our systems.
        </li>
        <li>
          <strong>From service providers:</strong> including Paddle for transaction and subscription
          status, Resend for email delivery events, and Keygen for connected-license issuance,
          machine activation, and validation events.
        </li>
        <li>
          <strong>From business interactions:</strong> such as a colleague, reseller, public
          business source, conference, or direct sales conversation where permitted by law.
        </li>
      </LegalList>
    ),
  },
  {
    id: 'use-and-legal-bases',
    title: 'Why we use personal data',
    content: (
      <>
        <LegalTable
          columns={['Purpose', 'Typical legal basis']}
          rows={[
            [
              'Create and secure accounts; verify email; authenticate users; manage organizations and permissions.',
              'Contract; steps requested before entering a contract; legitimate interests in operating a secure business service.',
            ],
            [
              'Provide the managed service, software access, downloads, evaluations, APIs, support, licensing, and usage-limit notifications.',
              'Contract; legitimate interests in delivering and improving the Services.',
            ],
            [
              'Prepare offers; manage orders, subscriptions, entitlements, invoices, tax information, renewals, refunds, and commercial records.',
              'Contract; legal obligations; legitimate interests in administering customer relationships.',
            ],
            [
              'Detect bots, abuse, account takeover, fraud, licensing misuse, and security incidents; investigate and enforce our terms.',
              'Legitimate interests in protecting customers, CloudPDF, and the Services; legal obligations where applicable.',
            ],
            [
              'Communicate about service changes, security, billing, offers, support, and account activity.',
              'Contract; legitimate interests in communicating with customers and users.',
            ],
            [
              'Analyze reliability and product usage, troubleshoot errors, and improve features using data that is aggregated or minimized where practical.',
              'Legitimate interests in maintaining and improving the Services.',
            ],
            [
              'Send product news or marketing and measure its effectiveness.',
              'Consent where required; otherwise legitimate interests, with an opt-out.',
            ],
            [
              'Comply with tax, accounting, sanctions, court orders, regulatory duties, and legal claims.',
              'Legal obligations; legitimate interests in establishing, exercising, or defending legal claims.',
            ],
          ]}
        />
        <LegalParagraph>
          Where we rely on consent, you may withdraw it at any time. Where we rely on legitimate
          interests, we balance those interests against the effect on your rights and expectations.
          You may contact us for more information about that assessment.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'paddle',
    title: 'Payments through Paddle',
    content: (
      <>
        <LegalParagraph>
          Paddle is our authorized reseller and Merchant of Record for purchases made through Paddle
          checkout. Paddle independently collects and processes payment credentials, billing
          details, tax information, fraud-prevention data, and transaction data. Its use of that
          information is governed by Paddle’s{' '}
          <LegalLink href="https://www.paddle.com/legal/privacy">Privacy Policy</LegalLink> and{' '}
          <LegalLink href="https://www.paddle.com/legal/buyer-terms">Buyer Terms</LegalLink>.
        </LegalParagraph>
        <LegalParagraph>
          Paddle sends us the information needed to identify the purchasing organization, record the
          order, activate entitlements, manage subscription status, provide support, and reconcile
          commercial records. This may include your name, email address, business and billing
          details, tax status, Paddle identifiers, purchased items, amount, currency, and
          transaction or subscription status. We do not receive your full card number or card
          security code.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'product-modes',
    title: 'How product mode affects data collection',
    content: (
      <>
        <LegalSubheading>CloudPDF managed service</LegalSubheading>
        <LegalParagraph>
          Customer Content is uploaded to and processed in systems operated for CloudPDF. We use it
          to store, transform, secure, render, and deliver documents and requested collaboration or
          workflow features. We also process usage and technical data needed to apply plan limits,
          troubleshoot, protect the service, and support the customer.
        </LegalParagraph>

        <LegalSubheading>Connected self-hosted deployments</LegalSubheading>
        <LegalParagraph>
          Documents remain in the customer-controlled deployment unless the customer deliberately
          sends them to us for support or another service. The software connects for license
          issuance, activation, validation, status, and aggregate usage reporting. Connected usage
          reports are limited to licensing and plan information such as monthly PDF views, monthly
          document uploads, current total storage, warning thresholds, deployment identifiers, and
          relevant timestamps or diagnostics. Keygen may also receive license, machine,
          installation, network, and validation information needed to operate connected licensing.
        </LegalParagraph>

        <LegalSubheading>Air-gapped self-hosted deployments</LegalSubheading>
        <LegalParagraph>
          Air-gapped mode does not automatically send telemetry to CloudPDF or Keygen. To activate,
          renew, or update an air-gapped license, an authorized person manually exports an offline
          request and submits it to CloudPDF, then imports the signed response into the deployment.
          We process the license, deployment, machine-binding, request, validity, and audit
          information contained in that exchange. We receive no document content or operational
          usage from an air-gapped environment unless the customer intentionally provides it.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'When we share personal data',
    content: (
      <>
        <LegalParagraph>We disclose personal data only as reasonably needed to:</LegalParagraph>
        <LegalList>
          <li>
            <strong>Your organization:</strong> owners, administrators, billing contacts, and other
            authorized members may see account, membership, offer, billing, usage, and licensing
            information according to their permissions.
          </li>
          <li>
            <strong>Paddle:</strong> to operate checkout, reseller transactions, subscriptions,
            invoicing, tax, refunds, and fraud prevention.
          </li>
          <li>
            <strong>Resend:</strong> to deliver verification codes, password resets, offer emails,
            service notifications, and other communications.
          </li>
          <li>
            <strong>Keygen:</strong> to issue and operate connected licenses, machine activations,
            validation, and signed licensing artifacts.
          </li>
          <li>
            <strong>Infrastructure and operations providers:</strong> for hosting, databases,
            storage, content delivery, backups, security, monitoring, and customer support. They may
            process data only to provide services to us under appropriate obligations.
          </li>
          <li>
            <strong>Professional advisers and authorities:</strong> where reasonably necessary for
            legal, audit, accounting, insurance, security, or compliance purposes, or in response to
            a valid legal request.
          </li>
          <li>
            <strong>Corporate transactions:</strong> in connection with a financing, reorganization,
            merger, acquisition, or sale, subject to appropriate confidentiality and notice where
            required.
          </li>
        </LegalList>
        <LegalParagraph>
          We do not sell personal data. We do not share personal data for cross-context behavioural
          advertising. We may publish or share information that has been aggregated or de-identified
          so that it does not reasonably identify a person or customer.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'international-transfers',
    title: 'International data transfers',
    content: (
      <LegalParagraph>
        CloudPDF and its service providers may process personal data in countries other than the
        country where you live. Where law requires safeguards for a transfer—for example, from the
        United Kingdom or European Economic Area to a country without an adequacy decision—we use an
        approved transfer mechanism such as Standard Contractual Clauses, a UK addendum or
        international data transfer agreement, or another lawful safeguard. You may contact us for
        information about the safeguards relevant to your data.
      </LegalParagraph>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep data',
    content: (
      <>
        <LegalParagraph>
          We retain personal data only for as long as reasonably needed for the purpose for which it
          was collected, including to provide the Services, maintain security and audit trails,
          comply with tax and accounting rules, resolve disputes, and enforce agreements. The period
          depends on the type of data and our relationship with you.
        </LegalParagraph>
        <LegalList>
          <li>
            Account, organization, entitlement, and license records are generally kept while the
            account, license, or customer relationship is active and for a reasonable period
            afterward for security, support, dispute, and legal purposes.
          </li>
          <li>
            Paddle transaction references, accepted offers, invoices, and related commercial records
            are kept for the period required by tax, accounting, and limitation laws.
          </li>
          <li>
            Managed-service Customer Content is retained according to customer settings and the
            applicable agreement. Following deletion or termination, residual copies may remain in
            protected backups until the relevant backup cycle expires.
          </li>
          <li>
            Verification challenges and similar temporary security data expire after a short period.
            Security, authentication, and audit logs are kept for a period proportionate to
            detecting abuse and investigating incidents.
          </li>
        </LegalList>
        <LegalParagraph>
          When data is no longer needed, we delete, anonymize, or securely isolate it unless law
          requires continued retention.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How we protect data',
    content: (
      <>
        <LegalParagraph>
          We use technical and organizational measures designed to protect personal data against
          unauthorized access, alteration, disclosure, loss, or destruction. Depending on the
          system, these measures include access controls, email verification, least-privilege
          permissions, encryption in transit, encryption or protected storage for sensitive secrets,
          audit logging, rate limiting, backups, monitoring, and incident procedures.
        </LegalParagraph>
        <LegalParagraph>
          No system is completely secure. You are responsible for protecting your credentials,
          limiting administrator access, securely configuring your applications and self-hosted
          infrastructure, and notifying us promptly of suspected compromise.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and similar technologies',
    content: (
      <>
        <LegalParagraph>
          We use cookies and similar local technologies that are necessary to operate and secure the
          website and account experience—for example, to maintain a session, complete an
          authentication handoff, remember a security state, or prevent abuse. Blocking necessary
          cookies may prevent account or checkout-related features from working.
        </LegalParagraph>
        <LegalParagraph>
          Paddle uses its own technologies when you interact with Paddle checkout, subject to
          Paddle’s privacy and cookie notices. If we introduce non-essential analytics,
          personalization, or advertising technologies, we will update this Policy and request
          consent where required by law.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'communications',
    title: 'Email and marketing choices',
    content: (
      <>
        <LegalParagraph>
          We send transactional messages needed to operate the Services, such as verification codes,
          password resets, security alerts, offer and order communications, license and usage
          notices, billing status, and important service changes. You generally cannot opt out of
          essential messages while maintaining the relevant account or Service.
        </LegalParagraph>
        <LegalParagraph>
          You may opt out of marketing emails at any time using the unsubscribe link or by emailing
          us. Opting out of marketing does not stop transactional or support communications. We may
          retain a minimal suppression record so that we can respect your choice.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'rights',
    title: 'Your privacy rights',
    content: (
      <>
        <LegalParagraph>
          Depending on your location and subject to legal exceptions, you may have the right to:
        </LegalParagraph>
        <LegalList>
          <li>request access to and a copy of your personal data;</li>
          <li>correct inaccurate or incomplete personal data;</li>
          <li>request deletion or restriction of processing;</li>
          <li>receive certain data in a portable, machine-readable format;</li>
          <li>object to processing based on legitimate interests;</li>
          <li>withdraw consent without affecting earlier lawful processing;</li>
          <li>opt out of direct marketing at any time;</li>
          <li>
            appeal a denied request where local law provides that right, and complain to the data
            protection authority where you live or work.
          </li>
        </LegalList>
        <LegalCallout>
          You have an unconditional right to object to the use of your personal data for direct
          marketing. You may also object to processing based on our legitimate interests, in which
          case we will stop unless we have a compelling lawful reason to continue.
        </LegalCallout>
        <LegalParagraph>
          To exercise a right, email {CONTACT_EMAIL}. We may need to verify your identity and
          authority. If your request concerns Customer Content controlled by one of our customers,
          we may direct the request to that customer or assist it in responding.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'us-rights',
    title: 'Additional U.S. state disclosures',
    content: (
      <>
        <LegalParagraph>
          Residents of certain U.S. states may have rights to know, access, correct, delete, or
          obtain a portable copy of personal information, to opt out of certain sales, sharing, or
          targeted advertising, and to appeal a denied request. CloudPDF does not sell personal
          information and does not use it for cross-context behavioural advertising. We do not
          discriminate against a person for exercising an applicable privacy right.
        </LegalParagraph>
        <LegalParagraph>
          You may submit a request at {CONTACT_EMAIL}. An authorized agent may submit a request
          where permitted, but we may require proof of authority and verification of the relevant
          individual.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'automated-decisions-children',
    title: 'Automated decisions and children',
    content: (
      <>
        <LegalParagraph>
          We use automated controls to detect abuse, apply rate limits, validate licenses, and
          protect accounts. We do not use personal data to make solely automated decisions that
          produce legal or similarly significant effects about individuals. You may contact us if
          you believe an automated security control has incorrectly affected you.
        </LegalParagraph>
        <LegalParagraph>
          The Services are intended for businesses and are not directed to children under 18. We do
          not knowingly collect personal data directly from children. If you believe a child has
          provided personal data to us, contact us so we can investigate and take appropriate
          action.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: 'changes-contact',
    title: 'Changes and how to contact us',
    content: (
      <>
        <LegalParagraph>
          We may update this Privacy Policy as our Services, providers, or legal obligations change.
          We will post the revised version with a new “last updated” date. If a change materially
          affects how we use personal data, we will provide additional notice or request consent
          where required.
        </LegalParagraph>
        <LegalCallout>
          <strong>Privacy contact and controller:</strong>
          <br />
          {COMPANY}
          <br />
          Email:{' '}
          <a
            className="text-cp-blue hover:text-cp-blue700 font-bold underline underline-offset-4"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
        </LegalCallout>
        <LegalParagraph>
          You may also complain to the data protection authority in your country. We would
          appreciate the opportunity to address your concern first, but contacting us is not a
          prerequisite to filing a complaint.
        </LegalParagraph>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      description="How CloudPDF handles account, billing, product, licensing, and website data across managed, connected, and air-gapped products."
      lastUpdated={LAST_UPDATED}
      sections={sections}
    />
  );
}
