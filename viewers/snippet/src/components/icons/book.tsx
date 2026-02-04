import { h } from 'preact';
import { IconProps } from './types';

export const BookIcon = ({
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
    <path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
    <path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
    <path d="M3 6l0 13" />
    <path d="M12 6l0 13" />
    <path d="M21 6l0 13" />
  </svg>
);
