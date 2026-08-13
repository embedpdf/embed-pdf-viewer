import type { SVGProps } from 'react';

/**
 * The kit's own copies of the handful of glyphs its components render, so a
 * kit component never reaches into a site's icon set. Sites keep their own
 * icon modules for everything else.
 */
type IconProps = SVGProps<SVGSVGElement>;

export function ArrowRight(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function BoltBadgeIcon(props: IconProps) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13 2v7h5a1 1 0 0 1 .868 1.497l-.06.091-8 11c-.568.783-1.808.38-1.808-.588v-6h-5a1 1 0 0 1-.868-1.497l.06-.091 8-11A1 1 0 0 1 13 2z" />
    </svg>
  );
}

export function PuzzleBadgeIcon(props: IconProps) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M10 2a3 3 0 0 1 2.995 2.824l.005.176v1h3a2 2 0 0 1 1.995 1.85l.005.15v3h1a3 3 0 0 1 .176 5.995l-.176.005h-1v3a2 2 0 0 1-1.85 1.995l-.15.005h-3a2 2 0 0 1-1.995-1.85l-.005-.15v-1a1 1 0 0 0-1.993-.117l-.007.117v1a2 2 0 0 1-1.85 1.995l-.15.005h-3a2 2 0 0 1-1.995-1.85l-.005-.15v-3a2 2 0 0 1 1.85-1.995l.15-.005h1a1 1 0 0 0 .117-1.993l-.117-.007h-1a2 2 0 0 1-1.995-1.85l-.005-.15v-3a2 2 0 0 1 1.85-1.995l.15-.005h3v-1a3 3 0 0 1 3-3z" />
    </svg>
  );
}

export function EngineIcon(props: IconProps) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2.75 19.75 7v10L12 21.25 4.25 17V7L12 2.75Z" />
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 5.75v3M12 15.25v3M6.75 9l2.6 1.5M14.65 13.5l2.6 1.5M17.25 9l-2.6 1.5M9.35 13.5 6.75 15" />
    </svg>
  );
}

export function ServerBadgeIcon(props: IconProps) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="2" y="3" width="20" height="7" rx="2" />
      <rect x="2" y="14" width="20" height="7" rx="2" />
      <path d="M6 6.5h.01M6 17.5h.01" />
    </svg>
  );
}

