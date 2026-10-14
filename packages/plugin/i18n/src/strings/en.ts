/** EmbedPDF's own strings in English: the shape every other language follows. */
export const en = {
  commands: {
    zoom: { in: 'Zoom in', out: 'Zoom out', fitWidth: 'Fit width', fitPage: 'Fit page' },
    page: {
      next: 'Next page',
      previous: 'Previous page',
      first: 'First page',
      last: 'Last page',
    },
    view: {
      rotateClockwise: 'Rotate clockwise',
      rotateCounterclockwise: 'Rotate counterclockwise',
    },
    selection: { copy: 'Copy' },
    annotation: { delete: 'Delete' },
    document: { download: 'Download', print: 'Print' },
    tool: {
      pointer: 'Select',
      pan: 'Pan',
      highlight: 'Highlight',
      underline: 'Underline',
      strikeout: 'Strikethrough',
      squiggly: 'Squiggly underline',
      'insert-text': 'Insert text',
      'replace-text': 'Replace text',
      ink: 'Draw',
      'ink-highlight': 'Highlighter',
      'free-text': 'Text box',
      'free-text-callout': 'Callout',
      note: 'Note',
      square: 'Rectangle',
      circle: 'Ellipse',
      line: 'Line',
      polygon: 'Polygon',
      polyline: 'Polyline',
      link: 'Link',
      stamp: 'Stamp',
      attachment: 'Attach file',
      redact: 'Redact',
      distance: 'Distance',
      perimeter: 'Perimeter',
      area: 'Area',
      calibrate: 'Calibrate',
      'form-fill': 'Fill form',
      'form-edit': 'Edit form',
      'form-text': 'Text field',
      'form-checkbox': 'Checkbox',
      'form-radio': 'Radio button',
      'form-combobox': 'Dropdown',
      'form-listbox': 'List box',
      'form-signature': 'Signature field',
    },
  },
} as const;

/** The strings every language has, with their text left open. */
type Shape<T> = { readonly [Key in keyof T]: T[Key] extends string ? string : Shape<T[Key]> };

/** EmbedPDF's own strings, as each language has them. */
export type EmbedpdfStrings = Shape<typeof en>;
