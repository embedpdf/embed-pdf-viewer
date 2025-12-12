import { h } from 'preact';
import { IconProps } from './types';

export function FileIcon({
  size = 24,
  strokeWidth = 2,
  primaryColor = 'currentColor',
  className,
  title,
}: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={primaryColor}
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      aria-hidden={!title}
      role={title ? 'img' : 'presentation'}
    >
      {title && <title>{title}</title>}
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
