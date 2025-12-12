import { h } from 'preact';
import { IconProps } from './types';

export const RotateCounterClockwiseIcon = ({
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
    <path d="M19.95 11a8 8 0 1 0 -.5 4m.5 5v-5h-5" />
  </svg>
);
