/**
 * The mark maker (`signature-maker` modal surface): a person's signature and
 * initials, drawn, typed, or uploaded, saved as one library of kind
 * `signatures` — the file is the person (Preview's model). Chrome code over
 * the stamp plugin's generic calls: `createLibrary` + `addAsset({ mark })`;
 * rename/export/delete are the library verbs. Opened on an existing library
 * (`props.libraryId`) it only adds the missing initials.
 */
import { useEffect, useRef, useState } from 'react';
import { useKernel } from '@embedpdf/react/runtime';
import { useSurface } from '@embedpdf/react/shell';
import { useT } from '@embedpdf/react/i18n';
import { useStamp, type MarkSource } from '@embedpdf/react/stamp';
import {
  INITIALS_MARK_NAME,
  SIGNATURE_MARK_NAME,
  SIGNATURES_LIBRARY_KIND,
} from '@embedpdf/react/signature';
import { useSignaturesConfig } from '../config-context';
import { Icon } from './icons';

type Tab = 'draw' | 'type' | 'upload';
type Stroke = Array<{ x: number; y: number }>;

const PAD = { width: 360, height: 120 };
const BUILTIN_FONTS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'helvetica-oblique', label: 'Helvetica' },
  { key: 'times-italic', label: 'Times' },
];

/** One pad: draw / type / upload, producing a `MarkSource` or null. */
function MarkPad({
  value,
  onChange,
  fonts,
  registerFont,
}: {
  value: MarkSource | null;
  onChange: (mark: MarkSource | null) => void;
  fonts: ReadonlyArray<{ key: string; label: string }>;
  registerFont: (key: string) => Promise<void>;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('draw');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [text, setText] = useState('');
  const [font, setFont] = useState(fonts[0]?.key ?? 'helvetica-oblique');
  const [fileName, setFileName] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);

  // Paint the strokes (device-pixel sharp).
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const dpr = window.devicePixelRatio || 1;
    element.width = PAD.width * dpr;
    element.height = PAD.height * dpr;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PAD.width, PAD.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = getComputedStyle(element).color || '#000';
    for (const stroke of strokes) {
      ctx.beginPath();
      stroke.forEach((vertex, i) =>
        i === 0 ? ctx.moveTo(vertex.x, vertex.y) : ctx.lineTo(vertex.x, vertex.y),
      );
      ctx.stroke();
    }
  }, [strokes, tab]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const commitStrokes = (next: Stroke[]) => {
    setStrokes(next);
    onChange(
      next.length ? { kind: 'ink', strokes: next, color: '#000000', strokeWidth: 2.5 } : null,
    );
  };
  const commitText = async (next: string, key: string) => {
    setText(next);
    setFont(key);
    if (!next.trim()) {
      onChange(null);
      return;
    }
    await registerFont(key);
    onChange({ kind: 'text', text: next.trim(), fontFamily: key, color: '#000000', fontSize: 36 });
  };
  const pickFile = (file: File) => {
    setFileName(file.name);
    onChange(
      file.type === 'application/pdf'
        ? { kind: 'pdf', source: file, pageIndex: 0 }
        : { kind: 'image', source: file },
    );
  };

  const tabClass = (id: Tab) =>
    `rounded px-2 py-1 text-xs font-medium ${tab === id ? 'bg-accent text-on-accent' : 'text-fg-muted hover:bg-hover'}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <button type="button" className={tabClass('draw')} onClick={() => setTab('draw')}>
          {t('demo.makerDraw')}
        </button>
        <button type="button" className={tabClass('type')} onClick={() => setTab('type')}>
          {t('demo.makerType')}
        </button>
        <button type="button" className={tabClass('upload')} onClick={() => setTab('upload')}>
          {t('demo.makerUpload')}
        </button>
        <div className="flex-1" />
        {value ? (
          <button
            type="button"
            onClick={() => {
              commitStrokes([]);
              setText('');
              setFileName(null);
              onChange(null);
            }}
            className="text-fg-muted hover:text-fg text-xs"
          >
            {t('demo.makerClear')}
          </button>
        ) : null}
      </div>
      {tab === 'draw' ? (
        <canvas
          ref={canvas}
          style={{ width: PAD.width, height: PAD.height, touchAction: 'none' }}
          className="border-border-subtle bg-surface text-fg rounded-md border"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = [point(event)];
            setStrokes((previous) => [...previous, drawing.current!]);
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            drawing.current.push(point(event));
            setStrokes((previous) => [...previous.slice(0, -1), [...drawing.current!]]);
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            const done = drawing.current;
            drawing.current = null;
            setStrokes((previous) => {
              const next = [...previous.slice(0, -1), done];
              commitStrokes(next);
              return next;
            });
          }}
        />
      ) : tab === 'type' ? (
        <div className="flex flex-col gap-2">
          <input
            value={text}
            placeholder={t('demo.makerTypePlaceholder')}
            onChange={(event) => void commitText(event.target.value, font)}
            className="border-border bg-surface text-fg w-full rounded border px-2 py-1.5 text-sm"
          />
          <label className="text-fg-muted flex items-center gap-2 text-xs">
            {t('demo.makerFont')}
            <select
              value={font}
              onChange={(event) => void commitText(text, event.target.value)}
              className="border-border bg-surface text-fg rounded border px-2 py-1 text-xs"
            >
              {fonts.map((fontOption) => (
                <option key={fontOption.key} value={fontOption.key}>
                  {fontOption.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <label className="border-border-subtle text-fg-muted hover:bg-hover flex h-24 cursor-pointer items-center justify-center rounded-md border border-dashed text-sm">
          {fileName ?? t('demo.makerUploadHint')}
          <input
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) pickFile(file);
            }}
          />
        </label>
      )}
    </div>
  );
}

export function SignatureMakerModal() {
  const t = useT();
  const surface = useSurface('signature-maker');
  const stamp = useStamp();
  const kernel = useKernel();
  const config = useSignaturesConfig();
  const [name, setName] = useState('');
  const [signatureMark, setSignatureMark] = useState<MarkSource | null>(null);
  const [initialsMark, setInitialsMark] = useState<MarkSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingId = surface.props?.libraryId as string | undefined;
  const existing = existingId ? stamp.getLibrary(existingId) : null;
  const wantsInitials = (config.kinds ?? ['signature', 'initials']).includes('initials');
  const fonts = [
    ...(config.fonts ?? []).map((font) => ({ key: font.key, label: font.label })),
    ...BUILTIN_FONTS,
  ];
  const registered = useRef(new Set<string>());
  // A configured script face is registered on the engine the stamp plugin
  // authors with (the viewer's own) the first time a typed mark uses it.
  const registerFont = async (key: string) => {
    const spec = config.fonts?.find((font) => font.key === key);
    if (!spec || registered.current.has(key) || !kernel.engine.fonts) return;
    const response = await fetch(spec.url);
    if (!response.ok) throw new Error(`${spec.url}: HTTP ${response.status}`);
    await kernel.engine.fonts.register({ key, data: new Uint8Array(await response.arrayBuffer()) });
    registered.current.add(key);
  };

  if (!surface.isOpen) return null;

  const canSave = existing ? initialsMark != null : name.trim().length > 0 && signatureMark != null;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await stamp.createAsset({
          libraryId: existing.id,
          name: INITIALS_MARK_NAME,
          label: t('demo.initialsLabel'),
          mark: initialsMark!,
        });
      } else {
        const libraryId = await stamp.createLibrary(name.trim(), { kind: SIGNATURES_LIBRARY_KIND });
        await stamp.createAsset({
          libraryId,
          name: SIGNATURE_MARK_NAME,
          label: t('demo.signatureLabel'),
          mark: signatureMark!,
        });
        if (initialsMark) {
          await stamp.createAsset({
            libraryId,
            name: INITIALS_MARK_NAME,
            label: t('demo.initialsLabel'),
            mark: initialsMark,
          });
        }
      }
      setName('');
      setSignatureMark(null);
      setInitialsMark(null);
      surface.close();
    } catch (error) {
      console.error('[embedpdf] saving the signature failed:', error);
      setError(t('demo.makerError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="border-border bg-surface w-[26rem] rounded-lg border p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-fg text-base font-semibold">
            {existing ? t('demo.signaturesAddInitials') : t('demo.makerTitle')}
          </h2>
          <button
            type="button"
            onClick={surface.close}
            className="text-fg-muted hover:bg-hover grid h-7 w-7 place-items-center rounded-md"
            aria-label={t('demo.cancel')}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        {existing ? null : (
          <label className="text-fg-muted mt-3 block text-xs">
            {t('demo.makerName')}
            <input
              value={name}
              placeholder={t('demo.makerNamePlaceholder')}
              onChange={(event) => setName(event.target.value)}
              className="border-border bg-surface text-fg mt-1 w-full rounded border px-2 py-1.5 text-sm"
            />
          </label>
        )}
        {existing ? null : (
          <div className="mt-3">
            <p className="text-fg mb-1 text-xs font-semibold uppercase tracking-wide">
              {t('demo.signatureLabel')}
            </p>
            <MarkPad
              value={signatureMark}
              onChange={setSignatureMark}
              fonts={fonts}
              registerFont={registerFont}
            />
          </div>
        )}
        {wantsInitials ? (
          <div className="mt-3">
            <p className="text-fg mb-1 text-xs font-semibold uppercase tracking-wide">
              {t('demo.initialsLabel')}
              {existing ? null : (
                <span className="text-fg-muted ml-1 font-normal normal-case tracking-normal">
                  {t('demo.makerOptional')}
                </span>
              )}
            </p>
            <MarkPad
              value={initialsMark}
              onChange={setInitialsMark}
              fonts={fonts}
              registerFont={registerFont}
            />
          </div>
        ) : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={surface.close}
            className="border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm"
          >
            {t('demo.cancel')}
          </button>
          <button
            type="button"
            disabled={busy || !canSave}
            onClick={() => void save()}
            className="bg-accent text-on-accent rounded-md px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {busy ? t('demo.makerSaving') : t('demo.makerSave')}
          </button>
        </div>
      </div>
    </div>
  );
}
