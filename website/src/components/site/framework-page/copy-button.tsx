'use client';

import { useState } from 'react';

import { CheckIcon, CopyIcon } from '../icons';

/** The code window's Copy button: the one client island on a framework page. */
export function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy code"
      className={`font-display inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
        copied
          ? 'border-[rgba(58,192,122,0.4)] bg-[rgba(58,192,122,0.12)] text-[#6FE0A0]'
          : 'border-[#25324F] bg-[#18233D] text-[#B8C5DD] hover:border-[#314069] hover:bg-[#1F2C4A] hover:text-white'
      }`}
    >
      {copied ? <CheckIcon size={13} strokeWidth={2.5} /> : <CopyIcon size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
