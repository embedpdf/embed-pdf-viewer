import { h } from 'preact';
import { IconProps } from './types';

export const GroupIcon = ({
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
    <path d="M3 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M17 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M3 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M17 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M5 7v10" />
    <path d="M19 7v10" />
    <path d="M7 5h10" />
    <path d="M7 19h10" />
    <path d="M8 8H12.8V11.2H16V16H11.2V12.8H8V8Z" />
  </svg>
);
