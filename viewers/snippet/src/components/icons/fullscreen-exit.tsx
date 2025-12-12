import { h } from 'preact';
import { IconProps } from './types';

export const FullscreenExitIcon = ({
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
    <path d="M4 8v-2c0 -.551 .223 -1.05 .584 -1.412" />
    <path d="M4 16v2a2 2 0 0 0 2 2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M16 20h2c.545 0 1.04 -.218 1.4 -.572" />
    <path d="M3 3l18 18" />
  </svg>
);
