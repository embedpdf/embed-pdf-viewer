import { h } from 'preact';
import { IconProps } from './types';

export const VerticalIcon = ({
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
    <path d="M8 7l4 -4l4 4" />
    <path d="M8 17l4 4l4 -4" />
    <path d="M12 3l0 18" />
  </svg>
);
