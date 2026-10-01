// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { DocumentScope, useDocuments } from '../src/runtime';
import { bytesInput, counterPlugin, viewerWith } from './counter-plugin';

/** `useDocuments` inside a <DocumentScope>: document verbs default to the document in scope. */

type Save = ReturnType<typeof useDocuments>['save'];

function SaveProbe({ saves }: { saves: Save[] }) {
  saves.push(useDocuments().save);
  return null;
}

const latest = (saves: Save[]) => saves[saves.length - 1];
const plugins = [counterPlugin];

afterEach(cleanup);

describe('useDocuments', () => {
  it('saves the document in scope when save() has no id, and the active one outside a scope', async () => {
    const scoped: Save[] = [];
    const unscoped: Save[] = [];
    const { kernel } = await viewerWith(
      plugins,
      <>
        <DocumentScope id="b">
          <SaveProbe saves={scoped} />
        </DocumentScope>
        <SaveProbe saves={unscoped} />
      </>,
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    await act(() => kernel.documents.open(bytesInput('b')));
    act(() => kernel.documents.setActive('a'));

    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
    expect(decode(await latest(scoped)())).toBe('b');
    expect(decode(await latest(unscoped)())).toBe('a');
  });
});
