import { createTestCommandContext } from '@embedpdf/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { createAnnotationCommands } from '../src/commands';
import { AnnotationToken } from '../src/contract';

const command = (id: string) => createAnnotationCommands().find((item) => item.id === id)!;

describe('createAnnotationCommands', () => {
  it('deletes a selection only when every annotation in it may be deleted, by hand', () => {
    const refs = [{ id: 1 }, { id: 2 }];
    const annotation = {
      selection: { getSelected: () => refs.map((ref) => ({ ref })), delete: vi.fn() },
      canDelete: (ref: { id: number }) => ref.id === 1,
      isEditable: (_ref: { id: number }) => true,
    };
    const context = createTestCommandContext(new Map([[AnnotationToken, annotation]]));
    expect(command('annotation:delete').enabled?.(context)).toBe(false);
    annotation.canDelete = () => true;
    expect(command('annotation:delete').enabled?.(context)).toBe(true);
    // One the `editable` setting freezes stays.
    annotation.isEditable = (ref) => ref.id === 1;
    expect(command('annotation:delete').enabled?.(context)).toBe(false);
  });
});
