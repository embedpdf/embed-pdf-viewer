import { h } from 'preact';
import { IconProps } from './types';

export const RedactionSidebarIcon = ({
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
    {/* Outer layout */}
    <path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
    {/* Sidebar divider */}
    <path d="M15 4v16" />
    {/* Left-side content lines */}
    <path d="M7 8h5" />
    <path d="M7 11h5" />
    <path d="M7 14h4" />
  </svg>
);
