import { h } from 'preact';
import { IconProps } from './types';

export const ReplaceTextIcon = ({
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
    <path d="M3 7v-2h12v2" />
    <path d="M9 5v14" />
    <path d="M7 19h4" />
    <g transform="translate(-1, -3) rotate(180 19 18)">
      <path d="M20 14l2 2h-3" />
      <path d="M20 18l2 -2" />
      <path d="M19 16a3 3 0 1 0 2 5.236" />
    </g>
  </svg>
);
