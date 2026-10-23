import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { Anchored } from '@embedpdf/react/anchored';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationAnchor,
  useAnnotationList,
  useAnnotationState,
  type Annotation,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './stamp-status.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const approvals: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// One stamp's status, pinned to it: a check on its corner once it's signed off,
// and a status with a button under it. Both stay there while the stamp moves.
function ApprovalStatus(props: { stamp: Annotation; signedOff: boolean; onToggle: () => void }) {
  const anchor = useAnnotationAnchor(props.stamp.ref);

  return (
    <>
      {props.signedOff && (
        <Anchored anchor={anchor} placement="top-end" gap={-12} pinned>
          <span className="check">✓</span>
        </Anchored>
      )}
      <Anchored anchor={anchor} placement="bottom" gap={8} pinned>
        <div className="status">
          <span className={props.signedOff ? 'dot dot--done' : 'dot'} />
          {props.signedOff ? 'Signed off' : 'Waiting'}
          <button
            type="button"
            className={props.signedOff ? 'sign sign--undo' : 'sign'}
            onClick={props.onToggle}
          >
            {props.signedOff ? 'Undo' : 'Sign off'}
          </button>
        </div>
      </Anchored>
    </>
  );
}

// An approval stamp's name, which the stamp keeps in every PDF app; null for any other annotation.
const approvalName = (annotation: Annotation): string | null =>
  annotation.subtype === 'stamp' && annotation.name?.startsWith('approval-')
    ? annotation.name
    : null;

// Every approval stamp's status, mounted in the Stage's overlay. Your own data
// for each stamp is kept by its name.
function Approvals() {
  const stamps = useAnnotationList({ subtype: 'stamp' });
  const [signedOff, setSignedOff] = useState<Record<string, boolean>>({
    'approval-budget': true,
  });

  return stamps.map((stamp) => {
    const name = approvalName(stamp);
    if (!name) return null;
    return (
      <ApprovalStatus
        key={name}
        stamp={stamp}
        signedOff={signedOff[name] ?? false}
        onToggle={() => setSignedOff((current) => ({ ...current, [name]: !current[name] }))}
      />
    );
  });
}

// On load: the page with the document's two approval stamps, the budget one already signed off.
function ShowStamps() {
  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const found = annotation
      .list()
      .filter((each) => each.nm === 'approval-budget' || each.nm === 'approval-contract');
    if (found.length === 0) return;
    stage.reveal(found[0].page, { rect: found[0].rect });
  }, [annotation, stage, ready]);

  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: approvals }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ShowStamps />
        <p className="hint">Sign a stamp off, then move it: its status goes with it.</p>
        <Stage className="stage" overlay={<Approvals />}>
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
