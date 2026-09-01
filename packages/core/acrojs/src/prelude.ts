/**
 * Install the curated Acrobat object model into an isolated JavaScript realm.
 *
 * This function must remain self-contained: no imports and no closed-over
 * values. The sandbox ships `installAcroJs.toString()` into QuickJS, while
 * tests execute the same source in a Node VM. Types disappear at build time.
 */
export function installAcroJs(g: Record<string, unknown>): void {
  type AnyRecord = Record<string, unknown>;
  type FieldRecord = {
    input: AnyRecord;
    originalValue: unknown;
    value: unknown;
    originalDisplay: string;
    display: string;
    wrapper: AnyRecord;
  };
  type AnnotRecord = {
    input: AnyRecord;
    /** Writable-key snapshots: original vs current — effects are the diff. */
    original: AnyRecord;
    current: AnyRecord;
    wrapper: AnyRecord;
  };
  type RunState = {
    input: AnyRecord;
    fields: FieldRecord[];
    fieldsByName: Map<string, FieldRecord>;
    fieldsByRef: Map<string, FieldRecord>;
    annots: AnnotRecord[];
    annotsByPage: Map<number, AnnotRecord[]>;
    annotPages: Set<number>;
    annotsCoverDocument: boolean;
    event: AnyRecord;
    resetRefs: AnyRecord[];
    resetKeys: Set<string>;
    uiEffects: AnyRecord[];
    diagnostics: AnyRecord[];
    randomState: number;
    maxEffects: number;
  };

  const host = g as AnyRecord;
  const NativeDate = Date;
  let state: RunState | null = null;

  const cloneValue = (value: unknown): unknown =>
    Array.isArray(value) ? value.map((item) => String(item)) : value;
  const sameValue = (a: unknown, b: unknown): boolean => {
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((item, index) => item === b[index]);
    }
    return a === b;
  };
  const refKey = (ref: unknown): string => {
    const value = ref as AnyRecord | null | undefined;
    return value?.kind === 'objectNumber'
      ? `obj:${String(value.fieldObjectNumber)}`
      : `fqn:${String(value?.name ?? '')}`;
  };
  const diagnostic = (code: string, message: string): void => {
    state?.diagnostics.push({ code, message });
  };
  const blocked = (api: string): undefined => {
    diagnostic('blocked-network', `${api} is blocked by the scripting policy`);
    return undefined;
  };
  const numberValue = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value ?? '').replace(/[^0-9+\-.]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const displayToCode = (display: string): number =>
    display === 'hidden' ? 1 : display === 'noPrint' ? 2 : display === 'noView' ? 3 : 0;
  const codeToDisplay = (code: unknown): string =>
    Number(code) === 1
      ? 'hidden'
      : Number(code) === 2
        ? 'noPrint'
        : Number(code) === 3
          ? 'noView'
          : 'visible';
  const eventName = (kind: string): string =>
    kind === 'widget-activate'
      ? 'Mouse Up'
      : kind === 'field-keystroke'
        ? 'Keystroke'
        : kind === 'field-validate'
          ? 'Validate'
          : kind === 'field-calculate'
            ? 'Calculate'
            : kind === 'field-format'
              ? 'Format'
              : 'Open';

  const doc: AnyRecord = {};

  const makeField = (record: FieldRecord): AnyRecord => {
    const input = record.input;
    const wrapper: AnyRecord = {};
    Object.defineProperties(wrapper, {
      name: { enumerable: true, get: () => input.name },
      type: { enumerable: true, get: () => input.family },
      value: {
        enumerable: true,
        get: () => cloneValue(record.value),
        set: (value: unknown) => {
          record.value = cloneValue(value);
        },
      },
      valueAsString: {
        enumerable: true,
        get: () =>
          Array.isArray(record.value) ? record.value.join(',') : String(record.value ?? ''),
      },
      defaultValue: { enumerable: true, get: () => cloneValue(input.defaultValue) },
      readonly: {
        enumerable: true,
        get: () => Boolean(input.readOnly),
        set: () => {
          diagnostic('unsupported-api', 'Field.readonly writes are not supported in v1');
        },
      },
      required: {
        enumerable: true,
        get: () => Boolean(input.required),
        set: () => {
          diagnostic('unsupported-api', 'Field.required writes are not supported in v1');
        },
      },
      display: {
        enumerable: true,
        get: () => displayToCode(record.display),
        set: (value: unknown) => {
          record.display = codeToDisplay(value);
        },
      },
      source: { enumerable: false, get: () => doc },
    });
    wrapper.setFocus = () => diagnostic('unsupported-api', 'Field.setFocus is not supported in v1');
    return wrapper;
  };

  const getField = (name: unknown): AnyRecord | null =>
    state?.fieldsByName.get(String(name))?.wrapper ?? null;

  // ── the annots plane (curated; self-contained twins of src/color.ts and
  //    types.ts ANNOT_WRITABLE_KEYS — parity tests pin them) ───────────────
  const ANNOT_WRITABLE: Record<string, string[]> = {
    square: ['strokeColor', 'fillColor', 'opacity', 'width', 'borderStyle', 'dash', 'rect'],
    circle: ['strokeColor', 'fillColor', 'opacity', 'width', 'borderStyle', 'dash', 'rect'],
    polygon: ['strokeColor', 'fillColor', 'opacity', 'width', 'borderStyle', 'dash', 'rect'],
    polyline: ['strokeColor', 'fillColor', 'opacity', 'width', 'borderStyle', 'dash', 'rect'],
    line: ['strokeColor', 'fillColor', 'opacity', 'width', 'borderStyle', 'dash', 'rect'],
    ink: ['strokeColor', 'opacity', 'width', 'rect'],
    'free-text': ['strokeColor', 'fillColor', 'opacity', 'rect'],
    highlight: ['strokeColor', 'opacity'],
    underline: ['strokeColor', 'opacity'],
    squiggly: ['strokeColor', 'opacity'],
    strikeout: ['strokeColor', 'opacity'],
    caret: ['strokeColor', 'opacity'],
    text: ['strokeColor', 'opacity', 'rect'],
    stamp: ['rect'],
    'file-attachment': ['strokeColor', 'opacity'],
  };
  const ANNOT_FLAG_KEYS = ['hidden', 'print', 'readOnly', 'locked', 'noView', 'toggleNoView'];
  const ACROBAT_TYPE: Record<string, string> = {
    square: 'Square',
    circle: 'Circle',
    line: 'Line',
    polygon: 'Polygon',
    polyline: 'PolyLine',
    ink: 'Ink',
    'free-text': 'FreeText',
    highlight: 'Highlight',
    underline: 'Underline',
    squiggly: 'Squiggly',
    strikeout: 'StrikeOut',
    text: 'Text',
    stamp: 'Stamp',
    caret: 'Caret',
    'file-attachment': 'FileAttachment',
  };
  const isColorArray = (value: unknown): boolean => {
    if (!Array.isArray(value) || value.length === 0) return false;
    const counts: Record<string, number> = { T: 0, G: 1, RGB: 3, CMYK: 4 };
    const expected = counts[String(value[0])];
    return (
      expected !== undefined &&
      value.length === expected + 1 &&
      value.slice(1).every((part) => typeof part === 'number' && isFinite(Number(part)))
    );
  };
  const colorToRgbTriple = (value: unknown): number[] | null => {
    const color = value as unknown[];
    const space = String(color[0]);
    if (space === 'T') return null;
    if (space === 'G') return [Number(color[1]), Number(color[1]), Number(color[1])];
    if (space === 'RGB') return [Number(color[1]), Number(color[2]), Number(color[3])];
    const c = Number(color[1]);
    const m = Number(color[2]);
    const y = Number(color[3]);
    const k = Number(color[4]);
    return [1 - Math.min(1, c + k), 1 - Math.min(1, m + k), 1 - Math.min(1, y + k)];
  };
  const sameAnnotValue = (a: unknown, b: unknown): boolean => {
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((item, index) => item === b[index]);
    }
    return a === b;
  };
  const cloneAnnotValue = (value: unknown): unknown => (Array.isArray(value) ? [...value] : value);

  const makeAnnot = (record: AnnotRecord): AnyRecord => {
    const input = record.input;
    const subtype = String(input.subtype);
    const writable = ANNOT_WRITABLE[subtype] ?? [];
    const wrapper: AnyRecord = {};
    const stage = (key: string, value: unknown, validate: (v: unknown) => boolean): void => {
      // Flags and contents are writable on every script-addressable subtype;
      // appearance keys follow the per-subtype matrix.
      if (key !== 'contents' && ANNOT_FLAG_KEYS.indexOf(key) < 0 && writable.indexOf(key) < 0) {
        diagnostic(
          'unsupported-api',
          `Annot.${key} is not writable on subtype '${subtype}' (write ignored)`,
        );
        return;
      }
      if (input.opaqueBody && ANNOT_FLAG_KEYS.indexOf(key) < 0 && key !== 'contents') {
        diagnostic(
          'unsupported-api',
          `Annot.${key}: '${subtype}' has an opaque appearance (write ignored)`,
        );
        return;
      }
      if (!validate(value)) {
        diagnostic('invalid-field-value', `Annot.${key}: invalid value (write ignored)`);
        return;
      }
      record.current[key] = cloneAnnotValue(value);
    };
    const prop = (key: string, validate: (v: unknown) => boolean): PropertyDescriptor => ({
      enumerable: true,
      get: () => cloneAnnotValue(record.current[key]),
      set: (value: unknown) => stage(key, value, validate),
    });
    const isNum = (v: unknown) => typeof v === 'number' && isFinite(v);
    const isBool = (v: unknown) => typeof v === 'boolean';
    Object.defineProperties(wrapper, {
      name: { enumerable: true, get: () => String(input.name ?? '') },
      type: { enumerable: true, get: () => ACROBAT_TYPE[subtype] ?? subtype },
      page: { enumerable: true, get: () => Number(input.page ?? 0) },
      author: { enumerable: true, get: () => String(input.author ?? '') },
      subject: { enumerable: true, get: () => String(input.subject ?? '') },
      strokeColor: prop('strokeColor', isColorArray),
      fillColor: prop('fillColor', isColorArray),
      opacity: prop('opacity', (v) => isNum(v) && Number(v) >= 0 && Number(v) <= 1),
      width: prop('width', (v) => isNum(v) && Number(v) >= 0),
      style: prop('borderStyle', (v) => v === 'S' || v === 'D'),
      dash: prop('dash', (v) => Array.isArray(v) && v.every(isNum)),
      rect: prop('rect', (v) => Array.isArray(v) && v.length === 4 && v.every(isNum)),
      contents: prop('contents', (v) => typeof v === 'string'),
      hidden: prop('hidden', isBool),
      print: prop('print', isBool),
      readOnly: prop('readOnly', isBool),
      lock: prop('locked', isBool),
      noView: prop('noView', isBool),
      toggleNoView: prop('toggleNoView', isBool),
      doc: { enumerable: false, get: () => doc },
    });
    wrapper.getProps = () => {
      const out: AnyRecord = {};
      for (const key of Object.keys(record.current)) out[key] = cloneAnnotValue(record.current[key]);
      return out;
    };
    wrapper.setProps = (props: unknown) => {
      const source = (props ?? {}) as AnyRecord;
      for (const key of Object.keys(source)) {
        const alias = key === 'style' ? 'borderStyle' : key === 'lock' ? 'locked' : key;
        void alias;
        (wrapper as AnyRecord)[key] = source[key];
      }
    };
    return wrapper;
  };

  const getAnnots = (spec?: unknown): AnyRecord[] | null => {
    if (!state) return null;
    const nPage = (spec as AnyRecord | undefined)?.nPage;
    if (nPage === undefined || nPage === null) {
      if (!state.annotsCoverDocument) {
        diagnostic(
          'unsupported-api',
          'getAnnots: whole-document search is limited to the prefetched pages (compatibility deviation)',
        );
      }
      return state.annots.length ? state.annots.map((record) => record.wrapper) : null;
    }
    const page = Math.trunc(Number(nPage));
    if (!state.annotPages.has(page)) {
      diagnostic(
        'unsupported-api',
        `getAnnots: page ${page} is outside the prefetched annots plane (compatibility deviation)`,
      );
      return null;
    }
    const records = state.annotsByPage.get(page) ?? [];
    return records.length ? records.map((record) => record.wrapper) : null;
  };
  const getAnnot = (nPage: unknown, name: unknown): AnyRecord | null => {
    const records = getAnnots({ nPage });
    if (!records) return null;
    for (const wrapper of records) {
      if (String((wrapper as AnyRecord).name) === String(name)) return wrapper;
    }
    return null;
  };
  doc.getAnnots = getAnnots;
  doc.getAnnot = getAnnot;

  Object.defineProperties(doc, {
    documentFileName: {
      enumerable: true,
      get: () => String((state?.input.document as AnyRecord | undefined)?.fileName ?? ''),
    },
    numFields: { enumerable: true, get: () => state?.fields.length ?? 0 },
    pageNum: {
      enumerable: true,
      get: () => Number((state?.input.document as AnyRecord | undefined)?.pageNumber ?? 0),
      set: (value: unknown) => {
        const page = Math.trunc(Number(value));
        if (Number.isFinite(page)) state?.uiEffects.push({ kind: 'gotoPage', page });
      },
    },
  });
  doc.getField = getField;
  doc.getNthFieldName = (index: unknown) =>
    String(state?.fields[Math.trunc(Number(index))]?.input.name ?? '');
  doc.resetForm = (names?: unknown) => {
    if (!state) return;
    const requested =
      names === undefined
        ? state.fields
        : (Array.isArray(names) ? names : [names])
            .map((name) => state!.fieldsByName.get(String(name)))
            .filter((field): field is FieldRecord => field !== undefined);
    for (const field of requested) {
      field.value = cloneValue(field.input.defaultValue);
      const key = refKey(field.input.ref);
      if (!state.resetKeys.has(key)) {
        state.resetKeys.add(key);
        state.resetRefs.push(field.input.ref as AnyRecord);
      }
    }
  };
  doc.print = () => state?.uiEffects.push({ kind: 'print' });
  doc.submitForm = () => blocked('submitForm');
  doc.mailDoc = () => blocked('mailDoc');
  doc.getURL = () => blocked('getURL');

  const app = {
    // Viewer identity — the properties Adobe's ubiquitous version-check
    // boilerplate (`!ADBE::…VersChk…` name-tree scripts) branches on. Honest
    // values for an emulated modern-Reader-level environment, so those
    // scripts take their "viewer is current" paths instead of tripping over
    // `undefined`. Deliberately NO `xfa_installed`: we never claim XFA.
    platform: 'WIN',
    language: 'ENU',
    viewerType: 'Reader',
    viewerVariation: 'Reader',
    viewerVersion: 21,
    formsVersion: 21,
    alert: (message: unknown, icon?: unknown, _type?: unknown, title?: unknown): number => {
      state?.uiEffects.push({
        kind: 'alert',
        message: String(message),
        icon: Number.isFinite(Number(icon)) ? Number(icon) : 0,
        ...(title === undefined ? {} : { title: String(title) }),
      });
      return 1;
    },
    beep: () => diagnostic('unsupported-api', 'app.beep is not supported in v1'),
    response: () => {
      diagnostic('unsupported-api', 'app.response is not supported in v1');
      return null;
    },
    launchURL: () => blocked('app.launchURL'),
    // Acrobat's contract when a viewer component (e.g. the XFA plugin) is not
    // available is `undefined` — NEVER a throw. A web viewer has no
    // installable components, so "not available" is always the truthful
    // answer; Adobe's XFA-check boilerplate calls this after its upgrade nag.
    findComponent: (): undefined => {
      diagnostic('unsupported-api', 'app.findComponent: no installable components in this viewer');
      return undefined;
    },
  };

  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  const monthShort = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const monthLong = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const printd = (format: unknown, inputDate: unknown): string => {
    const environment = (state?.input.environment ?? {}) as AnyRecord;
    const date =
      inputDate && typeof (inputDate as AnyRecord).getTime === 'function'
        ? new NativeDate(Number((inputDate as { getTime(): number }).getTime()))
        : new NativeDate(Number(environment.nowMs ?? 0));
    const local = new NativeDate(
      date.getTime() + Number(environment.utcOffsetMinutes ?? 0) * 60000,
    );
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    const day = local.getUTCDate();
    const hour = local.getUTCHours();
    const minute = local.getUTCMinutes();
    const second = local.getUTCSeconds();
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    const tokens: Record<string, string> = {
      yyyy: String(year),
      yy: pad(year % 100),
      mmmm: monthLong[month],
      mmm: monthShort[month],
      mm: pad(month + 1),
      m: String(month + 1),
      dd: pad(day),
      d: String(day),
      HH: pad(hour),
      hh: pad(hour12),
      h: String(hour12),
      H: String(hour),
      MM: pad(minute),
      M: String(minute),
      ss: pad(second),
      tt: hour < 12 ? 'am' : 'pm',
    };
    // Single pass, longest tokens first; replacements are never re-scanned, so
    // an emitted 'am'/'pm' cannot collide with the month token.
    return String(format).replace(
      /yyyy|mmmm|mmm|yy|mm|dd|HH|hh|MM|ss|tt|m|d|H|h|M/g,
      (token) => tokens[token],
    );
  };
  const util = {
    printd,
    printf: (format: unknown, ...values: unknown[]): string => {
      let index = 0;
      return String(format).replace(/%(?:,?\d*(?:\.\d+)?)?[dfs]/g, (token) => {
        const value = values[index++];
        if (token.endsWith('s')) return String(value ?? '');
        if (token.endsWith('d')) return String(Math.trunc(numberValue(value)));
        const precision = /\.(\d+)/.exec(token)?.[1];
        return numberValue(value).toFixed(precision ? Number(precision) : 0);
      });
    },
  };

  const begin = (input: AnyRecord, budget?: AnyRecord): void => {
    const fields: FieldRecord[] = ((input.fields as AnyRecord[] | undefined) ?? []).map((field) => {
      const record: FieldRecord = {
        input: field,
        originalValue: cloneValue(field.value),
        value: cloneValue(field.value),
        originalDisplay: String(field.display ?? 'visible'),
        display: String(field.display ?? 'visible'),
        wrapper: {},
      };
      record.wrapper = makeField(record);
      return record;
    });
    const fieldsByName = new Map(fields.map((field) => [String(field.input.name), field]));
    const fieldsByRef = new Map(fields.map((field) => [refKey(field.input.ref), field]));
    const annots: AnnotRecord[] = ((input.annots as AnyRecord[] | undefined) ?? []).map(
      (annot) => {
        const writableSnapshot = (): AnyRecord => ({
          strokeColor: cloneAnnotValue(annot.strokeColor ?? ['T']),
          fillColor: cloneAnnotValue(annot.fillColor ?? ['T']),
          opacity: Number(annot.opacity ?? 1),
          width: Number(annot.width ?? 1),
          borderStyle: String(annot.borderStyle ?? 'S'),
          dash: cloneAnnotValue(annot.dash ?? []),
          rect: cloneAnnotValue(annot.rect ?? [0, 0, 0, 0]),
          contents: String(annot.contents ?? ''),
          hidden: Boolean(annot.hidden),
          print: Boolean(annot.print),
          readOnly: Boolean(annot.readOnly),
          locked: Boolean(annot.locked),
          noView: Boolean(annot.noView),
          toggleNoView: Boolean(annot.toggleNoView),
        });
        const record: AnnotRecord = {
          input: annot,
          original: writableSnapshot(),
          current: writableSnapshot(),
          wrapper: {},
        };
        record.wrapper = makeAnnot(record);
        return record;
      },
    );
    const annotsByPage = new Map<number, AnnotRecord[]>();
    for (const record of annots) {
      const page = Number(record.input.page ?? 0);
      const bucket = annotsByPage.get(page);
      if (bucket) bucket.push(record);
      else annotsByPage.set(page, [record]);
    }
    const eventInput = (input.event ?? {}) as AnyRecord;
    const target = fieldsByRef.get(refKey(eventInput.target));
    const source = fieldsByRef.get(refKey(eventInput.source));
    const initialValue =
      eventInput.value !== undefined
        ? cloneValue(eventInput.value)
        : cloneValue(target?.value ?? null);
    const event: AnyRecord = {
      // Explicit type/name (action-driven runs, from trigger provenance)
      // beat the kind-derived defaults (the K/V/C/F pipeline path).
      name: eventInput.name !== undefined
        ? String(eventInput.name)
        : eventName(String(eventInput.kind ?? '')),
      type: eventInput.type !== undefined
        ? String(eventInput.type)
        : eventInput.kind === 'name-tree-boot'
          ? 'Doc'
          : 'Field',
      target: target?.wrapper ?? null,
      targetName: String(target?.input.name ?? ''),
      source: source?.wrapper ?? { source: doc },
      value: initialValue,
      change: String(eventInput.change ?? ''),
      selStart: Math.max(0, Math.trunc(Number(eventInput.selStart ?? 0))),
      selEnd: Math.max(0, Math.trunc(Number(eventInput.selEnd ?? 0))),
      willCommit: Boolean(eventInput.willCommit),
      modifier: Boolean(eventInput.modifier),
      shift: Boolean(eventInput.shift),
      rc: true,
    };
    state = {
      input,
      fields,
      fieldsByName,
      fieldsByRef,
      annots,
      annotsByPage,
      annotPages: new Set(
        ((input.annotPages as unknown[] | undefined) ?? []).map((page) => Math.trunc(Number(page))),
      ),
      annotsCoverDocument: Boolean(input.annotsCoverDocument),
      event,
      resetRefs: [],
      resetKeys: new Set(),
      uiEffects: [],
      diagnostics: [],
      randomState: Number((input.environment as AnyRecord | undefined)?.randomSeed ?? 1) >>> 0,
      maxEffects: Math.max(1, Math.trunc(Number(budget?.maxEffects ?? 256))),
    };
    host.event = event;
    host.identity = { ...((input.identity as AnyRecord | undefined) ?? {}) };
  };

  const formValue = (field: FieldRecord, value: unknown): AnyRecord | null => {
    const family = String(field.input.family);
    if (family === 'text') return { type: 'text', value: String(value ?? '') };
    if (family === 'checkbox' || family === 'radio') {
      const token =
        value === null || value === undefined || String(value) === 'Off' ? null : String(value);
      return { type: 'toggle', state: token };
    }
    if (family === 'combobox') {
      const selected = Array.isArray(value) ? value.slice(0, 1).map(String) : [String(value ?? '')];
      return { type: 'choice', values: selected };
    }
    if (family === 'listbox') {
      return {
        type: 'choice',
        values: Array.isArray(value) ? value.map(String) : [String(value ?? '')],
      };
    }
    diagnostic(
      'invalid-field-value',
      `field '${String(field.input.name)}' cannot accept a scripted value`,
    );
    return null;
  };

  const eventOutput = (): AnyRecord => ({
    rc: Boolean(state?.event.rc),
    value: cloneValue(state?.event.value ?? null),
    change: String(state?.event.change ?? ''),
    selStart: Math.max(0, Math.trunc(Number(state?.event.selStart ?? 0))),
    selEnd: Math.max(0, Math.trunc(Number(state?.event.selEnd ?? 0))),
  });

  const finish = (): AnyRecord => {
    if (!state) throw new Error('AcroJS run state was not initialized');
    const eventInput = state.input.event as AnyRecord;
    const target = state.fieldsByRef.get(refKey(eventInput.target));
    const kind = String(eventInput.kind ?? '');
    if (target && kind === 'field-calculate') target.value = cloneValue(state.event.value);

    const formEffects: AnyRecord[] = [];
    if (state.resetRefs.length > 0) formEffects.push({ kind: 'reset', refs: [...state.resetRefs] });
    for (const field of state.fields) {
      const key = refKey(field.input.ref);
      // A reset effect is replayed before the value effects below, so reset
      // fields start from their default rather than the transaction input.
      // This preserves reset -> rewrite-to-original sequences.
      const valueBaseline = state.resetKeys.has(key)
        ? field.input.defaultValue
        : field.originalValue;
      if (!sameValue(field.value, valueBaseline)) {
        const value = formValue(field, field.value);
        if (value) formEffects.push({ kind: 'setValue', ref: field.input.ref, value });
      }
      if (field.display !== field.originalDisplay) {
        formEffects.push({ kind: 'setDisplay', ref: field.input.ref, display: field.display });
      }
    }
    if (target && kind === 'field-format') {
      formEffects.push({
        kind: 'setAppearanceText',
        ref: target.input.ref,
        text: String(state.event.value ?? ''),
      });
    }
    // Annot effects: the canonical per-annot diff, exactly the fields model —
    // last write wins per key, ordered by the input plane's annot order.
    const annotEffects: AnyRecord[] = [];
    for (const record of state.annots) {
      const patch: AnyRecord = {};
      const flags: AnyRecord = {};
      for (const key of Object.keys(record.current)) {
        if (sameAnnotValue(record.current[key], record.original[key])) continue;
        if (ANNOT_FLAG_KEYS.indexOf(key) >= 0) flags[key] = record.current[key];
        else patch[key] = cloneAnnotValue(record.current[key]);
      }
      if (Object.keys(flags).length > 0) patch.flags = flags;
      if (Object.keys(patch).length > 0) annotEffects.push({ ref: record.input.ref, patch });
    }

    const totalEffects = formEffects.length + annotEffects.length + state.uiEffects.length;
    if (totalEffects > state.maxEffects) {
      return {
        event: eventOutput(),
        formEffects: [],
        annotEffects: [],
        uiEffects: [],
        diagnostics: [...state.diagnostics],
        error: {
          kind: 'budget',
          message: `script produced ${totalEffects} effects; limit is ${state.maxEffects}`,
        },
      };
    }
    return {
      event: eventOutput(),
      formEffects,
      annotEffects,
      uiEffects: [...state.uiEffects],
      diagnostics: [...state.diagnostics],
    };
  };

  const failed = (error: unknown): AnyRecord => ({
    event: eventOutput(),
    formEffects: [],
    annotEffects: [],
    uiEffects: [],
    diagnostics: [...(state?.diagnostics ?? [])],
    error: {
      kind: 'exception',
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
    },
  });

  const evaluate = (source: string): unknown => {
    // Indirect eval is deliberate: name-tree declarations must persist in the
    // isolated realm's global scope for later field events.
    return (0, eval)(source);
  };

  const boot = (sources: unknown, input: unknown, budget?: unknown): AnyRecord => {
    begin(input as AnyRecord, budget as AnyRecord | undefined);
    try {
      for (const source of (sources as unknown[]) ?? []) evaluate(String(source));
      return finish();
    } catch (error) {
      return failed(error);
    }
  };
  const run = (source: unknown, input: unknown, budget?: unknown): AnyRecord => {
    begin(input as AnyRecord, budget as AnyRecord | undefined);
    try {
      evaluate(String(source));
      return finish();
    } catch (error) {
      return failed(error);
    }
  };

  // PDF scripts share this realm, but they must not replace the host-owned
  // transaction boundary for later events in the same document.
  Object.defineProperties(host, {
    __acrojsBoot: { configurable: false, writable: false, value: boot },
    __acrojsRun: { configurable: false, writable: false, value: run },
  });

  host.app = app;
  host.util = util;
  host.display = Object.freeze({ visible: 0, hidden: 1, noPrint: 2, noView: 3 });
  // The standard Acrobat color object: constants + convert/equal with the
  // documented G/RGB/CMYK vectors (self-contained twin of src/color.ts).
  host.color = Object.freeze({
    transparent: Object.freeze(['T']),
    black: Object.freeze(['G', 0]),
    white: Object.freeze(['G', 1]),
    gray: Object.freeze(['G', 0.5]),
    ltGray: Object.freeze(['G', 0.75]),
    dkGray: Object.freeze(['G', 0.25]),
    red: Object.freeze(['RGB', 1, 0, 0]),
    green: Object.freeze(['RGB', 0, 1, 0]),
    blue: Object.freeze(['RGB', 0, 0, 1]),
    cyan: Object.freeze(['CMYK', 1, 0, 0, 0]),
    magenta: Object.freeze(['CMYK', 0, 1, 0, 0]),
    yellow: Object.freeze(['CMYK', 0, 0, 1, 0]),
    convert: (value: unknown, space: unknown): unknown[] => {
      if (!isColorArray(value)) return ['T'];
      const target = String(space);
      const rgb = colorToRgbTriple(value);
      if (target === 'T' || rgb === null) return ['T'];
      if (target === 'G') return ['G', 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]];
      if (target === 'RGB') return ['RGB', rgb[0], rgb[1], rgb[2]];
      if (target === 'CMYK') {
        const k = 1 - Math.max(rgb[0], rgb[1], rgb[2]);
        return ['CMYK', 1 - rgb[0] - k, 1 - rgb[1] - k, 1 - rgb[2] - k, k];
      }
      return ['T'];
    },
    equal: (a: unknown, b: unknown): boolean => {
      if (!isColorArray(a) || !isColorArray(b)) return false;
      const left = colorToRgbTriple(a);
      const right = colorToRgbTriple(b);
      if (left === null || right === null) return left === right;
      return left.every((component, index) => Math.abs(component - right[index]) < 1e-6);
    },
  });
  host.getField = getField;
  host.getAnnots = getAnnots;
  host.getAnnot = getAnnot;
  host.resetForm = doc.resetForm;
  host.print = doc.print;
  host.submitForm = doc.submitForm;
  host.mailDoc = doc.mailDoc;
  host.getURL = doc.getURL;
  Object.defineProperties(host, {
    documentFileName: { configurable: true, get: () => doc.documentFileName },
    numFields: { configurable: true, get: () => doc.numFields },
    pageNum: {
      configurable: true,
      get: () => doc.pageNum,
      set: (value: unknown) => {
        doc.pageNum = value;
      },
    },
  });

  class FixedDate extends NativeDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(Number(((state?.input.environment ?? {}) as AnyRecord).nowMs ?? 0));
      } else if (args.length === 1) {
        super(args[0] as string | number);
      } else {
        super(
          Number(args[0]),
          Number(args[1]),
          Number(args[2] ?? 1),
          Number(args[3] ?? 0),
          Number(args[4] ?? 0),
          Number(args[5] ?? 0),
          Number(args[6] ?? 0),
        );
      }
    }
    static override now(): number {
      return Number(((state?.input.environment ?? {}) as AnyRecord).nowMs ?? 0);
    }
  }
  host.Date = FixedDate;

  const math = host.Math as Math | undefined;
  if (math) {
    math.random = () => {
      if (!state) return 0;
      state.randomState = (1664525 * state.randomState + 1013904223) >>> 0;
      return state.randomState / 0x100000000;
    };
  }

  host.AFSimple_Calculate = (operation: unknown, names: unknown): void => {
    const requested = Array.isArray(names) ? names : String(names).split(',');
    const values = requested.map((name) => numberValue(getField(String(name).trim())?.value));
    const op = String(operation).toUpperCase();
    const value =
      values.length === 0
        ? 0
        : op === 'PRD'
          ? values.reduce((a, b) => a * b, 1)
          : op === 'AVG'
            ? values.reduce((a, b) => a + b, 0) / values.length
            : op === 'MIN'
              ? Math.min(...values)
              : op === 'MAX'
                ? Math.max(...values)
                : values.reduce((a, b) => a + b, 0);
    if (state) state.event.value = value;
  };
  host.AFNumber_Format = (
    decimals: unknown,
    separatorStyle: unknown,
    _negativeStyle: unknown,
    _currencyStyle: unknown,
    currency: unknown,
    prepend: unknown,
  ): void => {
    if (!state) return;
    const places = Math.max(0, Math.min(10, Math.trunc(Number(decimals))));
    let formatted = numberValue(state.event.value).toFixed(places);
    if (Number(separatorStyle) === 0 || Number(separatorStyle) === 2) {
      const [whole, fraction] = formatted.split('.');
      formatted = `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction === undefined ? '' : `.${fraction}`}`;
    }
    const symbol = String(currency ?? '');
    state.event.value = prepend ? `${symbol}${formatted}` : `${formatted}${symbol}`;
  };
  host.AFPercent_Format = (decimals: unknown): void => {
    if (!state) return;
    const places = Math.max(0, Math.min(10, Math.trunc(Number(decimals))));
    state.event.value = `${(numberValue(state.event.value) * 100).toFixed(places)}%`;
  };
  // ── Acrobat AF support library ─────────────────────────────────────────
  // Deterministic subset of Acrobat's AFxxx forms helpers. Everything reads
  // only the injected environment; keystroke helpers validate the committed
  // value (this pipeline runs K once, on commit, as a full replacement).

  const DATE_FORMATS = [
    'm/d',
    'm/d/yy',
    'mm/dd/yy',
    'mm/yy',
    'd-mmm',
    'd-mmm-yy',
    'dd-mmm-yy',
    'yy-mm-dd',
    'mmm-yy',
    'mmmm-yy',
    'mmm d, yyyy',
    'mmmm d, yyyy',
    'm/d/yy h:MM tt',
    'm/d/yy HH:MM',
  ];
  const TIME_FORMATS = ['HH:MM', 'h:MM tt', 'HH:MM:ss', 'h:MM:ss tt'];

  const rejectWithAlert = (message: string): void => {
    if (!state) return;
    state.uiEffects.push({ kind: 'alert', message, icon: 0 });
    state.event.rc = false;
  };
  const formatMismatch = (): void =>
    rejectWithAlert(
      `The value entered does not match the format of the field [ ${String(
        state?.event.targetName ?? '',
      )} ]`,
    );
  const dateMismatch = (format: unknown): void =>
    rejectWithAlert(
      `Invalid date/time: please ensure that the date/time exists. Field [ ${String(
        state?.event.targetName ?? '',
      )} ] should match format ${String(format ?? '')}`,
    );

  const mergeChange = (eventObject?: unknown): string => {
    const e = (eventObject ?? state?.event ?? {}) as AnyRecord;
    const value = String(e.value ?? '');
    if (e.willCommit) return value;
    const start = Math.max(0, Math.trunc(Number(e.selStart ?? 0)));
    const end = Math.max(start, Math.trunc(Number(e.selEnd ?? 0)));
    return value.slice(0, start) + String(e.change ?? '') + value.slice(end);
  };
  host.AFMergeChange = mergeChange;

  const makeNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    let text = String(value ?? '').trim();
    if (text === '') return null;
    text = text.replace(/[^0-9,.\-+eE]/g, '');
    if (text.includes(',') && text.includes('.')) {
      // The last separator is the decimal: "1,234.56" vs "1.234,56".
      text =
        text.lastIndexOf(',') > text.lastIndexOf('.')
          ? text.replace(/\./g, '').replace(',', '.')
          : text.replace(/,/g, '');
    } else if (text.includes(',')) {
      // A single comma reads as the decimal separator; several are thousands.
      text = (text.match(/,/g) ?? []).length === 1 ? text.replace(',', '.') : text.replace(/,/g, '');
    }
    const parsed = Number(text);
    return text !== '' && Number.isFinite(parsed) ? parsed : null;
  };
  host.AFMakeNumber = makeNumber;

  host.AFExtractNums = (value: unknown): string[] | null => {
    const matches = String(value ?? '').match(/\d+/g);
    return matches && matches.length > 0 ? [...matches] : null;
  };

  const validNumberText = (text: string, separatorStyle: number): boolean => {
    const trimmed = text.trim();
    if (trimmed === '') return true;
    const decimalComma = separatorStyle === 2 || separatorStyle === 3;
    const pattern = decimalComma
      ? /^[+-]?(\d+|\d{1,3}(\.\d{3})+)?(,\d*)?$/
      : /^[+-]?(\d+|\d{1,3}(,\d{3})+)?(\.\d*)?$/;
    return pattern.test(trimmed) && /\d/.test(trimmed);
  };
  host.AFNumber_Keystroke = (
    _decimals: unknown,
    separatorStyle: unknown,
    _negativeStyle: unknown,
    _currencyStyle: unknown,
    currency: unknown,
  ): void => {
    if (!state || !state.event.willCommit) return;
    const proposed = mergeChange(state.event);
    const cleaned = currency ? proposed.split(String(currency)).join('') : proposed;
    if (!validNumberText(cleaned, Math.trunc(Number(separatorStyle)))) formatMismatch();
  };
  host.AFPercent_Keystroke = (_decimals: unknown, separatorStyle: unknown): void => {
    if (!state || !state.event.willCommit) return;
    const cleaned = mergeChange(state.event).replace(/%\s*$/, '');
    if (!validNumberText(cleaned, Math.trunc(Number(separatorStyle)))) formatMismatch();
  };

  const digitsOf = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
  const afSpecialFormat = (psf: unknown): void => {
    if (!state) return;
    const digits = digitsOf(state.event.value);
    const kind = Math.trunc(Number(psf));
    let formatted = String(state.event.value ?? '');
    if (kind === 0) formatted = digits.slice(0, 5);
    else if (kind === 1) formatted = `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
    else if (kind === 2)
      formatted =
        digits.length >= 10
          ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
          : `${digits.slice(0, 3)}-${digits.slice(3, 7)}`;
    else if (kind === 3) formatted = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
    state.event.value = formatted;
  };
  host.AFSpecial_Format = afSpecialFormat;
  host.AFSpecial_Keystroke = (psf: unknown): void => {
    if (!state || !state.event.willCommit) return;
    const merged = mergeChange(state.event);
    if (merged.trim() === '') return;
    const digits = digitsOf(merged).length;
    const kind = Math.trunc(Number(psf));
    const valid =
      kind === 0
        ? digits === 5
        : kind === 1
          ? digits === 9
          : kind === 2
            ? digits === 7 || digits === 10
            : digits === 9;
    if (!valid) formatMismatch();
  };

  host.AFRange_Validate = (
    useGreater: unknown,
    greaterThan: unknown,
    useLess: unknown,
    lessThan: unknown,
  ): void => {
    if (!state) return;
    const value = makeNumber(state.event.value);
    if (value === null) return;
    const hasGreater = Boolean(useGreater);
    const hasLess = Boolean(useLess);
    const low = Number(greaterThan);
    const high = Number(lessThan);
    if ((!hasGreater || value >= low) && (!hasLess || value <= high)) return;
    rejectWithAlert(
      hasGreater && hasLess
        ? `Invalid value: must be greater than or equal to ${low} and less than or equal to ${high}.`
        : hasGreater
          ? `Invalid value: must be greater than or equal to ${low}.`
          : `Invalid value: must be less than or equal to ${high}.`,
    );
  };

  interface WallTime {
    y: number;
    m: number;
    d: number;
    H: number;
    M: number;
    S: number;
  }
  const nowWall = (): WallTime => {
    const env = (state?.input.environment ?? {}) as AnyRecord;
    const local = new NativeDate(
      Number(env.nowMs ?? 0) + Number(env.utcOffsetMinutes ?? 0) * 60000,
    );
    return {
      y: local.getUTCFullYear(),
      m: local.getUTCMonth() + 1,
      d: local.getUTCDate(),
      H: 0,
      M: 0,
      S: 0,
    };
  };
  /** printd adds the environment offset itself, so a wall time converts back. */
  const wallDate = (parts: WallTime): Date => {
    const env = (state?.input.environment ?? {}) as AnyRecord;
    return new NativeDate(
      NativeDate.UTC(parts.y, parts.m - 1, parts.d, parts.H, parts.M, parts.S) -
        Number(env.utcOffsetMinutes ?? 0) * 60000,
    );
  };

  /** Lenient scand-style parse: numbers mapped by the format's token order,
   *  month names accepted, missing parts defaulted like Acrobat's scand. */
  const parseDateLoose = (raw: unknown, format: unknown): WallTime | null => {
    const text = String(raw ?? '').trim();
    if (text === '') return null;
    const lower = text.toLowerCase();
    let namedMonth: number | null = null;
    for (let index = 0; index < 12; index += 1) {
      if (lower.indexOf(monthShort[index].toLowerCase()) >= 0) {
        namedMonth = index + 1;
        break;
      }
    }
    const timeMatch = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
    let H = 0;
    let M = 0;
    let S = 0;
    if (timeMatch) {
      H = Number(timeMatch[1]);
      M = Number(timeMatch[2]);
      S = Number(timeMatch[3] ?? 0);
      const marker = String(timeMatch[4] ?? '').toLowerCase();
      if (marker === 'pm' && H < 12) H += 12;
      if (marker === 'am' && H === 12) H = 0;
      if (H > 23 || M > 59 || S > 59) return null;
    }
    const dateText = timeMatch
      ? text.slice(0, timeMatch.index) + text.slice(timeMatch.index + timeMatch[0].length)
      : text;
    const numbers = (dateText.match(/\d+/g) ?? []).map((token) => Number(token));
    const order: Array<'y' | 'm' | 'd'> = [];
    for (const token of String(format ?? '').match(/yyyy|mmmm|mmm|yy|mm|dd|m|d/g) ?? []) {
      const kind = (token[0] === 'y' ? 'y' : token[0] === 'm' ? 'm' : 'd') as 'y' | 'm' | 'd';
      if (order.indexOf(kind) < 0) order.push(kind);
    }
    let y: number | null = null;
    let m: number | null = namedMonth;
    let d: number | null = null;
    let cursor = 0;
    for (const kind of order) {
      if (kind === 'm' && namedMonth !== null) continue;
      if (cursor >= numbers.length) break;
      const value = numbers[cursor];
      cursor += 1;
      if (kind === 'y') y = value;
      else if (kind === 'm') m = value;
      else d = value;
    }
    if (y === null && m === null && d === null && !timeMatch) return null;
    const today = nowWall();
    if (y === null) y = today.y;
    else if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
    if (m === null) m = today.m;
    if (d === null) d = 1;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const probe = new NativeDate(NativeDate.UTC(y, m - 1, d));
    if (
      probe.getUTCFullYear() !== y ||
      probe.getUTCMonth() !== m - 1 ||
      probe.getUTCDate() !== d
    ) {
      return null;
    }
    return { y, m, d, H, M, S };
  };

  const afDateFormatEx = (format: unknown): void => {
    if (!state) return;
    const raw = String(state.event.value ?? '');
    if (raw.trim() === '') return;
    let date: Date = new FixedDate(raw);
    if (Number.isNaN(date.getTime())) {
      const parts = parseDateLoose(raw, format);
      if (!parts) return; // unparsable: leave the value untouched
      date = wallDate(parts);
    }
    state.event.value = printd(format, date);
  };
  host.AFDate_FormatEx = afDateFormatEx;
  host.AFDate_Format = (index: unknown): void =>
    afDateFormatEx(DATE_FORMATS[Math.trunc(Number(index))] ?? 'm/d/yy');

  const afDateKeystrokeEx = (format: unknown): void => {
    if (!state || !state.event.willCommit) return;
    const merged = mergeChange(state.event);
    if (merged.trim() === '') return;
    if (!parseDateLoose(merged, format)) dateMismatch(format);
  };
  host.AFDate_KeystrokeEx = afDateKeystrokeEx;
  host.AFDate_Keystroke = (index: unknown): void =>
    afDateKeystrokeEx(DATE_FORMATS[Math.trunc(Number(index))] ?? 'm/d/yy');

  const afTimeFormatEx = (format: unknown): void => {
    if (!state) return;
    const raw = String(state.event.value ?? '');
    if (raw.trim() === '') return;
    const parts = parseDateLoose(raw, format);
    if (!parts) return;
    state.event.value = printd(format, wallDate(parts));
  };
  host.AFTime_FormatEx = afTimeFormatEx;
  host.AFTime_Format = (index: unknown): void =>
    afTimeFormatEx(TIME_FORMATS[Math.trunc(Number(index))] ?? 'HH:MM');
  host.AFTime_Keystroke = (index: unknown): void => {
    if (!state || !state.event.willCommit) return;
    const merged = mergeChange(state.event);
    if (merged.trim() === '') return;
    if (!parseDateLoose(merged, TIME_FORMATS[Math.trunc(Number(index))] ?? 'HH:MM')) {
      dateMismatch(TIME_FORMATS[Math.trunc(Number(index))] ?? 'HH:MM');
    }
  };

  // QuickJS does not provide browser networking, but explicitly shadow these
  // names so a future adapter cannot accidentally inject ambient authority.
  host.fetch = undefined;
  host.XMLHttpRequest = undefined;
  host.WebSocket = undefined;
}

/** The exact self-contained source evaluated in Node parity tests and QuickJS. */
export const PRELUDE_SOURCE = `(${installAcroJs.toString()})(globalThis);`;
