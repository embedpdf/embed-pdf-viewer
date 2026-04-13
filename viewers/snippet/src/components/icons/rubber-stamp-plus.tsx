import { h } from 'preact';
import { IconProps } from './types';

export const RubberStampPlusIcon = ({
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
    <path d="M21 17.85h-18c0 -4.05 1.421 -4.05 3.79 -4.05c5.21 0 1.21 -4.59 1.21 -6.8a4 4 0 0 1 4.9 -4.1" />
    <path d="M16 10c0 1.2 -4 3.8 1.21 3.8c2.369 0 3.79 0 3.79 4.05" />
    <path d="M5 21h14" />
    <path d="M16 5h6" />
    <path d="M19 2v6" />
  </svg>
);
