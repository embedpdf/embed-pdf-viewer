import { h } from 'preact';
import { IconProps } from './types';

export const ScreenshotIcon = ({
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
    <path d="M7 19a2 2 0 0 1 -2 -2" />
    <path d="M5 13v-2" />
    <path d="M5 7a2 2 0 0 1 2 -2" />
    <path d="M11 5h2" />
    <path d="M17 5a2 2 0 0 1 2 2" />
    <path d="M19 11v2" />
    <path d="M19 17v4" />
    <path d="M21 19h-4" />
    <path d="M13 19h-2" />
  </svg>
);
