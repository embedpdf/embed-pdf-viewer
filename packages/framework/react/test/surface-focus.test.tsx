// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import { DocumentScope } from '../src/runtime';
import { ShellToken, shellPlugin, useSurface, useSurfaceFocus } from '../src/shell';
import { bytesInput, viewerWith } from './counter-plugin';

/**
 * `useSurfaceFocus(id, ref)`: the cursor moves into the element when its surface asks, and when
 * the element mounts because it did; a plain open never moves it, `select` selects the text, and
 * one document's request stays out of another's.
 */

afterEach(cleanup);

function Field({ id = 'search', select }: { id?: string; select?: boolean }) {
  const ref = React.useRef<HTMLInputElement>(null);
  useSurfaceFocus(id, ref, { select });
  return <input data-testid={`field-${id}`} ref={ref} defaultValue="contract" />;
}

/** The field only while its panel is open, as a panel draws its content. */
function Panel() {
  const panel = useSurface('search');
  return panel.isOpen ? <Field /> : null;
}

const field = (id = 'search') => screen.getByTestId(`field-${id}`) as HTMLInputElement;

async function opened(content: React.ReactNode, ids: string[] = ['a']) {
  const viewer = await viewerWith([shellPlugin()], content);
  for (const id of ids) await act(() => viewer.kernel.documents.open(bytesInput(id)));
  const shellOf = (id = ids[ids.length - 1]!) => viewer.kernel.capability(ShellToken, id);
  return { ...viewer, shellOf };
}

describe('useSurfaceFocus', () => {
  it('focuses the element on every request, also with the surface open already', async () => {
    const { shellOf } = await opened(<Field />);
    act(() => shellOf().open('search', { focus: true }));
    expect(document.activeElement).toBe(field());

    act(() => field().blur());
    act(() => shellOf().open('search', { focus: true }));
    expect(document.activeElement).toBe(field());
  });

  it('never focuses on a plain open', async () => {
    const { shellOf } = await opened(<Panel />);
    act(() => shellOf().open('search'));
    expect(field()).toBeTruthy();
    expect(document.activeElement).not.toBe(field());
  });

  it('focuses an element that mounts because its surface opened asking for it', async () => {
    const { shellOf } = await opened(<Panel />);
    act(() => shellOf().toggle('search', { focus: true }));
    expect(document.activeElement).toBe(field());
  });

  it('selects the text with select, and only places the cursor without it', async () => {
    const { shellOf, rerender } = await opened(<Field />);
    act(() => field().setSelectionRange(8, 8));
    act(() => shellOf().open('search', { focus: true }));
    expect([field().selectionStart, field().selectionEnd]).toEqual([8, 8]);

    act(() => shellOf().close('search'));
    rerender(<Field select />);
    act(() => shellOf().open('search', { focus: true }));
    expect(document.activeElement).toBe(field());
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 8]);
  });

  it("reads its subtree's document: a request in one never moves the cursor in another", async () => {
    const { shellOf } = await opened(
      <>
        <DocumentScope id="a">
          <Field id="notes" />
        </DocumentScope>
        <DocumentScope id="b">
          <Field id="search" />
        </DocumentScope>
      </>,
      ['a', 'b'],
    );
    act(() => shellOf('a').open('search', { focus: true }));
    expect(document.activeElement).not.toBe(field('search'));
    act(() => shellOf('b').open('search', { focus: true }));
    expect(document.activeElement).toBe(field('search'));
    act(() => shellOf('b').open('notes', { focus: true }));
    expect(document.activeElement).toBe(field('search'));
  });
});
