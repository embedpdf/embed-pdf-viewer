'use client';

import { useState, type FormEvent } from 'react';

import { optional, readUtmParameters, required, responseMessage } from '@/lib/inquiries';

import {
  InquiryError,
  InquiryField,
  InquiryHoneypot,
  InquiryPrivacyNote,
  InquirySelect,
  InquiryTextarea,
} from './inquiry-form-fields';

const topics = [
  ['general', 'General question'],
  ['product', 'Product question'],
  ['technical', 'Technical question'],
  ['billing', 'Billing'],
  ['partnership', 'Partnership'],
  ['privacy', 'Privacy'],
  ['other', 'Something else'],
] as const;

export function ContactInquiryForm() {
  const [phase, setPhase] = useState<'idle' | 'sending' | 'submitted'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhase('sending');
    setError(null);
    const form = new FormData(event.currentTarget);
    const fullName = required(form, 'fullName');

    try {
      const response = await fetch('/api/platform/v1/public/contact-inquiries', {
        body: JSON.stringify({
          addressLine2: optional(form, 'addressLine2'),
          company: optional(form, 'company') || null,
          email: required(form, 'email'),
          fullName,
          id: crypto.randomUUID(),
          message: required(form, 'message'),
          referrer: document.referrer || null,
          source: 'cloudpdf',
          sourceContext: 'contact-page',
          sourcePath: window.location.pathname,
          subject: required(form, 'subject'),
          topic: required(form, 'topic'),
          utm: readUtmParameters(window.location.search),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(
          await responseMessage(response, 'We could not send your message. Please try again.'),
        );
      }

      setFirstName(fullName.split(/\s+/)[0] ?? fullName);
      setPhase('submitted');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'We could not send your message. Please try again.',
      );
      setPhase('idle');
    }
  }

  if (phase === 'submitted') {
    return (
      <div className="rounded-[28px] border border-[#D7E3F5] bg-white p-7 shadow-[0_30px_80px_rgba(16,45,96,0.12)] sm:p-9">
        <span className="grid size-12 place-items-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700">
          ✓
        </span>
        <h2 className="font-display text-cp-navy mt-5 text-2xl font-extrabold">
          Thanks{firstName ? `, ${firstName}` : ''}.
        </h2>
        <p className="text-cp-muted mt-2 max-w-xl text-sm leading-6">
          Your message has reached the CloudPDF team. We will review it and reply by email.
        </p>
      </div>
    );
  }

  return (
    <form
      className="rounded-[28px] border border-[#D7E3F5] bg-white p-6 shadow-[0_30px_80px_rgba(16,45,96,0.12)] sm:p-8"
      onSubmit={submit}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <InquiryField autoComplete="name" label="Full name" name="fullName" required />
        <InquiryField
          autoComplete="email"
          label="Email"
          name="email"
          placeholder="you@company.com"
          required
          type="email"
        />
        <InquiryField autoComplete="organization" label="Company (optional)" name="company" />
        <InquirySelect defaultValue="" label="Topic" name="topic" required>
          <option disabled value="">
            Choose a topic
          </option>
          {topics.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </InquirySelect>
      </div>

      <div className="mt-5">
        <InquiryField
          label="Subject"
          maxLength={200}
          minLength={3}
          name="subject"
          placeholder="How can we help?"
          required
        />
      </div>

      <div className="mt-5">
        <InquiryTextarea
          label="Message"
          maxLength={5000}
          minLength={10}
          name="message"
          placeholder="Include enough context for us to send a useful reply."
          required
        />
      </div>

      <InquiryHoneypot />
      {error ? <InquiryError>{error}</InquiryError> : null}

      <div className="mt-7 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <InquiryPrivacyNote />
        <button
          className="bg-cp-blue hover:bg-cp-blue600 min-w-40 cursor-pointer rounded-xl border-0 px-6 py-3.5 font-bold text-white shadow-[0_12px_28px_rgba(22,119,255,0.22)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
          disabled={phase === 'sending'}
          type="submit"
        >
          {phase === 'sending' ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  );
}
