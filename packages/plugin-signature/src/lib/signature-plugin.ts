import { BasePlugin, createEmitter, createScopedEmitter, PluginRegistry } from '@embedpdf/core';
import { uuidV4 } from '@embedpdf/models';
import { AnnotationCapability, AnnotationPlugin } from '@embedpdf/plugin-annotation';
import {
  SignatureCapability,
  SignatureScope,
  SignatureEntry,
  SignatureFieldKind,
  SignatureCreationType,
  SignaturePluginConfig,
  SignatureState,
  ActivePlacementInfo,
  ActivePlacementChangeEvent,
} from './types';
import { addSignatureEntry, removeSignatureEntry, SignatureAction } from './actions';
import { SIGNATURE_PLUGIN_ID } from './manifest';
import { SIGNATURE_STAMP_TOOL_ID, SIGNATURE_INK_TOOL_ID, signatureTools } from './tools';

export class SignaturePlugin extends BasePlugin<
  SignaturePluginConfig,
  SignatureCapability,
  SignatureState,
  SignatureAction
> {
  static readonly id = SIGNATURE_PLUGIN_ID;

  private readonly entries = new Map<string, SignatureEntry>();
  private readonly entriesChange$ = createEmitter<SignatureEntry[]>();
  private readonly activePlacement$ = createScopedEmitter<
    ActivePlacementInfo | null,
    ActivePlacementChangeEvent,
    string
  >((documentId, activePlacement) => ({ documentId, activePlacement }));

  private annotation: AnnotationCapability | null = null;
  private toolChangeUnsubscribe: (() => void) | null = null;
  private currentGhostUrl: string | null = null;

  constructor(
    id: string,
    registry: PluginRegistry,
    private config: SignaturePluginConfig,
  ) {
    super(id, registry);

    this.annotation = registry.getPlugin<AnnotationPlugin>('annotation')?.provides() ?? null;
    if (this.annotation) {
      for (const tool of signatureTools) {
        this.annotation.addTool(tool);
      }
      this.toolChangeUnsubscribe = this.annotation.onActiveToolChange(({ documentId, tool }) => {
        if (tool?.id !== SIGNATURE_STAMP_TOOL_ID && tool?.id !== SIGNATURE_INK_TOOL_ID) {
          this.revokeGhostUrl();
          this.activePlacement$.emit(documentId, null);
        }
      });
    }
  }

  async initialize(): Promise<void> {}

  protected buildCapability(): SignatureCapability {
    return {
      mode: this.config.mode,
      getEntries: () => this.getEntries(),
      addEntry: (entry) => this.addEntry(entry),
      removeEntry: (id) => this.removeEntry(id),
      loadEntries: (entries) => this.loadEntries(entries),
      exportEntries: () => this.exportEntries(),
      onEntriesChange: this.entriesChange$.on,
      forDocument: (documentId) => this.createSignatureScope(documentId),
      onActivePlacementChange: this.activePlacement$.onGlobal,
    };
  }

  getEntries(): SignatureEntry[] {
    return Array.from(this.entries.values());
  }

  addEntry(entry: Omit<SignatureEntry, 'id' | 'createdAt'>): string {
    const id = uuidV4();
    const fullEntry: SignatureEntry = {
      ...entry,
      id,
      createdAt: Date.now(),
    };

    this.entries.set(id, fullEntry);
    this.dispatch(addSignatureEntry(id));
    this.emitEntriesChange();

    return id;
  }

  removeEntry(id: string): void {
    if (!this.entries.has(id)) return;

    this.entries.delete(id);
    this.dispatch(removeSignatureEntry(id));
    this.emitEntriesChange();
  }

  loadEntries(entries: SignatureEntry[]): void {
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
      this.dispatch(addSignatureEntry(entry.id));
    }

    this.emitEntriesChange();
  }

  exportEntries(): SignatureEntry[] {
    return this.getEntries();
  }

  private createSignatureScope(documentId: string): SignatureScope {
    return {
      activateSignaturePlacement: (entryId) =>
        this.activatePlacement(documentId, entryId, SignatureFieldKind.Signature),
      activateInitialsPlacement: (entryId) =>
        this.activatePlacement(documentId, entryId, SignatureFieldKind.Initials),
      deactivatePlacement: () => this.deactivatePlacement(documentId),
      getActivePlacement: () => this.activePlacement$.getValue(documentId) ?? null,
      onActivePlacementChange: this.activePlacement$.forScope(documentId),
    };
  }

  private activatePlacement(documentId: string, entryId: string, kind: SignatureFieldKind): void {
    const entry = this.entries.get(entryId);
    if (!entry || !this.annotation) return;

    const field = kind === SignatureFieldKind.Initials ? entry.initials : entry.signature;
    if (!field) return;

    this.revokeGhostUrl();

    if (field.creationType === SignatureCreationType.Draw) {
      if (entry.signature.creationType !== SignatureCreationType.Draw) return;
      const defaultSize = this.config.defaultSize ?? { width: 150, height: 50 };
      const referenceSize = entry.signature.inkData.size;
      const scale = Math.min(
        defaultSize.width / referenceSize.width,
        defaultSize.height / referenceSize.height,
      );
      const targetSize = {
        width: field.inkData.size.width * scale,
        height: field.inkData.size.height * scale,
      };

      this.annotation.setActiveTool(SIGNATURE_INK_TOOL_ID, {
        inkData: field.inkData,
        targetSize,
        entryId,
        kind,
      });
    } else {
      if (!field.imageData) return;

      const ghostUrl = URL.createObjectURL(
        new Blob([field.imageData], { type: field.imageMimeType ?? 'image/png' }),
      );
      this.currentGhostUrl = ghostUrl;

      const defaultSize = this.config.defaultSize ?? { width: 150, height: 50 };
      let targetSize = defaultSize;
      if (field.imageSize) {
        const referenceSize =
          entry.signature.creationType !== SignatureCreationType.Draw
            ? (entry.signature.imageSize ?? field.imageSize)
            : field.imageSize;
        const scale = Math.min(
          defaultSize.width / referenceSize.width,
          defaultSize.height / referenceSize.height,
        );
        targetSize = {
          width: field.imageSize.width * scale,
          height: field.imageSize.height * scale,
        };
      }

      this.annotation.setActiveTool(SIGNATURE_STAMP_TOOL_ID, {
        imageData: field.imageData,
        ghostUrl,
        targetSize,
        entryId,
        kind,
      });
    }

    this.activePlacement$.emit(documentId, { entryId, kind });
  }

  private deactivatePlacement(documentId: string): void {
    if (!this.annotation) return;
    this.annotation.setActiveTool(null);
    this.revokeGhostUrl();
    this.activePlacement$.emit(documentId, null);
  }

  private revokeGhostUrl(): void {
    if (this.currentGhostUrl) {
      URL.revokeObjectURL(this.currentGhostUrl);
      this.currentGhostUrl = null;
    }
  }

  private emitEntriesChange(): void {
    this.entriesChange$.emit(this.getEntries());
  }

  override async destroy(): Promise<void> {
    this.revokeGhostUrl();
    this.toolChangeUnsubscribe?.();
    this.entries.clear();
  }
}
