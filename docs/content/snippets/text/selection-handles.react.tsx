import { RenderLayer } from '@embedpdf/react/render';
import { SelectionHandles, SelectionLayer, SelectionMenu } from '@embedpdf/react/selection';
import { Stage } from '@embedpdf/react/stage';

import { CopyButton } from './copy-button';

export function Pages() {
  return (
    <Stage
      overlay={
        <>
          <SelectionMenu>
            <CopyButton />
          </SelectionMenu>
          <SelectionHandles />
        </>
      }
    >
      {() => (
        <>
          <RenderLayer />
          <SelectionLayer />
        </>
      )}
    </Stage>
  );
}
