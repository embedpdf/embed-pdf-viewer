import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export const inquiryFieldClass =
  'text-cp-navy w-full rounded-xl border border-[#CCD8ED] bg-white px-4 py-3 shadow-inner outline-none transition placeholder:text-[#8290AA] focus:border-cp-blue focus:ring-4 focus:ring-cp-blue/10 disabled:cursor-not-allowed disabled:bg-slate-50';

export function InquiryField({
  label,
  name,
  ...props
}: {
  label: string;
  name: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      <span className="text-cp-navy mb-2 block text-sm font-bold">{label}</span>
      <input className={inquiryFieldClass} name={name} {...props} />
    </label>
  );
}

export function InquirySelect({
  children,
  label,
  name,
  ...props
}: {
  children: ReactNode;
  label: string;
  name: string;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label>
      <span className="text-cp-navy mb-2 block text-sm font-bold">{label}</span>
      <select className={inquiryFieldClass} name={name} {...props}>
        {children}
      </select>
    </label>
  );
}

export function InquiryTextarea({
  label,
  name,
  ...props
}: {
  label: string;
  name: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="text-cp-navy mb-2 block text-sm font-bold">{label}</span>
      <textarea className={`${inquiryFieldClass} min-h-32 resize-y`} name={name} {...props} />
    </label>
  );
}

export function InquiryHoneypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[10000px] top-auto size-px overflow-hidden">
      <label>
        Address line 2
        <input autoComplete="off" name="addressLine2" tabIndex={-1} />
      </label>
    </div>
  );
}

export function InquiryError({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      role="alert"
    >
      {children}
    </p>
  );
}

export function InquiryPrivacyNote() {
  return (
    <p className="text-cp-muted max-w-md text-xs leading-5">
      We use these details only to respond to your inquiry. Please do not include passwords or
      payment-card information.
    </p>
  );
}
