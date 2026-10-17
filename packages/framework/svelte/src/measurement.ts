/**
 * @embedpdf/svelte/measurement — distances, perimeters and areas in the page's scale.
 *
 * Measuring rides the annotation plugin (the `distance`, `perimeter` and `area` tools draw on its
 * `<AnnotationLayer>`); these readers surface the scale, the calibration and the readouts:
 *
 *   const measurement = useMeasurement();
 *   const scale = usePageScale(0); // scale.current: the cover's
 *   const readout = useMeasurementReadout(() => annotation); // readout.current.label
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-measurement';

export {
  useMeasurement,
  useMeasurementEvent,
  useMeasurementReadout,
  useMeasurementSettings,
  useMeasurementState,
  usePageScale,
} from './measurement/readers';
