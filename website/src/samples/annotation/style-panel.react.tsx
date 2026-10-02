import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationProperties,
  useAnnotationState,
  type AnnotationProperty,
  type LineEnding,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './style-panel.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// On load: a rectangle (selected), an arrow and a text box on the cover.
function AddAnnotations() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void annotation.create(cover, {
      subtype: 'line',
      linePoints: { start: { x: 520, y: 120 }, end: { x: 470, y: 230 } },
      lineEndings: { start: 'none', end: 'closed-arrow' },
      color: '#1a2748',
      strokeWidth: 3,
    });
    void annotation.create(cover, {
      subtype: 'free-text',
      box: { x: 300, y: 512, width: 230, height: 40 },
      contents: 'Ready for review',
      fontSize: 16,
      fontColor: '#1a2748',
    });
    void annotation.create(
      cover,
      {
        subtype: 'square',
        box: { x: 96, y: 506, width: 178, height: 54 },
        color: '#e5484d',
        interiorColor: '#ffe4e1',
        strokeWidth: 3,
      },
      undefined,
      { select: true },
    );
  }, [annotation, ready, cover]);

  return null;
}

// One control per property, by the control it asks for.
function Control({ property }: { property: AnnotationProperty }) {
  const annotation = useAnnotation();
  const { values, mixed } = useAnnotationProperties();
  const value = values[property.key];
  const isMixed = mixed.includes(property.key);
  const update = (next: unknown) => annotation.selection.update({ [property.key]: next });

  switch (property.control) {
    case 'color':
      return (
        <span className="pair">
          <input
            type="color"
            className="color"
            aria-label={property.label}
            value={typeof value === 'string' ? value : '#ffffff'}
            onChange={(event) => update(event.target.value)}
          />
          {property.key === 'interiorColor' && (
            <button type="button" className="link" onClick={() => update(null)}>
              {value === null ? 'none' : 'remove'}
            </button>
          )}
        </span>
      );
    case 'number':
      return (
        <span className="pair">
          <input
            type="range"
            aria-label={property.label}
            min={property.min}
            max={property.max}
            step={property.step}
            value={typeof value === 'number' ? value : property.min}
            onChange={(event) => update(Number(event.target.value))}
          />
          <output className="value">{isMixed ? 'mixed' : String(value)}</output>
        </span>
      );
    case 'choice':
      // Line endings are a pair: this sets the end, and each line keeps its own start.
      if (property.key === 'lineEndings') {
        const end = (value as { end?: string } | undefined)?.end ?? 'none';
        return (
          <select
            className="select"
            aria-label="Line end"
            value={end}
            onChange={(event) => {
              const next = event.target.value as LineEnding;
              void annotation.selection.update((member) =>
                member.subtype === 'line'
                  ? { lineEndings: { ...member.lineEndings, end: next } }
                  : {},
              );
            }}
          >
            {property.options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        );
      }
      // The border is three fields: its style, its dashes, and how cloudy it is.
      if (property.key === 'borderStyle') {
        const border = values.cloudyIntensity ? 'cloudy' : String(value);
        return (
          <select
            className="select"
            aria-label={property.label}
            value={isMixed ? '' : border}
            onChange={(event) => {
              const next = event.target.value;
              void annotation.selection.update({
                borderStyle: next === 'dashed' ? 'dashed' : 'solid',
                dashArray: next === 'dashed' ? [4, 3] : null,
                cloudyIntensity: next === 'cloudy' ? 1 : null,
              });
            }}
          >
            {isMixed && <option value="">mixed</option>}
            {property.options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        );
      }
      return (
        <select
          className="select"
          aria-label={property.label}
          value={isMixed ? '' : String(value ?? '')}
          onChange={(event) => update(event.target.value)}
        >
          {isMixed && <option value="">mixed</option>}
          {property.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      );
    case 'flag':
      return (
        <input
          type="checkbox"
          aria-label={property.label}
          checked={value === true}
          onChange={(event) => update(event.target.checked)}
        />
      );
    case 'textFormat':
      return (
        <button
          type="button"
          className="toggle"
          aria-pressed={value === true}
          onClick={() => annotation.text.toggleFormat(property.format)}
        >
          {property.label}
        </button>
      );
    case 'text':
      return (
        <input
          className="text"
          aria-label={property.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => update(event.target.value)}
        />
      );
    case 'link':
      return (
        <select
          className="select"
          aria-label={property.label}
          value={value ? 'website' : 'none'}
          onChange={(event) =>
            annotation.selection.updateLink(
              event.target.value === 'website'
                ? { kind: 'uri', uri: 'https://www.embedpdf.com' }
                : null,
            )
          }
        >
          <option value="none">No link</option>
          <option value="website">embedpdf.com</option>
        </select>
      );
  }
}

// What the selection can change, with its current values.
function StylePanel() {
  const { properties } = useAnnotationProperties();

  if (properties.length === 0) return <p className="panel empty">Select an annotation</p>;
  return (
    <dl className="panel properties">
      {properties.map((property) => (
        <div key={property.key} className="property">
          <dt>{property.label}</dt>
          <dd>
            <Control property={property} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddAnnotations />
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer annotations={false} />
                <AnnotationLayer />
              </>
            )}
          </Stage>
          <StylePanel />
        </div>
      </DocumentGate>
    </Viewer>
  );
}
