import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationKey,
  annotationPlugin,
  useAnnotation,
  useAnnotationState,
  type AnnotationRenderer,
  type AnnotationRendererProps,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './interactive.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// The document opens in reading mode, with the hand tool.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin({ defaultTool: 'pan' }),
  annotationPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Your own data for each stamp, kept by its key: here, whether it's signed off.
type Approvals = { signedOff: Record<string, boolean>; toggle: (key: string) => void };
const ApprovalsContext = createContext<Approvals>({ signedOff: {}, toggle: () => {} });

// The stamp as the PDF draws it, with your status on top and, while reading, a button.
function ApprovalStamp({ annotation, box, page, native, interactive }: AnnotationRendererProps) {
  const approvals = useContext(ApprovalsContext);
  const key = annotationKey(annotation.ref);
  const signedOff = approvals.signedOff[key] ?? false;
  const { x, y, width, height } = page.transform.pageToViewRect(box);

  return (
    <>
      {native}
      <div className="status" style={{ left: x, top: y + height + 6, width }}>
        <span className={signedOff ? 'dot dot--done' : 'dot'} />
        {signedOff ? 'Signed off' : 'Waiting'}
        {interactive && (
          <button type="button" className="sign" onClick={() => approvals.toggle(key)}>
            {signedOff ? 'Undo' : 'Sign off'}
          </button>
        )}
      </div>
    </>
  );
}

// Stamps named "Approved" are yours to draw, and take the pointer in reading mode only.
const RENDERERS: AnnotationRenderer[] = [
  {
    for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
    component: ApprovalStamp,
    interactive: ({ toolId }) => toolId === 'pan',
  },
];

// On load: an Approved stamp on the cover.
function AddStamp() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void approvedPicture().then((appearance) =>
      annotation.create(
        cover,
        { subtype: 'stamp', box: { x: 330, y: 520, width: 180, height: 60 }, name: 'Approved' },
        { appearance },
      ),
    );
  }, [annotation, ready, cover]);

  return null;
}

function ModeSwitch() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();

  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Mode">
        <button
          type="button"
          aria-pressed={activeToolId === 'pan'}
          onClick={() => interaction.activateTool('pan')}
        >
          Read
        </button>
        <button
          type="button"
          aria-pressed={activeToolId === 'pointer'}
          onClick={() => interaction.activateTool('pointer')}
        >
          Edit
        </button>
      </div>
      <p className="hint">
        {activeToolId === 'pan'
          ? 'The button works; the stamp stays put'
          : 'Select and move the stamp; the button is gone'}
      </p>
    </div>
  );
}

export default function App() {
  const [signedOff, setSignedOff] = useState<Record<string, boolean>>({});
  const approvals: Approvals = {
    signedOff,
    toggle: (key) => setSignedOff((current) => ({ ...current, [key]: !current[key] })),
  };

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddStamp />
        <ModeSwitch />
        <ApprovalsContext.Provider value={approvals}>
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer annotations={false} />
                <AnnotationLayer renderers={RENDERERS} />
              </>
            )}
          </Stage>
        </ApprovalsContext.Provider>
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
