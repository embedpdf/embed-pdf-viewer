/**
 * The form layer's controls of an app's own, the same for every framework. A
 * control is a rule ("draw these boxes with this component"); a framework
 * adapter keeps the component, and these decide everything around it:
 *
 * - {@link fieldControlFor}: which control draws a box, the first that matches.
 * - {@link fieldControlPlaceOf}: the frame the control draws into, and where
 *   the layer's own drawing of the box goes inside it.
 * - {@link createFieldControlPress}: a value the control writes and the
 *   widget's action, in Acrobat's order.
 * - {@link claimClick}: the layer's own control inside an app's control
 *   handles its click itself.
 *
 * The form plugin's types are mirrored structurally, so this package stays
 * free of EmbedPDF imports.
 */
import { frameInPixels, lookFrameOf, type PageLayerTransform } from './annotation-frame';
import { rectInPixels, type PixelRect } from './page-pixels';

/** A control of an app's own: it draws the boxes `for` matches. */
export interface FieldControlEntry<Widget> {
  for(widget: Widget): boolean;
}

/** The first control that draws this box, or `null` for a box the layer draws itself. */
export function fieldControlFor<Widget, Entry extends FieldControlEntry<Widget>>(
  widget: Widget,
  controls: readonly Entry[] | undefined,
): Entry | null {
  return controls?.find((control) => control.for(widget)) ?? null;
}

/** The box a control draws into: the size to draw at, how it's turned, and how it's scaled. */
export interface FieldControlFrame {
  /** Its width in pixels at the field's 100% size, before its turn: draw at this. */
  width: number;
  /** Its height in pixels at the field's 100% size, before its turn: draw at this. */
  height: number;
  /**
   * How it's turned on screen, degrees clockwise: the page's turn and the
   * field's own. 0 is upright; turn your content by `-rotation` to keep it
   * upright.
   */
  rotation: number;
  /** How much the layer scales what you draw, with the page: the zoom. */
  scale: number;
}

// Type aliases, not interfaces, so each fits a framework's style type (see the note in `form-field`).

/** The element a control is drawn in: the field's 100% size, scaled with the page from its corner. */
export type FieldControlFrameStyle = {
  position: 'absolute';
  left: '0';
  top: '0';
  width: string;
  height: string;
  transform: string;
  transformOrigin: '0 0';
};

/** Where a widget's picture goes inside its box: where the widget stands, whatever the box's turn. */
export type FieldPictureStyle = {
  position: 'absolute';
  left: string;
  top: string;
  width: string;
  height: string;
  /** The box's turn undone: the picture holds the widget's turn already. */
  transform?: string;
};

/** Where a control of an app's own draws, and where the layer's own drawing goes inside it. */
export interface FieldControlPlace {
  /** The frame the control is handed. */
  frame: FieldControlFrame;
  /** The style of the element the control is drawn in, inside the widget's box. */
  frameStyle: FieldControlFrameStyle;
  /**
   * The style of the element the layer's own drawing goes in, inside the
   * frame: the box's size on screen with the frame's scale undone, so the
   * layer's control is drawn exactly as it is without a control of the app's.
   */
  nativeStyle: FieldControlFrameStyle;
  /** The widget's box on screen, at the origin of that element: what the layer's control is laid out in. */
  nativeBox: PixelRect;
  /** Where the widget's picture goes in that element. */
  pictureStyle: FieldPictureStyle;
}

/**
 * The place of a control of an app's own for one widget: the box's `box`
 * (its frame), its quarter turn and the `rect` it stands in, at the page's
 * transform. The widget's box is placed and turned by the layer
 * (`widgetBoxStyleOf`); everything here is inside it.
 */
export function fieldControlPlaceOf(
  widget: {
    box: { x: number; y: number; width: number; height: number };
    rotation?: number | null;
    rect: { x: number; y: number; width: number; height: number };
  },
  page: PageLayerTransform,
): FieldControlPlace {
  const rotation = widget.rotation ?? 0;
  const pixels = frameInPixels({ box: widget.box, rotation, scale: 1 }, page);
  const stands = rectInPixels(widget.rect, page);
  const fill = { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0' } as const;
  return {
    frame: lookFrameOf(pixels, true),
    frameStyle: {
      ...fill,
      width: `${pixels.design.width}px`,
      height: `${pixels.design.height}px`,
      transform: `scale(${pixels.scale})`,
    },
    nativeStyle: {
      ...fill,
      width: `${pixels.width}px`,
      height: `${pixels.height}px`,
      transform: `scale(${1 / pixels.scale})`,
    },
    nativeBox: { left: 0, top: 0, width: pixels.width, height: pixels.height },
    pictureStyle: {
      position: 'absolute',
      // Centred on the box, at the size the widget stands at: a quarter turn swaps its sides.
      left: `${(pixels.width - stands.width) / 2}px`,
      top: `${(pixels.height - stands.height) / 2}px`,
      width: `${stands.width}px`,
      height: `${stands.height}px`,
      ...(rotation ? { transform: `rotate(${-rotation}deg)` } : {}),
    },
  };
}

/**
 * Whether a click on a box runs the widget's action, as it does on the
 * layer's own control: every box but a signature field's (a click there
 * signs, or shows the signature) and a push button that takes no input.
 */
export function runsActionOnClick(widget: { control: string; disabled: boolean }): boolean {
  return widget.control !== 'signature' && !(widget.control === 'button' && widget.disabled);
}

/** A control's writes and its box's click. */
export interface FieldControlPress<Value, Result> {
  /** Fill the field in: the write the control is handed. */
  setValue(value: Value): Promise<Result>;
  /** A click landed on the box: run the widget's action, once a value the click wrote is written. */
  click(): void;
}

/**
 * The value a control writes and the widget's action, in Acrobat's order: a
 * click that fills the field in writes the value first, then the action
 * runs, so an action script reads the new state. A click that writes nothing
 * runs the action at once.
 */
export function createFieldControlPress<Value, Result>(
  write: (value: Value) => Promise<Result>,
  activate: () => void,
): FieldControlPress<Value, Result> {
  let writing: Promise<Result> | null = null;
  return {
    setValue(value) {
      const written = write(value);
      writing = written;
      const done = () => {
        if (writing === written) writing = null;
      };
      written.then(done, done);
      return written;
    },
    click() {
      void Promise.resolve(writing).then(activate, activate);
    },
  };
}

const claimed = new WeakSet<Event>();

/**
 * The layer's own control, drawn inside a control of an app's own, dealt with
 * this click (it ran the widget's action, or its own): the box around it
 * leaves the click alone.
 */
export function claimClick(event: Event): void {
  claimed.add(event);
}

/** Whether the layer's own control inside the box dealt with this click ({@link claimClick}). */
export function isClickClaimed(event: Event): boolean {
  return claimed.has(event);
}
