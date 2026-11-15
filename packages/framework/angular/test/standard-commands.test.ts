import { describe, expect, it } from 'vitest';
import { standardCommands } from '@embedpdf/angular/commands';
import { renderCommands } from '@embedpdf/angular/render';
import { documentCommands } from '@embedpdf/angular/runtime';
import { selectionCommands } from '@embedpdf/angular/selection';

// The lists are tested where they live, in each plugin's `test/commands.test.ts`. This pins
// the join an app spreads: which lists it has, and in which order.
describe('standardCommands', () => {
  it('joins the lists of the owners every viewer has, in order', () => {
    const ids = standardCommands.map((item) => ('id' in item ? item.id : `${item.prefix}*`));
    expect(ids).toEqual([
      'zoom:in',
      'zoom:out',
      'zoom:fit-width',
      'zoom:fit-page',
      'page:next',
      'page:previous',
      'page:first',
      'page:last',
      'view:rotate-clockwise',
      'view:rotate-counterclockwise',
      'tool:pointer',
      'tool:pan',
      'tool:zoom',
      'tool:*',
      'selection:copy',
      'annotation:delete',
      'history:undo',
      'history:redo',
      'tool:snapshot',
      'snapshot:copy',
      'snapshot:save',
      'snapshot:clear',
      'document:download',
      'document:print',
    ]);
  });

  it('has the commands of the lists the feature entries export', () => {
    const ids = new Set(standardCommands.flatMap((item) => ('id' in item ? [item.id] : [])));
    for (const list of [selectionCommands, renderCommands, documentCommands]) {
      expect(list.length).toBeGreaterThan(0);
      for (const item of list) expect(ids.has(item.id)).toBe(true);
    }
  });
});
