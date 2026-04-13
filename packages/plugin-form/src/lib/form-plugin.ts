import { BasePlugin, createScopedEmitter, PluginRegistry } from '@embedpdf/core';
import {
  FieldGroupEntry,
  FieldValueChangeEvent,
  FormCapability,
  FormDocumentState,
  FormFieldInfo,
  FormPluginConfig,
  FormReadyEvent,
  FormScope,
  FormState,
  FormStateChangeEvent,
  RenameFieldResult,
  RenderWidgetOptions,
} from './types';
import {
  FormAction,
  initFormState,
  cleanupFormState,
  selectField as selectFieldAction,
  deselectField as deselectFieldAction,
} from './actions';
import {
  PdfAnnotationObject,
  PdfAnnotationSubtype,
  PdfCheckboxWidgetAnnoField,
  PdfDocumentObject,
  PdfErrorCode,
  PdfErrorReason,
  PDF_FORM_FIELD_FLAG,
  PDF_FORM_FIELD_TYPE,
  PdfRadioButtonWidgetAnnoField,
  PdfTask,
  PdfTaskHelper,
  PdfWidgetAnnoField,
  PdfWidgetAnnoObject,
  Task,
  TaskSequence,
  isWidgetChecked,
} from '@embedpdf/models';
import {
  AnnotationCapability,
  AnnotationEvent,
  AnnotationPlugin,
} from '@embedpdf/plugin-annotation';
import { Command, HistoryCapability, HistoryPlugin } from '@embedpdf/plugin-history';
import { initialDocumentState } from './reducer';
import { formTools } from './tools';

export class FormPlugin extends BasePlugin<
  FormPluginConfig,
  FormCapability,
  FormState,
  FormAction
> {
  static readonly id = 'form' as const;

  private readonly FORM_HISTORY_TOPIC = 'form-fields';

  private annotation: AnnotationCapability | null = null;
  private history: HistoryCapability | null = null;

  private readonly state$ = createScopedEmitter<FormDocumentState, FormStateChangeEvent, string>(
    (documentId, state) => ({ documentId, state }),
  );
  private readonly fieldValueChange$ = createScopedEmitter<
    FieldValueChangeEvent,
    FieldValueChangeEvent,
    string
  >((_, event) => event, { cache: false });
  private readonly formReady$ = createScopedEmitter<FormFieldInfo[], FormReadyEvent, string>(
    (documentId, fields) => ({ documentId, fields }),
    { cache: false },
  );

  /** Per-document logical field index: documentId → (fieldKey → FieldGroupEntry[]) */
  private readonly fieldGroupIndex = new Map<string, Map<string, FieldGroupEntry[]>>();

  /** Per-document name-based index: documentId → (fieldName → FieldGroupEntry[]) */
  private readonly fieldNameIndex = new Map<string, Map<string, FieldGroupEntry[]>>();

  /** Per-document tab-order sorted widget list: documentId → FieldGroupEntry[] */
  private readonly orderedFieldIndex = new Map<string, FieldGroupEntry[]>();

  /** IDs currently being propagated to siblings; prevents recursive loops */
  private readonly propagationInProgress = new Set<string>();

  constructor(id: string, registry: PluginRegistry, _config: FormPluginConfig) {
    super(id, registry);

    this.annotation = registry.getPlugin<AnnotationPlugin>('annotation')?.provides() ?? null;
    this.history = registry.getPlugin<HistoryPlugin>(HistoryPlugin.id)?.provides() ?? null;

    if (this.annotation) {
      for (const tool of formTools) {
        this.annotation.addTool(tool);
      }
      this.annotation.onAnnotationEvent((event) => this.handleAnnotationEvent(event));
    }
  }

  async initialize(): Promise<void> {}

  protected override onDocumentLoadingStarted(documentId: string): void {
    this.dispatch(initFormState(documentId, { ...initialDocumentState }));
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupFormState(documentId));
    this.fieldGroupIndex.delete(documentId);
    this.fieldNameIndex.delete(documentId);
    this.orderedFieldIndex.delete(documentId);

    // Cleanup scoped emitter caches and listeners
    this.state$.clearScope(documentId);
    this.fieldValueChange$.clearScope(documentId);
    this.formReady$.clearScope(documentId);
  }

  override onStoreUpdated(prev: FormState, next: FormState): void {
    for (const documentId in next.documents) {
      const prevDoc = prev.documents[documentId];
      const nextDoc = next.documents[documentId];
      if (prevDoc !== nextDoc) {
        this.state$.emit(documentId, nextDoc);
      }
    }
  }

  protected buildCapability(): FormCapability {
    return {
      getPageFormAnnoWidgets: (pageIndex, documentId?) =>
        this.getPageFormAnnoWidgets(pageIndex, documentId),
      setFormFieldValues: (pageIndex, annotation, newField, documentId?) =>
        this.setFormFieldValues(pageIndex, annotation, newField, documentId),
      renameField: (annotationId, name, documentId?) =>
        this.renameFieldMethod(annotationId, name, documentId),
      shareField: (annotationId, targetAnnotationId, documentId?) =>
        this.shareFieldMethod(annotationId, targetAnnotationId, documentId),
      renderWidget: (options, documentId?) => this.renderWidget(options, documentId),
      selectField: (annotationId, documentId?) => this.selectFieldMethod(annotationId, documentId),
      deselectField: (documentId?) => this.deselectFieldMethod(documentId),
      getSelectedFieldId: (documentId?) => this.getSelectedFieldId(documentId),
      selectNextField: (documentId?) => this.selectNextFieldMethod(documentId),
      selectPreviousField: (documentId?) => this.selectPreviousFieldMethod(documentId),
      activateField: (documentId?) => this.activateFieldMethod(documentId),
      getState: (documentId?) => this.getDocumentState(documentId),
      getFieldGroup: (annotationId, documentId?) => this.getFieldGroup(annotationId, documentId),
      getFieldSiblings: (annotationId, documentId?) =>
        this.getFieldSiblings(annotationId, documentId),
      getFormValues: (documentId?) => this.getFormValuesMethod(documentId),
      getFormFields: (documentId?) => this.getFormFieldsMethod(documentId),
      setFormValues: (values, documentId?) => this.setFormValuesMethod(values, documentId),
      forDocument: (documentId) => this.createFormScope(documentId),
      onStateChange: this.state$.onGlobal,
      onFieldValueChange: this.fieldValueChange$.onGlobal,
      onFormReady: this.formReady$.onGlobal,
    };
  }

  private createFormScope(documentId: string): FormScope {
    return {
      getPageFormAnnoWidgets: (pageIndex) => this.getPageFormAnnoWidgets(pageIndex, documentId),
      setFormFieldValues: (pageIndex, annotation, newField) =>
        this.setFormFieldValues(pageIndex, annotation, newField, documentId),
      renameField: (annotationId, name) => this.renameFieldMethod(annotationId, name, documentId),
      shareField: (annotationId, targetAnnotationId) =>
        this.shareFieldMethod(annotationId, targetAnnotationId, documentId),
      renderWidget: (options) => this.renderWidget(options, documentId),
      selectField: (annotationId) => this.selectFieldMethod(annotationId, documentId),
      deselectField: () => this.deselectFieldMethod(documentId),
      getSelectedFieldId: () => this.getSelectedFieldId(documentId),
      selectNextField: () => this.selectNextFieldMethod(documentId),
      selectPreviousField: () => this.selectPreviousFieldMethod(documentId),
      activateField: () => this.activateFieldMethod(documentId),
      getState: () => this.getDocumentState(documentId),
      getFieldGroup: (annotationId) => this.getFieldGroup(annotationId, documentId),
      getFieldSiblings: (annotationId) => this.getFieldSiblings(annotationId, documentId),
      getFormValues: () => this.getFormValuesMethod(documentId),
      getFormFields: () => this.getFormFieldsMethod(documentId),
      setFormValues: (values) => this.setFormValuesMethod(values, documentId),
      onStateChange: this.state$.forScope(documentId),
      onFieldValueChange: this.fieldValueChange$.forScope(documentId),
      onFormReady: this.formReady$.forScope(documentId),
    };
  }

  private handleAnnotationEvent(event: AnnotationEvent): void {
    switch (event.type) {
      case 'loaded':
        this.buildFieldGroupIndex(event.documentId);
        this.formReady$.emit(event.documentId, this.getFormFieldsMethod(event.documentId));
        break;

      case 'create':
      case 'delete': {
        if (event.annotation.type !== PdfAnnotationSubtype.WIDGET) break;
        this.buildFieldGroupIndex(event.documentId);
        break;
      }

      case 'update': {
        if (!event.committed) break;
        const anno = event.annotation;
        if (anno.type !== PdfAnnotationSubtype.WIDGET) break;

        if (this.propagationInProgress.has(anno.id)) {
          this.propagationInProgress.delete(anno.id);
          break;
        }

        const patch = event.patch as Partial<PdfWidgetAnnoObject>;

        this.buildFieldGroupIndex(event.documentId);
        this.propagateFieldLevelChanges(event.documentId, anno, patch);
        break;
      }
    }
  }

  private propagateFieldLevelChanges(
    documentId: string,
    annotation: PdfAnnotationObject,
    patch: Partial<PdfWidgetAnnoObject>,
  ): void {
    if (!this.annotation || !patch.field) return;

    const fieldPatch = patch.field;

    const siblings = this.getFieldSiblings(annotation.id, documentId);
    if (siblings.length === 0) return;

    const siblingPatches: Array<{
      pageIndex: number;
      id: string;
      patch: Partial<PdfAnnotationObject>;
    }> = [];

    for (const sibling of siblings) {
      this.propagationInProgress.add(sibling.annotationId);
      siblingPatches.push({
        pageIndex: sibling.pageIndex,
        id: sibling.annotationId,
        patch: { field: { ...fieldPatch } } as Partial<PdfAnnotationObject>,
      });
    }

    this.annotation.forDocument(documentId).updateAnnotations(siblingPatches);
  }

  private buildFieldGroupIndex(documentId: string): void {
    if (!this.annotation) return;
    const annoState = this.annotation.forDocument(documentId).getState();
    if (!annoState) return;

    const idx = new Map<string, FieldGroupEntry[]>();
    const allWidgets: { entry: FieldGroupEntry; widget: PdfWidgetAnnoObject }[] = [];

    for (const [pageStr, uids] of Object.entries(annoState.pages)) {
      const pageIndex = Number(pageStr);
      for (const uid of uids) {
        const tracked = annoState.byUid[uid];
        if (!tracked || tracked.object.type !== PdfAnnotationSubtype.WIDGET) continue;
        const widget = tracked.object as PdfWidgetAnnoObject;

        const entry: FieldGroupEntry = { annotationId: uid, pageIndex };
        allWidgets.push({ entry, widget });

        const fieldKey = this.getFieldKey(widget.field);
        if (!fieldKey) continue;

        const group = idx.get(fieldKey) ?? [];
        group.push(entry);
        idx.set(fieldKey, group);
      }
    }

    this.fieldGroupIndex.set(documentId, idx);

    const nameIdx = new Map<string, FieldGroupEntry[]>();
    for (const { entry, widget } of allWidgets) {
      const name = widget.field.name.trim();
      if (!name) continue;
      const group = nameIdx.get(name) ?? [];
      group.push(entry);
      nameIdx.set(name, group);
    }
    this.fieldNameIndex.set(documentId, nameIdx);

    const navigable = allWidgets.filter(
      ({ widget }) => !(widget.field.flag & PDF_FORM_FIELD_FLAG.READONLY),
    );
    this.orderedFieldIndex.set(
      documentId,
      navigable.map(({ entry }) => entry),
    );
  }

  private getDocumentState(documentId?: string): FormDocumentState {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? { ...initialDocumentState };
  }

  // ─────────────────────────────────────────────────────────
  // Field Group Index
  // ─────────────────────────────────────────────────────────

  private getDocIndex(documentId: string): Map<string, FieldGroupEntry[]> {
    let idx = this.fieldGroupIndex.get(documentId);
    if (!idx) {
      idx = new Map();
      this.fieldGroupIndex.set(documentId, idx);
    }
    return idx;
  }

  private getFieldKey(field: PdfWidgetAnnoField): string | null {
    if (typeof field.fieldObjectId === 'number' && field.fieldObjectId > 0) {
      return `field:${field.fieldObjectId}`;
    }

    const normalizedName = field.name.trim();
    if (!normalizedName) return null;

    return `legacy:${field.type}:${normalizedName}`;
  }

  private resolveWidgetAnnotation(
    annotationId: string,
    documentId: string,
  ): PdfWidgetAnnoObject | null {
    if (!this.annotation) return null;

    const annoState = this.annotation.forDocument(documentId).getState();
    const tracked = annoState?.byUid[annotationId];
    if (!tracked || tracked.object.type !== PdfAnnotationSubtype.WIDGET) {
      return null;
    }

    return tracked.object as PdfWidgetAnnoObject;
  }

  public getFieldGroup(annotationId: string, documentId?: string): FieldGroupEntry[] {
    const docId = documentId ?? this.getActiveDocumentId();
    const widget = this.resolveWidgetAnnotation(annotationId, docId);
    if (!widget) return [];

    const fieldKey = this.getFieldKey(widget.field);
    if (!fieldKey) {
      return [{ annotationId: widget.id, pageIndex: widget.pageIndex }];
    }

    return (
      this.getDocIndex(docId).get(fieldKey) ?? [
        { annotationId: widget.id, pageIndex: widget.pageIndex },
      ]
    );
  }

  public getFieldSiblings(annotationId: string, documentId?: string): FieldGroupEntry[] {
    return this.getFieldGroup(annotationId, documentId).filter(
      (e) => e.annotationId !== annotationId,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Form Values API
  // ─────────────────────────────────────────────────────────

  private getFormValuesMethod(documentId?: string): Record<string, string> {
    const docId = documentId ?? this.getActiveDocumentId();
    const nameIdx = this.fieldNameIndex.get(docId);
    if (!nameIdx) return {};

    const values: Record<string, string> = {};
    for (const [name, entries] of nameIdx) {
      const widget = this.resolveWidgetAnnotation(entries[0].annotationId, docId);
      if (widget) {
        values[name] = widget.field.value;
      }
    }
    return values;
  }

  private getFormFieldsMethod(documentId?: string): FormFieldInfo[] {
    const docId = documentId ?? this.getActiveDocumentId();
    const nameIdx = this.fieldNameIndex.get(docId);
    if (!nameIdx) return [];

    const fields: FormFieldInfo[] = [];
    for (const [name, entries] of nameIdx) {
      const widget = this.resolveWidgetAnnotation(entries[0].annotationId, docId);
      if (!widget) continue;

      fields.push({
        name,
        type: widget.field.type,
        value: widget.field.value,
        readOnly: !!(widget.field.flag & PDF_FORM_FIELD_FLAG.READONLY),
        ...('options' in widget.field && widget.field.options
          ? { options: widget.field.options }
          : {}),
      });
    }
    return fields;
  }

  private setFormValuesMethod(
    values: Record<string, string>,
    documentId?: string,
  ): PdfTask<boolean> {
    const docId = documentId ?? this.getActiveDocumentId();
    const nameIdx = this.fieldNameIndex.get(docId);
    if (!nameIdx) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'no form fields indexed for this document',
      });
    }

    const entries = Object.entries(values);
    if (entries.length === 0) {
      return PdfTaskHelper.resolve(true);
    }

    const resultTask = new Task<boolean, PdfErrorReason>();
    let pending = entries.length;
    let failed = false;

    const onComplete = () => {
      pending--;
      if (pending === 0 && !failed) {
        resultTask.resolve(true);
      }
    };

    const onError = (err: { code: PdfErrorCode; message: string }) => {
      if (!failed) {
        failed = true;
        resultTask.reject(err);
      }
    };

    for (const [name, value] of entries) {
      const fieldEntries = nameIdx.get(name);
      if (!fieldEntries || fieldEntries.length === 0) {
        onComplete();
        continue;
      }

      let targetEntry = fieldEntries[0];
      let widget = this.resolveWidgetAnnotation(targetEntry.annotationId, docId);
      if (!widget) {
        onComplete();
        continue;
      }

      if (
        widget.field.type === PDF_FORM_FIELD_TYPE.RADIOBUTTON ||
        widget.field.type === PDF_FORM_FIELD_TYPE.CHECKBOX
      ) {
        for (const entry of fieldEntries) {
          const w = this.resolveWidgetAnnotation(entry.annotationId, docId);
          if (w && w.exportValue === value) {
            widget = w;
            targetEntry = entry;
            break;
          }
        }
      }

      this.setFormFieldValues(
        targetEntry.pageIndex,
        widget,
        this.buildImportField(widget, value),
        docId,
      ).wait(
        () => onComplete(),
        (error) => onError(error.reason),
      );
    }

    return resultTask;
  }

  private buildImportField(widget: PdfWidgetAnnoObject, value: string): PdfWidgetAnnoField {
    const field = widget.field;

    if (
      (field.type === PDF_FORM_FIELD_TYPE.COMBOBOX || field.type === PDF_FORM_FIELD_TYPE.LISTBOX) &&
      'options' in field
    ) {
      return {
        ...field,
        value,
        options: field.options.map((opt) => ({
          ...opt,
          isSelected: opt.label === value,
        })),
      };
    }

    if (field.type === PDF_FORM_FIELD_TYPE.CHECKBOX) {
      const normalizedValue = value === 'Off' ? 'Off' : (widget.exportValue ?? 'Yes');
      return { ...field, value: normalizedValue };
    }

    return { ...field, value };
  }

  private isToggleField(
    field: PdfWidgetAnnoField,
  ): field is PdfCheckboxWidgetAnnoField | PdfRadioButtonWidgetAnnoField {
    return (
      field.type === PDF_FORM_FIELD_TYPE.CHECKBOX || field.type === PDF_FORM_FIELD_TYPE.RADIOBUTTON
    );
  }

  private shouldRegenerateWidgetAppearances(field: PdfWidgetAnnoField): boolean {
    return !this.isToggleField(field);
  }

  private getFieldBatchTarget(
    batch: Map<string, { widget: PdfWidgetAnnoObject; pageIndex: number }>,
  ): { widget: PdfWidgetAnnoObject; pageIndex: number } | undefined {
    const entries = [...batch.values()];
    const checkedToggleEntry = entries.find(
      (entry) => this.isToggleField(entry.widget.field) && isWidgetChecked(entry.widget),
    );
    return checkedToggleEntry ?? entries[0];
  }

  private async readFieldWidgets(
    doc: PdfDocumentObject,
    groupEntries: FieldGroupEntry[],
    seq: TaskSequence<PdfErrorReason, unknown>,
    regenerateAppearances: boolean,
  ): Promise<Map<string, { widget: PdfWidgetAnnoObject; pageIndex: number }>> {
    const pageSet = new Set(groupEntries.map((entry) => entry.pageIndex));
    const memberIds = new Set(groupEntries.map((entry) => entry.annotationId));
    const batch = new Map<string, { widget: PdfWidgetAnnoObject; pageIndex: number }>();

    for (const pageIndex of pageSet) {
      const page = doc.pages.find((entry) => entry.index === pageIndex);
      if (!page) continue;

      const pageMemberIds = groupEntries
        .filter((entry) => entry.pageIndex === pageIndex)
        .map((entry) => entry.annotationId);

      if (regenerateAppearances) {
        await seq.run(() => this.engine.regenerateWidgetAppearances(doc, page, pageMemberIds));
      }

      const widgets = await seq.run(() => this.engine.getPageAnnoWidgets(doc, page));
      for (const widget of widgets) {
        if (memberIds.has(widget.id)) {
          batch.set(widget.id, { widget, pageIndex });
        }
      }
    }

    return batch;
  }

  private syncFieldBatch(
    documentId: string,
    batch: Map<string, { widget: PdfWidgetAnnoObject; pageIndex: number }>,
    options: { emitFieldValueChanges?: boolean } = {},
  ): void {
    if (!this.annotation) return;

    for (const [id, { widget, pageIndex }] of batch) {
      this.annotation.syncAnnotationObject(id, widget, documentId);
      this.annotation.invalidatePageAppearances(pageIndex, documentId);

      if (options.emitFieldValueChanges) {
        this.fieldValueChange$.emit(documentId, {
          documentId,
          pageIndex,
          annotationId: id,
          widget,
        });
      }
    }

    this.buildFieldGroupIndex(documentId);
  }

  private resolveWidgetPage(
    annotationId: string,
    documentId: string,
    doc: PdfDocumentObject,
  ): { widget: PdfWidgetAnnoObject; page: PdfDocumentObject['pages'][number] } | null {
    const widget = this.resolveWidgetAnnotation(annotationId, documentId);
    if (!widget) return null;

    const page = doc.pages.find((entry) => entry.index === widget.pageIndex);
    if (!page) return null;

    return { widget, page };
  }

  private getPageFormAnnoWidgets(
    pageIndex: number,
    documentId?: string,
  ): PdfTask<PdfWidgetAnnoObject[]> {
    const docState = this.getCoreDocumentOrThrow(documentId);
    const doc = docState.document;

    if (!doc) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document is not open',
      });
    }

    const page = doc.pages.find((p) => p.index === pageIndex);
    if (!page) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'page does not exist',
      });
    }

    return this.engine.getPageAnnoWidgets(doc, page);
  }

  private setFormFieldValues(
    pageIndex: number,
    annotation: PdfWidgetAnnoObject,
    newField: PdfWidgetAnnoField,
    documentId?: string,
  ): PdfTask<boolean> {
    const docId = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.getCoreDocumentOrThrow(docId);
    const doc = coreDoc.document;

    if (!doc) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document is not open',
      });
    }

    const page = doc.pages.find((p) => p.index === pageIndex);
    if (!page) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'page does not exist',
      });
    }

    const resultTask = new Task<boolean, PdfErrorReason>();
    const seq = new TaskSequence(resultTask);

    seq.execute(
      async () => {
        // 1. Snapshot "before" state for the entire field group
        const groupEntries = this.getFieldGroup(annotation.id, docId);
        const beforeEntries = await this.readFieldWidgets(doc, groupEntries, seq, false);

        // 2. Apply field state change to the engine (PDFium propagates to all controls)
        await seq.run(() => this.engine.setFormFieldState(doc, page, annotation, newField));

        // 3. Re-read fresh state for all group members, regenerating AP only when needed
        const afterEntries = await this.readFieldWidgets(
          doc,
          groupEntries,
          seq,
          this.shouldRegenerateWidgetAppearances(newField),
        );

        // 5. Build and register history command
        let isFirstExecution = true;

        const applyToEngine = async (
          batch: Map<string, { widget: PdfWidgetAnnoObject; pageIndex: number }>,
        ) => {
          const target = this.getFieldBatchTarget(batch);
          if (!target) return;
          const pg = doc.pages.find((p) => p.index === target.pageIndex);
          if (!pg) return;
          await new Promise<void>((resolve) => {
            this.engine.setFormFieldState(doc, pg, target.widget, target.widget.field).wait(
              () => resolve(),
              () => resolve(),
            );
          });

          if (this.shouldRegenerateWidgetAppearances(target.widget.field)) {
            for (const pi of new Set([...batch.values()].map((entry) => entry.pageIndex))) {
              const p = doc.pages.find((pp) => pp.index === pi);
              if (!p) continue;
              const ids = [...batch.entries()]
                .filter(([, entry]) => entry.pageIndex === pi)
                .map(([id]) => id);
              await new Promise<void>((resolve) => {
                this.engine.regenerateWidgetAppearances(doc, p, ids).wait(
                  () => resolve(),
                  () => resolve(),
                );
              });
            }
          }
        };

        const command: Command = {
          execute: () => {
            const skipEngine = isFirstExecution;
            isFirstExecution = false;

            if (skipEngine) {
              this.syncFieldBatch(docId, afterEntries, { emitFieldValueChanges: true });
            } else {
              applyToEngine(afterEntries).then(() =>
                this.syncFieldBatch(docId, afterEntries, { emitFieldValueChanges: true }),
              );
            }
          },

          undo: () => {
            applyToEngine(beforeEntries).then(() =>
              this.syncFieldBatch(docId, beforeEntries, { emitFieldValueChanges: true }),
            );
          },
        };

        if (this.history) {
          this.history.forDocument(docId).register(command, this.FORM_HISTORY_TOPIC);
        } else {
          command.execute();
        }

        resultTask.resolve(true);
      },
      (err) => ({ code: PdfErrorCode.Unknown, message: String(err) }),
    );

    return resultTask;
  }

  private findConflictingFieldGroups(
    normalizedName: string,
    sourceAnnotationId: string,
    documentId: string,
  ): Map<string, { entries: FieldGroupEntry[]; widget: PdfWidgetAnnoObject }> {
    const result = new Map<string, { entries: FieldGroupEntry[]; widget: PdfWidgetAnnoObject }>();
    if (!this.annotation) return result;

    const annoState = this.annotation.forDocument(documentId).getState();
    if (!annoState) return result;

    const sourceFieldKey = (() => {
      const w = this.resolveWidgetAnnotation(sourceAnnotationId, documentId);
      return w ? this.getFieldKey(w.field) : null;
    })();

    for (const [pageStr, uids] of Object.entries(annoState.pages)) {
      const pageIndex = Number(pageStr);
      for (const uid of uids) {
        const tracked = annoState.byUid[uid];
        if (!tracked || tracked.object.type !== PdfAnnotationSubtype.WIDGET) continue;
        const widget = tracked.object as PdfWidgetAnnoObject;
        if (widget.field.name.trim() !== normalizedName) continue;

        const fieldKey = this.getFieldKey(widget.field);
        if (!fieldKey || fieldKey === sourceFieldKey) continue;

        if (!result.has(fieldKey)) {
          result.set(fieldKey, { entries: [], widget });
        }
        result.get(fieldKey)!.entries.push({ annotationId: uid, pageIndex });
      }
    }

    return result;
  }

  private renameFieldMethod(
    annotationId: string,
    name: string,
    documentId?: string,
  ): PdfTask<RenameFieldResult> {
    const docId = documentId ?? this.getActiveDocumentId();
    const normalizedName = name.trim();
    if (!normalizedName) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: 'Field name must not be empty.',
      });
    }

    const coreDoc = this.getCoreDocumentOrThrow(docId);
    const doc = coreDoc.document;
    if (!doc) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document is not open',
      });
    }

    const source = this.resolveWidgetPage(annotationId, docId, doc);
    if (!source) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'widget annotation not found',
      });
    }

    if (source.widget.field.name.trim() === normalizedName) {
      return PdfTaskHelper.resolve<RenameFieldResult>({ outcome: 'no-op' });
    }

    const conflicts = this.findConflictingFieldGroups(normalizedName, annotationId, docId);

    if (conflicts.size > 0) {
      if (conflicts.size > 1) {
        return PdfTaskHelper.reject({
          code: PdfErrorCode.Unknown,
          message: 'That field name is used by multiple fields. Choose a unique name.',
        });
      }

      const [, match] = [...conflicts.entries()][0];

      if (match.widget.field.type !== source.widget.field.type) {
        return PdfTaskHelper.reject({
          code: PdfErrorCode.Unknown,
          message: 'That field name is already used by a different widget type.',
        });
      }

      return PdfTaskHelper.resolve<RenameFieldResult>({
        outcome: 'conflict',
        targetAnnotationId: match.entries[0].annotationId,
        fieldName: normalizedName,
      });
    }

    const resultTask = new Task<RenameFieldResult, PdfErrorReason>();
    const seq = new TaskSequence(resultTask);

    seq.execute(
      async () => {
        const groupEntries = this.getFieldGroup(annotationId, docId);
        await seq.run(() =>
          this.engine.renameWidgetField(doc, source.page, source.widget, normalizedName),
        );

        const syncedEntries = await this.readFieldWidgets(doc, groupEntries, seq, false);
        this.syncFieldBatch(docId, syncedEntries);
        resultTask.resolve({ outcome: 'renamed' });
      },
      (err) => ({ code: PdfErrorCode.Unknown, message: String(err) }),
    );

    return resultTask;
  }

  private shareFieldMethod(
    annotationId: string,
    targetAnnotationId: string,
    documentId?: string,
  ): PdfTask<boolean> {
    const docId = documentId ?? this.getActiveDocumentId();
    if (annotationId === targetAnnotationId) {
      return PdfTaskHelper.resolve(true);
    }

    const coreDoc = this.getCoreDocumentOrThrow(docId);
    const doc = coreDoc.document;
    if (!doc) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document is not open',
      });
    }

    const source = this.resolveWidgetPage(annotationId, docId, doc);
    const target = this.resolveWidgetPage(targetAnnotationId, docId, doc);
    if (!source || !target) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'widget annotation not found',
      });
    }

    if (source.widget.field.type !== target.widget.field.type) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: 'cannot share fields with different widget types',
      });
    }

    if (
      source.widget.field.fieldObjectId &&
      target.widget.field.fieldObjectId &&
      source.widget.field.fieldObjectId === target.widget.field.fieldObjectId
    ) {
      return PdfTaskHelper.resolve(true);
    }

    const affectedEntryMap = new Map<string, FieldGroupEntry>();
    for (const entry of this.getFieldGroup(annotationId, docId)) {
      affectedEntryMap.set(entry.annotationId, entry);
    }
    for (const entry of this.getFieldGroup(targetAnnotationId, docId)) {
      affectedEntryMap.set(entry.annotationId, entry);
    }

    const affectedEntries = [...affectedEntryMap.values()];
    const resultTask = new Task<boolean, PdfErrorReason>();
    const seq = new TaskSequence(resultTask);

    seq.execute(
      async () => {
        await seq.run(() =>
          this.engine.shareWidgetField(doc, source.page, source.widget, target.page, target.widget),
        );

        const syncedEntries = await this.readFieldWidgets(
          doc,
          affectedEntries,
          seq,
          this.shouldRegenerateWidgetAppearances(target.widget.field),
        );
        this.syncFieldBatch(docId, syncedEntries);
        resultTask.resolve(true);
      },
      (err) => ({ code: PdfErrorCode.Unknown, message: String(err) }),
    );

    return resultTask;
  }

  private selectFieldMethod(annotationId: string, documentId?: string): void {
    const docId = documentId ?? this.getActiveDocumentId();
    this.dispatch(selectFieldAction(docId, annotationId));
  }

  private deselectFieldMethod(documentId?: string): void {
    const docId = documentId ?? this.getActiveDocumentId();
    this.dispatch(deselectFieldAction(docId));
  }

  private getSelectedFieldId(documentId?: string): string | null {
    return this.getDocumentState(documentId).selectedFieldId;
  }

  private selectNextFieldMethod(documentId?: string): void {
    const docId = documentId ?? this.getActiveDocumentId();
    const ordered = this.orderedFieldIndex.get(docId);
    if (!ordered || ordered.length === 0) return;

    const currentId = this.getSelectedFieldId(docId);
    let nextIndex = 0;
    if (currentId) {
      const currentIndex = ordered.findIndex((e) => e.annotationId === currentId);
      nextIndex = currentIndex >= 0 ? (currentIndex + 1) % ordered.length : 0;
    }

    const next = ordered[nextIndex];
    this.dispatch(selectFieldAction(docId, next.annotationId));
  }

  private selectPreviousFieldMethod(documentId?: string): void {
    const docId = documentId ?? this.getActiveDocumentId();
    const ordered = this.orderedFieldIndex.get(docId);
    if (!ordered || ordered.length === 0) return;

    const currentId = this.getSelectedFieldId(docId);
    let prevIndex = ordered.length - 1;
    if (currentId) {
      const currentIndex = ordered.findIndex((e) => e.annotationId === currentId);
      prevIndex =
        currentIndex >= 0
          ? (currentIndex - 1 + ordered.length) % ordered.length
          : ordered.length - 1;
    }

    const prev = ordered[prevIndex];
    this.dispatch(selectFieldAction(docId, prev.annotationId));
  }

  private activateFieldMethod(documentId?: string): void {
    const docId = documentId ?? this.getActiveDocumentId();
    const selectedId = this.getSelectedFieldId(docId);
    if (!selectedId) return;

    const widget = this.resolveWidgetAnnotation(selectedId, docId);
    if (!widget) return;

    const field = widget.field;
    if (field.type === PDF_FORM_FIELD_TYPE.CHECKBOX) {
      const checked = isWidgetChecked(widget);
      const newValue = checked ? 'Off' : (widget.exportValue ?? 'Yes');
      this.setFormFieldValues(widget.pageIndex, widget, { ...field, value: newValue }, docId);
    } else if (field.type === PDF_FORM_FIELD_TYPE.RADIOBUTTON) {
      if (!isWidgetChecked(widget) && widget.exportValue) {
        this.setFormFieldValues(
          widget.pageIndex,
          widget,
          { ...field, value: widget.exportValue },
          docId,
        );
      }
    }
  }

  private renderWidget(
    options: RenderWidgetOptions,
    documentId?: string,
  ): Task<Blob, PdfErrorReason> {
    if (!this.annotation) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'annotation plugin not found',
      });
    }

    const id = documentId ?? this.getActiveDocumentId();
    return this.annotation.forDocument(id).renderAnnotation(options);
  }

  async destroy(): Promise<void> {
    this.state$.clear();
    this.fieldValueChange$.clear();
    this.formReady$.clear();
    super.destroy();
  }
}
