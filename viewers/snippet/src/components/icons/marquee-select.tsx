import { h } from 'preact';
import { IconProps } from './types';

export const MarqueeSelectIcon = ({
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
    <path d="M17 20h6" />
    <path d="M20 17v6" />
    <path d="M4 13v-2" />
    <path d="M4 6v-1a1 1 0 0 1 1 -1h1" />
    <path d="M6 20h-1a1 1 0 0 1 -1 -1v-1" />
    <path d="M11 4h2" />
    <path d="M11 20h2" />
    <path d="M18 4h1a1 1 0 0 1 1 1v1" />
    <path d="M20 11v2" />
  </svg>
);
