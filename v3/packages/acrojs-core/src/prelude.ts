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
  type RunState = {
    input: AnyRecord;
    fields: FieldRecord[];
    fieldsByName: Map<string, FieldRecord>;
    fieldsByRef: Map<string, FieldRecord>;
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
      H: String(hour),
      MM: pad(minute),
      M: String(minute),
      ss: pad(second),
    };
    return String(format).replace(
      /yyyy|mmmm|mmm|yy|mm|dd|HH|MM|ss|m|d|H|M/g,
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
    const eventInput = (input.event ?? {}) as AnyRecord;
    const target = fieldsByRef.get(refKey(eventInput.target));
    const source = fieldsByRef.get(refKey(eventInput.source));
    const initialValue =
      eventInput.value !== undefined
        ? cloneValue(eventInput.value)
        : cloneValue(target?.value ?? null);
    const event: AnyRecord = {
      name: eventName(String(eventInput.kind ?? '')),
      type: eventInput.kind === 'name-tree-boot' ? 'Doc' : 'Field',
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
    const totalEffects = formEffects.length + state.uiEffects.length;
    if (totalEffects > state.maxEffects) {
      return {
        event: eventOutput(),
        formEffects: [],
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
      uiEffects: [...state.uiEffects],
      diagnostics: [...state.diagnostics],
    };
  };

  const failed = (error: unknown): AnyRecord => ({
    event: eventOutput(),
    formEffects: [],
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
  host.getField = getField;
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
    static now(): number {
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
  host.AFDate_FormatEx = (format: unknown): void => {
    if (state) state.event.value = printd(format, new FixedDate(String(state.event.value ?? '')));
  };

  // QuickJS does not provide browser networking, but explicitly shadow these
  // names so a future adapter cannot accidentally inject ambient authority.
  host.fetch = undefined;
  host.XMLHttpRequest = undefined;
  host.WebSocket = undefined;
}

/** The exact self-contained source evaluated in Node parity tests and QuickJS. */
export const PRELUDE_SOURCE = `(${installAcroJs.toString()})(globalThis);`;
