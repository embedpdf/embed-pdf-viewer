import {
  escapeXmlAttribute,
  escapeXmlText,
  parseXml,
  walkXml,
  xmlName,
  XML_NAMESPACE,
  XMLNS_NAMESPACE,
  type XmlAttribute,
  type XmlElement,
} from '../../../../shared/xml';

/** RDF's namespace: an XMP packet's properties sit in its `rdf:Description`s. */
export const RDF_NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

/** A property of an XMP packet, and the prefix it is written with when added. */
export interface XmpProperty {
  ns: string;
  name: string;
  prefix: string;
}

/** A property's value, in the forms document metadata uses. */
export type XmpValue =
  | { kind: 'text'; text: string }
  /** A language alternative (`rdf:Alt`) holding only its default, `x-default`. */
  | { kind: 'alt'; text: string }
  /** An ordered list (`rdf:Seq`). */
  | { kind: 'seq'; items: readonly string[] }
  /** An unordered list (`rdf:Bag`). */
  | { kind: 'bag'; items: readonly string[] };

export interface XmpEdit {
  property: XmpProperty;
  /** The new value; `null` removes the property. */
  value: XmpValue | null;
  /** Whether a value is added when the packet doesn't have the property; if not, only one that's there changes. */
  add: boolean;
}

/**
 * The XMP packet with `edits` made and every other character as it was, or
 * `null` when the packet can't be read (it isn't well-formed XML, or has no
 * `rdf:RDF`).
 *
 * A property is a child of one of the top-level `rdf:Description`s, or one of
 * their attributes (the short form of a text value). Removing a property
 * removes it everywhere it appears. Setting one writes it where it first
 * appears, as an attribute still when it is one and the value is text, and
 * removes it everywhere else; when it already reads the new value nothing
 * changes. A property the packet doesn't have goes into the description that
 * declares its namespace, else the first.
 */
export function editXmp(packet: string, edits: readonly XmpEdit[]): string | null {
  const root = parseXml(packet);
  const rdf = root && [...walkXml(root)].find((element) => isRdf(element, 'RDF'));
  if (!rdf) return null;
  const descriptions = rdf.children.filter((element) => isRdf(element, 'Description'));
  const writer = new PacketWriter(packet, rdf);

  for (const { property, value, add } of edits) {
    const elements = descriptions.flatMap((description) =>
      description.children.filter((child) => names(child, property)),
    );
    const attributes = descriptions.flatMap((description) =>
      description.attributes
        .filter((attribute) => names(attribute, property))
        .map((attribute) => ({ attribute, description })),
    );

    if (value === null) {
      elements.forEach((element) => writer.removeElement(element));
      attributes.forEach(({ attribute }) => writer.removeAttribute(attribute));
      continue;
    }

    const [element, ...otherElements] = elements;
    const [first, ...otherAttributes] = attributes;
    if (element) {
      if (otherElements.length > 0 || attributes.length > 0 || !reads(element, value)) {
        writer.replaceElement(element, value);
        otherElements.forEach((other) => writer.removeElement(other));
        attributes.forEach(({ attribute }) => writer.removeAttribute(attribute));
      }
    } else if (first && value.kind === 'text') {
      if (otherAttributes.length > 0 || first.attribute.value !== value.text) {
        writer.replaceAttributeValue(first.attribute, value.text);
        otherAttributes.forEach(({ attribute }) => writer.removeAttribute(attribute));
      }
    } else if (first) {
      attributes.forEach(({ attribute }) => writer.removeAttribute(attribute));
      writer.addProperty(first.description, property, value);
    } else if (add) {
      const target =
        descriptions.find((description) => declares(description, property.ns)) ?? descriptions[0];
      writer.addProperty(target ?? null, property, value);
    }
  }
  return writer.result();
}

function isRdf(element: XmlElement, local: string): boolean {
  return element.ns === RDF_NAMESPACE && element.local === local;
}

function names(node: XmlElement | XmlAttribute, property: XmpProperty): boolean {
  return node.ns === property.ns && node.local === property.name;
}

function declares(description: XmlElement, ns: string): boolean {
  return description.attributes.some(
    (attribute) => attribute.ns === XMLNS_NAMESPACE && attribute.value === ns,
  );
}

/** Whether `element` already holds `value`, in the form it would be written. */
function reads(element: XmlElement, value: XmpValue): boolean {
  if (element.attributes.some((attribute) => attribute.ns === RDF_NAMESPACE)) return false;
  if (value.kind === 'text') return element.children.length === 0 && element.text === value.text;
  const [container, ...rest] = element.children;
  const local = { alt: 'Alt', seq: 'Seq', bag: 'Bag' }[value.kind];
  if (!container || rest.length > 0 || !isRdf(container, local)) return false;
  const items = container.children;
  if (!items.every((item) => isRdf(item, 'li') && item.children.length === 0)) return false;
  if (value.kind === 'alt') {
    const [item] = items;
    const lang = item?.attributes.find((a) => a.ns === XML_NAMESPACE && a.local === 'lang');
    return items.length === 1 && lang?.value === 'x-default' && item!.text === value.text;
  }
  return (
    items.length === value.items.length &&
    items.every((item, index) => item.text === value.items[index])
  );
}

interface Splice {
  start: number;
  end: number;
  text: string;
}

/** What goes into one description: namespace declarations for its start tag, and children. */
interface Additions {
  declarations: Map<string, string>;
  children: string[];
}

/**
 * Collects the changes to a packet as splices of its text, and writes them
 * out at the end. Additions to one description are gathered first, so its
 * start tag and its end get one change each.
 */
class PacketWriter {
  private readonly splices: Splice[] = [];
  /** By description; `null` is a description to be made, for a packet without one. */
  private readonly additions = new Map<XmlElement | null, Additions>();

  constructor(
    private readonly packet: string,
    private readonly rdf: XmlElement,
  ) {}

  /** Removes `element` with the white space before it. */
  removeElement(element: XmlElement): void {
    this.splices.push({ start: this.spaceBefore(element.start), end: element.end, text: '' });
  }

  removeAttribute(attribute: XmlAttribute): void {
    this.splices.push({ start: this.spaceBefore(attribute.start), end: attribute.end, text: '' });
  }

  replaceAttributeValue(attribute: XmlAttribute, text: string): void {
    this.splices.push({
      start: attribute.valueStart,
      end: attribute.valueEnd,
      text: escapeXmlAttribute(text),
    });
  }

  /** Writes `element` again holding `value`, keeping its name and its own namespace declarations. */
  replaceElement(element: XmlElement, value: XmpValue): void {
    const declarations = element.attributes
      .filter((attribute) => attribute.ns === XMLNS_NAMESPACE)
      .map((attribute) => ` ${this.packet.slice(attribute.start, attribute.end)}`)
      .join('');
    const rdfPrefix = prefixIn(element.scope, RDF_NAMESPACE) ?? 'rdf';
    this.splices.push({
      start: element.start,
      end: element.end,
      text: propertyXml(element.qname, declarations, rdfPrefix, value),
    });
  }

  addProperty(description: XmlElement | null, property: XmpProperty, value: XmpValue): void {
    const additions = this.additionsFor(description);
    const scope = description?.scope ?? this.rdf.scope;
    const prefix = prefixIn(scope, property.ns, false) ?? this.declare(additions, scope, property);
    const rdfPrefix = prefixIn(scope, RDF_NAMESPACE) ?? 'rdf';
    additions.children.push(propertyXml(xmlName(prefix, property.name), '', rdfPrefix, value));
  }

  result(): string {
    for (const [description, additions] of this.additions)
      this.writeAdditions(description, additions);
    // Insertions (empty ranges) go before a change starting at the same place.
    const ordered = this.splices
      .map((splice, index) => ({ splice, index }))
      .sort(
        (a, b) =>
          a.splice.start - b.splice.start ||
          a.splice.end - a.splice.start - (b.splice.end - b.splice.start) ||
          a.index - b.index,
      );
    let out = '';
    let at = 0;
    for (const { splice } of ordered) {
      if (splice.start < at) throw new Error('XMP edits overlap');
      out += this.packet.slice(at, splice.start) + splice.text;
      at = splice.end;
    }
    return out + this.packet.slice(at);
  }

  private additionsFor(description: XmlElement | null): Additions {
    let additions = this.additions.get(description);
    if (!additions) {
      additions = { declarations: new Map(), children: [] };
      this.additions.set(description, additions);
    }
    return additions;
  }

  /** A prefix free in `scope` for the property's namespace, declared on the description. */
  private declare(
    additions: Additions,
    scope: ReadonlyMap<string, string>,
    property: XmpProperty,
  ): string {
    for (const [prefix, ns] of additions.declarations) if (ns === property.ns) return prefix;
    let prefix = property.prefix;
    for (let n = 2; scope.has(prefix) || additions.declarations.has(prefix); n++) {
      prefix = `${property.prefix}${n}`;
    }
    additions.declarations.set(prefix, property.ns);
    return prefix;
  }

  private writeAdditions(description: XmlElement | null, additions: Additions): void {
    const declarations = [...additions.declarations]
      .map(([prefix, ns]) => ` xmlns:${prefix}="${escapeXmlAttribute(ns)}"`)
      .join('');
    if (!description) {
      // A packet without a description gets one, about the same resource as its siblings would be.
      const rdfPrefix = this.rdf.prefix;
      const name = xmlName(rdfPrefix, 'Description');
      const made = `<${name} ${xmlName(rdfPrefix, 'about')}=""${declarations}>${additions.children.join('')}</${name}>`;
      this.insertInto(this.rdf, made);
      return;
    }
    if (declarations) {
      this.splices.push({
        start: description.startTagClose,
        end: description.startTagClose,
        text: declarations,
      });
    }
    const indent = this.childIndent(description);
    this.insertInto(description, additions.children.map((child) => indent + child).join(''));
  }

  /** Puts `text` after `parent`'s last child, turning `<a/>` into `<a>…</a>`. */
  private insertInto(parent: XmlElement, text: string): void {
    if (parent.selfClosing) {
      this.splices.push({
        start: parent.startTagClose,
        end: parent.startTagEnd,
        text: `>${text}</${parent.qname}>`,
      });
      return;
    }
    const last = parent.children[parent.children.length - 1];
    const at = last ? last.end : parent.startTagEnd;
    this.splices.push({ start: at, end: at, text });
  }

  /** The white space its children are written after, so an added one lines up. */
  private childIndent(description: XmlElement): string {
    const [first] = description.children;
    const before = first
      ? this.packet.slice(description.startTagEnd, first.start)
      : this.packet.slice(description.startTagEnd, description.endTagStart);
    if (!/^\s*$/.test(before)) return '';
    return first ? before : before && `${before}   `;
  }

  private spaceBefore(index: number): number {
    let start = index;
    while (start > 0 && /\s/.test(this.packet[start - 1]!)) start--;
    return start;
  }
}

/** The prefix `ns` has in `scope`; the default namespace (`''`) only when `allowDefault`. */
function prefixIn(
  scope: ReadonlyMap<string, string>,
  ns: string,
  allowDefault = true,
): string | undefined {
  let found: string | undefined;
  for (const [prefix, bound] of scope) {
    if (bound !== ns) continue;
    if (prefix) return prefix;
    if (allowDefault) found = prefix;
  }
  return found;
}

function propertyXml(
  name: string,
  declarations: string,
  rdfPrefix: string,
  value: XmpValue,
): string {
  const rdf = (local: string) => xmlName(rdfPrefix, local);
  const item = (text: string, attributes = '') =>
    `<${rdf('li')}${attributes}>${escapeXmlText(text)}</${rdf('li')}>`;
  const container = (local: string, items: string) => `<${rdf(local)}>${items}</${rdf(local)}>`;
  let inner: string;
  switch (value.kind) {
    case 'text':
      inner = escapeXmlText(value.text);
      break;
    case 'alt':
      inner = container('Alt', item(value.text, ' xml:lang="x-default"'));
      break;
    case 'seq':
      inner = container('Seq', value.items.map((text) => item(text)).join(''));
      break;
    case 'bag':
      inner = container('Bag', value.items.map((text) => item(text)).join(''));
      break;
  }
  return `<${name}${declarations}>${inner}</${name}>`;
}
