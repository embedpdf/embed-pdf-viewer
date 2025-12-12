import { h } from 'preact';
import { IconProps } from './types';

export const RedactAreaIcon = ({
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
    stroke={primaryColor}
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
    role="img"
    aria-label={title}
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M6 20h-1a2 2 0 0 1 -2 -2v-1" />
    <path d="M3 13v-3" />
    <path d="M3 6v-1a2 2 0 0 1 2 -2h1" />
    <path d="M10 3h3" />
    <path d="M17 3h1a2 2 0 0 1 2 2v1" />
    <defs>
      <clipPath id="redactClip">
        <rect x="10" y="10" width="12" height="12" rx="2" />
      </clipPath>
    </defs>
    <rect x="10" y="10" width="12" height="12" rx="2" fill="none" />
    <g clip-path="url(#redactClip)">
      <path d="M-2 24l14 -14" />
      <path d="M2 24l14 -14" />
      <path d="M6 24l14 -14" />
      <path d="M10 24l15 -15" />
      <path d="M14 24l15 -15" />
      <path d="M18 24l15 -15" />
    </g>
  </svg>
);
