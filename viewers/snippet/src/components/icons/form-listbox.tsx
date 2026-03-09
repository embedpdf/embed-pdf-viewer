import { h } from 'preact';
import { IconProps } from './types';

export const FormListboxIcon = ({
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
    <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" />
    <path d="M11 8h6" />
    <path d="M11 12h6" />
    <path d="M11 16h6" />
    <path d="M7 8l0 .01" />
    <path d="M7 12l0 .01" />
    <path d="M7 16l0 .01" />
  </svg>
);
