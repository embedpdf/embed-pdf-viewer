import { MouseEvent, TouchEvent } from '@framework';

interface TextProps {
  isSelected: boolean;
  color?: string;
  opacity?: number;
  onClick?: (e: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => void;
  appearanceActive?: boolean;
}

function parseColor(color: string): { r: number; g: number; b: number } | null {
  const normalized = color.trim().toLowerCase();

  if (normalized === 'black') {
    return { r: 0, g: 0, b: 0 };
  }

  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgbMatch = normalized.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/,
  );
  if (rgbMatch) {
    return {
      r: Math.min(255, Number(rgbMatch[1])),
      g: Math.min(255, Number(rgbMatch[2])),
      b: Math.min(255, Number(rgbMatch[3])),
    };
  }

  return null;
}

function getContrastStroke(fillColor: string): string {
  const rgb = parseColor(fillColor);
  if (!rgb) {
    return '#000';
  }

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance < 0.45 ? '#fff' : '#000';
}

/**
 * Renders a fallback sticky-note icon for PDF Text annotations when no
 * appearance stream image is available.
 */
export function Text({
  isSelected,
  color = '#facc15',
  opacity = 1,
  onClick,
  appearanceActive = false,
}: TextProps): JSX.Element {
  const lineColor = getContrastStroke(color);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        pointerEvents: isSelected ? 'none' : 'auto',
        cursor: isSelected ? 'move' : 'pointer',
      }}
      onPointerDown={onClick}
      onTouchStart={onClick}
    >
      {!appearanceActive && (
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
          viewBox="0 0 64 64"
          width="100%"
          height="100%"
          fill="#facc15"
        >
          <path
            d="M8 8 H56 V48 H32 L26 56 L20 48 H8 Z"
            fill={color}
            opacity={opacity}
            stroke={lineColor}
            strokeWidth="4"
            strokeLinejoin="miter"
          />
          <line
            x1="20"
            y1="18"
            x2="44"
            y2="18"
            stroke={lineColor}
            strokeWidth="2"
            strokeLinecap="square"
          />
          <line
            x1="20"
            y1="28"
            x2="44"
            y2="28"
            stroke={lineColor}
            strokeWidth="2"
            strokeLinecap="square"
          />
          <line
            x1="20"
            y1="38"
            x2="44"
            y2="38"
            stroke={lineColor}
            strokeWidth="2"
            strokeLinecap="square"
          />
        </svg>
      )}
    </div>
  );
}
