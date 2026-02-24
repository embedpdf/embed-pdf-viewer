import { h } from 'preact';
import { IconProps } from './types';

export const RedactCombinedIcon = ({
  size = 24,
  strokeWidth = 2,
  primaryColor = 'currentColor',
  secondaryColor = 'currentColor',
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
    <path d="M20 13v-3" />
    <path d="M3 6v-1a2 2 0 0 1 2 -2h1" />
    <path d="M10 3h3" />
    <path d="M17 3h1a2 2 0 0 1 2 2v1" />
    <path d="M8 8h8" />
    <path d="M12 8v7" />
    <defs>
      <clipPath id="redactCombinedClip">
        <rect x="10" y="18" width="13" height="6" rx="2" />
      </clipPath>
    </defs>
    <rect x="10" y="17" width="13" height="6" rx="2" fill="none" />
    <g clip-path="url(#redactCombinedClip)" stroke={secondaryColor}>
      <path d="M6 19l12 -12" />
      <path d="M6 23l12 -12" />
      <path d="M10 23l12 -12" />
      <path d="M14 27l12 -12" />
      <path d="M14 23l12 -12" />
    </g>
  </svg>
);
