import { describe, expect, it } from 'vitest';
import {
  documentCommands,
  renderCommands,
  selectionCommands,
  standardCommands,
} from '../src/command-lists';

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

  it('holds the same lists the feature entries export', () => {
    for (const list of [selectionCommands, renderCommands, documentCommands]) {
      expect(list.length).toBeGreaterThan(0);
      for (const item of list) expect(standardCommands).toContain(item);
    }
  });
});
