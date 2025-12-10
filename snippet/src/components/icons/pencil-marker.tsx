import { h } from 'preact';
import { IconProps } from './types';

export const PencilMarkerIcon = ({
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
    <path
      d="m9.109 16.275 8.856-8.097c.812-.743.87-2.014.127-2.826s-2.014-.869-2.826-.127L6.41 13.322l-.127 2.826zM13.79 6.575l2.7 2.952"
      stroke="currentColor"
    />
    <path
      stroke={primaryColor}
      d="M19.375 20.125c.569.063-4.05-.562-6.412-.437s-4.759 1.229-6.857 1.625c-1.764.687-3.404-.938-1.981-2.5"
    />
  </svg>
);
