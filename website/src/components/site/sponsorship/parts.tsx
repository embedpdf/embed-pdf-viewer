import Image from 'next/image';
import type { ReactNode } from 'react';

import { Eyebrow, PillDivider } from '../eyebrow';
import type { Sponsor, TierId } from './data';

/**
 * Per-tier colour, as whole class strings so Tailwind sees every one. The
 * metals only ever tint a tier's own furniture (medal, chip, empty slot);
 * actions stay brand blue on every tier.
 */
export const TIER_TONE: Record<
  TierId,
  { chip: string; slot: string; slotHover: string; check: string }
> = {
  gold: {
    chip: 'border-[#F3DDA2] bg-[#FFF8E6] text-[#8A5D00]',
    slot: 'border-[#EBCF85] bg-[linear-gradient(135deg,#FFFBF0_0%,#FFFFFF_55%,#FFF7E2_100%)]',
    slotHover: 'hover:border-[#D9AE3A] hover:shadow-[0_22px_44px_-20px_rgba(201,138,12,0.35)]',
    check: '#C98A0C',
  },
  silver: {
    chip: 'border-[#D8E0EC] bg-[#F3F6FB] text-[#45536F]',
    slot: 'border-[#CFD8E6] bg-[#F7F9FC]',
    slotHover: 'hover:border-[#9FB0CC] hover:shadow-[0_22px_44px_-20px_rgba(71,85,113,0.28)]',
    check: '#0876FD',
  },
  bronze: {
    chip: 'border-[#F0D4BD] bg-[#FDF3EB] text-[#8F4A1B]',
    slot: 'border-[#EBCDB4] bg-[#FDF8F4]',
    slotHover: 'hover:border-[#D69B6C] hover:shadow-[0_22px_44px_-20px_rgba(166,91,40,0.28)]',
    check: '#C06E35',
  },
};

const MEDAL_METAL: Record<TierId, [string, string, string]> = {
  gold: ['#FFE9A8', '#F2B526', '#C2830A'],
  silver: ['#FFFFFF', '#C9D2E0', '#8996B0'],
  bronze: ['#FAD5B4', '#DE9358', '#A05626'],
};

/**
 * A brand-ribboned medal in the tier's metal. Shaded with flat layers, not a
 * gradient: a gradient needs an id, and the first medal on a page can sit in
 * a subtree hidden at some breakpoint — Chrome then paints every later
 * `url(#id)` reference as nothing.
 */
export function TierMedal({ tier, size = 48 }: { tier: TierId; size?: number }) {
  const [light, mid, dark] = MEDAL_METAL[tier];
  return (
    <svg
      width={size}
      height={(size * 56) / 48}
      viewBox="0 0 48 56"
      fill="none"
      aria-hidden
      className="block flex-shrink-0"
    >
      <path d="M12 2h10l6 20H18z" fill="#0876FD" />
      <path d="M36 2H26l-6 20h10z" fill="#9747FF" />
      <path d="M22 2h4l-2 7z" fill="#07204C" opacity="0.25" />
      <circle cx="24" cy="34" r="18" fill={dark} />
      <circle cx="23" cy="33" r="17" fill={mid} />
      <path d="M9.5 30a14.5 14.5 0 0 1 22-10.6A17 17 0 0 0 9.5 30z" fill={light} opacity="0.9" />
      <circle cx="24" cy="34" r="13.5" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.5" />
      <polygon
        points="24,26.5 26,31.25 31.13,31.68 27.23,35.05 28.41,40.07 24,37.4 19.59,40.07 20.77,35.05 16.87,31.68 22,31.25"
        fill="#fff"
        opacity="0.95"
      />
    </svg>
  );
}

/** A sponsor's square mark as a rounded app tile — every logo we hold is
 *  square, so they read as one family at any size. */
export function SponsorLogo({
  sponsor,
  size,
  className = '',
}: {
  sponsor: Pick<Sponsor, 'name' | 'logo'>;
  size: number;
  className?: string;
}) {
  return (
    <span
      className={`relative block flex-shrink-0 overflow-hidden rounded-[24%] bg-white shadow-[0_0_0_1px_rgba(7,32,76,0.08),0_6px_16px_-8px_rgba(7,32,76,0.25)] ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={sponsor.logo}
        alt={sponsor.name}
        fill
        sizes={`${size}px`}
        className="object-cover"
      />
    </span>
  );
}

/** Eyebrow, heading, pill divider, lede — the site's section opener. */
export function SectionHead({
  eyebrow,
  icon,
  title,
  lede,
  align = 'center',
  tone = 'light',
  as: Heading = 'h2',
}: {
  eyebrow: string;
  icon?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  align?: 'center' | 'left';
  tone?: 'light' | 'dark';
  as?: 'h1' | 'h2';
}) {
  const center = align === 'center';
  return (
    <div
      className={`flex flex-col ${center ? 'mx-auto max-w-[760px] items-center text-center' : 'items-start'}`}
    >
      <div className="mb-5">
        <Eyebrow tone={tone} icon={icon}>
          {eyebrow}
        </Eyebrow>
      </div>
      <Heading
        className={`font-display m-0 mb-[18px] text-[clamp(34px,4.4vw,56px)] font-extrabold leading-[1.06] tracking-[-0.02em] [text-wrap:balance] ${
          tone === 'dark' ? 'text-white' : 'text-ep-navy'
        }`}
      >
        {title}
      </Heading>
      <PillDivider gradient />
      {lede && (
        <p
          className={`mb-0 mt-[18px] max-w-[580px] font-sans text-[17px] leading-[1.6] ${
            tone === 'dark' ? 'text-ep-faint' : 'text-ep-muted'
          }`}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

/** Round check in a given colour — the site's list bullet. */
export function CheckDot({ color = '#0876FD', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      className="mt-px flex-shrink-0"
    >
      <circle cx="11" cy="11" r="11" fill={color} fillOpacity="0.14" />
      <path
        d="M6.5 11.2l3 3 6-6.4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
