import { h } from 'preact';
import { IconProps } from './types';

export const RedactIcon = ({
  size = 24,
  strokeWidth = 2,
  primaryColor = 'currentColor',
  className,
  title,
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
    role="img"
    aria-label={title}
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    {/* T-marker at top */}
    <path d="M7 4h10" />
    <path d="M12 4v8" />
    {/* Redacted area with stripes - primaryColor */}
    <defs>
      <clipPath id="stripeClip">
        <rect x="2" y="12" width="20" height="10" rx="2" />
      </clipPath>
    </defs>
    <rect x="2" y="12" width="20" height="10" rx="2" fill="none" stroke={primaryColor} />
    <g clip-path="url(#stripeClip)" stroke={primaryColor}>
      <path d="M-7 24l12 -12" />
      <path d="M-3 24l12 -12" />
      <path d="M1 24l12 -12" />
      <path d="M5 24l12 -12" />
      <path d="M9 24l12 -12" />
      <path d="M13 24l12 -12" />
      <path d="M17 24l12 -12" />
      <path d="M21 24l12 -12" />
      <path d="M25 24l12 -12" />
    </g>
  </svg>
);
