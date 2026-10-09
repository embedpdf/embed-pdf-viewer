import { useEffect } from 'react';
import { useInteraction } from '@embedpdf/react/interaction';

export function HoldSpaceToPan() {
  const interaction = useInteraction();

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat) interaction.pushTool('pan');
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') interaction.popTool();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [interaction]);

  return null;
}
