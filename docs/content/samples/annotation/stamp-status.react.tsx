import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
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
import { localEngine } from '@embedpdf/engine';

import './stamp-status.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

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

// On load: two approval stamps on the cover, one signed off. The second sits
// at the bottom, so its status hangs over the next page.
function AddStamps() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void approvedPicture().then(async (appearance) => {
      await annotation.create(
        cover,
        {
          subtype: 'stamp',
          box: { x: 330, y: 470, width: 180, height: 60 },
          name: 'approval-budget',
        },
        { appearance },
      );
      await annotation.create(
        cover,
        {
          subtype: 'stamp',
          box: { x: 96, y: 712, width: 180, height: 60 },
          name: 'approval-contract',
        },
        { appearance },
      );
    });
  }, [annotation, ready, cover]);

  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddStamps />
        <p className="hint">Sign a stamp off, then move it: its status goes with it.</p>
        <Stage className="stage" overlay={<Approvals />}>
          {() => (
            <>
              <RenderLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}

// The stamp's picture, drawn on a canvas so the example needs no image file.
function approvedPicture(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 120;
  const context = canvas.getContext('2d')!;
  context.strokeStyle = '#30a46c';
  context.lineWidth = 10;
  context.strokeRect(5, 5, 350, 110);
  context.fillStyle = '#30a46c';
  context.font = 'bold 54px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('APPROVED', 180, 64);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'));
}
