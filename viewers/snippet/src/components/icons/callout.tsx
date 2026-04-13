import { h } from 'preact';
import { IconProps } from './types';

export const CalloutIcon = ({
  size = 24,
  strokeWidth = 2,
  primaryColor = 'currentColor',
  secondaryColor = 'none',
  className,
  title,
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={secondaryColor}
    stroke={primaryColor}
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
    role="img"
    aria-label={title}
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M20 6v4a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1" />
    <path fill="none" d="M17 11v6h-9" />
    <path fill="none" d="M8 15l-2 2l2 2" />
  </svg>
);
