import { h } from 'preact';
import { IconProps } from './types';

const svgProps = (size: number, strokeWidth: number, primaryColor: string, className?: string, title?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: primaryColor,
  'stroke-width': strokeWidth,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
  class: className,
  role: 'img' as const,
  'aria-label': title,
});

/** A ruler — used for the Measure mode tab and the Calibrate action. */
export const RulerIcon = ({
  size = 24,
  strokeWidth = 2,
  primaryColor = 'currentColor',
  className,
  title,
}: IconProps) => (
  <svg {...svgProps(size, strokeWidth, primaryColor, className, title)}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M5 4l15 15a1 1 0 0 1 0 1.41l-.59.59a1 1 0 0 1-1.41 0L3 6a1 1 0 0 1 0-1.41l.59-.59a1 1 0 0 1 1.41 0z" />
    <path d="M7 8l1.5-1.5" />
    <path d="M10 11l1.5-1.5" />
    <path d="M13 14l1.5-1.5" />
    <path d="M16 17l1.5-1.5" />
  </svg>
);

/** Distance: a dimension line with perpendicular end caps. */
export const MeasureDistanceIcon = ({
  size = 24,
  strokeWidth = 2,
  primaryColor = 'currentColor',
  className,
  title,
}: IconProps) => (
  <svg {...svgProps(size, strokeWidth, primaryColor, className, title)}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M5 19L19 5" />
    <path d="M3 16l3 3" />
    <path d="M16 3l3 3" />
  </svg>
);

/** Perimeter: an open multi-point path with node dots. */
export const MeasurePerimeterIcon = ({
  size = 24,
  strokeWidth = 2,
  primaryColor = 'currentColor',
  className,
  title,
}: IconProps) => (
  <svg {...svgProps(size, strokeWidth, primaryColor, className, title)}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M4 18l5-9l4 5l7-9" />
    <circle cx="4" cy="18" r="1.4" fill={primaryColor} stroke="none" />
    <circle cx="9" cy="9" r="1.4" fill={primaryColor} stroke="none" />
    <circle cx="13" cy="14" r="1.4" fill={primaryColor} stroke="none" />
    <circle cx="20" cy="5" r="1.4" fill={primaryColor} stroke="none" />
  </svg>
);

/** Area (polygon): a filled polygon outline. */
export const MeasureAreaPolygonIcon = ({
  size = 24,
  strokeWidth = 2,
  primaryColor = 'currentColor',
  className,
  title,
}: IconProps) => (
  <svg {...svgProps(size, strokeWidth, primaryColor, className, title)}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M12 3l8 6l-3 9H7L4 9z" fill={primaryColor} fill-opacity={0.18} />
  </svg>
);

/** Area (rectangle): a filled rectangle. */
export const MeasureAreaRectIcon = ({
  size = 24,
  strokeWidth = 2,
  primaryColor = 'currentColor',
  className,
  title,
}: IconProps) => (
  <svg {...svgProps(size, strokeWidth, primaryColor, className, title)}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <rect x="4" y="6" width="16" height="12" rx="1" fill={primaryColor} fill-opacity={0.18} />
  </svg>
);

/** Area (ellipse): a filled ellipse. */
export const MeasureAreaEllipseIcon = ({
  size = 24,
  strokeWidth = 2,
  primaryColor = 'currentColor',
  className,
  title,
}: IconProps) => (
  <svg {...svgProps(size, strokeWidth, primaryColor, className, title)}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <ellipse cx="12" cy="12" rx="9" ry="6.5" fill={primaryColor} fill-opacity={0.18} />
  </svg>
);
