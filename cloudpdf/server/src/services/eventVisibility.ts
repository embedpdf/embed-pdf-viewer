/**
 * What one event-stream connection may see of an audit row.
 *
 * The stream belongs to one connection and is never cached, so it is
 * filtered row by row, with the rules the reads use: annotations take
 * `doc.annotate.read`, and widgets and form fields take `doc.forms.read`.
 * A row left with nothing the connection may read still goes out, marked
 * `withheld`, with only its pins (`meta.cacheDelta`): the client keeps its
 * cached manifest current, and the pins are in the shared manifest anyway.
 */

/** What a connection may read. */
export interface EventReadRights {
  /** `doc.annotate.read`: annotations other than widgets. */
  readonly annotations: boolean;
  /** `doc.forms.read`: form fields and their widgets. */
  readonly forms: boolean;
}

/** An audit row as the stream sends it (`toJsonlEvent`). */
export type StreamRow = Record<string, unknown> & { kind: string; payload: unknown };

type Payload = Record<string, unknown>;

/** The row as this connection may see it. */
export function visibleRow(row: StreamRow, may: EventReadRights): StreamRow {
  if (may.annotations && may.forms) return row;
  const payload = (row.payload ?? {}) as Payload;
  const visible = visiblePayload(row.kind, payload, may);
  if (visible === payload) return row;
  if (visible) return { ...row, payload: visible };
  const meta = payload.meta as { cacheDelta?: unknown } | undefined;
  return {
    ...row,
    withheld: true,
    payload: { meta: { cacheDelta: meta?.cacheDelta ?? null } },
  };
}

/** The payload as the connection may see it: itself, a part of it, or null. */
function visiblePayload(kind: string, payload: Payload, may: EventReadRights): Payload | null {
  if (kind === 'change') {
    const items = (payload.items ?? []) as Payload[];
    const shown = items.flatMap((item) => {
      const visible = visibleItem(String(item.type), item, may);
      return visible ? [visible] : [];
    });
    if (shown.length === items.length && shown.every((item, i) => item === items[i])) {
      return payload;
    }
    return shown.length > 0 ? { ...payload, items: shown } : null;
  }
  if (kind.startsWith('form.')) return may.forms ? payload : null;
  switch (kind) {
    case 'annot.create':
    case 'annot.update':
      return mayRead(payload.annotation, may) ? payload : null;
    case 'annot.reorder':
    case 'annot.delete':
    case 'annot.import':
      return may.annotations ? payload : null;
    default:
      return payload;
  }
}

/** A change's item as the connection may see it, or null. */
function visibleItem(type: string, item: Payload, may: EventReadRights): Payload | null {
  if (type.startsWith('forms.')) return may.forms ? item : null;
  switch (type) {
    case 'annotations.create':
    case 'annotations.update':
      return mayRead(item.annotation, may) ? item : null;
    case 'annotations.restore':
      return withVisibleAnnotations(item, may);
    case 'annotations.reorder':
    case 'annotations.delete':
      return may.annotations ? item : null;
    default:
      return item;
  }
}

/** `holder` with only the annotations the connection may read, or null for none. */
function withVisibleAnnotations(holder: Payload, may: EventReadRights): Payload | null {
  const annotations = (holder.annotations ?? []) as unknown[];
  const shown = annotations.filter((annotation) => mayRead(annotation, may));
  if (shown.length === annotations.length) return holder;
  return shown.length > 0 ? { ...holder, annotations: shown } : null;
}

/** Whether the connection may read `annotation`: a widget is the form's. */
function mayRead(annotation: unknown, may: EventReadRights): boolean {
  const subtype = (annotation as { subtype?: unknown } | undefined)?.subtype;
  return subtype === 'widget' ? may.forms : may.annotations;
}
