import { describe, expect, test } from 'vitest';
import {
  EngineError,
  EngineErrorCode,
  toPageRef,
  type AnnotationDTO,
  type AnnotationList,
  type AnnotationRef,
  type PageState,
} from '@embedpdf/engine-core/runtime';
import { CloudRevisionBridge } from '../src/index';

describe('CloudRevisionBridge', () => {
  const bridge = new CloudRevisionBridge();

  test('decorates annotation lists with durable cloud revision tokens', () => {
    const list: AnnotationList = {
      annotations: [
        annotation(indexRef('sess_worker', 0)),
        annotation({ kind: 'objectNumber', page: toPageRef(3), annotObjectNumber: 10 }),
      ],
      pages: [pageState('sess_worker', 0)],
    };

    const decorated = bridge.decorateAnnotationList(list, () =>
      pageState('cloud:layer:doc:alice', 7),
    );

    expect(decorated.pages[0]?.revision.docSessionId).toBe('cloud:layer:doc:alice');
    expect(decorated.pages[0]?.revision.generation).toBe(7);
    expect(decorated.annotations[0]?.ref).toMatchObject({
      kind: 'index',
      revision: {
        docSessionId: 'cloud:layer:doc:alice',
        page: toPageRef(3),
        generation: 7,
      },
    });
    expect(decorated.annotations[1]?.ref).toEqual({
      kind: 'objectNumber',
      page: toPageRef(3),
      annotObjectNumber: 10,
    });
    expect(JSON.stringify(decorated)).not.toContain('sess_worker');
  });

  test('validates fresh durable index refs and rejects stale ones', () => {
    const current = pageState('cloud:layer:doc:alice', 3);

    expect(() =>
      bridge.validateClientIndexRef(current, indexRef('cloud:layer:doc:alice', 3)),
    ).not.toThrow();

    expect(() =>
      bridge.validateClientIndexRef(current, indexRef('cloud:layer:doc:alice', 2)),
    ).toThrowError(EngineError);
    try {
      bridge.validateClientIndexRef(current, indexRef('cloud:layer:doc:alice', 2));
    } catch (error) {
      expect(error).toBeInstanceOf(EngineError);
      expect((error as EngineError).code).toBe(EngineErrorCode.InvalidReference);
    }
  });

  test('rewrites only index refs for worker mutators', () => {
    const workerState = pageState('sess_worker_2', 0);
    const rewritten = bridge.rewriteIndexRefForWorker(
      workerState,
      indexRef('cloud:layer:doc:alice', 3),
    );
    const stable: AnnotationRef = {
      kind: 'objectNumber',
      page: toPageRef(3),
      annotObjectNumber: 42,
    };

    expect(rewritten).toMatchObject({
      kind: 'index',
      revision: {
        docSessionId: 'sess_worker_2',
        page: toPageRef(3),
        generation: 0,
      },
    });
    expect(bridge.rewriteIndexRefForWorker(workerState, stable)).toBe(stable);
  });
});

function pageState(docSessionId: string, generation: number): PageState {
  return {
    page: toPageRef(3),
    revision: { docSessionId, page: toPageRef(3), generation },
    weakAnnotationState: { kind: 'known', hasAnyWeakAnnotations: true },
  };
}

function indexRef(docSessionId: string, generation: number): AnnotationRef {
  return {
    kind: 'index',
    page: toPageRef(3),
    index: 1,
    revision: { docSessionId, page: toPageRef(3), generation },
  };
}

function annotation(ref: AnnotationRef): AnnotationDTO {
  return {
    subtype: 'unsupported',
    rawSubtypeCode: 999,
    rawSubtypeName: 'Debug',
    ref,
    page: toPageRef(3),
    index: ref.kind === 'index' ? ref.index : 0,
    identityQuality: ref.kind === 'index' ? 'weak' : 'durable',
    nm: null,
    invisible: false,
    hidden: false,
    print: false,
    noZoom: false,
    noRotate: false,
    noView: false,
    readOnly: false,
    locked: false,
    toggleNoView: false,
    lockedContents: false,
    rect: { left: 0, top: 0, right: 1, bottom: 1 },
    contents: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
  };
}
