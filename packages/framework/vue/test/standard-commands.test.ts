import { describe, expect, it } from 'vitest';
import {
  annotationCommands,
  documentCommands,
  historyCommands,
  interactionCommands,
  renderCommands,
  selectionCommands,
  stageCommands,
  standardCommands,
} from '../src/command-lists';

// The lists are tested where they live, in each plugin's `test/commands.test.ts`. This pins
// the join an app spreads: which lists it has, and in which order.
describe('standardCommands', () => {
  it('joins the lists of the owners every viewer has, in order', () => {
    const ids = standardCommands.map((item) => ('id' in item ? item.id : `${item.prefix}*`));
    expect(ids).toEqual(IDS);
  });

  it('is the lists the feature entries export, joined', () => {
    expect(standardCommands).toEqual([
      ...stageCommands,
      ...interactionCommands,
      ...selectionCommands,
      ...annotationCommands,
      ...historyCommands,
      ...renderCommands,
      ...documentCommands,
    ]);
    // The same commands, not copies: a list is made once.
    for (const item of selectionCommands) expect(standardCommands).toContain(item);
  });
});

const IDS = [
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
];
