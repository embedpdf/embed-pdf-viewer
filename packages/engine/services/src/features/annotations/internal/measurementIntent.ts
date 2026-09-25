import type { LineIntent, PolygonIntent, PolylineIntent } from '@embedpdf/engine-core/runtime';

type MeasurementIntent = LineIntent | PolygonIntent | PolylineIntent;

/**
 * Line, polygon and polyline `/IT` names (ISO 32000 §12.5.6.7, §12.5.6.9)
 * mapped to the kebab-case intents the API speaks. The file keeps PDF's
 * names; a name the kind doesn't take reads as no intent.
 */
const NAMES: Record<MeasurementIntent, string> = {
  'line-arrow': 'LineArrow',
  'line-dimension': 'LineDimension',
  'polygon-cloud': 'PolygonCloud',
  'polygon-dimension': 'PolygonDimension',
  'polyline-dimension': 'PolyLineDimension',
};

export function measurementIntentToName(intent: MeasurementIntent): string {
  return NAMES[intent];
}

export function lineIntentFromName(name: string | null): LineIntent | null {
  return name === 'LineArrow' ? 'line-arrow' : name === 'LineDimension' ? 'line-dimension' : null;
}

export function polygonIntentFromName(name: string | null): PolygonIntent | null {
  return name === 'PolygonCloud'
    ? 'polygon-cloud'
    : name === 'PolygonDimension'
      ? 'polygon-dimension'
      : null;
}

export function polylineIntentFromName(name: string | null): PolylineIntent | null {
  return name === 'PolyLineDimension' ? 'polyline-dimension' : null;
}
