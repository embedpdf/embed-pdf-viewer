export const METRES = {
  pt: 0.0254 / 72,
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
  mi: 1609.344,
} as const;
export type LengthUnit = keyof typeof METRES;
export type AreaUnit = `${LengthUnit}2` | 'ha' | 'acre';
export const squareOf = (unit: LengthUnit): AreaUnit => `${unit}2`;
export function squareMetres(unit: AreaUnit): number {
  return unit === 'ha'
    ? 10000
    : unit === 'acre'
      ? 4046.8564224
      : METRES[unit.slice(0, -1) as LengthUnit] ** 2;
}
export const areaUnitLabel = (unit: AreaUnit): string =>
  unit.endsWith('2') ? unit.slice(0, -1) + '²' : unit;
