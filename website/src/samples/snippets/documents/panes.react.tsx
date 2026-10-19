import { DocumentScope } from '@embedpdf/react/runtime';
import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';
import { useViewManager, useViewManagerState } from '@embedpdf/react/view-manager';
import { PaneTabs } from './PaneTabs';

export function Panes() {
  const views = useViewManager();
  const { panes, focusedPaneId } = useViewManagerState();

  return (
    <div className="panes">
      {panes.map((pane) => (
        <section key={pane.id} data-focused={pane.id === focusedPaneId} onFocus={() => views.setFocusedPane(pane.id)}>
          <PaneTabs pane={pane} />
          {pane.activeDocumentId && (
            <DocumentScope id={pane.activeDocumentId}>
              <Stage>{() => <RenderLayer />}</Stage>
            </DocumentScope>
          )}
        </section>
      ))}
    </div>
  );
}
