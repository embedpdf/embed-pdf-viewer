import { describe, expect, it } from 'vitest';

import { DRAWN_FLAGS } from './flags';
import { isSelectable, paintOrder } from './hit';
import { effFlags } from './session';
import { initialModel, update } from './update';
import type { Annot, Model } from './types';

const PON = 7;
const rect = (x: number, y: number): Annot['geom'] => ({
  t: 'rect',
  rect: { x, y, width: 40, height: 30 },
  ellipse: false,
});
const annot = (id: string, over: Partial<Annot> = {}): Annot => ({
  id,
  ref: null,
  pon: PON,
  subtype: 'square',
  geom: rect(10, 10),
  style: initialModel.style,
  flags: DRAWN_FLAGS,
  source: 'vector',
  ...over,
});

const base = (): Model =>
  update(initialModel, {
    t: 'loaded',
    annots: [
      annot('obj:1'),
      annot('obj:2', { flags: { ...DRAWN_FLAGS, hidden: true } }),
      annot('obj:3'),
    ],
  })[0];

describe('session visibility overlay', () => {
  it('hiding removes an annotation from paint, hit, and selectability', () => {
    let m = base();
    expect(paintOrder(m, PON)).toContain('obj:1');
    m = update(m, { t: 'setSessionHidden', entries: [{ id: 'obj:1', hidden: true }] })[0];
    expect(paintOrder(m, PON)).not.toContain('obj:1');
    expect(isSelectable(m, 'obj:1')).toBe(false);
    expect(effFlags(m, 'obj:1').hidden).toBe(true);
  });

  it('showing (/H false) overrides a document /F hidden bit — paint AND interaction', () => {
    let m = base();
    expect(paintOrder(m, PON)).not.toContain('obj:2');
    expect(isSelectable(m, 'obj:2')).toBe(false);
    m = update(m, { t: 'setSessionHidden', entries: [{ id: 'obj:2', hidden: false }] })[0];
    expect(paintOrder(m, PON)).toContain('obj:2');
    // The session-SHOWN annotation must be live, not painted-but-dead.
    expect(isSelectable(m, 'obj:2')).toBe(true);
    expect(effFlags(m, 'obj:2').hidden).toBe(false);
  });

  it('is an identity-preserving no-op when nothing changes and emits zero effects', () => {
    const m = base();
    const [same, effects] = update(m, {
      t: 'setSessionHidden',
      entries: [{ id: 'ghost', hidden: true }],
    });
    expect(same).toBe(m);
    expect(effects).toEqual([]);
    const [withOverride] = update(m, {
      t: 'setSessionHidden',
      entries: [{ id: 'obj:1', hidden: true }],
    });
    const [again, fx2] = update(withOverride, {
      t: 'setSessionHidden',
      entries: [{ id: 'obj:1', hidden: true }],
    });
    expect(again).toBe(withOverride);
    expect(fx2).toEqual([]);
  });

  it('hiding clears transient engagement: selection, editing, hover', () => {
    let m = base();
    m = update(m, { t: 'select', ids: ['obj:1', 'obj:3'] })[0];
    m = { ...m, editing: 'obj:1', hovered: 'obj:1' };
    m = update(m, { t: 'setSessionHidden', entries: [{ id: 'obj:1', hidden: true }] })[0];
    expect(m.selected).toEqual(['obj:3']);
    expect(m.editing).toBeNull();
    expect(m.hovered).toBeNull();
  });

  it('survives remove-then-load (a page reload keeps the overlay)', () => {
    let m = base();
    m = update(m, { t: 'setSessionHidden', entries: [{ id: 'obj:1', hidden: true }] })[0];
    // reloadPage's shape: remove every id on the page, then load fresh DTOs.
    m = update(m, { t: 'remove', ids: ['obj:1', 'obj:2', 'obj:3'] })[0];
    expect(m.sessionHidden['obj:1']).toBe(true); // NOT reaped
    m = update(m, { t: 'loaded', annots: [annot('obj:1'), annot('obj:2'), annot('obj:3')] })[0];
    expect(paintOrder(m, PON)).not.toContain('obj:1'); // still session-hidden after reload
  });

  it('forgetSessionHidden drops overrides for deleted ids; clearSessionHidden drops all', () => {
    let m = base();
    m = update(m, {
      t: 'setSessionHidden',
      entries: [
        { id: 'obj:1', hidden: true },
        { id: 'obj:3', hidden: true },
      ],
    })[0];
    m = update(m, { t: 'forgetSessionHidden', ids: ['obj:1', 'unknown'] })[0];
    expect(m.sessionHidden).toEqual({ 'obj:3': true });
    m = update(m, { t: 'clearSessionHidden' })[0];
    expect(m.sessionHidden).toEqual({});
    // Identity no-ops on both when there is nothing to do.
    const [same] = update(m, { t: 'clearSessionHidden' });
    expect(same).toBe(m);
  });
});
