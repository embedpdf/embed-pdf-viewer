import {
  BasePlugin,
  createBehaviorEmitter,
  createEmitter,
  Listener,
  PluginRegistry,
} from '@embedpdf/core';
import {
  FieldValueChangeEvent,
  FormCapability,
  FormDocumentState,
  FormPluginConfig,
  FormScope,
  FormState,
  FormStateChangeEvent,
  RenderWidgetOptions,
} from './types';
import {
  FormAction,
  initFormState,
  cleanupFormState,
  setFieldWidgetsBatch,
  selectField as selectFieldAction,
  deselectField as deselectFieldAction,
} from './actions';
import {
  PDF_FORM_FIELD_TYPE,
  PdfErrorCode,
  PdfErrorReason,
  PdfTask,
  PdfTaskHelper,
  PdfWidgetAnnoField,
  PdfWidgetAnnoObject,
  Task,
  TaskSequence,
} from '@embedpdf/models';
import { AnnotationCapability, AnnotationPlugin } from '@embedpdf/plugin-annotation';
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

  private readonly state$ = createBehaviorEmitter<FormStateChangeEvent>();
  private readonly fieldValueChange$ = createEmitter<FieldValueChangeEvent>();

  constructor(id: string, registry: PluginRegistry, _config: FormPluginConfig) {
    super(id, registry);

    this.annotation = registry.getPlugin<AnnotationPlugin>('annotation')?.provides() ?? null;
    this.history = registry.getPlugin<HistoryPlugin>(HistoryPlugin.id)?.provides() ?? null;

    if (this.annotation) {
      for (const tool of formTools) {
        this.annotation.addTool(tool);
      }
    }
  }

  async initialize(): Promise<void> {}

  protected override onDocumentLoadingStarted(documentId: string): void {
    this.dispatch(initFormState(documentId, { ...initialDocumentState }));
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupFormState(documentId));
  }

  override onStoreUpdated(prev: FormState, next: FormState): void {
    for (const documentId in next.documents) {
      const prevDoc = prev.documents[documentId];
      const nextDoc = next.documents[documentId];
      if (prevDoc !== nextDoc) {
        this.state$.emit({ documentId, state: nextDoc });
      }
    }
  }

  protected buildCapability(): FormCapability {
    return {
      getPageFormAnnoWidgets: (pageIndex, documentId?) =>
        this.getPageFormAnnoWidgets(pageIndex, documentId),
      setFormFieldValues: (pageIndex, annotation, newField, documentId?) =>
        this.setFormFieldValues(pageIndex, annotation, newField, documentId),
      renderWidget: (options, documentId?) => this.renderWidget(options, documentId),
      selectField: (annotationId, documentId?) => this.selectFieldMethod(annotationId, documentId),
      deselectField: (documentId?) => this.deselectFieldMethod(documentId),
      getSelectedFieldId: (documentId?) => this.getSelectedFieldId(documentId),
      getState: (documentId?) => this.getDocumentState(documentId),
      forDocument: (documentId) => this.createFormScope(documentId),
      onStateChange: this.state$.on,
      onFieldValueChange: this.fieldValueChange$.on,
    };
  }

  private createFormScope(documentId: string): FormScope {
    return {
      getPageFormAnnoWidgets: (pageIndex) => this.getPageFormAnnoWidgets(pageIndex, documentId),
      setFormFieldValues: (pageIndex, annotation, newField) =>
        this.setFormFieldValues(pageIndex, annotation, newField, documentId),
      renderWidget: (options) => this.renderWidget(options, documentId),
      selectField: (annotationId) => this.selectFieldMethod(annotationId, documentId),
      deselectField: () => this.deselectFieldMethod(documentId),
      getSelectedFieldId: () => this.getSelectedFieldId(documentId),
      getState: () => this.getDocumentState(documentId),
      onStateChange: (listener: Listener<FormDocumentState>) =>
        this.state$.on((event) => {
          if (event.documentId === documentId) listener(event.state);
        }),
      onFieldValueChange: (listener: Listener<FieldValueChangeEvent>) =>
        this.fieldValueChange$.on((event) => {
          if (event.documentId === documentId) listener(event);
        }),
    };
  }

  private getDocumentState(documentId?: string): FormDocumentState {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? { ...initialDocumentState };
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
        // Step 1: Snapshot "before" widget state
        const beforeWidgets = await seq.run(() => this.engine.getPageAnnoWidgets(doc, page));

        // Step 2: Apply the new field state to the engine
        await seq.run(() => this.engine.setFormFieldState(doc, page, annotation, newField));

        // Step 3: Re-fetch to discover side-effects (e.g. radio group mutual exclusion)
        const afterWidgets = await seq.run(() => this.engine.getPageAnnoWidgets(doc, page));

        // Step 4: Find all annotations whose state changed
        const changedIds = this.diffWidgets(beforeWidgets, afterWidgets);

        if (changedIds.length === 0) {
          resultTask.resolve(true);
          return;
        }

        // Build before/after widget snapshot maps for all affected annotations
        const afterBatch: Record<string, PdfWidgetAnnoObject> = {};
        const beforeBatch: Record<string, PdfWidgetAnnoObject> = {};
        for (const id of changedIds) {
          const afterWidget = afterWidgets.find((w) => w.id === id);
          const beforeWidget = beforeWidgets.find((w) => w.id === id);
          if (afterWidget) afterBatch[id] = afterWidget;
          if (beforeWidget) beforeBatch[id] = beforeWidget;
        }

        // Emit field-value-change events for all affected annotations
        const emitChanges = (batch: Record<string, PdfWidgetAnnoObject>) => {
          for (const id of changedIds) {
            const widget = batch[id];
            if (widget) {
              this.fieldValueChange$.emit({
                documentId: docId,
                pageIndex,
                annotationId: id,
                widget,
              });
            }
          }
        };

        // Apply a batch of widget snapshots back to the engine.
        // For toggle fields (radio groups), we apply the widget that should be checked —
        // PDFium then handles mutual exclusion for the group automatically.
        const applyToEngine = (batch: Record<string, PdfWidgetAnnoObject>, onDone: () => void) => {
          const checkedWidget = Object.values(batch).find(
            (w) => 'isChecked' in w.field && w.field.isChecked,
          );
          const targetWidget = checkedWidget ?? Object.values(batch)[0];

          if (targetWidget) {
            this.engine.setFormFieldState(doc, page, targetWidget, targetWidget.field).wait(
              () => onDone(),
              () => onDone(),
            );
          } else {
            onDone();
          }
        };

        // Step 5: Build and register history command
        let isFirstExecution = true;

        const command: Command = {
          execute: () => {
            const skipEngine = isFirstExecution;
            isFirstExecution = false;

            if (skipEngine) {
              // First execution: engine is already in the correct state.
              this.dispatch(setFieldWidgetsBatch(docId, afterBatch));
              emitChanges(afterBatch);
            } else {
              // Redo: re-apply to engine, then update store and emit.
              this.dispatch(setFieldWidgetsBatch(docId, afterBatch));
              applyToEngine(afterBatch, () => emitChanges(afterBatch));
            }
          },

          undo: () => {
            this.dispatch(setFieldWidgetsBatch(docId, beforeBatch));
            applyToEngine(beforeBatch, () => emitChanges(beforeBatch));
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

  /**
   * Compare two widget snapshots and return the IDs of annotations whose
   * state changed. Handles text, toggle, and multi-select choice fields.
   */
  private diffWidgets(before: PdfWidgetAnnoObject[], after: PdfWidgetAnnoObject[]): string[] {
    const changedIds: string[] = [];
    const afterMap = new Map(after.map((w) => [w.id, w]));

    for (const beforeWidget of before) {
      const afterWidget = afterMap.get(beforeWidget.id);
      if (!afterWidget) continue;

      const bField = beforeWidget.field;
      const aField = afterWidget.field;

      if ('isChecked' in bField && 'isChecked' in aField) {
        if (bField.isChecked !== aField.isChecked) {
          changedIds.push(beforeWidget.id);
        }
      } else if (
        bField.type === PDF_FORM_FIELD_TYPE.COMBOBOX ||
        bField.type === PDF_FORM_FIELD_TYPE.LISTBOX
      ) {
        const bOpts = bField.options;
        const aOpts = (aField as typeof bField).options;
        if (bOpts.some((opt, i) => opt.isSelected !== aOpts[i]?.isSelected)) {
          changedIds.push(beforeWidget.id);
        }
      } else if (bField.value !== aField.value) {
        changedIds.push(beforeWidget.id);
      }
    }

    return changedIds;
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
    super.destroy();
  }
}
