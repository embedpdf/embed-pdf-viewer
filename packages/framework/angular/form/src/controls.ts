/**
 * The controls `<epdf-form-layer>` puts over a page's fields, one per widget. Each is a
 * component whose host element is the widget's box (`widget-box.ts`), with a real HTML control
 * inside. The field's own picture (the engine's drawing of its value, borders and fonts) is
 * drawn below, by the form layer's `<epdf-field-pictures>`; the controls add what people work
 * with on top of it:
 *
 *   text       the picture at rest; focus shows an editor in the field's own font (the plugin
 *              keeps what's typed, so a download writes it); blur or Enter commits, Escape
 *              puts the value back
 *   toggle     the picture is the control; a click writes the toggled value
 *   combo      an invisible native <select> over the picture: the browser owns the dropdown,
 *              the engine the pixels at rest
 *   list       a visible native <select> (`list-box.ts`): one surface owns the rows, the
 *              keyboard and the scrolling
 *   button     a native click target over the picture, which runs the widget's action
 *   signature  with the signature plugin, "sign here" on an empty field, and the signature's
 *              details on a signed one
 *
 * The text-editing, toggle and list policies, the field looks, the controls' styles and the
 * colors are `@embedpdf/web`'s, the same for every framework.
 */
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CapabilityBinding, injectKernelHost } from '@embedpdf/angular/runtime';
import { SignatureToken } from '@embedpdf/plugin-signature/contract';
import {
  createTextFieldEditor,
  FORM_CONTROL_FILL,
  formFocusRingStyleOf,
  listBoxControlStyleOf,
  pressToggle,
  textFieldEditorStyleOf,
  type TextFieldEditorState,
} from '@embedpdf/web';
import { FormListBox } from './list-box';
import { FormWidgetBox, type WidgetOf } from './widget-box';

/**
 * The focus ring of a field whose control is see-through or is the box itself: painted above
 * the field's picture, because an outline on the box would sit under an opaque child, and a
 * checkbox or a dropdown would look unfocused while it has the focus.
 */
@Component({
  selector: 'span[epdfFormFocusRing]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    'data-embedpdf-form-focus-ring': '',
    '[style]': 'ringStyle()',
  },
  template: '',
})
export class FormFocusRing {
  /** The ring's CSS color: the form's `focus.color` setting, through its CSS variable. */
  readonly color = input.required<string>();

  protected readonly ringStyle = computed(() => formFocusRingStyleOf(this.color()));
}

/** A text box: the picture at rest, an editor in the field's own font while focused. */
@Component({
  selector: 'div[epdfFormText]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A click runs the widget's action too, as in Acrobat: the editor's focus click bubbles
  // here, and a read-only field's lands here directly.
  host: { '(click)': 'activate()' },
  template: `
    @if (item().multiline) {
      <textarea
        #field
        [value]="state().draft"
        [attr.maxlength]="item().maxLength"
        [attr.aria-label]="item().label"
        [disabled]="item().disabled"
        [style]="editorStyle()"
        (focus)="editor()?.focus()"
        (input)="editor()?.input(field.value)"
        (blur)="editor()?.blur()"
        (keydown)="keyDown($event, field)"
      ></textarea>
    } @else {
      <input
        #field
        [type]="item().password ? 'password' : 'text'"
        [value]="state().draft"
        [attr.maxlength]="item().maxLength"
        [attr.aria-label]="item().label"
        [disabled]="item().disabled"
        [style]="editorStyle()"
        (focus)="editor()?.focus()"
        (input)="editor()?.input(field.value)"
        (blur)="editor()?.blur()"
        (keydown)="keyDown($event, field)"
      />
    }
  `,
})
export class FormTextControl extends FormWidgetBox<WidgetOf<'text'>> {
  /**
   * The editing policy of this field. The editor is always there, see-through at rest and
   * shown while focused: the DOM is the focus manager, so Tab reaches every field. A control is
   * one widget for its whole life (the layer tracks widgets by field and widget), so one
   * editor per form.
   */
  protected readonly editor = computed(() => {
    const form = this.form();
    return form
      ? untracked(() => createTextFieldEditor(form, this.item().fieldRef, this.item().value))
      : null;
  });

  protected readonly state = signal<TextFieldEditorState>({ focused: false, draft: '' });

  protected readonly editorStyle = computed(() =>
    textFieldEditorStyleOf(this.item(), this.frame(), this.colors(), this.state().focused),
  );

  constructor() {
    super();
    effect((onCleanup) => {
      const editor = this.editor();
      if (!editor) return;
      untracked(() => this.state.set(editor.getState()));
      onCleanup(editor.subscribe(() => this.state.set(editor.getState())));
    });
    // Take the field's value whenever it changes under us; the editor never takes it mid-edit.
    effect(() => {
      const editor = this.editor();
      const value = this.item().value;
      if (editor) untracked(() => editor.setValue(value));
    });
  }

  protected keyDown(event: KeyboardEvent, field: HTMLInputElement | HTMLTextAreaElement): void {
    if (this.editor()?.keyDown(event.key, this.item().multiline)) field.blur();
  }
}

/** A checkbox or a radio button: the picture is the control, a click writes the toggled value. */
@Component({
  selector: 'div[epdfFormToggle]',
  imports: [FormFocusRing],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': "item().kind === 'checkbox' ? 'checkbox' : 'radio'",
    '[attr.aria-checked]': 'item().checked',
    '[attr.aria-label]': 'item().label',
    '[attr.tabindex]': 'item().disabled ? -1 : 0',
    '[style.cursor]': "item().disabled ? 'default' : 'pointer'",
    '[style.outline]': "'none'",
    '(click)': 'press()',
    '(keydown)': 'keyDown($event)',
    '(focus)': 'focused.set(true)',
    '(blur)': 'focused.set(false)',
  },
  template: `
    @if (focused()) {
      <span epdfFormFocusRing [color]="colors().focus"></span>
    }
  `,
})
export class FormToggleControl extends FormWidgetBox<WidgetOf<'toggle'>> {
  protected readonly focused = signal(false);

  /** The value first, then the widget's action (Acrobat's order), so its script reads the new state. */
  protected press(): void {
    const form = this.form();
    if (form) pressToggle(form, this.item(), () => this.activate());
  }

  protected keyDown(event: KeyboardEvent): void {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    this.press();
  }
}

/** A dropdown: an invisible native select over the field's picture. */
@Component({
  selector: 'div[epdfFormCombo]',
  imports: [FormFocusRing],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(click)': 'activate()' },
  template: `
    <select
      #select
      [attr.aria-label]="item().label"
      [disabled]="item().disabled"
      [style]="selectStyle()"
      (focus)="focused.set(true)"
      (blur)="focused.set(false)"
      (change)="choose(select.value)"
    >
      @if (item().selected.length === 0) {
        <option value=""></option>
      }
      @for (option of item().options; track $index) {
        <option [value]="option.value">{{ option.label }}</option>
      }
    </select>
    @if (focused()) {
      <span epdfFormFocusRing [color]="colors().focus"></span>
    }
  `,
})
export class FormComboControl extends FormWidgetBox<WidgetOf<'choice'>> {
  protected readonly focused = signal(false);
  private readonly select = viewChild.required<ElementRef<HTMLSelectElement>>('select');
  /** The field's choice, and its options, by value: what the select is set to show. */
  private readonly choice = computed(() => this.item().selected[0] ?? '');
  private readonly optionValues = computed(() =>
    this.item().options.map((option) => option.value).join('\0'),
  );

  protected readonly selectStyle = computed(() => {
    const { disabled } = this.item();
    return {
      ...FORM_CONTROL_FILL,
      opacity: '0',
      cursor: disabled ? 'default' : 'pointer',
      'pointer-events': disabled ? 'none' : null,
    };
  });

  constructor() {
    super();
    // The select shows the field's choice whenever that changes, and is the user's otherwise:
    // a write on its way (which disables the field for a moment) leaves their choice alone.
    afterRenderEffect({
      write: () => {
        const choice = this.choice();
        this.optionValues();
        this.select().nativeElement.value = choice;
      },
    });
  }

  protected choose(value: string): void {
    void this.form()?.setValue(this.item().fieldRef, { value: value || null });
  }
}

/** A list: a visible native select in the field's own look, the settings where it has none. */
@Component({
  selector: 'div[epdfFormList]',
  imports: [FormFocusRing, FormListBox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(click)': 'activate()' },
  template: `
    <select
      epdfFormListBox
      [label]="item().label"
      [disabled]="item().disabled"
      [multi]="item().multi"
      [options]="item().options"
      [selected]="item().selected"
      [write]="write"
      [style]="listStyle()"
      (focus)="focused.set(true)"
      (blur)="focused.set(false)"
    ></select>
    @if (focused()) {
      <span epdfFormFocusRing [color]="colors().focus"></span>
    }
  `,
})
export class FormListControl extends FormWidgetBox<WidgetOf<'choice'>> {
  protected override readonly drawsEdge = false;
  protected readonly focused = signal(false);

  protected readonly listStyle = computed(() =>
    listBoxControlStyleOf(this.item(), this.frame(), this.colors()),
  );

  /** The list's write: the selection it shows at once, and the engine's once this resolves. */
  protected readonly write = (values: string[]) =>
    this.form()?.setValue(this.item().fieldRef, { selectedValues: values });
}

/** A push button: a native click target over its picture that runs its action. */
@Component({
  selector: 'div[epdfFormButton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.cursor]': "item().disabled ? 'default' : 'pointer'" },
  template: `
    <button
      type="button"
      [attr.aria-label]="item().label"
      [disabled]="item().disabled"
      [style]="buttonStyle()"
      (click)="activate()"
    ></button>
  `,
})
export class FormButtonControl extends FormWidgetBox<WidgetOf<'button'>> {
  protected override readonly drawsEdge = false;

  protected readonly buttonStyle = computed(() => ({
    ...FORM_CONTROL_FILL,
    padding: '0',
    border: '0',
    background: 'transparent',
    cursor: 'inherit',
    // The box is the event surface; a disabled button must not swallow the pointer.
    'pointer-events': this.item().disabled ? 'none' : 'auto',
  }));
}

/**
 * A signature field: with the signature plugin, an empty field is "sign here" (it becomes the
 * target the next mark goes to), and a signed one asks your UI to show its details. Without
 * the plugin, the field is only its picture.
 */
@Component({
  selector: 'div[epdfFormSignature]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.cursor]': "actionable() ? 'pointer' : 'default'" },
  template: `
    @if (actionable()) {
      <button
        type="button"
        [attr.aria-label]="item().label"
        [attr.data-signed]="signed() ? '' : null"
        [style]="buttonStyle"
        (click)="open()"
      ></button>
    }
  `,
})
export class FormSignatureControl extends FormWidgetBox<WidgetOf<'signature'>> {
  private readonly signature = new CapabilityBinding(
    injectKernelHost('<epdf-form-layer>'),
    () => SignatureToken,
    () => this.page.documentId,
  );

  private readonly signedByPlugin = this.signature.select(
    (signature) => signature.getSignature(this.item().fieldRef)?.signed ?? null,
    null,
  );
  /**
   * Whether the field is signed: the signature plugin knows best (it reads again after every
   * new version), the field's own value is the fallback.
   */
  protected readonly signed = computed(() => this.signedByPlugin() ?? this.item().signed);

  protected readonly actionable = computed(
    () => this.signature.capability() !== null && (this.signed() || !this.item().disabled),
  );

  protected readonly buttonStyle = {
    ...FORM_CONTROL_FILL,
    padding: '0',
    border: '0',
    background: 'transparent',
    cursor: 'inherit',
  };

  protected open(): void {
    const signature = this.signature.capability();
    if (!signature) return;
    const field = this.item().fieldRef;
    if (this.signed()) signature.requestInspection(field);
    else signature.setTarget(field);
  }
}
