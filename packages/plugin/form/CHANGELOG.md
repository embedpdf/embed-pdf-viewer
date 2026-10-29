# @embedpdf/plugin-form

## 3.0.0-next.18

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `FormState`, what `formState` reads and `useFormState()` returns, the State table of the form page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/internal`, is now `FormModel`, made by `initialFormModel()`, so `FormState` has one meaning.

## 3.0.0-next.16

### Patch Changes

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – The form is read again when an undo brings pages back.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form fields stay in sync from the document's confirmed events (every origin) instead of re-reading after each write, and widget boxes are kept per page. `ensureLoaded(page)` returns a promise. `createSerialQueue` is no longer exported, and the `/internal` entry is removed; hosts use `/contract/host`.

  Form field and widget operations now use object-number references, flat flag values, page-space widget boxes, and the revised engine create, update, and removal results.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The form contract, on the kernel's `create()` hook. Every method takes a `FormFieldRef` (`fieldRef.byName` / `fieldRef.byObjectNumber`) or a widget's `AnnotationRef`; the `obj:`/`fqn:` field keys leave the public surface. Reads: `getSnapshot` (was `snapshot`), new `getStatus`, `listFields(filter?)`, `getField`, `getFieldForWidget`, `getValue`, `listWidgets` (the fill items, now carrying `fieldRef` and `annotationRef`), `getWidgetAt`. Filling: `setValue` is the validated path (was `commitValue`) resolving a `SetValueResult`; `setValueRaw` is the engine passthrough (was `setValue`); `setText`, `setChecked` (was `toggle`), `setChoice` (was `choose`) resolve with the result; new `setValues`, `resetAll`, `exportValues`, `importValues`; `activateWidget(widget)` takes the widget alone. Designing: `createField({ family, page, bounds, name?, appearance?, options? })` (was `placeField`), `detachWidget(ref, widget)`. Events: `onValueChanged`, `onFieldCreated`/`onFieldUpdated`/`onFieldDeleted` (from the confirmed document events, own and remote), `onValidationRejected`, `onResynced`. `FormConfig.validation: 'scripts' | 'none'` replaces the empty options. Refusals are `PluginError`s (`permission-denied`, `not-found`, `invalid-input`, `not-ready`). A refresh that is asked for while a read is in flight now queues one follow-up read (G5).

  Host (`/contract/host`): `listFillItems`, `getFillItem`, `ensureLoaded` (was `ensureGeom`), `getPageBox`, `notifyWidgetEvent(fieldRef, widget, event)`, `resetFormAction`, `resolveSubmitDataset`, `commitScriptFormEffects`.
  - Internal layout: the plugin is `contract` / `host-contract` / `model` / `controller` with `services`, `read`, `write`, `sync`, `scripting` and `tools` areas; the `./scripting` export now resolves to `scripting/controller.ts`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A download includes the text being typed in a field. The plugin keeps what is typed and commits it before the file is read, matching Acrobat, which commits the field being edited before a save. Framework adapters report typing through three new host members: `draftText(field, text)` on each keystroke, `commitDraftText(field)` on blur or Enter (the field's scripts run then; it resolves `null` when there is nothing to write), and `discardDraftText(field)` on Escape. A download also waits for value writes still on their way.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `canRestoreAttribution()` (`doc.forms.import`: an import may keep who created and filled in its fields) and `canWriteScripts()` (`doc.forms.script`: scripts, submit buttons and links may be written into fields). Fields carry who created and filled them in.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `reorderCalculations(fields, position)`. `create()` and `update()` take field scripts (`actions`), refused up front without `doc.forms.script`. The form mirror takes the calculation order from `forms.calculationsReordered` and from writes that changed it, so a script added through `update()` runs from the next fill on.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Rights per field, and what the form layer paints:
  - **`canFill(field)`** takes the field: `doc.forms.fill`, or a `fields:fill` permission for its group. Filling in a field the user may not fill in is refused naming the permission (`fields:fill:group=seller`); `setValues` fails just that entry, and `importValues` skips it.
  - **The fill controls** of a field the user may not fill in (a signature field: sign) are disabled, so Tab skips them.
  - **`validate()`** checks the required fields the user may fill in, and **`reset()`** without fields puts back those fields only. A field you name that the user may not fill in refuses the reset.
  - **Hidden widgets** (`hidden`, `noView`) get no control.
  - **For the form layer:** `listShownWidgets(page)`, the widgets a page shows with the state each one shows.
  - The tools' placement helpers come from `@embedpdf/core-annotation`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `export(selection)` and `import(bundle, options)` replace the FDF/XFDF `export(format)` and `import(bytes)`: whole fields out as a bundle, and copied into a document as one change. Re-exports `FormTransfer`, `FormBundle` and the import types.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `addWidget(ref, placement?)` shows a field in one more place: a radio group's next choice (the next free `Choice<n>`) or a checkbox's next box, which checks together with the others. Without a place it goes next in line after the field's widgets: below them while they stand in a column, beside them while they stand in a row, the same size and step, a new column where the page ends. It looks like the field's last widget, and resolves `{ field, widget }`; a merged field splits.

  After a field tool places a field, the tool goes back to design's `form-edit` rather than the default pointer (with `afterCreate.tool: 'default'`), so design goes on and the field stays selected. The plugin looks its siblings up when it uses them, not once as it's created, so design mode finds the annotation plugin however the plugins came to be built. After a merged field splits, its old row goes from `getWidgets()` and the page's widgets.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The form plugin's one mirror holds the fields and every widget row, from `doc.forms.list()`, and folds the rows each form event carries; widget boxes and actions come from it. `getWidget(widget)` returns a widget's row, and `getWidgets(ref)` every row of a field, in the field's order (a radio group's buttons, or a field shown on several pages). A widget is addressed by its annotation ref or as a field names it (`FormWidget`); a field ref is no longer accepted where a widget is meant.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `form.deleteWidget(widget)` deletes a widget and resolves its field (`null` for a widget in no field); the field index folds `forms.widgetDeleted` and `forms.widgetRestored`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - Building the form is on the change queue: `create()`, `update()`, `delete()`, `deleteWidget()`, `removeWidget()` and `reorderCalculations()` each show at once, are one step to undo, and resolve with the engine's answer. A new field takes its final refs from its first frame.
  - `updateWidget(widget, patch)`: change one widget's place or look.
  - `getFieldSettings(field)`: a field's settings described for a settings panel (`{ properties, values }`), written with `update()`.
  - Design mode: the form lends its widgets to the annotation plugin, which edits them with its own tools; deleting every widget of a field deletes the field. In fill mode nothing is lent and the form layer draws every widget. `listShownWidgets()` is empty while the widgets are lent. Both modes draw the widgets' pictures from the render plugin (now an optional sibling), so switching modes fetches nothing.
  - The palette selects a field it placed at once, and gains a push button tool (`form-button`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - What the document's scripts change is written as one change (`doc.apply`): all of it, or none of it. A refusal throws, as a plain value write does.
  - `FormCommitResult.effectsResult` is removed: `status` says how the write ended (`unchanged` when it changed nothing).
  - A reset is one `doc.forms.reset`, then the recalculation.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - Filling in shows at once: a typed value, a click, a reset, a batch of values and what a script writes show before the engine answers, and stay unless the engine refuses them. Fields stay editable while a write is on its way: a widget is `disabled` only when its field is read-only or isn't yours to fill.
  - Every fill is one change with the calculations it causes: one request and one undo step. `setValues` and `importValues` write all their values as one change with one recalculation, without keystroke or validate scripts, as a script's `field.value` does.
  - The form's scripts read the form as you see it, so a commit reads nothing from the engine. A script's or an action's writes (JavaScript, hide and reset actions) go with the calculations they cause.
  - A fill the engine refuses leaves the form, and the calculations run again against what is left. An undo pressed while a fill's scripts still run takes the value back, and nothing worked out for it lands.
  - Undoing a fill shows the fields and their widgets as they were, at once.
  - A submit sends the form as you see it, once every fill on its way is answered.
  - The scripts' engine starts when the first field of a form with scripts takes focus, and never for a form without field scripts. A form with scripts but no script realm logs a one-time hint.
  - A field you name with `toFieldRef(name)` runs its own scripts.
  - `getValue()` returns the same object while the field's value stays the same.
  - `createFormScriptingController({ document, transaction, budget })` reads the form you give it and returns what the scripts changed (`FormScriptResult`) instead of writing it: `transaction(body)` runs the scripts and your write in one realm transaction, `commit`, `activate` and `recalculate` take the form, and `warm(form)` starts the realm.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The form capability takes the names the forms pages use. Reads: `list(filter?)` (was `listFields`), `get(ref)` (was `getField`), new `getFormKind()`, `getSelectedField()` (the field of the selected widget in design mode) and `validate()` → `{ valid, missing }` (the empty required fields, in page order). `listWidgets(page)`, `getWidgetAt(page, point)` and `list({ page })` take a page ref or an index, and each widget now carries its `look` (border, background, text color and font, `null` where the field has none of its own). A field is found by its full name too: `toFieldRef(name)` is exported from the contract (`fieldRef` is gone), and `get`, `getValue` and every write resolve it. `getValue` keeps one object per field while the field stays the same.

  Filling: `setValue(ref, { value | checked | selectedValues })` is the one value write and resolves `{ field, status }`; `setText`, `setChecked`, `setChoice` and `setValueRaw` are gone. Whether the form's scripts run is the `validation` setting, read at each write. `reset(refs?)` replaces `reset(ref)` and `resetAll()` and resolves `{ fields }`, the fields it changed. `exportValues()` gives plain values (`'Ada'`, `true`, `['a', 'b']`) and `importValues()` takes them, skipping names the form doesn't have and values a field can't take. `export(format?)` and `import(bytes)` replace `exportData` and `importData`; `import` tells FDF from XFDF by itself.

  Building: `create(draft)` takes the engine's field draft (every setting: `required`, `readOnly`, `options`, an `exportValue` per radio button) and resolves `{ field }` (was `createField({ family, page, bounds })`); `update` and `removeWidget` (was `detachWidget`) resolve `{ field }`, `delete` replaces `deleteField`. Every building verb is refused up front without `doc.forms.modify`, naming the permission. The palette tools follow the annotation plugin's `afterCreate` setting (select the new widget, stay or go back to the default tool).

  Settings: `formPlugin({ validation, focus: { color }, fields: { border, background, color } })` with `getSettings`, `updateSettings`, `resetSettings` and `onSettingsChanged`; `focus.color` and `fields.border` follow the viewer's accent while `null`. `formState` declares the State table (`fields`, `status`, `formKind`, `selectedField`). Events carry what their table lists: `onValueChanged { field, origin }`, `onFieldCreated` and `onFieldUpdated { field, origin }`, `onFieldDeleted { ref, origin }`, `onValidationRejected { field, issues }`. Every async verb takes a `signal`.

  Host (`/contract/host`): `listFillItems` and `getFillItem` are gone (`listWidgets` is public); `FillItem` is `FormWidgetItem`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Each setting `getFieldSettings()` describes has a `labelKey` beside its English `label` (`form.settings.tooltip`), to translate a field settings panel by, as the annotation kinds' style properties do. A choice's options stay the field's own values.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `fillItems`, `ensureGeom`, `widgetAt` and `pageBox` take a `PageRef`; `placeField` input uses `page`; widget refs carry `page` (`null` when unplaced).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Each widget has a picture version in the form's mirror, moved when the engine draws the widget again (a checkbox that only switches its state isn't drawn again, so nothing is fetched). New host calls, the same shape as the annotation plugin's: `getAppearanceEpoch(page)` and `renderAppearances(page, scale, signal)`. A shown widget says whether its look is `pending` and its `pictureVersion`; `getWidgetPainting(widget)` is the painter's drawing of it as the view has it, with the text this session's format scripts wrote (each run of text carries the face it draws in); in design mode the annotation plugin draws a widget with the same painter while its look is pending or its picture is older; `getTextEditorLayout(widget, text)` is where a text field's editor shows the text being typed.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `onValueChanged`, `onFieldCreated`, `onFieldUpdated` and `onFieldDeleted` carry the engine's `origin` as it is (`kind`, `sessionId`, `sub`, `ts`, `serverId`, `tx`), in place of `locality`, `sessionId` and `actorId`. A fill the session may not make rejects with `error.permission` set to `'doc.forms.fill'`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Field tools show their ghost: the field a click places, with the tool's defaults, round for a radio button (its tool is now `widget-radio`). Placement goes through the annotation core's `gesturePlacement`, the drag previews through the annotation plugin, and a cancelled gesture places nothing.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Add the `fillable` setting: which fields people may fill in by hand, `true` (the default), `false`, or a list of field families. A field it leaves out draws as a read-only field does and takes no input; `setValue()`, `importValues()` and `canFill()` are unchanged.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `create()` takes a widget's actions on its placements, refused up front without `doc.forms.script` when one runs a script, submits or opens a URI.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Match a widget's annotation by `annotationKey`, for the two ref kinds an annotation can have.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The form tools register through the annotation plugin's `tools.register()`, read `tools.getDefaults()`, and select a placed widget with `selection.set()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A script's form effects run under an `opId` minted for the batch, which a batch that never ran reports too.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Follows the interaction contract (`getActiveToolId`) and the annotation contract (`getRaw`, `getToolDefaults`, `listPageItems` from `/contract/host`).

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Internal: the controller composes through the kernel's `composeApi`; page ↔ PDF conversion goes through the kernel's page geometry instead of a copy of its own.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Uses the widget's engine-computed annotation address (`widget.ref`) instead of composing one by hand: the form place handler selects it and detach passes it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Imports the interaction plugin's handler types and `samplePointOn` from its host contract, where they moved.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `create()` makes push buttons; a button made this way draws, and runs its `activate` action when pressed.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The field index takes a page's widget order from `forms.widgetsReordered`.

## 3.0.0-next.14

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add signature-field authoring and fill controls that expose whether a field is signed. Provide widget hit testing for placing marks on existing fields, and refresh form state after signing or a document version change.

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Widget activation joins the action engine: with `@embedpdf/plugin-actions` installed, `activateWidget` delegates the full `/A` tree to the dispatcher (return type is now `WidgetActivationResult`, discriminating the two worlds), so Hide/ResetForm push buttons work with scripting disabled. The host lens exposes the interim executors' doors: `runActivationScript` (one JS node as a widget transaction) and `resetFormAction` (three-state target resolution, one batch reset skipping non-resettable families, recalculate after). Executor-driven form mutations ride the same serial mutation queue as user commits — strictly actions-queue → form-queue, never the reverse.

  The widget DOM-event door dispatches widget `/AA` trees, including coalesced hover events. Activation now submits synchronously through the dispatcher, and script UI effects carry their dispatch origin; print requests without document permission are withheld with an observable diagnostic.

  Form scripting is fault-tolerant per event: Keystroke, Validate, Calculate, and Format exceptions degrade to diagnostics while explicit `event.rc = false` remains a rejection and resource-budget faults still fail the transaction. Keystroke actions now run Acrobat's typing and commit passes so standard AF validators and custom transforms see the expected event shape.

  Publish bundle-safe `/contract` and `/contract/host` entries over the same form token, plus a focused `/scripting` helper entry. `/internal` remains an implementation visibility surface rather than the sibling bundle boundary.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The submit dataset resolver + the reset() symmetry fix (Phase 4). `resolveSubmitDataset` (registered as THE actions submit resolver) does a FRESH engine read and applies the ISO Table-239/240 semantics through the new shared `field-selection` module: include-mode NAMES select descendants by FQN dot-prefix (fixing the ResetForm exact-match conformance bug too — Tables 241/242 want subtrees), the NoExport veto is unconditional (diagnosed when explicitly listed), explicitly listed push-buttons/signatures and unsupported `/V` shapes are DIAGNOSED (`submit-entry-unsupported`), never silently dropped, and IncludeNoValueFields yields name-only entries. `resetFormAction` gains an origin parameter threaded from the executor's ActionContext — a lifecycle/hover ResetForm can no longer launder its recalculation alerts into user origin — and the public `form.reset(key)` now rides the SAME shared reset core (one effects batch → refresh → V/C/F recalculation), so a dependent calculated field can no longer go stale through the API door.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The K/V/C/F pipeline rides the shared realm: `FormScriptingController` keeps its ordering, `event.rc` semantics, two-pass keystroke, overlay, and fault ladder UNCHANGED, but acquires the realm through a transaction port — the actions plugin's per-document host in viewers, or a self-owned standalone host (`createFormScriptingHost` / the `{ config }` constructor arm) for stamp and tests. The snapshot moves INSIDE the transaction boundary (`commit(ref, value)` / `activate(ref, action)` / `recalculate()` — no snapshot parameters). `formPlugin({ scripting })` is DELETED (the switch is `actionsPlugin({ javascript })`); the interim `runActivationScript` executor and the form-side UI-effect provider (`setUiEffectProvider`/`FormUiEffectProvider`) are gone — every script surface flows through the actions port with origin/phase attached, and the new `commitScriptFormEffects` sink commits script form effects with engine write + snapshot AND annotation-plane reconciliation in one place.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add `canRead()`, `canFill()`, and `canDesign()` permission helpers, replacing
  `canModify()`. Form hydration and mutations now refuse unauthorized work
  locally, and realtime desync events trigger a full form snapshot refresh.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt interactive-form plugin. It provides reactive field state, fill-mode controls, form-data import and export, and sandboxed Acrobat JavaScript execution while keeping widgets integrated with the annotation plane.
