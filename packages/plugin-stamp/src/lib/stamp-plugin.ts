import { BasePlugin, createEmitter, createScopedEmitter, PluginRegistry } from '@embedpdf/core';
import { Task, PdfErrorReason, PdfErrorCode, PdfAnnotationObject, uuidV4 } from '@embedpdf/models';
import { AnnotationCapability, AnnotationPlugin } from '@embedpdf/plugin-annotation';
import { I18nCapability, I18nPlugin } from '@embedpdf/plugin-i18n';
import {
  StampCapability,
  StampScope,
  ActiveStampChangeEvent,
  ActiveStampInfo,
  StampDefinition,
  StampDefinitionUpdate,
  StampLibrary,
  StampLibraryConfig,
  StampLibraryUpdate,
  StampManifest,
  StampManifestSource,
  StampPluginConfig,
  StampState,
  ExportedStampLibrary,
  ResolvedStamp,
} from './types';
import { addStampLibrary, removeStampLibrary, StampAction } from './actions';
import { STAMP_PLUGIN_ID } from './manifest';
import { RUBBER_STAMP_TOOL_ID, stampTools } from './tools';
import { parseAnnotationName } from './defaults/name-map';

interface ManagedManifest {
  source: StampManifestSource;
  localeAware: boolean;
  currentLocale: string;
  libraryId: string | null;
}

export class StampPlugin extends BasePlugin<
  StampPluginConfig,
  StampCapability,
  StampState,
  StampAction
> {
  static readonly id = STAMP_PLUGIN_ID;

  private readonly instanceId = uuidV4();
  private readonly libraries = new Map<string, StampLibrary>();
  private readonly libraryChange$ = createEmitter<StampLibrary[]>();
  private readonly activeStamp$ = createScopedEmitter<
    ActiveStampInfo | null,
    ActiveStampChangeEvent,
    string
  >((documentId, activeStamp) => ({ documentId, activeStamp }));
  private readonly managedManifests: ManagedManifest[] = [];
  private annotation: AnnotationCapability | null = null;
  private i18n: I18nCapability | null = null;
  private localeUnsubscribe: (() => void) | null = null;
  private toolChangeUnsubscribe: (() => void) | null = null;
  private currentGhostUrl: string | null = null;

  constructor(
    id: string,
    registry: PluginRegistry,
    private config: StampPluginConfig,
  ) {
    super(id, registry);

    this.annotation = registry.getPlugin<AnnotationPlugin>('annotation')?.provides() ?? null;
    if (this.annotation) {
      for (const tool of stampTools) {
        this.annotation.addTool(tool);
      }
      this.toolChangeUnsubscribe = this.annotation.onActiveToolChange(({ documentId, tool }) => {
        if (tool?.id !== RUBBER_STAMP_TOOL_ID) {
          if (this.currentGhostUrl) {
            URL.revokeObjectURL(this.currentGhostUrl);
            this.currentGhostUrl = null;
          }
          this.activeStamp$.emit(documentId, null);
        }
      });
    }

    this.i18n = registry.getPlugin<I18nPlugin>('i18n')?.provides() ?? null;
  }

  async initialize(): Promise<void> {
    if (this.config.libraries) {
      for (const libConfig of this.config.libraries) {
        await this.loadLibraryInternal(libConfig).toPromise();
      }
    }

    if (this.config.manifests && this.config.manifests.length > 0) {
      await this.initializeManifests();
    }
  }

  protected buildCapability(): StampCapability {
    return {
      getLibraries: () => this.getLibraries(),
      getStampsByCategory: (category) => this.getStampsByCategory(category),
      renderStamp: (libraryId, pageIndex, width, dpr) =>
        this.renderStamp(libraryId, pageIndex, width, dpr),
      loadLibrary: (config) => this.loadLibrary(config),
      loadLibraryFromManifest: (url) => this.loadLibraryFromManifest(url),
      createNewLibrary: (name, options) => this.createNewLibrary(name, options),
      addStampToLibrary: (libraryId, stamp, pdf) => this.addStampToLibrary(libraryId, stamp, pdf),
      removeStampFromLibrary: (libraryId, stampId) =>
        this.removeStampFromLibrary(libraryId, stampId),
      updateStamp: (libraryId, stampId, updates) => this.updateStamp(libraryId, stampId, updates),
      updateLibrary: (libraryId, updates) => this.updateLibrary(libraryId, updates),
      removeLibrary: (id) => this.removeLibrary(id),
      exportLibrary: (id) => this.exportLibrary(id),
      forDocument: (documentId) => this.createStampScope(documentId),
      onActiveStampChange: this.activeStamp$.onGlobal,
      onLibraryChange: this.libraryChange$.on,
    };
  }

  getLibraries(): StampLibrary[] {
    return Array.from(this.libraries.values());
  }

  getStampsByCategory(category: string): ResolvedStamp[] {
    const results: ResolvedStamp[] = [];

    for (const library of this.libraries.values()) {
      const libraryMatches = library.categories?.includes(category) ?? false;

      for (const stamp of library.stamps) {
        const stampMatches = stamp.categories?.includes(category) ?? false;
        if (libraryMatches || stampMatches) {
          results.push({ library, stamp });
        }
      }
    }

    return results;
  }

  renderStamp(
    libraryId: string,
    pageIndex: number,
    width: number,
    dpr?: number,
  ): Task<Blob, PdfErrorReason> {
    const library = this.libraries.get(libraryId);
    if (!library) {
      const task = new Task<Blob, PdfErrorReason>();
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Stamp library not found: ${libraryId}`,
      });
      return task;
    }

    const page = library.document.pages[pageIndex];
    if (!page) {
      const task = new Task<Blob, PdfErrorReason>();
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Page ${pageIndex} not found in stamp library: ${libraryId}`,
      });
      return task;
    }

    const scaleFactor = width / page.size.width;

    return this.engine.renderPageRect(
      library.document,
      page,
      { origin: { x: 0, y: 0 }, size: page.size },
      {
        scaleFactor,
        dpr: dpr ?? 1,
        withAnnotations: true,
        rotation: page.rotation,
        transparentBackground: true,
      },
    );
  }

  loadLibrary(config: StampLibraryConfig): Task<string, PdfErrorReason> {
    return this.loadLibraryInternal(config);
  }

  createNewLibrary(
    name: string,
    options?: { categories?: string[]; id?: string; nameKey?: string; readonly?: boolean },
  ): Task<string, PdfErrorReason> {
    const task = new Task<string, PdfErrorReason>();
    const libraryId = options?.id ?? this.generateLibraryId();
    const documentId = this.getLibraryDocumentId(libraryId);

    this.engine.createDocument(documentId).wait(
      (doc) => {
        const library: StampLibrary = {
          id: libraryId,
          name,
          nameKey: options?.nameKey,
          document: doc,
          stamps: [],
          categories: options?.categories,
          readonly: options?.readonly ?? false,
        };

        this.libraries.set(libraryId, library);
        this.dispatch(addStampLibrary(libraryId));
        this.emitLibraryChange();
        task.resolve(libraryId);
      },
      (error) => {
        this.logger.error(
          'StampPlugin',
          'CreateNewLibrary',
          `Failed to create library: ${name}`,
          error,
        );
        task.fail(error);
      },
    );

    return task;
  }

  addStampToLibrary(
    libraryId: string,
    stamp: Omit<StampDefinition, 'id' | 'pageIndex'>,
    pdf: ArrayBuffer,
  ): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const library = this.libraries.get(libraryId);
    if (!library) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Stamp library not found: ${libraryId}`,
      });
      return task;
    }

    if (library.readonly) {
      task.reject({
        code: PdfErrorCode.NotSupport,
        message: `Cannot add stamps to readonly library: ${libraryId}`,
      });
      return task;
    }

    const tempDocId = `stamp-temp-${Date.now()}`;

    this.engine.openDocumentBuffer({ id: tempDocId, content: pdf }).wait(
      (tempDoc) => {
        this.engine.importPages(library.document, tempDoc, [0]).wait(
          (newPages) => {
            const newPage = newPages[0];
            library.document.pages.push(newPage);
            library.document.pageCount = library.document.pages.length;

            const stampDef: StampDefinition = {
              ...stamp,
              id: uuidV4(),
              pageIndex: newPage.index,
            };
            library.stamps.push(stampDef);

            this.engine.closeDocument(tempDoc).wait(
              () => {
                this.emitLibraryChange();
                task.resolve();
              },
              () => {
                this.emitLibraryChange();
                task.resolve();
              },
            );
          },
          (error) => {
            this.logger.error('StampPlugin', 'AddStampToLibrary', 'Failed to import page', error);
            this.engine.closeDocument(tempDoc).wait(
              () => task.fail(error),
              () => task.fail(error),
            );
          },
        );
      },
      (error) => {
        this.logger.error(
          'StampPlugin',
          'AddStampToLibrary',
          'Failed to open temp document',
          error,
        );
        task.fail(error);
      },
    );

    return task;
  }

  private createStampScope(documentId: string): StampScope {
    return {
      createStampFromAnnotation: (annotation, stamp, libraryId) =>
        this.createStampFromAnnotation(documentId, annotation, stamp, libraryId),
      createStampFromAnnotations: (annotations, stamp, libraryId) =>
        this.createStampFromAnnotations(documentId, annotations, stamp, libraryId),
      activateStampPlacement: (libraryId, stamp) =>
        this.activateStampPlacement(documentId, libraryId, stamp),
      activateStampPlacementById: (libraryId, stampId) =>
        this.activateStampPlacementById(documentId, libraryId, stampId),
      getActiveStamp: () => this.getActiveStamp(documentId),
      onActiveStampChange: this.activeStamp$.forScope(documentId),
    };
  }

  private activateStampPlacementById(
    documentId: string,
    libraryId: string,
    stampId: string,
  ): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const library = this.libraries.get(libraryId);
    if (!library) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Stamp library not found: ${libraryId}`,
      });
      return task;
    }

    const stamp = library.stamps.find((s) => s.id === stampId);
    if (!stamp) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Stamp ${stampId} not found in library: ${libraryId}`,
      });
      return task;
    }

    return this.activateStampPlacement(documentId, libraryId, stamp);
  }

  private getActiveStamp(documentId: string): ActiveStampInfo | null {
    return this.activeStamp$.getValue(documentId) ?? null;
  }

  private activateStampPlacement(
    documentId: string,
    libraryId: string,
    stamp: StampDefinition,
  ): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const library = this.libraries.get(libraryId);
    if (!library) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Stamp library not found: ${libraryId}`,
      });
      return task;
    }

    const page = library.document.pages[stamp.pageIndex];
    if (!page) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Page ${stamp.pageIndex} not found in library`,
      });
      return task;
    }

    const stampSize = page.size;

    this.engine.extractPages(library.document, [stamp.pageIndex]).wait(
      (appearance) => {
        this.renderStamp(libraryId, stamp.pageIndex, stampSize.width, 2).wait(
          (blob) => {
            if (this.currentGhostUrl) {
              URL.revokeObjectURL(this.currentGhostUrl);
            }
            const ghostUrl = URL.createObjectURL(blob);
            this.currentGhostUrl = ghostUrl;
            this.annotation?.setActiveTool(RUBBER_STAMP_TOOL_ID, {
              appearance,
              ghostUrl,
              stampSize,
              libraryId,
              stamp,
            });
            this.activeStamp$.emit(documentId, { libraryId, stamp });
            task.resolve();
          },
          (error) => {
            this.logger.error(
              'StampPlugin',
              'ActivateStampPlacement',
              'Failed to render stamp preview',
              error,
            );
            task.fail(error);
          },
        );
      },
      (error) => {
        this.logger.error(
          'StampPlugin',
          'ActivateStampPlacement',
          'Failed to extract stamp page',
          error,
        );
        task.fail(error);
      },
    );

    return task;
  }

  private createStampFromAnnotation(
    documentId: string,
    annotation: PdfAnnotationObject,
    stamp: Omit<StampDefinition, 'id' | 'pageIndex'>,
    libraryId?: string,
  ): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const docState = this.getCoreDocument(documentId);
    if (!docState?.document) {
      task.reject({ code: PdfErrorCode.DocNotOpen, message: 'document is not open' });
      return task;
    }

    const doc = docState.document;
    const page = doc.pages[annotation.pageIndex];
    if (!page) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `page ${annotation.pageIndex} not found`,
      });
      return task;
    }

    this.resolveTargetLibrary(libraryId).wait(
      (targetId) => {
        this.engine.exportAnnotationAppearanceAsPdf(doc, page, annotation).wait(
          (pdf) => {
            this.addStampToLibrary(targetId, stamp, pdf).wait(
              () => task.resolve(),
              (error) => task.fail(error),
            );
          },
          (error) => {
            this.logger.error(
              'StampPlugin',
              'CreateStampFromAnnotation',
              'Failed to export annotation',
              error,
            );
            task.fail(error);
          },
        );
      },
      (error) => task.fail(error),
    );

    return task;
  }

  private createStampFromAnnotations(
    documentId: string,
    annotations: PdfAnnotationObject[],
    stamp: Omit<StampDefinition, 'id' | 'pageIndex'>,
    libraryId?: string,
  ): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    if (annotations.length === 0) {
      task.reject({ code: PdfErrorCode.NotFound, message: 'no annotations provided' });
      return task;
    }

    const docState = this.getCoreDocument(documentId);
    if (!docState?.document) {
      task.reject({ code: PdfErrorCode.DocNotOpen, message: 'document is not open' });
      return task;
    }

    const doc = docState.document;
    const page = doc.pages[annotations[0].pageIndex];
    if (!page) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `page ${annotations[0].pageIndex} not found`,
      });
      return task;
    }

    this.resolveTargetLibrary(libraryId).wait(
      (targetId) => {
        this.engine.exportAnnotationsAppearanceAsPdf(doc, page, annotations).wait(
          (pdf) => {
            this.addStampToLibrary(targetId, stamp, pdf).wait(
              () => task.resolve(),
              (error) => task.fail(error),
            );
          },
          (error) => {
            this.logger.error(
              'StampPlugin',
              'CreateStampFromAnnotations',
              'Failed to export annotations',
              error,
            );
            task.fail(error);
          },
        );
      },
      (error) => task.fail(error),
    );

    return task;
  }

  private resolveTargetLibrary(libraryId?: string): Task<string, PdfErrorReason> {
    if (libraryId && this.libraries.has(libraryId)) {
      const task = new Task<string, PdfErrorReason>();
      task.resolve(libraryId);
      return task;
    }

    const defaults = this.config.defaultLibrary;
    if (this.config.defaultLibrary === false || !defaults) {
      const task = new Task<string, PdfErrorReason>();
      task.reject({
        code: PdfErrorCode.NotSupport,
        message: 'Default library creation is disabled',
      });
      return task;
    }

    const defaultId = defaults.id ?? 'custom';

    if (this.libraries.has(defaultId)) {
      const task = new Task<string, PdfErrorReason>();
      task.resolve(defaultId);
      return task;
    }

    return this.createNewLibrary(defaults.name ?? 'Custom Stamps', {
      id: defaultId,
      nameKey: defaults.nameKey,
      categories: defaults.categories,
    });
  }

  removeLibrary(id: string): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const library = this.libraries.get(id);
    if (!library) {
      task.resolve();
      return task;
    }

    this.engine.closeDocument(library.document).wait(
      () => {
        this.libraries.delete(id);
        this.dispatch(removeStampLibrary(id));
        this.emitLibraryChange();
        task.resolve();
      },
      () => {
        this.logger.warn(
          'StampPlugin',
          'RemoveLibrary',
          `Failed to close document for library: ${id}`,
        );
        this.libraries.delete(id);
        this.dispatch(removeStampLibrary(id));
        this.emitLibraryChange();
        task.resolve();
      },
    );

    return task;
  }

  exportLibrary(id: string): Task<ExportedStampLibrary, PdfErrorReason> {
    const task = new Task<ExportedStampLibrary, PdfErrorReason>();

    const library = this.libraries.get(id);
    if (!library) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Stamp library not found: ${id}`,
      });
      return task;
    }

    this.engine.saveAsCopy(library.document).wait(
      (pdf) => {
        task.resolve({
          name: library.name,
          pdf,
          stamps: library.stamps,
          categories: library.categories,
        });
      },
      (error) => {
        this.logger.error('StampPlugin', 'ExportLibrary', `Failed to export library: ${id}`, error);
        task.fail(error);
      },
    );

    return task;
  }

  private loadLibraryInternal(config: StampLibraryConfig): Task<string, PdfErrorReason> {
    const task = new Task<string, PdfErrorReason>();
    const libraryId = config.id ?? this.generateLibraryId();
    const documentId = this.getLibraryDocumentId(libraryId);

    const engineTask =
      typeof config.pdf === 'string'
        ? this.engine.openDocumentUrl({ id: documentId, url: config.pdf })
        : this.engine.openDocumentBuffer({ id: documentId, content: config.pdf });

    engineTask.wait(
      (doc) => {
        const stamps = config.stamps.map((s) => (s.id ? s : { ...s, id: uuidV4() }));

        const library: StampLibrary = {
          id: libraryId,
          name: config.name,
          nameKey: config.nameKey,
          document: doc,
          stamps,
          categories: config.categories,
          readonly: config.readonly ?? false,
        };

        this.libraries.set(libraryId, library);
        this.dispatch(addStampLibrary(libraryId));
        this.emitLibraryChange();

        task.resolve(libraryId);
      },
      (error) => {
        this.logger.error(
          'StampPlugin',
          'LoadLibrary',
          `Failed to load stamp library: ${config.name}`,
          error,
        );
        task.fail(error);
      },
    );

    return task;
  }

  removeStampFromLibrary(libraryId: string, stampId: string): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const library = this.libraries.get(libraryId);
    if (!library) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Stamp library not found: ${libraryId}`,
      });
      return task;
    }

    if (library.readonly) {
      task.reject({
        code: PdfErrorCode.NotSupport,
        message: `Cannot remove stamps from readonly library: ${libraryId}`,
      });
      return task;
    }

    const stampIdx = library.stamps.findIndex((s) => s.id === stampId);
    if (stampIdx === -1) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Stamp ${stampId} not found in library: ${libraryId}`,
      });
      return task;
    }

    const pageIndex = library.stamps[stampIdx].pageIndex;

    this.engine.deletePage(library.document, pageIndex).wait(
      () => {
        library.stamps.splice(stampIdx, 1);
        library.document.pages.splice(pageIndex, 1);
        library.document.pageCount = library.document.pages.length;

        for (const s of library.stamps) {
          if (s.pageIndex > pageIndex) {
            s.pageIndex--;
          }
        }
        for (let i = 0; i < library.document.pages.length; i++) {
          library.document.pages[i].index = i;
        }

        this.emitLibraryChange();
        task.resolve();
      },
      (error) => {
        this.logger.error(
          'StampPlugin',
          'RemoveStampFromLibrary',
          `Failed to delete page for stamp ${stampId}`,
          error,
        );
        task.fail(error);
      },
    );

    return task;
  }

  updateStamp(
    libraryId: string,
    stampId: string,
    updates: StampDefinitionUpdate,
  ): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const library = this.libraries.get(libraryId);
    if (!library) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Stamp library not found: ${libraryId}`,
      });
      return task;
    }

    if (library.readonly) {
      task.reject({
        code: PdfErrorCode.NotSupport,
        message: `Cannot update stamps in readonly library: ${libraryId}`,
      });
      return task;
    }

    const stamp = library.stamps.find((s) => s.id === stampId);
    if (!stamp) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Stamp ${stampId} not found in library: ${libraryId}`,
      });
      return task;
    }

    Object.assign(stamp, updates);
    this.emitLibraryChange();
    task.resolve();

    return task;
  }

  updateLibrary(libraryId: string, updates: StampLibraryUpdate): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const library = this.libraries.get(libraryId);
    if (!library) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Stamp library not found: ${libraryId}`,
      });
      return task;
    }

    if (library.readonly) {
      task.reject({
        code: PdfErrorCode.NotSupport,
        message: `Cannot update readonly library: ${libraryId}`,
      });
      return task;
    }

    if (updates.name !== undefined) library.name = updates.name;
    if (updates.nameKey !== undefined) library.nameKey = updates.nameKey;
    if (updates.categories !== undefined) library.categories = updates.categories;
    if (updates.readonly !== undefined) library.readonly = updates.readonly;

    this.emitLibraryChange();
    task.resolve();

    return task;
  }

  loadLibraryFromManifest(url: string): Task<string, PdfErrorReason> {
    return this.loadManifestUrl(url, true);
  }

  private async initializeManifests(): Promise<void> {
    const currentLocale = this.i18n?.getLocale() ?? 'en';

    for (const source of this.config.manifests!) {
      const localeAware = source.url.includes('{locale}');
      const locale = localeAware ? currentLocale : '';
      const resolvedUrl = source.url.replace('{locale}', locale || currentLocale);

      const managed: ManagedManifest = {
        source,
        localeAware,
        currentLocale: localeAware ? currentLocale : '',
        libraryId: null,
      };
      this.managedManifests.push(managed);

      try {
        const libraryId = await this.loadManifestUrl(resolvedUrl, true).toPromise();
        managed.libraryId = libraryId;
      } catch {
        if (localeAware && source.fallbackLocale && source.fallbackLocale !== currentLocale) {
          const fallbackUrl = source.url.replace('{locale}', source.fallbackLocale);
          try {
            const libraryId = await this.loadManifestUrl(fallbackUrl, true).toPromise();
            managed.libraryId = libraryId;
            managed.currentLocale = source.fallbackLocale;
          } catch {
            this.logger.warn(
              'StampPlugin',
              'InitManifests',
              `Failed to load manifest (including fallback): ${source.url}`,
            );
          }
        } else {
          this.logger.warn(
            'StampPlugin',
            'InitManifests',
            `Failed to load manifest: ${resolvedUrl}`,
          );
        }
      }
    }

    if (this.i18n) {
      this.localeUnsubscribe = this.i18n.onLocaleChange((event) => {
        this.handleLocaleChange(event.currentLocale);
      });
    }
  }

  private async handleLocaleChange(newLocale: string): Promise<void> {
    for (const managed of this.managedManifests) {
      if (!managed.localeAware || managed.currentLocale === newLocale) {
        continue;
      }

      if (managed.libraryId) {
        try {
          await this.removeLibrary(managed.libraryId).toPromise();
        } catch {
          // Best effort removal
        }
        managed.libraryId = null;
      }

      const resolvedUrl = managed.source.url.replace('{locale}', newLocale);

      try {
        const libraryId = await this.loadManifestUrl(resolvedUrl, true).toPromise();
        managed.libraryId = libraryId;
        managed.currentLocale = newLocale;
      } catch {
        const fallback = managed.source.fallbackLocale ?? 'en';
        if (fallback !== newLocale) {
          const fallbackUrl = managed.source.url.replace('{locale}', fallback);
          try {
            const libraryId = await this.loadManifestUrl(fallbackUrl, true).toPromise();
            managed.libraryId = libraryId;
            managed.currentLocale = fallback;
          } catch {
            this.logger.warn(
              'StampPlugin',
              'LocaleChange',
              `Failed to load manifest for locale ${newLocale} (including fallback): ${managed.source.url}`,
            );
          }
        } else {
          this.logger.warn(
            'StampPlugin',
            'LocaleChange',
            `Failed to load manifest for locale ${newLocale}: ${managed.source.url}`,
          );
        }
      }
    }
  }

  private loadManifestUrl(url: string, readonly: boolean): Task<string, PdfErrorReason> {
    const task = new Task<string, PdfErrorReason>();

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json() as Promise<StampManifest>;
      })
      .then((manifest) => {
        const pdfUrl = this.resolveManifestPdfUrl(url, manifest.pdf);

        const stamps: StampDefinition[] = manifest.stamps.map((entry) => ({
          id: entry.id ?? uuidV4(),
          pageIndex: entry.pageIndex,
          name: parseAnnotationName(entry.name),
          subject: entry.subject,
          subjectKey: entry.subjectKey,
          label: entry.label,
          categories: entry.categories,
        }));

        const config: StampLibraryConfig = {
          id: manifest.id,
          name: manifest.name,
          nameKey: manifest.nameKey,
          pdf: pdfUrl,
          stamps,
          categories: manifest.categories,
          readonly,
        };

        this.loadLibraryInternal(config).wait(
          (libraryId) => task.resolve(libraryId),
          (error) => task.fail(error),
        );
      })
      .catch((error) => {
        this.logger.error('StampPlugin', 'LoadManifest', `Failed to fetch manifest: ${url}`, error);
        task.reject({
          code: PdfErrorCode.NotFound,
          message: `Failed to load stamp manifest: ${url}`,
        });
      });

    return task;
  }

  private resolveManifestPdfUrl(manifestUrl: string, pdfPath: string): string {
    if (
      pdfPath.startsWith('http://') ||
      pdfPath.startsWith('https://') ||
      pdfPath.startsWith('/')
    ) {
      return pdfPath;
    }
    const base = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);
    return base + pdfPath;
  }

  private generateLibraryId(): string {
    return uuidV4();
  }

  private getLibraryDocumentId(libraryId: string): string {
    return `stamp-doc-${this.instanceId}-${libraryId}`;
  }

  private emitLibraryChange(): void {
    this.libraryChange$.emit(this.getLibraries());
  }

  override async destroy(): Promise<void> {
    if (this.currentGhostUrl) {
      URL.revokeObjectURL(this.currentGhostUrl);
      this.currentGhostUrl = null;
    }
    if (this.toolChangeUnsubscribe) {
      this.toolChangeUnsubscribe();
      this.toolChangeUnsubscribe = null;
    }
    if (this.localeUnsubscribe) {
      this.localeUnsubscribe();
      this.localeUnsubscribe = null;
    }
    this.activeStamp$.clear();
    const libs = Array.from(this.libraries.values());
    for (const library of libs) {
      try {
        await this.engine.closeDocument(library.document).toPromise();
      } catch {
        // Best effort cleanup
      }
    }
    this.libraries.clear();
    this.managedManifests.length = 0;
    super.destroy();
  }
}
