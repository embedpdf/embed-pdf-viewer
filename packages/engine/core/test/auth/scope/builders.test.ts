import { describe, expect, it } from 'vitest';
import {
  caps,
  collab,
  decodePdfBits,
  expandRawScope,
  materializePdfPermissions,
  parseScope,
  pdfPermissions,
  PDF_BITS,
  type DocCapability,
} from '../../../src/auth/scope';

describe('caps — capability builders return the expected literal strings', () => {
  it('session capabilities', () => {
    expect(caps.doc.open()).toBe('doc.open');
    expect(caps.doc.render()).toBe('doc.render');
  });

  it('text + content capabilities', () => {
    expect(caps.doc.text.select()).toBe('doc.text.select');
    expect(caps.doc.text.copy()).toBe('doc.text.copy');
    expect(caps.doc.text.search()).toBe('doc.text.search');
    expect(caps.doc.content.copy()).toBe('doc.content.copy');
  });

  it('download capability is callable AND carries .flattened sub-builder', () => {
    expect(caps.doc.download()).toBe('doc.download');
    expect(caps.doc.download.flattened()).toBe('doc.download.flattened');
  });

  it('print capability is callable AND carries .high sub-builder', () => {
    expect(caps.doc.print()).toBe('doc.print');
    expect(caps.doc.print.high()).toBe('doc.print.high');
  });

  it('pages + forms capabilities', () => {
    expect(caps.doc.pages.modify()).toBe('doc.pages.modify');
    expect(caps.doc.pages.assemble()).toBe('doc.pages.assemble');
    expect(caps.doc.forms.read()).toBe('doc.forms.read');
    expect(caps.doc.forms.fill()).toBe('doc.forms.fill');
    expect(caps.doc.forms.modify()).toBe('doc.forms.modify');
  });

  it('annotate read/modify split + metadata + redact', () => {
    expect(caps.doc.annotate.read()).toBe('doc.annotate.read');
    expect(caps.doc.annotate.modify()).toBe('doc.annotate.modify');
    expect(caps.doc.metadata.modify()).toBe('doc.metadata.modify');
    expect(caps.doc.redact()).toBe('doc.redact');
  });

  it('every output of caps parses back as a capability', () => {
    const all = [
      caps.doc.open(),
      caps.doc.render(),
      caps.doc.text.select(),
      caps.doc.text.copy(),
      caps.doc.text.search(),
      caps.doc.content.copy(),
      caps.doc.download(),
      caps.doc.download.flattened(),
      caps.doc.print(),
      caps.doc.print.high(),
      caps.doc.pages.modify(),
      caps.doc.pages.assemble(),
      caps.doc.forms.read(),
      caps.doc.forms.fill(),
      caps.doc.forms.modify(),
      caps.doc.annotate.read(),
      caps.doc.annotate.modify(),
      caps.doc.metadata.modify(),
      caps.doc.redact(),
    ];
    for (const s of all) {
      const parsed = parseScope(s);
      expect(parsed.kind).toBe('capability');
    }
  });
});

describe('collab — filter builders', () => {
  it('all/self filters cover create/update/delete', () => {
    expect(collab.annotations.create.self()).toBe('annotations:create:self');
    expect(collab.annotations.create.all()).toBe('annotations:create:all');
    expect(collab.annotations.update.self()).toBe('annotations:update:self');
    expect(collab.annotations.delete.self()).toBe('annotations:delete:self');
    expect(collab.annotations.update.all()).toBe('annotations:update:all');
    expect(collab.annotations.delete.all()).toBe('annotations:delete:all');
  });

  it('createdBy filter embeds the user id verbatim', () => {
    expect(collab.annotations.update.createdBy('user-7')).toBe(
      'annotations:update:createdBy=user-7',
    );
    expect(collab.annotations.delete.createdBy('urn:uuid:abc')).toBe(
      'annotations:delete:createdBy=urn:uuid:abc',
    );
    expect(collab.annotations.update.createdBy('auth0|user-44')).toBe(
      'annotations:update:createdBy=auth0|user-44',
    );
  });

  it('group filter embeds the group id verbatim', () => {
    expect(collab.annotations.update.group('4')).toBe('annotations:update:group=4');
    expect(collab.annotations.delete.group('engineering')).toBe(
      'annotations:delete:group=engineering',
    );
  });

  it('action wildcard via `.all`', () => {
    expect(collab.annotations.all.all()).toBe('annotations:*:all');
    expect(collab.annotations.all.self()).toBe('annotations:*:self');
    expect(collab.annotations.all.group('4')).toBe('annotations:*:group=4');
  });

  it('every output parses back as a collab scope', () => {
    const samples = [
      collab.annotations.create.self(),
      collab.annotations.create.group('legal'),
      collab.annotations.update.self(),
      collab.annotations.delete.createdBy('alice'),
      collab.annotations.update.group('engineering'),
      collab.annotations.setGroup.all(),
      collab.annotations.setGroup.group('legal'),
      collab.annotations.all.self(),
    ];
    for (const s of samples) {
      const parsed = parseScope(s);
      expect(parsed.kind).toBe('collab');
    }
  });

  it('setGroup builder emits only :all / :group=X', () => {
    expect(collab.annotations.setGroup.all()).toBe('annotations:set-group:all');
    expect(collab.annotations.setGroup.group('legal')).toBe('annotations:set-group:group=legal');
  });
});

describe('pdfPermissions virtual builder', () => {
  it('returns the literal string', () => {
    expect(pdfPermissions()).toBe('pdf.permissions');
  });

  it('parses as a virtual scope', () => {
    expect(parseScope(pdfPermissions())).toEqual({ kind: 'virtual', name: 'pdf.permissions' });
  });
});

describe('materializePdfPermissions', () => {
  it('always includes doc.open, doc.render, and the unconditional reads', () => {
    const set = new Set(materializePdfPermissions(decodePdfBits(null)));
    expect(set.has('doc.open')).toBe(true);
    expect(set.has('doc.render')).toBe(true);
    expect(set.has('doc.annotate.read')).toBe(true);
    expect(set.has('doc.forms.read')).toBe(true);
  });

  it('null bits yields ONLY the always-on capabilities', () => {
    const list = materializePdfPermissions(decodePdfBits(null));
    expect(list).toEqual(
      expect.arrayContaining(['doc.open', 'doc.render', 'doc.annotate.read', 'doc.forms.read']),
    );
    expect(list).toHaveLength(4);
  });

  it('bit 5 adds text.{select,copy,search} + content.copy', () => {
    const set = new Set(materializePdfPermissions(decodePdfBits(PDF_BITS.COPY)));
    expect(set.has('doc.text.select')).toBe(true);
    expect(set.has('doc.text.copy')).toBe(true);
    expect(set.has('doc.text.search')).toBe(true);
    expect(set.has('doc.content.copy')).toBe(true);
  });

  it('bit 6 adds doc.annotate.modify (reads are unconditional, not bit-gated)', () => {
    const set = new Set(materializePdfPermissions(decodePdfBits(PDF_BITS.ANNOTATE_FILL)));
    expect(set.has('doc.annotate.modify')).toBe(true);
    expect(set.has('doc.annotate.read')).toBe(true); // unconditional, already in set
  });

  it('bit 9 adds doc.forms.fill; doc.forms.read is unconditional', () => {
    const set = new Set(materializePdfPermissions(decodePdfBits(PDF_BITS.FILL_FORMS)));
    expect(set.has('doc.forms.fill')).toBe(true);
    expect(set.has('doc.forms.read')).toBe(true); // unconditional
  });

  it('bit 6 AND bit 4 required for doc.forms.modify', () => {
    expect(
      new Set(materializePdfPermissions(decodePdfBits(PDF_BITS.ANNOTATE_FILL))).has(
        'doc.forms.modify',
      ),
    ).toBe(false);
    expect(
      new Set(materializePdfPermissions(decodePdfBits(PDF_BITS.MODIFY))).has('doc.forms.modify'),
    ).toBe(false);
    expect(
      new Set(
        materializePdfPermissions(decodePdfBits(PDF_BITS.ANNOTATE_FILL | PDF_BITS.MODIFY)),
      ).has('doc.forms.modify'),
    ).toBe(true);
  });

  it('bit 12 requires bit 3 for doc.print.high', () => {
    expect(
      new Set(materializePdfPermissions(decodePdfBits(PDF_BITS.PRINT_HIGH))).has('doc.print.high'),
    ).toBe(false);
    expect(
      new Set(materializePdfPermissions(decodePdfBits(PDF_BITS.PRINT | PDF_BITS.PRINT_HIGH))).has(
        'doc.print.high',
      ),
    ).toBe(true);
  });
});

describe('materialize-vs-resolver parity (CRITICAL: keep in sync)', () => {
  // Iterate every relevant bit configuration; the set produced by
  // materializePdfPermissions must equal the set produced by
  // expandRawScope(['pdf.permissions'], bits). If this test ever fails,
  // someone has changed one of the two expansion implementations without
  // updating the other.
  const allMasks = [
    0,
    PDF_BITS.PRINT,
    PDF_BITS.MODIFY,
    PDF_BITS.COPY,
    PDF_BITS.ANNOTATE_FILL,
    PDF_BITS.FILL_FORMS,
    PDF_BITS.ACCESSIBILITY,
    PDF_BITS.ASSEMBLE,
    PDF_BITS.PRINT_HIGH,
    PDF_BITS.PRINT | PDF_BITS.PRINT_HIGH,
    PDF_BITS.ANNOTATE_FILL | PDF_BITS.MODIFY,
    PDF_BITS.ANNOTATE_FILL | PDF_BITS.FILL_FORMS,
    PDF_BITS.PRINT |
      PDF_BITS.MODIFY |
      PDF_BITS.COPY |
      PDF_BITS.ANNOTATE_FILL |
      PDF_BITS.FILL_FORMS |
      PDF_BITS.ASSEMBLE |
      PDF_BITS.PRINT_HIGH,
  ];

  it.each(allMasks)('mask=%i: materialize matches expandRawScope', (mask) => {
    const bits = decodePdfBits(mask);
    const fromMaterialize = new Set<DocCapability>(materializePdfPermissions(bits));
    const fromExpand = expandRawScope(['pdf.permissions'], bits);
    expect(fromMaterialize).toEqual(fromExpand);
  });
});
