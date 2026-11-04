/**
 * `text` with every line break (`\r\n`, `\r` or `\n`) spelled `lineBreak`.
 * Text the engine returns ends its lines in `\n`; a PDF string spells them
 * `\r`, as Acrobat writes them, so the engine converts on read and write.
 */
export function toLineBreaks(text: string, lineBreak: '\n' | '\r'): string {
  return text.replace(/\r\n|\r|\n/g, lineBreak);
}
