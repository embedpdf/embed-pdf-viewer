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
    history: { undo: 'Undo', redo: 'Redo' },
    document: { download: 'Download', print: 'Print' },
    snapshot: { copy: 'Copy', save: 'Save image', clear: 'Clear snapshot' },
    tool: {
      pointer: 'Select',
      pan: 'Pan',
      zoom: 'Marquee zoom',
      snapshot: 'Snapshot',
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
      'form-name': 'Name field',
      'form-email': 'Email field',
      'form-organization': 'Organization field',
      'form-organization-title': 'Title field',
      'form-date-signed': 'Date signed field',
      'form-initials': 'Initials field',
      'form-image': 'Image field',
    },
  },
  // What an empty form field shows for its purpose, and what a settings panel lists it as.
  form: {
    purposes: {
      name: 'Name',
      email: 'Email',
      organization: 'Organization',
      'organization-title': 'Title',
      'date-signed': 'Date signed',
      signature: 'Signature',
      initials: 'Initials',
    },
    // What the day of signing tells the person whose date it is, as its tooltip.
    hints: { 'date-signed': 'Filled in when you sign' },
    // What a field anyone fills in reads as after its name, as a group's label does.
    anyone: 'Anyone',
  },
  outline: { untitled: 'Untitled' },
} as const;

/** The strings every language has, with their text left open. */
type Shape<T> = { readonly [Key in keyof T]: T[Key] extends string ? string : Shape<T[Key]> };

/** EmbedPDF's own strings, as each language has them. */
export type EmbedpdfStrings = Shape<typeof en>;
