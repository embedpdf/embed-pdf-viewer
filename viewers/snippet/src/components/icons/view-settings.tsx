import { h } from 'preact';
import { IconProps } from './types';

export const ViewSettingsIcon = ({
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
    <path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M12 10.5v1.5" />
    <path d="M12 16v1.5" />
    <path d="M15.031 12.25l-1.299 .75" />
    <path d="M10.268 15l-1.3 .75" />
    <path d="M15 15.803l-1.285 -.773" />
    <path d="M10.285 12.97l-1.285 -.773" />
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
  </svg>
);
