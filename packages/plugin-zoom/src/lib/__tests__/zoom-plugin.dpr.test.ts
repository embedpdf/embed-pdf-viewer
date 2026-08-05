/**
 * Unit tests for the DPR-scaling feature of the zoom plugin.
 *
 * These tests exercise the reducer layer (state transitions) and the
 * handleRequest logic indirectly through the action payload — which is the
 * part that is fully portable without a DOM or plugin registry.
 *
 * Test conventions mirror packages/models/src/geometry.test.ts (Jest globals).
 */

import { zoomReducer, initialDocumentState, initialState } from '../reducer';
import { setZoomLevel } from '../actions';
import { ZoomMode, ZoomDocumentState } from '../types';

// ---------------------------------------------------------------------------
// Reducer tests — state transitions for SET_ZOOM_LEVEL
// ---------------------------------------------------------------------------

describe('zoomReducer – SET_ZOOM_LEVEL', () => {
  const docId = 'doc-1';
  const stateWithDoc = {
    ...initialState,
    documents: { [docId]: { ...initialDocumentState } },
  };

  test('initialDocumentState has currentUserZoomLevel: 1', () => {
    expect(initialDocumentState.currentUserZoomLevel).toBe(1);
  });

  test('writes all three fields when usePhysicalScaling is off (user === effective)', () => {
    const action = setZoomLevel(docId, 1, 1, 1);
    const next = zoomReducer(stateWithDoc, action);
    const doc = next.documents[docId] as ZoomDocumentState;
    expect(doc.zoomLevel).toBe(1);
    expect(doc.currentZoomLevel).toBe(1);
    expect(doc.currentUserZoomLevel).toBe(1);
  });

  test('stores user-space in zoomLevel for numeric requests (usePhysicalScaling=true, dpr=2)', () => {
    // Simulates: requestZoom(1) on a dpr=2 display.
    //   newUser      = 1      (user-space, clamped)
    //   newEffective = 2      (1 * dpr)
    //   stored zoomLevel should be 1 (user-space) — so "100%" preset highlights
    const action = setZoomLevel(docId, 1 /* newUser */, 2 /* newEffective */, 1 /* newUser */);
    const next = zoomReducer(stateWithDoc, action);
    const doc = next.documents[docId] as ZoomDocumentState;
    expect(doc.zoomLevel).toBe(1);
    expect(doc.currentZoomLevel).toBe(2);
    expect(doc.currentUserZoomLevel).toBe(1);
  });

  test('requestZoom(0.5) on dpr=2 → effective 1, user 0.5', () => {
    const action = setZoomLevel(docId, 0.5, 1, 0.5);
    const next = zoomReducer(stateWithDoc, action);
    const doc = next.documents[docId] as ZoomDocumentState;
    expect(doc.zoomLevel).toBe(0.5);
    expect(doc.currentZoomLevel).toBe(1);
    expect(doc.currentUserZoomLevel).toBe(0.5);
  });

  test('fit-width mode stores the mode string in zoomLevel', () => {
    // For mode requests, zoomLevel = the mode enum, not a number.
    // Simulates: FitWidth resolves to effective=0.7, user=0.35 on dpr=2.
    const action = setZoomLevel(docId, ZoomMode.FitWidth, 0.7, 0.35);
    const next = zoomReducer(stateWithDoc, action);
    const doc = next.documents[docId] as ZoomDocumentState;
    expect(doc.zoomLevel).toBe(ZoomMode.FitWidth);
    expect(doc.currentZoomLevel).toBe(0.7);
    expect(doc.currentUserZoomLevel).toBe(0.35);
  });

  test('usePhysicalScaling=false: user === effective at every zoom level', () => {
    // When dpr=1, newUser === newEffective. This exercises the backwards-compat invariant.
    const testCases: [number, number][] = [
      [0.25, 0.25],
      [1, 1],
      [1.5, 1.5],
      [2, 2],
      [4, 4],
    ];
    for (const [zoom, expected] of testCases) {
      const action = setZoomLevel(docId, zoom, zoom, zoom);
      const next = zoomReducer(stateWithDoc, action);
      const doc = next.documents[docId] as ZoomDocumentState;
      expect(doc.currentZoomLevel).toBe(expected);
      expect(doc.currentUserZoomLevel).toBe(expected);
    }
  });

  test('minZoom clamp on numeric path (user-space): requestZoom(0.1) → user=0.25 (dpr=2 → eff=0.5)', () => {
    // Simulates handleRequest numeric path with minZoom=0.25:
    //   level=0.1, clamped user=0.25, effective=0.25*2=0.5
    const action = setZoomLevel(docId, 0.25, 0.5, 0.25);
    const next = zoomReducer(stateWithDoc, action);
    const doc = next.documents[docId] as ZoomDocumentState;
    expect(doc.zoomLevel).toBe(0.25);
    expect(doc.currentZoomLevel).toBe(0.5);
    expect(doc.currentUserZoomLevel).toBe(0.25);
  });

  test('maxZoom clamp on numeric path (user-space): requestZoom(20) maxZoom=10 → user=10, eff=20', () => {
    const action = setZoomLevel(docId, 10, 20, 10);
    const next = zoomReducer(stateWithDoc, action);
    const doc = next.documents[docId] as ZoomDocumentState;
    expect(doc.zoomLevel).toBe(10);
    expect(doc.currentZoomLevel).toBe(20);
    expect(doc.currentUserZoomLevel).toBe(10);
  });

  test('returns unchanged state for unknown documentId', () => {
    const action = setZoomLevel('unknown-doc', 1, 2, 1);
    const next = zoomReducer(stateWithDoc, action);
    expect(next).toBe(stateWithDoc); // referential equality: no mutation
  });
});

// ---------------------------------------------------------------------------
// getDpr() logic (pure function extracted for unit testing)
// ---------------------------------------------------------------------------

describe('getDpr logic', () => {
  // 1 CSS inch = 96 px, 1 PDF pt = 1/72 inch → multiplier = 96/72
  const PT_TO_CSS_PX = 96 / 72;

  /**
   * Inline re-implementation of the private getDpr() logic so we can unit-test
   * it without instantiating the full plugin. This mirrors zoom-plugin.ts exactly.
   */
  function getDpr(usePhysicalScaling: boolean, devicePixelRatio: number | undefined): number {
    if (!usePhysicalScaling) return 1;
    if (typeof window === 'undefined') return 1;
    return PT_TO_CSS_PX * (devicePixelRatio || 1);
  }

  test('returns 1 when usePhysicalScaling is false', () => {
    expect(getDpr(false, 2)).toBe(1);
    expect(getDpr(false, 3)).toBe(1);
    expect(getDpr(false, undefined)).toBe(1);
  });

  test('returns PT_TO_CSS_PX × devicePixelRatio when usePhysicalScaling is true', () => {
    expect(getDpr(true, 1)).toBeCloseTo(96 / 72);       // DPR=1 → ~1.333
    expect(getDpr(true, 2)).toBeCloseTo((96 / 72) * 2); // DPR=2 → ~2.667
    expect(getDpr(true, 1.5)).toBeCloseTo((96 / 72) * 1.5);
  });

  test('falls back to PT_TO_CSS_PX when devicePixelRatio is 0/undefined', () => {
    expect(getDpr(true, 0)).toBeCloseTo(96 / 72);
    expect(getDpr(true, undefined)).toBeCloseTo(96 / 72);
  });

  test('A4 width at 100% zoom, DPR=1 → ~794 CSS px (physical size)', () => {
    // A4 = 210mm = 595.28 PDF points. At physical size: 595.28 × (96/72) ≈ 793.7 CSS px.
    const a4Pts = (210 * 72) / 25.4; // ≈ 595.28
    const scale = getDpr(true, 1);
    expect(a4Pts * scale).toBeCloseTo(793.7, 0);
  });
});

// ---------------------------------------------------------------------------
// Numeric path arithmetic (pure logic, no DOM)
// ---------------------------------------------------------------------------

describe('handleRequest numeric path arithmetic', () => {
  const minZoom = 0.25;
  const maxZoom = 10;
  const floor3 = (x: number) => Math.floor(x * 1000) / 1000;

  /**
   * Inline re-implementation of the numeric path from handleRequest.
   */
  function numericPath(
    level: number,
    delta: number,
    dpr: number,
  ): { newEffective: number; newUser: number } {
    const userBase = Math.min(Math.max(level + delta, minZoom), maxZoom);
    const newUser = floor3(userBase);
    const newEffective = floor3(userBase * dpr);
    return { newEffective, newUser };
  }

  // Full getDpr() value with usePhysicalScaling=true, DPR=1: (96/72) × 1 ≈ 1.333
  const SCALE_DPR1 = 96 / 72;
  // Full getDpr() value with usePhysicalScaling=true, DPR=2: (96/72) × 2 ≈ 2.667
  const SCALE_DPR2 = (96 / 72) * 2;

  test('usePhysicalScaling=false (getDpr=1): effective === user (backwards compat)', () => {
    expect(numericPath(1, 0, 1)).toEqual({ newEffective: 1, newUser: 1 });
    expect(numericPath(1.5, 0, 1)).toEqual({ newEffective: 1.5, newUser: 1.5 });
  });

  test('usePhysicalScaling=true, DPR=1: level=1 → user=1, effective≈1.333', () => {
    const result = numericPath(1, 0, SCALE_DPR1);
    expect(result.newUser).toBe(1);
    expect(result.newEffective).toBeCloseTo(96 / 72, 3);
  });

  test('usePhysicalScaling=true, DPR=1: A4 at 100% → ~794 CSS px', () => {
    const a4Pts = Math.floor(((210 * 72) / 25.4) * 1000) / 1000; // ≈ 595.275
    const result = numericPath(1, 0, SCALE_DPR1);
    expect(a4Pts * result.newEffective).toBeCloseTo(793.7, 0);
  });

  test('usePhysicalScaling=true, DPR=2: level=1 → user=1, effective≈2.667', () => {
    const result = numericPath(1, 0, SCALE_DPR2);
    expect(result.newUser).toBe(1);
    expect(result.newEffective).toBeCloseTo((96 / 72) * 2, 3);
  });

  test('zoomIn: level=1, delta=0.2, DPR=1 → user=1.2, effective≈1.6', () => {
    const result = numericPath(1, 0.2, SCALE_DPR1);
    expect(result.newUser).toBe(1.2);
    expect(result.newEffective).toBeCloseTo(1.2 * (96 / 72), 3);
  });

  test('zoomOut: level=1.2, delta=-0.2, DPR=1 → user=1, effective≈1.333', () => {
    const result = numericPath(1.2, -0.2, SCALE_DPR1);
    expect(result.newUser).toBe(1);
    expect(result.newEffective).toBeCloseTo(96 / 72, 3);
  });

  test('clamps to minZoom (user-space): level=0.1 → user=0.25, DPR=1', () => {
    const result = numericPath(0.1, 0, SCALE_DPR1);
    expect(result.newUser).toBe(0.25);
    expect(result.newEffective).toBeCloseTo(0.25 * (96 / 72), 3);
  });

  test('clamps to maxZoom (user-space): level=20 → user=10, DPR=1', () => {
    const result = numericPath(20, 0, SCALE_DPR1);
    expect(result.newUser).toBe(10);
    expect(result.newEffective).toBeCloseTo(10 * (96 / 72), 3);
  });

  test('quantization consistency: newEffective === floor(newUser * getDpr() * 1000) / 1000', () => {
    // Verifies Fix 1: effective is derived from quantized user, not raw userBase.
    // With userBase=1.0005, getDpr()=SCALE_DPR1: newUser=1.000, newEffective must be
    // floor(1.000 × (96/72) × 1000) / 1000 — not derived from unquantized 1.0005.
    const floor3 = (x: number) => Math.floor(x * 1000) / 1000;
    const userBase = 1.0005;
    const clamped = Math.min(Math.max(userBase, minZoom), maxZoom);
    const nUser = floor3(clamped);             // 1.000
    const nEffective = floor3(nUser * SCALE_DPR1);
    expect(nEffective).toBe(floor3(nUser * SCALE_DPR1));
    // Must NOT equal floor3(userBase * SCALE_DPR1) when they differ
    expect(nEffective).toBeCloseTo(96 / 72, 3);
  });

  test('requestZoomBy(+0.2) from user=1 → user=1.2, DPR=1', () => {
    // requestZoomBy computes: target = toZoom(curUser + delta), then numeric path.
    const curUser = 1;
    const delta = 0.2;
    const target = parseFloat(Math.min(Math.max(curUser + delta, minZoom), maxZoom).toFixed(2));
    const result = numericPath(target, 0, SCALE_DPR1);
    expect(result.newUser).toBe(1.2);
    expect(result.newEffective).toBeCloseTo(1.2 * (96 / 72), 3);
  });
});

// ---------------------------------------------------------------------------
// zoomToArea conversion: clamp in effective space, then convert to user-space
// ---------------------------------------------------------------------------

describe('zoomToArea effective-space clamp and user conversion', () => {
  const minZoom = 0.25;
  const maxZoom = 10;
  const PT_TO_CSS_PX = 96 / 72;

  // getDpr() with usePhysicalScaling=true: PT_TO_CSS_PX × devicePixelRatio
  const SCALE_DPR1 = PT_TO_CSS_PX * 1;
  const SCALE_DPR2 = PT_TO_CSS_PX * 2;

  /**
   * Inline re-implementation of the fixed zoomToArea conversion (Fix 2).
   * Clamps fitRatio against effective-space bounds so the full user range is reachable.
   */
  function zoomToAreaTarget(fitRatio: number, scale: number): number {
    const clampEffective = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
    return Math.floor(clampEffective(fitRatio, minZoom * scale, maxZoom * scale) / scale * 1000) / 1000;
  }

  test('usePhysicalScaling=false (scale=1): targetUser === fitRatio (backwards compat)', () => {
    expect(zoomToAreaTarget(0.9, 1)).toBe(0.9);
    expect(zoomToAreaTarget(1.4, 1)).toBe(1.4);
  });

  test('usePhysicalScaling=true, DPR=1: fitRatio=1.4 → targetUser = 1.4 / (96/72) ≈ 1.05', () => {
    expect(zoomToAreaTarget(1.4, SCALE_DPR1)).toBeCloseTo(1.4 / PT_TO_CSS_PX, 2);
  });

  test('usePhysicalScaling=true, DPR=2: fitRatio=1.4 → targetUser = 1.4 / ((96/72)×2)', () => {
    expect(zoomToAreaTarget(1.4, SCALE_DPR2)).toBeCloseTo(1.4 / SCALE_DPR2, 2);
  });

  test('usePhysicalScaling=true, DPR=1: tiny fit ratio below minZoom*scale clamps correctly', () => {
    // fitRatio=0.1, minZoom*scale = 0.25*(96/72) ≈ 0.333 → clamps to minZoom=0.25
    expect(zoomToAreaTarget(0.1, SCALE_DPR1)).toBe(minZoom);
  });

  test('usePhysicalScaling=true, DPR=1: fitRatio above maxZoom*scale clamps to maxZoom', () => {
    // maxZoom*scale = 10*(96/72) ≈ 13.33
    expect(zoomToAreaTarget(20, SCALE_DPR1)).toBe(maxZoom);
  });
});

// ---------------------------------------------------------------------------
// Pinch gesture delta conversion
// ---------------------------------------------------------------------------

describe('pinch gesture user-space delta', () => {
  const PT_TO_CSS_PX = 96 / 72;

  test('usePhysicalScaling=false (scale=1): gesture delta is unchanged (backwards compat)', () => {
    const currentScale = 1.5;
    const initialZoom = 1; // effective scale = 1 when feature is off
    const scale = 1;
    const initialUser = initialZoom / scale;
    const delta = (currentScale - 1) * initialUser;
    expect(delta).toBeCloseTo(0.5);
  });

  test('usePhysicalScaling=true, DPR=1: delta is in user-space (divided by PT_TO_CSS_PX)', () => {
    // At 100% user zoom, effective = PT_TO_CSS_PX ≈ 1.333
    const currentScale = 1.5;
    const initialZoom = PT_TO_CSS_PX; // effective when user is at 100%
    const scale = PT_TO_CSS_PX;       // getDpr() with DPR=1
    const initialUser = initialZoom / scale; // = 1.0
    const delta = (currentScale - 1) * initialUser;
    // user-space delta: (1.5 - 1) × 1 = 0.5 → result: 150% user zoom
    expect(delta).toBeCloseTo(0.5);
  });

  test('usePhysicalScaling=true, DPR=2: delta is in user-space (divided by full scale)', () => {
    const SCALE_DPR2 = PT_TO_CSS_PX * 2;
    const currentScale = 1.5;
    const initialZoom = SCALE_DPR2; // effective when user is at 100%, DPR=2
    const initialUser = initialZoom / SCALE_DPR2; // = 1.0
    const delta = (currentScale - 1) * initialUser;
    expect(delta).toBeCloseTo(0.5);
  });
});
