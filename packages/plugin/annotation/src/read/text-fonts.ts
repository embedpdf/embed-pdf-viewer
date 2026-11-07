/**
 * The fonts a free text box's text is drawn in by the browser, so it shows the
 * program the engine writes with. A box someone types in is resolved the way
 * its write will be (the fonts plugin's `resolve`, with the box, so its own
 * font counts): when the edit starts, and again after a pause in typing once
 * the text has a character it wasn't resolved with. An answer holds for the
 * faces it was asked about: a box restyled since (another font, a bold word)
 * is asked again, and drawn in the fonts its names say until it is answered.
 * Any other box is drawn in the fonts its names say. Without the fonts plugin, a box is drawn in the
 * standard font the engine falls back to for its font or face, in that
 * font's built-in program (`@embedpdf/core-fonts`).
 */
import {
  refOf,
  richDocOf,
  textOf,
  type FontLookup,
  type Id,
  type Model,
  type ModelAnnotation,
  type TextStyle,
} from '@embedpdf/core-annotation';
import { standardFontCss, standardFontOf, standardFontOfProgramFamily } from '@embedpdf/core-fonts';
import {
  STANDARD_FACES,
  faceForFontName,
  familyKey,
  standardFontForFace,
  type FontResolveRun,
  type ResolvedFontRun,
  type RichTextBody,
} from '@embedpdf/engine-core/runtime';
import { FontsToken, type FontCss, type FontsCapability } from '@embedpdf/plugin-fonts/contract';

import type { AnnotationContext } from '../services/context';
import type { AnnotationStore } from '../services/store';

/** A run's face: the family, weight and italic its font is chosen by. */
export interface TextFace {
  readonly family: string;
  readonly weight: number;
  readonly italic: boolean;
}

/** How long typing pauses before a box with new characters is resolved again. */
const RESOLVE_DELAY_MS = 250;

const faceKey = (face: TextFace): string =>
  `${familyKey(face.family)}|${face.weight}|${face.italic}`;

/** The key of a box's body in a resolved box's faces. */
const BODY = 'body';

/** Every code point of a text. */
const codePointsOf = (text: string): number[] => Array.from(text, (char) => char.codePointAt(0)!);

export interface TextFonts {
  /** The CSS a box's body is drawn in. */
  bodyCss(id: Id, style: TextStyle, body: TextFace): FontCss;
  /** The CSS a face is drawn in inside a box (`null` id: no box yet). */
  faceCss(id: Id | null, face: TextFace): FontCss;
  /** The family a program's CSS family stands for, for text a browser drew itself. */
  familyOfCss(cssFamily: string): string | undefined;
  /** Changes whenever an answer above would: compare it to tell. */
  version(): object;
  /** The text of a box being typed in changed. */
  typed(id: Id): void;
}

export function createTextFonts(
  ctx: Pick<AnnotationContext, 'tryGet' | 'clock' | 'notify' | 'state' | 'watch'>,
  store: Pick<AnnotationStore, 'model'>,
  lookup: FontLookup,
): TextFonts {
  const fonts = (): FontsCapability | null => ctx.tryGet(FontsToken);

  /**
   * What the engine answered per box: the faces it was asked about, the record it was asked for
   * (a newer one with the same faces keeps the answer), and the run each face drew in, its CSS
   * asked for on each read (it changes as the programs reach the browser).
   */
  const answers = new Map<
    Id,
    {
      readonly faces: string;
      readonly record: ModelAnnotation;
      readonly byFace: ReadonlyMap<string, ResolvedFontRun>;
    }
  >();
  /** The box being typed in, and the characters its last resolve asked about. */
  let editing: Id | null = null;
  let asked: { readonly id: Id; readonly codePoints: Set<number> } | null = null;
  /** Each box's resolve in flight: a newer one for the same box replaces it. */
  const resolving = new Map<Id, AbortController>();
  let cancelPause = () => {};
  let answered = 0;
  let token: { list: unknown; answered: number; epoch: number } = {
    list: null,
    answered,
    epoch: 0,
  };

  /** The body's face named by its font alone: then the box's font is the one drawn. */
  const bodyIsItsFont = (style: TextStyle, body: TextFace): boolean => {
    const face = faceForFontName(style.fontFamily, (key) =>
      lookup().find((font) => font.key === key),
    );
    return (face.weight ?? 400) === body.weight && (face.italic ?? false) === body.italic;
  };

  /**
   * What the engine is asked about a box's text: the body first, then every run, unstyled ones by
   * the box's font, the rest by face; `faces` names the faces asked, whatever the text.
   */
  const questionOf = (record: ModelAnnotation) => {
    const style = textOf(record.annotation);
    if (!style || record.annotation.subtype !== 'free-text') return null;
    const doc = richDocOf(record.annotation, lookup);
    const body = doc.body;
    const faces: string[] = [BODY];
    const runs: FontResolveRun[] = [bodyRun(style, body, bodyIsItsFont(style, body))];
    let text = '';
    for (const paragraph of doc.paragraphs) {
      for (const run of paragraph.runs) {
        text += run.text;
        const own = run.style;
        if (own?.family === undefined && own?.weight === undefined && own?.italic === undefined) {
          faces.push(BODY);
          runs.push({ ...bodyRun(style, body, bodyIsItsFont(style, body)), text: run.text });
          continue;
        }
        const face = {
          family: own.family ?? body.family,
          weight: own.weight ?? body.weight,
          italic: own.italic ?? body.italic,
        };
        faces.push(faceKey(face));
        runs.push({ text: run.text, ...face });
      }
    }
    // The body run has no text of its own: it and the faces are the question, whatever is typed.
    const key = JSON.stringify({ body: runs[0], faces: [...new Set(faces)].sort() });
    return { body, runs, faces, text, key };
  };

  /** Ask the engine what the box's text will be drawn in, and keep the answer. */
  const resolveBox = async (id: Id): Promise<void> => {
    const api = fonts();
    const record = store.model().byId[id];
    const question = api && record && questionOf(record);
    if (!api || !record || !question) return;
    const { body, runs, faces, text, key } = question;
    // A box not written yet has no font of its own to count.
    const ref = refOf(record) ?? undefined;
    if (id === editing) asked = { id, codePoints: new Set(codePointsOf(text)) };
    resolving.get(id)?.abort();
    const request = new AbortController();
    resolving.set(id, request);
    try {
      // The list names the programs' styles and the system families after them.
      await api.ensureLoaded();
      const answer = await api.resolve(
        { ...(ref ? { annotation: ref } : {}), runs },
        { signal: request.signal },
      );
      if (resolving.get(id) !== request) return;
      resolving.delete(id);
      const byFace = new Map<string, ResolvedFontRun>();
      answer.runs.forEach((run, index) => {
        const face = faces[index]!;
        if (!byFace.has(face)) byFace.set(face, run);
      });
      // A run that names the body's own face is drawn as the body is.
      if (!byFace.has(faceKey(body))) byFace.set(faceKey(body), byFace.get(BODY)!);
      answers.set(id, { faces: key, record, byFace });
      answered++;
      ctx.notify();
    } catch {
      // An engine that doesn't resolve, or an edit that moved on: the names' fonts stay.
    }
  };

  /**
   * Drop the answers the model moved on from: a box deleted, or restyled so its faces aren't the
   * ones asked about, which is asked again (typing keeps the faces, and the answer). The model is
   * watched, not this plugin's state: a change that shows before the engine answers it, as a
   * format on a whole box does, changes the view alone.
   */
  const dropStaleAnswers = (model: Model) => {
    let dropped = false;
    for (const [id, answer] of answers) {
      const record = model.byId[id];
      if (record === answer.record) continue;
      const question = record && questionOf(record);
      if (question && question.key === answer.faces) {
        answers.set(id, { ...answer, record });
        continue;
      }
      answers.delete(id);
      dropped = true;
      if (question) void resolveBox(id);
    }
    if (dropped) {
      answered++;
      ctx.notify();
    }
  };

  ctx.watch(store.model, dropStaleAnswers);

  // Resolve the box someone starts typing in.
  ctx.state.onChange(() => {
    const next = store.model().editing;
    if (next === editing) return;
    editing = next;
    cancelPause();
    asked = null;
    if (next !== null) void resolveBox(next);
  });

  return {
    bodyCss: (id, style, body) => {
      const api = fonts();
      const byFont = bodyIsItsFont(style, body);
      if (!api) {
        return standardFontCss(
          byFont ? standardFontOf(style.fontFamily) : standardFontForFace(body),
        );
      }
      const run = answers.get(id)?.byFace.get(BODY);
      if (run) return api.getRunCss(run);
      return byFont ? api.getFontCss(style.fontFamily) : api.getFaceCss(body);
    },
    faceCss: (id, face) => {
      const api = fonts();
      if (!api) return standardFontCss(standardFontForFace(face));
      const run = id !== null ? answers.get(id)?.byFace.get(faceKey(face)) : undefined;
      return run ? api.getRunCss(run) : api.getFaceCss(face);
    },
    familyOfCss: (cssFamily) => {
      const face = fonts()?.getFaceOfCssFamily(cssFamily);
      if (face) return face.family;
      const standard = standardFontOfProgramFamily(cssFamily);
      return standard && STANDARD_FACES[standard].family;
    },
    version: () => {
      const api = fonts();
      const list = api?.getFontList() ?? null;
      // The epoch moves as programs reach the browser, and with them the CSS.
      const epoch = api?.getPaintFontsEpoch() ?? 0;
      if (token.list !== list || token.answered !== answered || token.epoch !== epoch) {
        token = { list, answered, epoch };
      }
      return token;
    },
    typed: (id) => {
      if (editing !== id) return;
      const record = store.model().byId[id];
      if (!record) return;
      const text = richDocOf(record.annotation, lookup)
        .paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.text))
        .join('');
      const known = asked?.id === id ? asked.codePoints : null;
      if (known && codePointsOf(text).every((point) => known.has(point))) return;
      cancelPause();
      cancelPause = ctx.clock.after(RESOLVE_DELAY_MS, () => void resolveBox(id));
    },
  };
}

/** The body as a run: by the box's font when its face is that font's, else by face. */
function bodyRun(style: TextStyle, body: RichTextBody, byFont: boolean): FontResolveRun {
  return byFont
    ? { text: '', fontFamily: style.fontFamily }
    : { text: '', family: body.family, weight: body.weight, italic: body.italic };
}
