/**
 * `/State` + `/StateModel` spelling maps — ISO 32000 §12.5.6.3, Table 174.
 *
 * Known values are wire-stable lowercase (the house vocabulary — same
 * rationale as `AnnotationReplyType` / `AnnotationBorderStyle`); the PDF
 * stores the capitalized Table 174 spellings. Unknown values — custom
 * Acrobat state models and their states — pass through VERBATIM in both
 * directions, so foreign review workflows survive a round trip.
 */

const STATE_MODEL_TO_PDF: Record<string, string> = {
  review: 'Review',
  marked: 'Marked',
};

const STATE_TO_PDF: Record<string, string> = {
  accepted: 'Accepted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  completed: 'Completed',
  none: 'None',
  marked: 'Marked',
  unmarked: 'Unmarked',
};

const PDF_TO_STATE_MODEL: Record<string, string> = invert(STATE_MODEL_TO_PDF);
const PDF_TO_STATE: Record<string, string> = invert(STATE_TO_PDF);

export function stateModelToPdf(value: string): string {
  return STATE_MODEL_TO_PDF[value] ?? value;
}

export function stateModelFromPdf(value: string): string {
  return PDF_TO_STATE_MODEL[value] ?? value;
}

export function stateToPdf(value: string): string {
  return STATE_TO_PDF[value] ?? value;
}

export function stateFromPdf(value: string): string {
  return PDF_TO_STATE[value] ?? value;
}

function invert(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([wire, pdf]) => [pdf, wire]));
}
