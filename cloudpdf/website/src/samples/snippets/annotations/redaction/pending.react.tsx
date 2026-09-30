import { annotationKey } from '@embedpdf/react/annotation';
import { usePendingRedactions, useRedaction } from '@embedpdf/react/redaction';
import { useStage } from '@embedpdf/react/stage';

export function Pending() {
  const stage = useStage();
  const redaction = useRedaction();
  const marks = usePendingRedactions();

  return (
    <ul>
      {marks.map((mark) => (
        <li key={annotationKey(mark.ref)}>
          <button onClick={() => stage.reveal(mark.page, { rect: mark.bounds })}>
            Page {mark.pageIndex + 1}: {mark.kind === 'text' ? 'text' : 'area'}
          </button>
          <button onClick={() => redaction.unmark([mark.ref])}>Remove</button>
        </li>
      ))}
    </ul>
  );
}
