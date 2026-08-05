'use client';

import { useMemo, useState, type FormEvent } from 'react';

import { countries, optional, readUtmParameters, required, responseMessage } from '@/lib/inquiries';

import {
  InquiryError,
  InquiryField,
  InquiryHoneypot,
  InquiryPrivacyNote,
  InquirySelect,
  InquiryTextarea,
} from './inquiry-form-fields';

export type ProductInterest =
  | 'cloudpdf-self-hosted'
  | 'cloudpdf-saas'
  | 'embedpdf-pro'
  | 'not-sure';

type FollowUpPreference = 'book-call' | 'email';

interface SubmittedInquiry {
  company: string;
  countryCode: string;
  email: string;
  followUpPreference: FollowUpPreference;
  fullName: string;
  id: string;
  message: string;
  phone: string;
  productInterest: ProductInterest;
}

const products: Array<{ description: string; label: string; value: ProductInterest }> = [
  {
    description: 'Run the complete CloudPDF platform in your own infrastructure.',
    label: 'CloudPDF Self-hosted',
    value: 'cloudpdf-self-hosted',
  },
  {
    description: 'Managed document workflows without operating the infrastructure.',
    label: 'CloudPDF SaaS',
    value: 'cloudpdf-saas',
  },
  {
    description: 'Production-ready PDF viewer templates with lifetime source access.',
    label: 'EmbedPDF Pro',
    value: 'embedpdf-pro',
  },
  {
    description: 'Tell us what you are building and we will help you choose.',
    label: 'Not sure yet',
    value: 'not-sure',
  },
];

export function SalesInquiryForm({
  defaultProductInterest = 'not-sure',
  sourceContext,
}: {
  defaultProductInterest?: ProductInterest;
  sourceContext: string;
}) {
  const [phase, setPhase] = useState<'idle' | 'sending' | 'submitted'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedInquiry | null>(null);
  const calUrl = useMemo(() => (submitted ? buildCalUrl(submitted) : null), [submitted]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhase('sending');
    setError(null);
    const form = new FormData(event.currentTarget);
    const followUpPreference = required(form, 'followUpPreference') as FollowUpPreference;
    const productInterest = required(form, 'productInterest') as ProductInterest;
    const inquiry: SubmittedInquiry = {
      company: required(form, 'company'),
      countryCode: required(form, 'countryCode'),
      email: required(form, 'email'),
      followUpPreference,
      fullName: required(form, 'fullName'),
      id: crypto.randomUUID(),
      message: required(form, 'message'),
      phone: optional(form, 'phone'),
      productInterest,
    };

    try {
      const response = await fetch('/api/platform/v1/public/sales-inquiries', {
        body: JSON.stringify({
          ...inquiry,
          addressLine2: optional(form, 'addressLine2'),
          companyWebsite: optional(form, 'companyWebsite'),
          phone: inquiry.phone || null,
          referrer: document.referrer || null,
          source: 'cloudpdf',
          sourceContext,
          sourcePath: window.location.pathname,
          utm: readUtmParameters(window.location.search),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(
          await responseMessage(response, 'We could not send your inquiry. Please try again.'),
        );
      }

      setSubmitted(inquiry);
      setPhase('submitted');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'We could not send your inquiry. Please try again.',
      );
      setPhase('idle');
    }
  }

  if (phase === 'submitted' && submitted) {
    return (
      <div className="p-6 sm:p-8">
        <span className="grid size-12 place-items-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700">
          ✓
        </span>
        <h3 className="font-display text-cp-navy mt-5 text-2xl font-extrabold">
          Thanks, {submitted.fullName.split(/\s+/)[0]}.
        </h3>
        <p className="text-cp-muted mt-2 max-w-2xl text-sm leading-6">
          Your inquiry is with our sales team. We saved everything you shared, so you will not need
          to repeat it.
        </p>

        {submitted.followUpPreference === 'book-call' && calUrl ? (
          <a
            className="bg-cp-blue hover:bg-cp-blue600 mt-6 inline-flex h-12 items-center justify-center rounded-xl px-6 font-bold text-white no-underline transition"
            href={calUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Choose a time with our team ↗
          </a>
        ) : (
          <p className="text-cp-navy mt-6 rounded-xl bg-[#F3F7FE] px-4 py-3 text-sm font-semibold">
            We will reply to {submitted.email}.
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="p-5 sm:p-7" onSubmit={submit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <InquiryField autoComplete="name" label="Full name" name="fullName" required />
        <InquiryField
          autoComplete="email"
          label="Work email"
          name="email"
          placeholder="you@company.com"
          required
          type="email"
        />
        <InquiryField
          autoComplete="organization"
          label="Company or organization"
          name="company"
          required
        />
        <InquiryField
          autoComplete="url"
          label="Company website"
          name="companyWebsite"
          placeholder="https://"
          type="url"
        />
        <InquiryField
          autoComplete="tel"
          label="Phone number (optional)"
          name="phone"
          placeholder="+1 555 123 4567"
          type="tel"
        />
        <InquirySelect defaultValue="" label="Country or region" name="countryCode" required>
          <option disabled value="">
            Select your country
          </option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </InquirySelect>
      </div>

      <fieldset className="mt-7">
        <legend className="text-cp-navy text-sm font-bold">Primary product interest</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {products.map((product) => (
            <label
              className="has-[:checked]:border-cp-blue cursor-pointer rounded-2xl border border-[#DCE5F2] p-4 transition hover:border-[#9EC8FF] has-[:checked]:bg-[#F2F7FF]"
              key={product.value}
            >
              <span className="flex items-start gap-3">
                <input
                  className="mt-1 size-4 accent-[#1677FF]"
                  defaultChecked={product.value === defaultProductInterest}
                  name="productInterest"
                  required
                  type="radio"
                  value={product.value}
                />
                <span>
                  <span className="text-cp-navy block text-sm font-extrabold">{product.label}</span>
                  <span className="text-cp-muted mt-1 block text-xs leading-5">
                    {product.description}
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-7">
        <InquiryTextarea
          label="Tell us more about your product"
          maxLength={5000}
          minLength={10}
          name="message"
          placeholder="What are you building, what problem are you solving, and what scale do you expect?"
          required
        />
      </div>

      <fieldset className="mt-7">
        <legend className="text-cp-navy text-sm font-bold">How should we follow up?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FollowUpOption
            description="Choose a convenient time after submitting."
            label="Book a call"
            value="book-call"
          />
          <FollowUpOption
            description="We will review your details and respond by email."
            label="Email me back"
            value="email"
          />
        </div>
      </fieldset>

      <InquiryHoneypot />
      {error ? <InquiryError>{error}</InquiryError> : null}

      <div className="mt-7 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <InquiryPrivacyNote />
        <button
          className="bg-cp-blue hover:bg-cp-blue600 min-w-40 cursor-pointer rounded-xl border-0 px-6 py-3.5 font-bold text-white shadow-[0_12px_28px_rgba(22,119,255,0.22)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
          disabled={phase === 'sending'}
          type="submit"
        >
          {phase === 'sending' ? 'Sending…' : 'Contact sales'}
        </button>
      </div>
    </form>
  );
}

function FollowUpOption({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: FollowUpPreference;
}) {
  return (
    <label className="has-[:checked]:border-cp-blue cursor-pointer rounded-2xl border border-[#DCE5F2] p-4 transition hover:border-[#9EC8FF] has-[:checked]:bg-[#F2F7FF]">
      <span className="flex items-start gap-3">
        <input
          className="mt-1 size-4 accent-[#1677FF]"
          name="followUpPreference"
          required
          type="radio"
          value={value}
        />
        <span>
          <span className="text-cp-navy block text-sm font-extrabold">{label}</span>
          <span className="text-cp-muted mt-1 block text-xs leading-5">{description}</span>
        </span>
      </span>
    </label>
  );
}

function buildCalUrl(inquiry: SubmittedInquiry): string | null {
  const configured = process.env.NEXT_PUBLIC_CAL_LINK?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured);
    url.searchParams.set('name', inquiry.fullName);
    url.searchParams.set('email', inquiry.email);
    if (inquiry.phone) url.searchParams.set('phone', inquiry.phone);
    url.searchParams.set('company', inquiry.company);
    url.searchParams.set('country', inquiry.countryCode);
    url.searchParams.set('product-interest', inquiry.productInterest);
    url.searchParams.set('notes', inquiry.message.slice(0, 1000));
    url.searchParams.set('metadata[salesInquiryId]', inquiry.id);
    return url.toString();
  } catch {
    return null;
  }
}
