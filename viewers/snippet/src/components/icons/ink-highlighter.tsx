import { h } from 'preact';
import { IconProps } from './types';

export const InkHighlighterIcon = ({
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
    stroke-linejoin="round"
    stroke-linecap="round"
    stroke-width={strokeWidth}
    class={className}
    role="img"
    aria-label={title}
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path stroke="currentColor" d="M3 19h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
    <path stroke="currentColor" d="M12.5 5.5l4 4" />
    <path stroke="currentColor" d="M4.5 13.5l4 4" />
    <path stroke={primaryColor} fill={primaryColor} d="M21 15v4h-8l4 -4l4 0" />
  </svg>
);
