import { describe, expect, it } from 'vitest';
import { annotationCommands } from '@embedpdf/angular/annotation';
import { standardCommands } from '@embedpdf/angular/commands';
import { historyCommands } from '@embedpdf/angular/history';
import { interactionCommands } from '@embedpdf/angular/interaction';
import { renderCommands } from '@embedpdf/angular/render';
import { documentCommands } from '@embedpdf/angular/runtime';
import { selectionCommands } from '@embedpdf/angular/selection';
import { stageCommands } from '@embedpdf/angular/stage';

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

  it('has the ids of the lists the feature entries export, in their order', () => {
    const idOf = (item: (typeof standardCommands)[number]) =>
      'id' in item ? item.id : `${item.prefix}*`;
    expect(standardCommands.map(idOf)).toEqual(
      [
        ...stageCommands,
        ...interactionCommands,
        ...selectionCommands,
        ...annotationCommands,
        ...historyCommands,
        ...renderCommands,
        ...documentCommands,
      ].map(idOf),
    );
  });
});
