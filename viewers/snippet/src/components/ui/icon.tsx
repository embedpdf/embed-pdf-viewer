import { h, VNode } from 'preact';
import { icons } from '../icons';
import {
  getCustomIcon,
  hasCustomIcon,
  resolveIconColor,
  CustomIconConfig,
} from '@/config/icon-registry';

type IconProps = {
  icon: string;
  size?: number;
  strokeWidth?: number;
  primaryColor?: string;
  secondaryColor?: string;
  className?: string;
  title?: string;
};

/**
 * Icon component for Preact
 *
 * Renders icons from:
 * 1. Built-in icon components (defined in ./icons)
 * 2. Custom registered icons (registered via registerIcon)
 */
export function Icon({
  icon,
  title,
  size = 24,
  strokeWidth = 2,
  primaryColor = 'currentColor',
  secondaryColor = 'currentColor',
  className,
}: IconProps): VNode | null {
  // Check built-in icons first
  const BuiltInIcon = icons[icon];
  if (BuiltInIcon) {
    return (
      <BuiltInIcon
        size={size}
        strokeWidth={strokeWidth}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        className={className}
        title={title}
      />
    );
  }

  // Check custom registered icons
  if (hasCustomIcon(icon)) {
    const config = getCustomIcon(icon)!;
    return renderCustomIcon(config, {
      size,
      strokeWidth,
      primaryColor,
      secondaryColor,
      className,
      title,
    });
  }

  // Icon not found
  console.warn(`Icon not found: ${icon}`);
  return null;
}

/**
 * Renders a custom icon from its configuration
 */
function renderCustomIcon(
  config: CustomIconConfig,
  props: {
    size: number;
    strokeWidth: number;
    primaryColor: string;
    secondaryColor: string;
    className?: string;
    title?: string;
  },
): VNode {
  const { size, strokeWidth, primaryColor, secondaryColor, className, title } = props;
  const defaultStrokeWidth = config.strokeWidth ?? strokeWidth;

  return (
    <svg
      width={size}
      height={size}
      viewBox={config.viewBox}
      stroke-linecap={config.strokeLinecap}
      stroke-linejoin={config.strokeLinejoin}
      class={className}
      role="img"
      aria-label={title}
    >
      {config.paths.map((path, i) => {
        const strokeColor = resolveIconColor(path.stroke, primaryColor, secondaryColor);
        const fillColor = resolveIconColor(path.fill, primaryColor, secondaryColor);
        const pathStrokeWidth = path.strokeWidth ?? defaultStrokeWidth;

        return (
          <path
            key={i}
            d={path.d}
            stroke={strokeColor}
            fill={fillColor}
            stroke-width={strokeColor !== 'none' ? pathStrokeWidth : undefined}
            opacity={path.opacity}
          />
        );
      })}
    </svg>
  );
}
