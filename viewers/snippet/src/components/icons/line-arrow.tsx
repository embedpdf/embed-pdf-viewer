import { h } from 'preact';
import { IconProps } from './types';

export const LineArrowIcon = ({
  size = 24,
  strokeWidth = 2.2,
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
    <path d="M20 4l-16 16" />
    <path d="M16 3h5v5" />
  </svg>
);
