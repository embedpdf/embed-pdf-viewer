'use client';

import {
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Download04Icon,
  Pdf02Icon,
  PlusSignIcon,
  Shield01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  customKeyProblem,
  customPatch,
  formValues,
  hasXmp,
  metadataPatch,
  PERSONAL_FIELDS,
  type CustomRow,
  type FormValues,
  type Trapped,
} from './fields';
import { NextSteps } from '../shared/next-steps';
import { saveBytes } from '../shared/save-file';
import type { OpenFile } from '../shared/single-file';

/** The engine side of saving the PDF, loaded with the engine. */
const loadOpenPdf = () => import('../shared/open-pdf');

let nextRow = 0;
const rowsOf = (custom: Readonly<Record<string, string>>): CustomRow[] =>
  Object.entries(custom).map(([key, value]) => ({ id: `row-${++nextRow}`, key, value }));

const INPUT =
  'border-ep-border focus:border-ep-blue text-ep-navy h-11 w-full min-w-0 rounded-lg border bg-white px-3 font-sans text-[15px] outline-none';
const PRIMARY_BUTTON =
  'bg-ep-blue hover:bg-ep-blue600 focus-visible:outline-ep-blue disabled:bg-ep-faint inline-flex h-[52px] flex-shrink-0 items-center justify-center gap-2.5 rounded-[10px] px-6 font-sans text-base font-bold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-[3px] disabled:cursor-not-allowed';

const TRAPPED_CHOICES: readonly { value: Trapped; label: string }[] = [
  { value: 'unknown', label: 'Not set' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

/** A field with its label, a hint under it, and a way back when it changed. */
function Field({
  id,
  label,
  hint,
  changed,
  onRevert,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  changed: boolean;
  onRevert: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-ep-navy font-sans text-sm font-bold">
          {label}
        </label>
        {changed && (
          <span className="flex items-center gap-2 font-sans text-xs">
            <span className="bg-ep-mist text-ep-blue700 rounded-full px-2 py-0.5 font-bold">
              Changed
            </span>
            <button
              type="button"
              onClick={onRevert}
              className="text-ep-soft hover:text-ep-blue font-semibold"
            >
              Undo
            </button>
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-ep-soft m-0 font-sans text-[13px] leading-[1.5]">{hint}</p>}
    </div>
  );
}

/**
 * Edit PDF metadata: the details stored in the file, as a form that says what each one is for.
 * The four people know come first; the rest are folded away. "Remove personal details" empties
 * what names a person or their software, and the save writes the file whole, so no old value is
 * left inside it. Where the file keeps a second copy of the details (XMP), which the engine
 * doesn't change yet, the tool says so.
 */
export function MetadataTool({ file }: { file: OpenFile }) {
  const doc = file.doc!;
  const [original, setOriginal] = useState<{
    values: FormValues;
    custom: Readonly<Record<string, string>>;
  } | null>(null);
  const [draft, setDraft] = useState<FormValues | null>(null);
  const [rows, setRows] = useState<readonly CustomRow[]>([]);
  const [cleared, setCleared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<Uint8Array | null>(null);
  const xmp = useMemo(() => hasXmp(file.bytes), [file.bytes]);

  const read = useCallback(async () => {
    const [metadata, custom] = await Promise.all([doc.metadata.get(), doc.metadata.custom.get()]);
    const values = formValues(metadata);
    setOriginal({ values, custom });
    setDraft(values);
    setRows(rowsOf(custom));
  }, [doc]);

  useEffect(() => {
    read().catch(() => setProblem('The details of this PDF couldn’t be read.'));
  }, [read]);

  if (!original || !draft) {
    return (
      <div className="text-ep-soft flex min-h-[160px] items-center justify-center gap-3 font-sans text-sm">
        {problem ?? (
          <>
            <span className="border-ep-mistDeep border-t-ep-blue h-5 w-5 animate-spin rounded-full border-2" />
            Reading the details…
          </>
        )}
      </div>
    );
  }

  const set = (change: Partial<FormValues>) => {
    setDraft({ ...draft, ...change });
    setSaved(null);
  };
  const isChanged = (field: keyof FormValues) => draft[field] !== original.values[field];
  const revert = (field: keyof FormValues) => set({ [field]: original.values[field] });

  const keyProblems = rows.map((row, index) =>
    !row.key.trim() && !row.value.trim()
      ? null
      : customKeyProblem(
          row.key,
          rows.filter((_, other) => other !== index).map((each) => each.key.trim()),
        ),
  );
  const patch = metadataPatch(original.values, draft);
  const ownPatch = customPatch(original.custom, rows);
  const changes = Object.keys(patch).length + Object.keys(ownPatch).length;
  const blocked = keyProblems.some(Boolean);

  const setRow = (id: string, change: Partial<CustomRow>) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
    setSaved(null);
  };

  const removePersonal = () => {
    set(Object.fromEntries(PERSONAL_FIELDS.map((field) => [field, ''])));
    setRows([]);
    setCleared(true);
  };

  const save = async () => {
    if (changes === 0 || blocked) return;
    setSaving(true);
    setProblem(null);
    try {
      if (Object.keys(patch).length > 0) await doc.metadata.update(patch);
      if (Object.keys(ownPatch).length > 0) await doc.metadata.custom.update(ownPatch);
      const { downloadWhole } = await loadOpenPdf();
      const bytes = await downloadWhole(doc);
      saveBytes(bytes, file.name);
      await read();
      setCleared(false);
      setSaved(bytes);
    } catch {
      setProblem('The details couldn’t be saved. Check the fields and try again.');
    }
    setSaving(false);
  };

  const text = (field: 'title' | 'author' | 'subject' | 'keywords' | 'creator' | 'producer') => (
    <input
      id={`meta-${field}`}
      type="text"
      value={draft[field]}
      onChange={(event) => set({ [field]: event.target.value })}
      className={INPUT}
    />
  );
  const date = (field: 'createdAt' | 'modifiedAt') => (
    <input
      id={`meta-${field}`}
      type="datetime-local"
      step={1}
      value={draft[field]}
      onChange={(event) => set({ [field]: event.target.value })}
      className={INPUT}
    />
  );

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-1 gap-6 min-[901px]:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <div className="flex flex-col gap-5">
          <Field
            id="meta-title"
            label="Title"
            changed={isChanged('title')}
            onRevert={() => revert('title')}
            hint="Shown in the browser tab and in search results instead of the file name. Leave it empty to show the file name."
          >
            {text('title')}
          </Field>
          <Field
            id="meta-author"
            label="Author"
            changed={isChanged('author')}
            onRevert={() => revert('author')}
          >
            {text('author')}
          </Field>
          <Field
            id="meta-subject"
            label="Subject"
            changed={isChanged('subject')}
            onRevert={() => revert('subject')}
            hint="What the document is about, in a sentence."
          >
            {text('subject')}
          </Field>
          <Field
            id="meta-keywords"
            label="Keywords"
            changed={isChanged('keywords')}
            onRevert={() => revert('keywords')}
            hint="Words to find it by, separated by commas."
          >
            {text('keywords')}
          </Field>

          <details className="border-ep-border group rounded-2xl border bg-white">
            <summary className="text-ep-navy flex cursor-pointer list-none items-center justify-between rounded-2xl px-4 py-3.5 font-sans text-sm font-bold [&::-webkit-details-marker]:hidden">
              More details
              <span className="text-ep-soft hidden font-normal group-open:hidden min-[641px]:inline">
                Dates, apps, trapping and fields of their own
              </span>
            </summary>
            <div className="flex flex-col gap-5 px-4 pb-5">
              <div className="grid gap-5 min-[641px]:grid-cols-2">
                <Field
                  id="meta-createdAt"
                  label="Created"
                  changed={isChanged('createdAt')}
                  onRevert={() => revert('createdAt')}
                >
                  {date('createdAt')}
                </Field>
                <Field
                  id="meta-modifiedAt"
                  label="Last changed"
                  changed={isChanged('modifiedAt')}
                  onRevert={() => revert('modifiedAt')}
                >
                  {date('modifiedAt')}
                </Field>
                <Field
                  id="meta-creator"
                  label="Made with"
                  changed={isChanged('creator')}
                  onRevert={() => revert('creator')}
                  hint="The app the document was written in."
                >
                  {text('creator')}
                </Field>
                <Field
                  id="meta-producer"
                  label="PDF made by"
                  changed={isChanged('producer')}
                  onRevert={() => revert('producer')}
                  hint="The app that turned it into a PDF."
                >
                  {text('producer')}
                </Field>
              </div>
              <Field
                id="meta-trapped"
                label="Trapping"
                changed={isChanged('trapped')}
                onRevert={() => revert('trapped')}
                hint="For print shops. Leave it unless your printer asks for it."
              >
                <select
                  id="meta-trapped"
                  value={draft.trapped}
                  onChange={(event) => set({ trapped: event.target.value as Trapped })}
                  className={`${INPUT} min-[641px]:w-[200px]`}
                >
                  {TRAPPED_CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="flex flex-col gap-2.5">
                <p className="text-ep-navy m-0 font-sans text-sm font-bold">Fields of their own</p>
                <p className="text-ep-soft m-0 font-sans text-[13px]">
                  Extra details other apps added, or ones you add, each with a name and a value.
                </p>
                {rows.map((row, index) => (
                  <div key={row.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={row.key}
                        placeholder="Name"
                        aria-label="Field name"
                        aria-invalid={Boolean(keyProblems[index])}
                        onChange={(event) => setRow(row.id, { key: event.target.value })}
                        className={`${INPUT} flex-[2] ${keyProblems[index] ? '!border-[#B42318]' : ''}`}
                      />
                      <input
                        type="text"
                        value={row.value}
                        placeholder="Value"
                        aria-label={`Value of ${row.key || 'the field'}`}
                        onChange={(event) => setRow(row.id, { value: event.target.value })}
                        className={`${INPUT} flex-[3]`}
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${row.key || 'this field'}`}
                        onClick={() => {
                          setRows(rows.filter((each) => each.id !== row.id));
                          setSaved(null);
                        }}
                        className="text-ep-soft inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg hover:bg-[#FDF0EF] hover:text-[#B42318]"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={18} strokeWidth={2} />
                      </button>
                    </div>
                    {keyProblems[index] && (
                      <p className="m-0 font-sans text-[13px] font-semibold text-[#B42318]">
                        {keyProblems[index]}
                      </p>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setRows([...rows, { id: `row-${++nextRow}`, key: '', value: '' }])}
                  className="text-ep-blue hover:text-ep-blue700 inline-flex items-center gap-1.5 self-start font-sans text-sm font-bold"
                >
                  <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2.4} />
                  Add a field
                </button>
              </div>
            </div>
          </details>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="border-ep-border bg-ep-bg rounded-2xl border p-4">
            <p className="text-ep-soft m-0 mb-2.5 font-sans text-[13px] font-semibold">
              In a browser tab it reads:
            </p>
            <div className="rounded-t-lg bg-[#DEE1E6] px-2 pt-2">
              <div className="flex items-center gap-2 rounded-t-md bg-white px-3 py-2">
                <HugeiconsIcon
                  icon={Pdf02Icon}
                  size={14}
                  strokeWidth={2}
                  className="text-[#B42318]"
                />
                <span className="text-ep-ink min-w-0 flex-1 truncate font-sans text-[13px]">
                  {draft.title.trim() || file.name}
                </span>
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={12}
                  strokeWidth={2}
                  className="text-ep-soft"
                />
              </div>
            </div>
          </div>

          <div className="border-ep-border rounded-2xl border bg-white p-4">
            <p className="text-ep-navy m-0 flex items-center gap-2 font-sans text-sm font-bold">
              <HugeiconsIcon
                icon={Shield01Icon}
                size={18}
                strokeWidth={2}
                className="text-ep-blue"
              />
              Sharing this PDF?
            </p>
            <p className="text-ep-muted m-0 mt-1.5 font-sans text-[13px] leading-[1.55]">
              Remove the author, keywords, the names of the apps that made the file, and fields
              other apps added.
            </p>
            <button
              type="button"
              onClick={removePersonal}
              className="border-ep-blue text-ep-blue mt-3 inline-flex h-10 items-center rounded-[10px] border-2 px-3.5 font-sans text-sm font-bold transition-colors hover:bg-[rgba(8,118,253,0.08)]"
            >
              Remove personal details
            </button>
            {cleared && (
              <p className="text-ep-ink m-0 mt-2.5 font-sans text-[13px] leading-[1.5]">
                Cleared. Press Save and download to keep the PDF without them.
              </p>
            )}
            {xmp && (
              <p className="m-0 mt-3 font-sans text-[13px] leading-[1.5] text-[#8A5D00]">
                This PDF also keeps a second copy of its details (XMP metadata), which some apps
                read instead. This tool can’t change that copy yet.
              </p>
            )}
          </div>
        </aside>
      </div>

      {problem && (
        <p
          role="alert"
          className="m-0 mt-4 flex items-start gap-2 font-sans text-sm text-[#B42318]"
        >
          <HugeiconsIcon
            icon={Alert02Icon}
            size={18}
            strokeWidth={2}
            className="mt-px flex-shrink-0"
          />
          {problem}
        </p>
      )}

      <div className="border-ep-border sticky bottom-0 z-[3] -mx-[clamp(14px,2.2vw,24px)] -mb-[clamp(14px,2.2vw,24px)] mt-6 flex flex-col-reverse gap-2 rounded-b-[22px] border-t bg-white/95 px-[clamp(14px,2.2vw,24px)] py-3.5 backdrop-blur min-[641px]:flex-row min-[641px]:items-center min-[641px]:justify-end min-[641px]:gap-4">
        <p className="text-ep-soft m-0 font-sans text-[13px] leading-[1.45] min-[641px]:max-w-[460px] min-[641px]:text-right">
          {saved
            ? null
            : blocked
              ? 'Fix the field names marked in red to save.'
              : changes === 0
                ? 'Change a field to save a new copy.'
                : file.signed
                  ? 'This PDF is signed. Saving changes will show the signature as changed.'
                  : `${changes} ${changes === 1 ? 'change' : 'changes'} to save.`}
        </p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={changes === 0 || blocked || saving}
          className={PRIMARY_BUTTON}
        >
          <HugeiconsIcon icon={Download04Icon} size={20} strokeWidth={2.2} />
          {saving ? 'Saving…' : 'Save and download'}
        </button>
      </div>

      {saved && (
        <div className="mt-8 flex flex-col items-center gap-5 text-center">
          <p className="text-ep-ink m-0 flex items-center gap-2 font-sans text-[15px] font-semibold">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={20}
              strokeWidth={2}
              className="text-[#15803D]"
            />
            Saved. {file.name} is downloading.
          </p>
          <NextSteps
            file={{ name: file.name, bytes: saved, password: file.password }}
            from="pdf-metadata-editor"
          />
        </div>
      )}
    </div>
  );
}
