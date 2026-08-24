import type { ReactNode } from 'react';

export function CloudMark({ width = 26, height = 17 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 160 107" fill="none">
      <path
        d="M71.1094 71.1094H142.224C142.224 51.474 126.302 35.5573 106.667 35.5573C106.667 15.9167 90.75 0 71.1094 0C51.474 0 35.5573 15.9167 35.5573 35.5573C15.9167 35.5573 0 51.474 0 71.1094C0 90.75 15.9167 106.667 35.5573 106.667C55.1927 106.667 71.1094 90.75 71.1094 71.1094Z"
        fill="#23278A"
      />
      <path
        d="M142.225 71.1094C142.225 90.75 126.303 106.667 106.668 106.667H124.444C144.085 106.667 160.001 90.75 160.001 71.1094H142.225Z"
        fill="#2CADF4"
      />
      <path
        d="M142.225 71.1094H71.1107C71.1107 90.75 55.194 106.667 35.5586 106.667H106.668C126.303 106.667 142.225 90.75 142.225 71.1094Z"
        fill="#1189FA"
      />
    </svg>
  );
}

export function CloudBanner({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border-cp-border flex items-center gap-4 rounded-full border bg-white p-[16px_26px_16px_16px] shadow-[0_20px_44px_-26px_rgba(10,26,77,0.26),0_2px_6px_rgba(10,26,77,0.05)] max-[480px]:flex-col max-[480px]:gap-3 max-[480px]:rounded-[28px] max-[480px]:p-[22px_26px] max-[480px]:text-center ${className}`}
    >
      <span className="bg-cp-blue/10 inline-flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full">
        <CloudMark width={26} height={17} />
      </span>
      <p className="font-display text-cp-navy m-0 text-balance text-[clamp(16px,1.4vw,20px)] font-semibold leading-[1.4] tracking-[-0.01em]">
        {children}
      </p>
    </div>
  );
}
