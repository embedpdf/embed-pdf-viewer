import { getContrastStrokeColor } from '@embedpdf/models';
import { MouseEvent } from '@framework';

interface TextProps {
  isSelected: boolean;
  color?: string;
  opacity?: number;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  appearanceActive?: boolean;
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
  const lineColor = getContrastStrokeColor(color);

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
    >
      {!appearanceActive && (
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
          viewBox="0 0 20 20"
          width="100%"
          height="100%"
        >
          <path
            d="M 0.5 15.5 L 0.5 0.5 L 19.5 0.5 L 19.5 15.5 L 8.5 15.5 L 6.5 19.5 L 4.5 15.5 Z"
            fill={color}
            opacity={opacity}
            stroke={lineColor}
            strokeWidth="1"
            strokeLinejoin="miter"
          />
          <line x1="2.5" y1="4.25" x2="17.5" y2="4.25" stroke={lineColor} strokeWidth="1" />
          <line x1="2.5" y1="8" x2="17.5" y2="8" stroke={lineColor} strokeWidth="1" />
          <line x1="2.5" y1="11.75" x2="17.5" y2="11.75" stroke={lineColor} strokeWidth="1" />
        </svg>
      )}
    </div>
  );
}
