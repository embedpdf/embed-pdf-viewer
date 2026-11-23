import { onScopeDispose, shallowRef } from 'vue';
import type { Ref } from 'vue';
import {
  createViewerController,
  type ViewerController,
  type ViewerState,
} from '@embedpdf/web/controller';
import { useDocumentScope, useKernel } from '../runtime/kernel';

/** The controller, and its snapshot as a ref a template reads unwrapped. */
export interface ViewerControllerRef extends ViewerController {
  readonly state: Readonly<Ref<ViewerState>>;
}

/**
 * The viewer controller for the document in scope (the active one outside a
 * `<DocumentScope>`). Call it in a component inside `<Viewer>`; it stops with the component.
 */
export function useViewerController(): ViewerControllerRef {
  const scope = useDocumentScope();
  const controller = createViewerController(useKernel(), { documentId: () => scope.value });
  const state = shallowRef(controller.getState());
  const stop = controller.subscribe((next) => {
    state.value = next;
  });
  onScopeDispose(() => {
    stop();
    controller.dispose();
  });
  return { ...controller, state };
}
