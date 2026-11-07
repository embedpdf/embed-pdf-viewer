/**
 * The mark maker (`signature-maker` modal surface): a person's signature and
 * initials, drawn, typed, or uploaded, saved as one library of kind
 * `signatures` — the file is the person (Preview's model). Chrome code over
 * the stamp plugin's generic calls: `createLibrary` + `createAsset({ mark })`;
 * rename/export/delete are the library verbs. Opened on an existing library
 * (`props.libraryId`) it only adds the missing initials. Escape cancels,
 * unless it's saving.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { MountableFontProgram } from '@embedpdf/core-fonts';
import { useFontMounts } from '@embedpdf/react/fonts';
import { useSurface } from '@embedpdf/react/shell';
import { useT } from '@embedpdf/react/i18n';
import { useStamp, type MarkSource } from '@embedpdf/react/stamp';
import {
  INITIALS_MARK_NAME,
  SIGNATURE_MARK_NAME,
  SIGNATURES_LIBRARY_KIND,
} from '@embedpdf/react/signature';
import { useSignatureSettings } from '../config-context';
import { Dialog } from './dialog';
import { Icon } from './icons';
import { markFontProgram, markFontsOf, type MarkFont } from './signature-fonts';

type Tab = 'draw' | 'type' | 'upload';

const NO_PROGRAMS: readonly MountableFontProgram[] = [];
type Stroke = Array<{ x: number; y: number }>;

const PAD = { width: 360, height: 120 };

/** One pad: draw / type / upload, producing a `MarkSource` or null. */
function MarkPad({
  value,
  onChange,
  fonts,
}: {
  value: MarkSource | null;
  onChange: (mark: MarkSource | null) => void;
  fonts: readonly MarkFont[];
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('draw');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [text, setText] = useState('');
  const [font, setFont] = useState(fonts[0]?.key ?? '');
  const [fileName, setFileName] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);
  // The typed name shows in the font the mark is written in: read when the Type tab opens on it.
  const [program, setProgram] = useState<MountableFontProgram | null>(null);
  useEffect(() => {
    const chosen = tab === 'type' ? fonts.find((each) => each.key === font) : undefined;
    if (!chosen) return;
    let current = true;
    markFontProgram(chosen).then(
      (made) => current && setProgram(made),
      (error: unknown) => console.error('[embedpdf] loading the signature font failed:', error),
    );
    return () => {
      current = false;
    };
  }, [tab, font, fonts]);
  useFontMounts(program ? [program] : NO_PROGRAMS);

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
    // A mark's strokes go down the page, as the pad's do.
    onChange(
      next.length ? { kind: 'ink', strokes: next, color: '#000000', strokeWidth: 2.5 } : null,
    );
  };
  // The stamp plugin registers the font where the mark is written, when it's saved.
  const commitText = (next: string, key: string) => {
    setText(next);
    setFont(key);
    onChange(
      next.trim()
        ? { kind: 'text', text: next.trim(), fontFamily: key, color: '#000000', fontSize: 36 }
        : null,
    );
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
        {fonts.length > 0 ? (
          <button type="button" className={tabClass('type')} onClick={() => setTab('type')}>
            {t('demo.makerType')}
          </button>
        ) : null}
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
            onChange={(event) => commitText(event.target.value, font)}
            style={
              program ? { fontFamily: `"${program.family}", cursive`, fontSize: 22 } : undefined
            }
            className="border-border bg-surface text-fg w-full rounded border px-2 py-1.5 text-sm"
          />
          <label className="text-fg-muted flex items-center gap-2 text-xs">
            {t('demo.makerFont')}
            <select
              value={font}
              onChange={(event) => commitText(text, event.target.value)}
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
  const config = useSignatureSettings();
  const [name, setName] = useState('');
  const [signatureMark, setSignatureMark] = useState<MarkSource | null>(null);
  const [initialsMark, setInitialsMark] = useState<MarkSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  const existingId = surface.props?.libraryId as string | undefined;
  const existing = existingId ? stamp.getLibrary(existingId) : null;
  const wantsInitials = (config.kinds ?? ['signature', 'initials']).includes('initials');
  const [fonts] = useState(() => markFontsOf(config.fonts));

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
        const { library } = await stamp.createLibrary(name.trim(), {
          kind: SIGNATURES_LIBRARY_KIND,
        });
        const libraryId = library.id;
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
    <Dialog
      labelledBy={titleId}
      onClose={() => {
        if (!busy) surface.close();
      }}
      className="border-border bg-surface w-[26rem] rounded-lg border p-4 shadow-xl"
    >
      <div className="flex items-center justify-between">
        <h2 id={titleId} className="text-fg text-base font-semibold">
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
          <MarkPad value={signatureMark} onChange={setSignatureMark} fonts={fonts} />
        </div>
      )}
      {wantsInitials ? (
        <div className="mt-3">
          <p className="text-fg mb-1 text-xs font-semibold uppercase tracking-wide">
            {t('demo.initialsLabel')}
            {existing ? null : (
              <span className="text-fg-muted ms-1 font-normal normal-case tracking-normal">
                {t('demo.makerOptional')}
              </span>
            )}
          </p>
          <MarkPad value={initialsMark} onChange={setInitialsMark} fonts={fonts} />
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
    </Dialog>
  );
}
