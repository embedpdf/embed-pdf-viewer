// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { PageView } from '../src/page-view';
import { toPageRef, usePage } from '../src/runtime';
import { bytesInput, counterPlugin, viewerWith } from './counter-plugin';

/** `<PageView>` takes its page as a ref or an index, and puts `className` on its outer box. */

function PageProbe({ seen }: { seen: unknown[] }) {
  const page = usePage();
  seen.push({ ref: page.ref.objectNumber, index: page.pageIndex });
  return null;
}

afterEach(cleanup);

describe('PageView', () => {
  it('shows a page given by its index or its ref', async () => {
    const byIndex: unknown[] = [];
    const byRef: unknown[] = [];
    const { kernel } = await viewerWith(
      [counterPlugin],
      <>
        <PageView page={0} className="by-index" fallback={<p className="waiting" />}>
          <PageProbe seen={byIndex} />
        </PageView>
        <PageView page={toPageRef(1)} pageFrame={{ bottom: 20 }}>
          <PageProbe seen={byRef} />
        </PageView>
      </>,
    );
    expect(document.querySelector('.waiting')).not.toBeNull(); // no document yet
    await act(() => kernel.documents.open(bytesInput('a')));
    expect(byIndex.at(-1)).toEqual({ ref: 1, index: 0 });
    expect(byRef.at(-1)).toEqual({ ref: 1, index: 0 });
    expect(document.querySelector('.by-index')).not.toBeNull();
  });
});
