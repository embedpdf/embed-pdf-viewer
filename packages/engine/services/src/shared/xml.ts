/**
 * A small XML reader that keeps where everything is in the text, so a caller
 * can change one element and leave every other character as it was written.
 *
 * It reads elements, attributes, text and CDATA, resolves namespaces, and
 * decodes the predefined entities and character references. It skips the XML
 * declaration, processing instructions, comments and a DOCTYPE. Text that
 * isn't well-formed (a tag that doesn't close, an unknown entity, a stray
 * `<`) is unreadable: {@link parseXml} returns `null` rather than guess.
 */

/** The namespace the `xml` prefix is always bound to (`xml:lang`). */
export const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
/** The namespace of `xmlns` declarations. */
export const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';

export interface XmlAttribute {
  /** The name as written, such as `rdf:about`. */
  qname: string;
  prefix: string;
  local: string;
  /**
   * The namespace its prefix is bound to; `null` for an unprefixed
   * attribute (attributes take no default namespace) or an unbound prefix.
   */
  ns: string | null;
  /** The value, decoded. */
  value: string;
  /** Where its name starts, and just after its closing quote. */
  start: number;
  end: number;
  /** Where its value starts and ends, between the quotes. */
  valueStart: number;
  valueEnd: number;
}

export interface XmlElement {
  /** The name as written, such as `dc:title`. */
  qname: string;
  prefix: string;
  local: string;
  /** The namespace of its name; `null` when it has none or the prefix is unbound. */
  ns: string | null;
  attributes: XmlAttribute[];
  /** Prefix → namespace in scope here, its own declarations included (`''` is the default). */
  scope: ReadonlyMap<string, string>;
  parent: XmlElement | null;
  children: XmlElement[];
  /** The text and CDATA directly inside it, decoded. */
  text: string;
  /** The `<` of its start tag. */
  start: number;
  /** Where its start tag's `/>` or `>` begins. */
  startTagClose: number;
  /** Just after its start tag. */
  startTagEnd: number;
  /** Whether its start tag closes it (`<a/>`). */
  selfClosing: boolean;
  /** The `<` of its end tag; `startTagEnd` when it closes itself. */
  endTagStart: number;
  /** Just after its end tag (or its start tag, when it closes itself). */
  end: number;
}

/** The text's elements, from its one root; `null` when it isn't well-formed. */
export function parseXml(text: string): XmlElement | null {
  try {
    return new XmlReader(text).read();
  } catch (error) {
    if (error instanceof Unreadable) return null;
    throw error;
  }
}

/** Every element under `element`, in document order (`element` first). */
export function* walkXml(element: XmlElement): Generator<XmlElement> {
  yield element;
  for (const child of element.children) yield* walkXml(child);
}

/** `value` as XML text: `&`, `<` and `>` escaped, characters XML can't hold dropped. */
export function escapeXmlText(value: string): string {
  return withoutUnwritable(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');
}

/** `value` as an attribute value between either kind of quote. */
export function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;');
}

/** `prefix:local`, or `local` alone for no prefix. */
export function xmlName(prefix: string, local: string): string {
  return prefix ? `${prefix}:${local}` : local;
}

/**
 * Characters XML 1.0 can't hold at all, not even as a reference: controls
 * other than tab, line feed and carriage return, lone surrogates, `U+FFFE`
 * and `U+FFFF`.
 */
function withoutUnwritable(value: string): string {
  let kept = '';
  for (const char of value) {
    const code = char.codePointAt(0)!;
    const control = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    const loneSurrogate = code >= 0xd800 && code <= 0xdfff;
    if (!control && !loneSurrogate && code !== 0xfffe && code !== 0xffff) kept += char;
  }
  return kept;
}

class Unreadable extends Error {}

const ENTITY = /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|(lt|gt|amp|quot|apos));/g;
const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const SPACE = /[ \t\r\n]/;
const NAME_END = /[ \t\r\n/>=<"']/;

function decode(raw: string): string {
  if (!raw.includes('&')) return raw;
  if (raw.replace(ENTITY, '').includes('&')) throw new Unreadable();
  return raw.replace(ENTITY, (_, hex: string, decimal: string, name: string) => {
    if (name) return NAMED[name]!;
    const code = hex ? parseInt(hex, 16) : Number(decimal);
    if (code > 0x10ffff) throw new Unreadable();
    return String.fromCodePoint(code);
  });
}

function splitName(qname: string): { prefix: string; local: string } {
  const colon = qname.indexOf(':');
  return colon < 0
    ? { prefix: '', local: qname }
    : { prefix: qname.slice(0, colon), local: qname.slice(colon + 1) };
}

class XmlReader {
  private at = 0;
  private readonly open: XmlElement[] = [];
  private root: XmlElement | null = null;

  constructor(private readonly text: string) {}

  read(): XmlElement {
    const { text } = this;
    while (this.at < text.length) {
      const lt = text.indexOf('<', this.at);
      const textEnd = lt < 0 ? text.length : lt;
      if (textEnd > this.at) this.addText(text.slice(this.at, textEnd));
      if (lt < 0) break;
      if (text.startsWith('<!--', lt)) this.at = this.after('-->', lt + 4);
      else if (text.startsWith('<![CDATA[', lt)) this.readCData(lt);
      else if (text.startsWith('<?', lt)) this.at = this.after('?>', lt + 2);
      else if (text.startsWith('<!', lt)) this.skipDeclaration(lt);
      else if (text.startsWith('</', lt)) this.readEndTag(lt);
      else this.readStartTag(lt);
    }
    if (this.open.length > 0 || !this.root) throw new Unreadable();
    return this.root;
  }

  /** Just after the next `token` from `from`. */
  private after(token: string, from: number): number {
    const found = this.text.indexOf(token, from);
    if (found < 0) throw new Unreadable();
    return found + token.length;
  }

  private skipSpace(from: number): number {
    let i = from;
    while (i < this.text.length && SPACE.test(this.text[i]!)) i++;
    return i;
  }

  private readName(from: number): string {
    let i = from;
    while (i < this.text.length && !NAME_END.test(this.text[i]!)) i++;
    if (i === from) throw new Unreadable();
    return this.text.slice(from, i);
  }

  /** Text inside the open element; text outside the root (packet padding) is passed over. */
  private addText(raw: string, cdata = false): void {
    const current = this.open[this.open.length - 1];
    if (!current) return;
    const normalized = raw.replace(/\r\n?/g, '\n');
    current.text += cdata ? normalized : decode(normalized);
  }

  private readCData(lt: number): void {
    const close = this.text.indexOf(']]>', lt + 9);
    if (close < 0) throw new Unreadable();
    this.addText(this.text.slice(lt + 9, close), true);
    this.at = close + 3;
  }

  /** `<!DOCTYPE …>`, with an internal subset in brackets. */
  private skipDeclaration(lt: number): void {
    let depth = 0;
    for (let i = lt + 2; i < this.text.length; i++) {
      const c = this.text[i];
      if (c === '[') depth++;
      else if (c === ']') depth--;
      else if (c === '>' && depth <= 0) {
        this.at = i + 1;
        return;
      }
    }
    throw new Unreadable();
  }

  private readStartTag(lt: number): void {
    const { text } = this;
    const qname = this.readName(lt + 1);
    const attributes: XmlAttribute[] = [];
    let i = lt + 1 + qname.length;
    let startTagClose: number;
    let selfClosing = false;
    for (;;) {
      const next = this.skipSpace(i);
      if (text.startsWith('/>', next)) {
        startTagClose = next;
        selfClosing = true;
        break;
      }
      if (text[next] === '>') {
        startTagClose = next;
        break;
      }
      // An attribute needs white space before it.
      if (next === i || next >= text.length) throw new Unreadable();
      const name = this.readName(next);
      let j = this.skipSpace(next + name.length);
      if (text[j] !== '=') throw new Unreadable();
      j = this.skipSpace(j + 1);
      const quote = text[j];
      if (quote !== '"' && quote !== "'") throw new Unreadable();
      const close = text.indexOf(quote, j + 1);
      if (close < 0) throw new Unreadable();
      const raw = text.slice(j + 1, close);
      if (raw.includes('<')) throw new Unreadable();
      attributes.push({
        qname: name,
        ...splitName(name),
        ns: null,
        // Attribute values read their white space as spaces.
        value: decode(raw.replace(/[\t\r\n]/g, ' ')),
        start: next,
        end: close + 1,
        valueStart: j + 1,
        valueEnd: close,
      });
      i = close + 1;
    }

    const parent = this.open[this.open.length - 1] ?? null;
    if (!parent && this.root) throw new Unreadable(); // a second root
    const scope = new Map(parent?.scope ?? []);
    for (const attribute of attributes) {
      if (attribute.qname === 'xmlns') scope.set('', attribute.value);
      else if (attribute.prefix === 'xmlns') scope.set(attribute.local, attribute.value);
    }
    // `xmlns=""` takes the default namespace away: '' reads as none.
    const resolve = (prefix: string): string | null =>
      prefix === 'xml' ? XML_NAMESPACE : scope.get(prefix) || null;
    for (const attribute of attributes) {
      attribute.ns =
        attribute.qname === 'xmlns' || attribute.prefix === 'xmlns'
          ? XMLNS_NAMESPACE
          : attribute.prefix
            ? resolve(attribute.prefix)
            : null;
    }
    const startTagEnd = startTagClose + (selfClosing ? 2 : 1);
    const { prefix, local } = splitName(qname);
    const element: XmlElement = {
      qname,
      prefix,
      local,
      ns: resolve(prefix),
      attributes,
      scope,
      parent,
      children: [],
      text: '',
      start: lt,
      startTagClose,
      startTagEnd,
      selfClosing,
      endTagStart: startTagEnd,
      end: startTagEnd,
    };
    if (parent) parent.children.push(element);
    else this.root = element;
    if (!selfClosing) this.open.push(element);
    this.at = startTagEnd;
  }

  private readEndTag(lt: number): void {
    const qname = this.readName(lt + 2);
    const close = this.skipSpace(lt + 2 + qname.length);
    const element = this.open.pop();
    if (this.text[close] !== '>' || !element || element.qname !== qname) throw new Unreadable();
    element.endTagStart = lt;
    element.end = close + 1;
    this.at = close + 1;
  }
}
