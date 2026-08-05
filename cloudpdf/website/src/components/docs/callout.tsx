import type { ReactNode } from 'react';

type CalloutType = 'info' | 'warn';

const styles: Record<CalloutType, { box: string; icon: string; body: string }> = {
  info: {
    box: 'border-[#C9DEFF] bg-[#F2F7FF]',
    icon: 'bg-[#DCEAFF] text-cp-blue',
    body: 'text-[#2A4574] [&_b]:text-cp-navy [&_strong]:text-cp-navy',
  },
  warn: {
    box: 'border-[#FBE3B8] bg-[#FFF9EE]',
    icon: 'bg-[#FCEAC4] text-[#B7791F]',
    body: 'text-[#7A5A1B] [&_b]:text-[#5C4310] [&_strong]:text-[#5C4310]',
  },
};

export function Callout({ type = 'info', children }: { type?: CalloutType; children: ReactNode }) {
  const s = styles[type];
  return (
    <div
      className={`mt-6 flex max-w-[72ch] gap-3.5 rounded-[14px] border bg-white px-[18px] py-4 ${s.box}`}
    >
      <span
        className={`inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-lg ${s.icon}`}
      >
        <svg
          width={15}
          height={15}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {type === 'info' ? (
            <>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 16v-4M12 8h.01" />
            </>
          ) : (
            <>
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              <path d="M12 9v4M12 17h.01" />
            </>
          )}
        </svg>
      </span>
      <div
        className={`font-sans text-[15px] leading-[1.6] ${s.body} [&_a]:text-cp-blue [&>:first-child]:mt-0 [&_a:hover]:underline [&_a]:font-semibold`}
      >
        {children}
      </div>
    </div>
  );
}
