import { useInteractionState } from '@embedpdf/react/interaction';
import { Toolbar } from '@embedpdf/react/toolbar';
import { formBar, mainBar } from './bars';
import { renderCommand } from './render-command';

export function ModeToolbar() {
  const { activeToolId } = useInteractionState();
  const bar = activeToolId === 'form-edit' ? formBar : mainBar;

  return <Toolbar bar={bar} renderCommand={renderCommand} />;
}
