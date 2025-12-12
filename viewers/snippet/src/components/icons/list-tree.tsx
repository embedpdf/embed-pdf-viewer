import { h } from 'preact';
import { IconProps } from './types';

export const ListTreeIcon = ({
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
    <path d="M9 6h11" />
    <path d="M12 12h8" />
    <path d="M15 18h5" />
    <path d="M5 6v.01" />
    <path d="M8 12v.01" />
    <path d="M11 18v.01" />
  </svg>
);
