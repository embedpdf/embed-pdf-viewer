import type { DocumentEventInit } from './DocumentEvent';
import { deletedAnnotationsOf } from '../mutation/AnnotationMutationResults';
import { isSkippedItem, type ChangeItem, type ChangeResult } from '../mutation/Change';
import { deletedFieldOf, formResetFacts } from '../mutation/FormMutationResults';

/**
 * The events a change publishes: each op's events as its single verb
 * publishes them, in op order. An op an undo left alone entirely publishes
 * nothing. The publisher stamps them all with the change's `opId`.
 */
export function changeEvents(result: ChangeResult): DocumentEventInit[] {
  return result.items.flatMap(itemEvents);
}

function itemEvents(item: ChangeItem): DocumentEventInit[] {
  if (isSkippedItem(item)) return [];
  switch (item.type) {
    case 'annotations.create': {
      const { type: _type, ...result } = item;
      return [{ type: 'annotations.created', ...result }];
    }
    case 'annotations.update': {
      const { type: _type, skipped: _skipped, ...result } = item;
      return [{ type: 'annotations.updated', ...result }];
    }
    case 'annotations.delete': {
      const { type: _type, ...result } = item;
      return [{ type: 'annotations.deleted', deleted: deletedAnnotationsOf(result), ...result }];
    }
    case 'annotations.reorder': {
      const { type: _type, ...result } = item;
      return [{ type: 'annotations.reordered', ...result }];
    }
    case 'annotations.restore': {
      const { type: _type, ...result } = item;
      return [{ type: 'annotations.restored', ...result }];
    }
    case 'forms.setValue': {
      const { type: _type, ...result } = item;
      return [{ type: 'forms.valueSet', ...result }];
    }
    case 'forms.reset': {
      const { type: _type, skipped: _skipped, ...result } = item;
      return formResetFacts(result).map((fact) => ({ type: 'forms.valueSet' as const, ...fact }));
    }
    case 'forms.setDisplay':
    case 'forms.setAppearanceText':
    case 'forms.setSignatureAppearance': {
      const { type: _type, ...result } = item;
      return [{ type: 'forms.updated', ...result }];
    }
    case 'forms.update': {
      const { type: _type, skipped: _skipped, ...result } = item;
      return [{ type: 'forms.updated', ...result }];
    }
    case 'forms.create': {
      const { type: _type, ...result } = item;
      return [{ type: 'forms.created', ...result }];
    }
    case 'forms.delete': {
      const { type: _type, ...result } = item;
      return [{ type: 'forms.deleted', deleted: deletedFieldOf(result), ...result }];
    }
    case 'forms.restore': {
      const { type: _type, ...result } = item;
      return [{ type: 'forms.restored', ...result }];
    }
    case 'forms.addWidget': {
      const { type: _type, ...result } = item;
      return [{ type: 'forms.widgetAdded', ...result }];
    }
    case 'forms.removeWidget': {
      const { type: _type, ...result } = item;
      return [{ type: 'forms.widgetRemoved', ...result }];
    }
    case 'forms.deleteWidget': {
      const { type: _type, ...result } = item;
      return [{ type: 'forms.widgetDeleted', ...result }];
    }
    case 'forms.restoreWidget': {
      const { type: _type, ...result } = item;
      return [{ type: 'forms.widgetRestored', ...result }];
    }
    case 'forms.reorderWidgets': {
      const { type: _type, ...result } = item;
      return [{ type: 'forms.widgetsReordered', ...result }];
    }
    case 'forms.reorderCalculations': {
      const { type: _type, ...result } = item;
      return [{ type: 'forms.calculationsReordered', ...result }];
    }
    case 'forms.updateWidget': {
      const { type: _type, skipped: _skipped, ...result } = item;
      return [{ type: 'forms.widgetUpdated', ...result }];
    }
    case 'metadata.update': {
      const { type: _type, skipped: _skipped, ...result } = item;
      return [{ type: 'metadata.updated', ...result }];
    }
    case 'metadata.updateCustom': {
      const { type: _type, skipped: _skipped, ...result } = item;
      return [{ type: 'metadata.customUpdated', ...result }];
    }
  }
}
