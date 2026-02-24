import { h } from 'preact';
import { IconProps } from './types';

export const SquigglyIcon = ({
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
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
    role="img"
    aria-label={title}
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M8 16v-8a4 4 0 1 1 8 0v8" stroke="currentColor" />
    <path d="M8 10h8" stroke="currentColor" />
    <path d="M4 20c1.5 -1.5 3.5 -1.5 5 0s3.5 1.5 5 0 3.5 -1.5 5 0" stroke={primaryColor} />
  </svg>
);
