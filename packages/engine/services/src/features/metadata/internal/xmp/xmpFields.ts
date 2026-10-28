import type {
  CustomMetadataPatch,
  DateInput,
  DocumentMetadataTrapped,
  MetadataPatch,
} from '@embedpdf/engine-core/runtime';

import type { XmpEdit, XmpProperty, XmpValue } from './editXmp';
import { formatPdfDate, pdfDateToIso } from '../../../../shared/pdf-date';

const DC = 'http://purl.org/dc/elements/1.1/';
const XMP = 'http://ns.adobe.com/xap/1.0/';
const PDF = 'http://ns.adobe.com/pdf/1.3/';
/** Where Adobe apps copy the custom keys of a document's /Info. */
const PDFX = 'http://ns.adobe.com/pdfx/1.3/';

const property = (ns: string, prefix: string, name: string): XmpProperty => ({ ns, prefix, name });

/**
 * The XMP property each standard field is, as PDF/A pairs them with /Info,
 * and the form its value takes there.
 */
const FIELDS = {
  title: { property: property(DC, 'dc', 'title'), kind: 'alt' },
  author: { property: property(DC, 'dc', 'creator'), kind: 'seq' },
  subject: { property: property(DC, 'dc', 'description'), kind: 'alt' },
  keywords: { property: property(PDF, 'pdf', 'Keywords'), kind: 'text' },
  creator: { property: property(XMP, 'xmp', 'CreatorTool'), kind: 'text' },
  producer: { property: property(PDF, 'pdf', 'Producer'), kind: 'text' },
} as const;

const CREATED = property(XMP, 'xmp', 'CreateDate');
const MODIFIED = property(XMP, 'xmp', 'ModifyDate');
const TRAPPED = property(PDF, 'pdf', 'Trapped');
/** Adobe apps also list the keywords one by one here. */
const KEYWORD_LIST = property(DC, 'dc', 'subject');

const TRAPPED_VALUES: Record<DocumentMetadataTrapped, string> = {
  true: 'True',
  false: 'False',
  unknown: 'Unknown',
};

/**
 * The XMP edits that keep a packet in step with a metadata patch. A field the
 * patch sets is written to its property, which is added when the packet
 * doesn't have it (PDF/A asks the two to match); a field it clears is
 * removed. Fields it leaves out stay as they are. A keyword list the packet
 * has follows the keywords, split at commas and semicolons.
 */
export function xmpEditsForMetadata(patch: MetadataPatch): XmpEdit[] {
  const edits: XmpEdit[] = [];
  const edit = (property: XmpProperty, value: XmpValue | null, add = true) =>
    edits.push({ property, value, add });

  for (const [field, { property, kind }] of Object.entries(FIELDS)) {
    const value = patch[field as keyof typeof FIELDS];
    if (value === undefined) continue;
    if (value === null) edit(property, null);
    else if (kind === 'seq') edit(property, { kind, items: [value] });
    else edit(property, { kind, text: value });
  }
  if (patch.keywords !== undefined) {
    const items = patch.keywords === null ? null : splitKeywords(patch.keywords);
    edit(KEYWORD_LIST, items && { kind: 'bag', items }, false);
  }
  if (patch.createdAt !== undefined) edit(CREATED, dateValue(patch.createdAt));
  if (patch.modifiedAt !== undefined) edit(MODIFIED, dateValue(patch.modifiedAt));
  if (patch.trapped !== undefined) {
    edit(TRAPPED, { kind: 'text', text: TRAPPED_VALUES[patch.trapped] });
  }
  return edits;
}

/**
 * The XMP edits for a custom-key patch: a key's `pdfx:` property follows it
 * when the packet has one, and goes when the key does. None is added: a
 * namespace PDF/A doesn't know needs a schema description in the packet.
 * A key that can't be an XML name can't be in the packet.
 */
export function xmpEditsForCustomMetadata(patch: CustomMetadataPatch): XmpEdit[] {
  return Object.entries(patch)
    .filter(([key]) => /^[A-Za-z_][A-Za-z0-9._-]*$/.test(key))
    .map(([key, value]) => ({
      property: property(PDFX, 'pdfx', key),
      value: value === null ? null : { kind: 'text', text: value },
      add: false,
    }));
}

function splitKeywords(keywords: string): string[] {
  return keywords
    .split(/[,;]/)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword !== '');
}

/** The date as /Info gets it (whole seconds, the same offset), written the XMP way. */
function dateValue(value: DateInput | null): XmpValue | null {
  if (value === null) return null;
  const pdfDate = formatPdfDate(value);
  return { kind: 'text', text: pdfDateToIso(pdfDate) ?? pdfDate };
}
