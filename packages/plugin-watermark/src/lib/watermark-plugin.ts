import { BasePlugin, createEmitter, PluginRegistry, refreshPages } from '@embedpdf/core';
import {
  PdfAnnotationObject,
  PdfAnnotationSubtype,
  PdfErrorCode,
  PdfErrorReason,
  PdfStampAnnoObject,
  Task,
  uuidV4,
} from '@embedpdf/models';
import { AnnotationCapability, AnnotationPlugin } from '@embedpdf/plugin-annotation';
import {
  WatermarkCapability,
  WatermarkChangeEvent,
  WatermarkDefinition,
  WatermarkInput,
  WatermarkPlacement,
  WatermarkPluginConfig,
  WatermarkState,
  computeWatermarkFlags,
} from './types';
import {
  addWatermark,
  removeWatermark,
  addPlacements,
  clearPlacements,
  WatermarkAction,
} from './actions';
import { WATERMARK_PLUGIN_ID } from './manifest';

type WatermarkRect = { origin: { x: number; y: number }; size: { width: number; height: number } };
type PlacementTarget = { pageIndex: number; rect: WatermarkRect };

export class WatermarkPlugin extends BasePlugin<
  WatermarkPluginConfig,
  WatermarkCapability,
  WatermarkState,
  WatermarkAction
> {
  static readonly id = WATERMARK_PLUGIN_ID;

  private readonly definitions = new Map<string, WatermarkDefinition>();
  private readonly watermarkChange$ = createEmitter<WatermarkChangeEvent>();
  private annotation: AnnotationCapability | null = null;
  private config!: WatermarkPluginConfig;

  constructor(id: string, registry: PluginRegistry, config: WatermarkPluginConfig) {
    super(id, registry);
    this.config = config;
    this.annotation =
      registry.getPlugin<AnnotationPlugin>('annotation')?.provides() ?? null;
  }

  async initialize(): Promise<void> {
    if (this.config.watermarks) {
      for (const input of this.config.watermarks) {
        const def = this.createDefinition(input);
        this.definitions.set(def.id, def);
        this.dispatch(addWatermark(def));
      }
      this.emitChange();
    }
  }

  protected buildCapability(): WatermarkCapability {
    return {
      addWatermark: (input) => this.addWatermarkPublic(input),
      removeWatermark: (id) => this.removeWatermarkPublic(id),
      getWatermarks: () => this.getWatermarks(),
      applyToDocument: (documentId) => this.applyToDocument(documentId),
      clearFromDocument: (documentId) => this.clearFromDocument(documentId),
      onWatermarkChange: this.watermarkChange$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle hooks
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoaded(documentId: string): void {
    if (this.config.autoApply !== false && this.definitions.size > 0) {
      this.applyToDocument(documentId);
    }
  }

  protected override onDocumentClosed(documentId: string): void {
    for (const def of this.definitions.values()) {
      this.dispatch(clearPlacements(def.id, documentId));
    }
  }

  // ─────────────────────────────────────────────────────────
  // Public capability methods
  // ─────────────────────────────────────────────────────────

  private addWatermarkPublic(input: WatermarkInput): Task<string, PdfErrorReason> {
    const task = new Task<string, PdfErrorReason>();

    const def = this.createDefinition(input);
    this.definitions.set(def.id, def);
    this.dispatch(addWatermark(def));
    this.emitChange();

    const activeDocId = this.getActiveDocumentIdOrNull();
    if (activeDocId) {
      this.applyWatermarkToDocument(def, activeDocId).wait(
        () => task.resolve(def.id),
        (error: { type: string; reason: PdfErrorReason }) => {
          this.logger.warn(
            'WatermarkPlugin',
            'AddWatermark',
            `Watermark registered but failed to apply: ${error.reason.message}`,
          );
          task.resolve(def.id);
        },
      );
    } else {
      task.resolve(def.id);
    }

    return task;
  }

  private removeWatermarkPublic(id: string): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const def = this.definitions.get(id);
    if (!def) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: `Watermark not found: ${id}`,
      });
      return task;
    }

    // Flattened watermarks are permanent — just remove the definition.
    // The watermark content is already part of the page and cannot be reversed.
    this.definitions.delete(id);
    this.dispatch(removeWatermark(id));
    this.emitChange();
    task.resolve();

    return task;
  }

  private getWatermarks(): WatermarkDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Apply all registered watermarks to a given document.
   */
  applyToDocument(documentId: string): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    if (!this.annotation) {
      task.reject({
        code: PdfErrorCode.NotSupport,
        message: 'Annotation plugin is not available',
      });
      return task;
    }

    const docState = this.getCoreDocument(documentId);
    if (!docState?.document) {
      task.reject({ code: PdfErrorCode.DocNotOpen, message: 'Document is not open' });
      return task;
    }

    const definitions = Array.from(this.definitions.values());
    let pending = definitions.length;

    if (pending === 0) {
      task.resolve();
      return task;
    }

    let hasError = false;

    for (const def of definitions) {
      this.applyWatermarkToDocument(def, documentId).wait(
        () => {
          pending--;
          if (pending === 0 && !hasError) {
            task.resolve();
          }
        },
        (error: { type: string; reason: PdfErrorReason }) => {
          if (!hasError) {
            hasError = true;
            this.logger.error(
              'WatermarkPlugin',
              'ApplyToDocument',
              `Failed to apply watermark ${def.id}`,
              error,
            );
            task.fail(error);
          }
        },
      );
    }

    return task;
  }

  /**
   * Flattened watermarks cannot be removed from the document.
   * This only clears placement tracking records.
   */
  private clearFromDocument(documentId: string): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    for (const def of this.definitions.values()) {
      this.dispatch(clearPlacements(def.id, documentId));
    }

    task.resolve();
    return task;
  }

  // ─────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────

  /**
   * Apply a single watermark definition to all target pages.
   */
  private applyWatermarkToDocument(
    def: WatermarkDefinition,
    documentId: string,
  ): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const docState = this.getCoreDocument(documentId);
    if (!docState?.document) {
      task.reject({ code: PdfErrorCode.DocNotOpen, message: 'Document is not open' });
      return task;
    }

    const pageCount = docState.document.pageCount;
    const pageIndices = this.resolvePageRange(def.pageRange, pageCount);
    const pageMap: Map<number, { index: number; size: { width: number; height: number } }> =
      new Map(
        docState.document.pages.map(
          (page: { index: number; size: { width: number; height: number } }) =>
            [page.index, page] as const,
        ),
      );

    if (def.type === 'text') {
      this.applyTextWatermark(def, documentId, pageIndices, pageMap, task);
    } else {
      this.applyImageWatermark(def, documentId, pageIndices, pageMap, task);
    }

    return task;
  }

  /**
   * Apply a text watermark by creating stamp annotations sequentially,
   * waiting for each to be committed, then flattening into page content.
   */
  private applyTextWatermark(
    def: WatermarkDefinition,
    documentId: string,
    pageIndices: number[],
    pageMap: Map<number, { index: number; size: { width: number; height: number } }>,
    task: Task<void, PdfErrorReason>,
  ): void {
    if (!this.annotation) {
      task.reject({ code: PdfErrorCode.NotSupport, message: 'Annotation plugin unavailable' });
      return;
    }

    const { pdfString, rect } = this.generateTextAppearance(def);
    const placementTargets = this.buildPlacementTargets(def, pageIndices, pageMap, rect);
    const placements: WatermarkPlacement[] = [];
    const annotationScope = this.annotation.forDocument(documentId);

    const createNext = (index: number) => {
      if (index >= placementTargets.length) {
        this.dispatch(addPlacements(def.id, placements));
        task.resolve();
        return;
      }

      const target = placementTargets[index];
      const pageIndex = target.pageIndex;
      const annotationId = uuidV4();

      const annotation: PdfStampAnnoObject = {
        id: annotationId,
        type: PdfAnnotationSubtype.STAMP,
        pageIndex,
        rect: target.rect,
        flags: computeWatermarkFlags(def),
        subject: 'Watermark',
      };

      const appearanceCopy = new TextEncoder().encode(pdfString).buffer;

      annotationScope.createAnnotation(pageIndex, annotation, {
        appearance: appearanceCopy,
      });

      // Explicitly commit so this works even when annotation autoCommit is disabled.
      annotationScope.commit().wait(
        () => {
          this.flattenAndRefresh(documentId, pageIndex, annotation).wait(
            () => {
              placements.push({ documentId, pageIndex, annotationId });
              createNext(index + 1);
            },
            (error: { type: string; reason: PdfErrorReason }) => {
              this.logger.warn(
                'WatermarkPlugin',
                'FlattenFailed',
                `Flatten failed for page ${pageIndex}: ${error.reason.message}`,
              );
              placements.push({ documentId, pageIndex, annotationId });
              createNext(index + 1);
            },
          );
        },
        (error: { type: string; reason: PdfErrorReason }) => {
          this.logger.warn(
            'WatermarkPlugin',
            'CommitFailed',
            `Commit failed for page ${pageIndex}: ${error.reason.message}`,
          );
          createNext(index + 1);
        },
      );
    };

    createNext(0);
  }

  /**
   * Apply an image watermark by creating stamp annotations sequentially,
   * waiting for each to be committed, then flattening into page content.
   * Opacity is baked into the image pixel data via OffscreenCanvas.
   */
  private applyImageWatermark(
    def: WatermarkDefinition,
    documentId: string,
    pageIndices: number[],
    pageMap: Map<number, { index: number; size: { width: number; height: number } }>,
    task: Task<void, PdfErrorReason>,
  ): void {
    if (!this.annotation) {
      task.reject({ code: PdfErrorCode.NotSupport, message: 'Annotation plugin unavailable' });
      return;
    }

    if (!def.imageOptions) {
      task.reject({
        code: PdfErrorCode.NotFound,
        message: 'Image options are required for image watermarks',
      });
      return;
    }

    const opacity = def.opacity ?? 0.5;
    const rotation = def.rotation ?? 0;
    const baseRect = this.computePlacementRect(def.position, def.size, rotation);
    const placementTargets = this.buildPlacementTargets(def, pageIndices, pageMap, baseRect);

    // Pre-process image to bake in opacity/rotation, then proceed.
    this.applyOpacityAndRotationToImage(def.imageOptions.data, opacity, rotation).then(
      (processedData) => {
        this.createImageAnnotationsSequentially(
          def,
          documentId,
          placementTargets,
          processedData,
          task,
        );
      },
      () => {
        // Fallback: use original data without opacity
        this.createImageAnnotationsSequentially(
          def,
          documentId,
          placementTargets,
          def.imageOptions!.data,
          task,
        );
      },
    );
  }

  /**
   * Create image stamp annotations sequentially (after image processing).
   */
  private createImageAnnotationsSequentially(
    def: WatermarkDefinition,
    documentId: string,
    placementTargets: PlacementTarget[],
    imageData: ArrayBuffer,
    task: Task<void, PdfErrorReason>,
  ): void {
    const annotationScope = this.annotation!.forDocument(documentId);
    const placements: WatermarkPlacement[] = [];

    const createNext = (index: number) => {
      if (index >= placementTargets.length) {
        this.dispatch(addPlacements(def.id, placements));
        task.resolve();
        return;
      }

      const target = placementTargets[index];
      const pageIndex = target.pageIndex;
      const annotationId = uuidV4();

      const annotation: PdfStampAnnoObject = {
        id: annotationId,
        type: PdfAnnotationSubtype.STAMP,
        pageIndex,
        rect: target.rect,
        flags: computeWatermarkFlags(def),
        subject: 'Watermark',
      };

      const dataCopy = imageData.slice(0);

      annotationScope.createAnnotation(pageIndex, annotation, {
        data: dataCopy,
        mimeType: 'image/png',
      });

      // Explicitly commit so this works even when annotation autoCommit is disabled.
      annotationScope.commit().wait(
        () => {
          this.flattenAndRefresh(documentId, pageIndex, annotation).wait(
            () => {
              placements.push({ documentId, pageIndex, annotationId });
              createNext(index + 1);
            },
            (error: { type: string; reason: PdfErrorReason }) => {
              this.logger.warn(
                'WatermarkPlugin',
                'FlattenFailed',
                `Flatten failed for page ${pageIndex}: ${error.reason.message}`,
              );
              placements.push({ documentId, pageIndex, annotationId });
              createNext(index + 1);
            },
          );
        },
        (error: { type: string; reason: PdfErrorReason }) => {
          this.logger.warn(
            'WatermarkPlugin',
            'CommitFailed',
            `Commit failed for page ${pageIndex}: ${error.reason.message}`,
          );
          createNext(index + 1);
        },
      );
    };

    createNext(0);
  }

  /**
   * Apply opacity to an image by drawing it on an OffscreenCanvas with
   * globalAlpha, then exporting as PNG. Returns the processed ArrayBuffer.
   */
  private async applyOpacityAndRotationToImage(
    data: ArrayBuffer,
    opacity: number,
    rotation: number,
  ): Promise<ArrayBuffer> {
    const blob = new Blob([data]);
    const bitmap = await createImageBitmap(blob);
    const radians = (rotation * Math.PI) / 180;
    const absCos = Math.abs(Math.cos(radians));
    const absSin = Math.abs(Math.sin(radians));
    const outWidth = Math.max(1, Math.ceil(bitmap.width * absCos + bitmap.height * absSin));
    const outHeight = Math.max(1, Math.ceil(bitmap.width * absSin + bitmap.height * absCos));

    const canvas = new OffscreenCanvas(outWidth, outHeight);
    const ctx = canvas.getContext('2d')!;
    ctx.globalAlpha = opacity;
    ctx.translate(outWidth / 2, outHeight / 2);
    if (rotation !== 0) {
      ctx.rotate(radians);
    }
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    bitmap.close();
    const resultBlob = await canvas.convertToBlob({ type: 'image/png' });
    return resultBlob.arrayBuffer();
  }

  private computePlacementRect(
    position: { x: number; y: number },
    size: { width: number; height: number },
    rotation: number,
  ): WatermarkRect {
    const radians = (rotation * Math.PI) / 180;
    const absCos = Math.abs(Math.cos(radians));
    const absSin = Math.abs(Math.sin(radians));
    const rotatedWidth = size.width * absCos + size.height * absSin;
    const rotatedHeight = size.width * absSin + size.height * absCos;
    const centreX = position.x + size.width / 2;
    const centreY = position.y + size.height / 2;

    return {
      origin: {
        x: centreX - rotatedWidth / 2,
        y: centreY - rotatedHeight / 2,
      },
      size: { width: rotatedWidth, height: rotatedHeight },
    };
  }

  private buildPlacementTargets(
    def: WatermarkDefinition,
    pageIndices: number[],
    pageMap: Map<number, { index: number; size: { width: number; height: number } }>,
    baseRect: WatermarkRect,
  ): PlacementTarget[] {
    const targets: PlacementTarget[] = [];
    const mode = def.repeat ?? 'none';
    const spacingX = Math.max(0, def.repeatSpacing?.x ?? 0);
    const spacingY = Math.max(0, def.repeatSpacing?.y ?? 0);

    for (const pageIndex of pageIndices) {
      const page = pageMap.get(pageIndex);
      if (!page) continue;

      const xOrigins = this.expandAxisOrigins(
        baseRect.origin.x,
        baseRect.size.width,
        page.size.width,
        mode === 'horizontal' || mode === 'both',
        spacingX,
      );
      const yOrigins = this.expandAxisOrigins(
        baseRect.origin.y,
        baseRect.size.height,
        page.size.height,
        mode === 'vertical' || mode === 'both',
        spacingY,
      );

      for (const y of yOrigins) {
        for (const x of xOrigins) {
          targets.push({
            pageIndex,
            rect: {
              origin: { x, y },
              size: { width: baseRect.size.width, height: baseRect.size.height },
            },
          });
        }
      }
    }

    return targets;
  }

  private expandAxisOrigins(
    start: number,
    itemSize: number,
    pageSize: number,
    repeatEnabled: boolean,
    spacing: number,
  ): number[] {
    if (!repeatEnabled) {
      return [start];
    }

    const step = itemSize + spacing;
    if (step <= 0) {
      return [start];
    }

    const result: number[] = [];
    let first = start;

    // Extend backwards while still intersecting the page.
    while (first - step + itemSize > 0) {
      first -= step;
    }

    // Extend forwards while still intersecting the page.
    for (let cursor = first; cursor < pageSize; cursor += step) {
      if (cursor + itemSize <= 0) continue;
      result.push(cursor);
    }

    if (result.length === 0) {
      return [start];
    }

    return result;
  }

  /**
   * Flatten an annotation into the page content stream, then trigger
   * a page re-render via refreshPages.
   */
  private flattenAndRefresh(
    documentId: string,
    pageIndex: number,
    annotation: PdfAnnotationObject,
  ): Task<void, PdfErrorReason> {
    const task = new Task<void, PdfErrorReason>();

    const docState = this.getCoreDocument(documentId);
    if (!docState?.document) {
      task.reject({ code: PdfErrorCode.DocNotOpen, message: 'Document is not open' });
      return task;
    }

    const page = docState.document.pages.find((p: { index: number }) => p.index === pageIndex);
    if (!page) {
      task.reject({ code: PdfErrorCode.NotFound, message: `Page ${pageIndex} not found` });
      return task;
    }

    this.engine.flattenAnnotationBehind(docState.document, page, annotation).wait(
      (flattened: boolean) => {
        if (!flattened) {
          task.reject({
            code: PdfErrorCode.Unknown,
            message: `Failed to flatten watermark annotation ${annotation.id}`,
          });
          return;
        }
        // Trigger tile re-render for this page
        this.dispatchCoreAction(refreshPages(documentId, [pageIndex]));
        task.resolve();
      },
      (error: { type: string; reason: PdfErrorReason }) => {
        task.reject(error.reason);
      },
    );

    return task;
  }

  /**
   * Generate the text appearance PDF and the expanded annotation rect
   * that accounts for rotation. The bounding box is expanded to encompass
   * the fully rotated content, preventing clipping.
   */
  private generateTextAppearance(def: WatermarkDefinition): {
    pdfString: string;
    rect: { origin: { x: number; y: number }; size: { width: number; height: number } };
  } {
    const text = def.textOptions?.text ?? '';
    const fontSize = def.textOptions?.fontSize ?? 48;
    const fontFamily = def.textOptions?.fontFamily ?? 'Helvetica';
    const colourHex = def.textOptions?.colour ?? '#000000';
    const opacity = def.opacity ?? 0.5;
    const rotation = def.rotation ?? 0;
    const { width, height } = def.size;

    // Calculate the rotated bounding box dimensions
    const radians = (rotation * Math.PI) / 180;
    const absCos = Math.abs(Math.cos(radians));
    const absSin = Math.abs(Math.sin(radians));
    const rotatedWidth = width * absCos + height * absSin;
    const rotatedHeight = width * absSin + height * absCos;

    // Centre of the user-specified position
    const centreX = def.position.x + width / 2;
    const centreY = def.position.y + height / 2;

    // Expanded rect origin (keep same centre)
    const originX = centreX - rotatedWidth / 2;
    const originY = centreY - rotatedHeight / 2;

    // Parse hex colour to RGB components (0–1 range)
    const r = parseInt(colourHex.slice(1, 3), 16) / 255;
    const g = parseInt(colourHex.slice(3, 5), 16) / 255;
    const b = parseInt(colourHex.slice(5, 7), 16) / 255;

    // Estimate text width (rough: Helvetica averages ~0.52 of fontSize per char)
    const avgCharWidth = fontSize * 0.52;
    const estimatedTextWidth = text.length * avgCharWidth;

    // Centre the text in the ORIGINAL (pre-rotation) bounding box
    const textX = (width - estimatedTextWidth) / 2;
    const textY = (height - fontSize) / 2;

    // Build rotation transform: translate to centre of expanded box,
    // rotate, then offset to draw the original box centred
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const cx = rotatedWidth / 2;
    const cy = rotatedHeight / 2;

    // The transform: move origin to centre, rotate, then offset by -width/2, -height/2
    // so the original content box is centred within the expanded box.
    // Combined matrix: translate(cx, cy) * rotate(θ) * translate(-width/2, -height/2)
    const tx = cx - (width / 2) * cos + (height / 2) * sin;
    const ty = cy - (width / 2) * sin - (height / 2) * cos;

    // Build content stream
    const contentLines = [
      'q',
      '/GS0 gs',
      `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} rg`,
      `${cos.toFixed(6)} ${sin.toFixed(6)} ${(-sin).toFixed(6)} ${cos.toFixed(6)} ${tx.toFixed(4)} ${ty.toFixed(4)} cm`,
      'BT',
      `/F1 ${fontSize} Tf`,
      `${textX.toFixed(2)} ${textY.toFixed(2)} Td`,
      `(${this.escapePdfString(text)}) Tj`,
      'ET',
      'Q',
    ];
    const contentStream = contentLines.join('\n');

    const pdfString = this.buildMinimalPdf(rotatedWidth, rotatedHeight, contentStream, fontFamily, opacity);

    return {
      pdfString,
      rect: {
        origin: { x: originX, y: originY },
        size: { width: rotatedWidth, height: rotatedHeight },
      },
    };
  }

  /**
   * Build a minimal but valid PDF document with a single page containing
   * the given content stream.
   */
  private buildMinimalPdf(
    width: number,
    height: number,
    contentStream: string,
    fontName: string,
    opacity: number,
  ): string {
    const streamBytes = new TextEncoder().encode(contentStream);
    const streamLength = streamBytes.length;

    const objects: string[] = [];

    // 1: Catalog
    objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

    // 2: Pages
    objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');

    // 3: Page — Resources reference /F1 for font and /GS0 for graphics state
    objects.push(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> ` +
        `/ExtGState << /GS0 << /Type /ExtGState /ca ${opacity} /CA ${opacity} >> >> >> >>\nendobj`,
    );

    // 4: Content stream
    objects.push(
      `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream\nendobj`,
    );

    // 5: Font
    objects.push(
      `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${fontName} >>\nendobj`,
    );

    // Build the PDF file
    const header = '%PDF-1.4\n';
    let body = '';
    const xrefOffsets: number[] = [];

    let offset = header.length;
    for (const obj of objects) {
      xrefOffsets.push(offset);
      const line = obj + '\n';
      body += line;
      offset += new TextEncoder().encode(line).length;
    }

    const xrefStart = offset;
    let xref = `xref\n0 ${objects.length + 1}\n`;
    xref += '0000000000 65535 f \n';
    for (const o of xrefOffsets) {
      xref += `${o.toString().padStart(10, '0')} 00000 n \n`;
    }

    const trailer =
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
      `startxref\n${xrefStart}\n%%EOF`;

    return header + body + xref + trailer;
  }

  /**
   * Escape special characters in a PDF string literal.
   */
  private escapePdfString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
  }

  /**
   * Resolve a page range into concrete page indices.
   */
  private resolvePageRange(
    range: WatermarkDefinition['pageRange'],
    pageCount: number,
  ): number[] {
    if (!range || range === 'all') {
      return Array.from({ length: pageCount }, (_, i) => i);
    }
    return range.filter((i) => i >= 0 && i < pageCount);
  }

  /**
   * Create a full WatermarkDefinition from user input, generating an ID.
   */
  private createDefinition(input: WatermarkInput): WatermarkDefinition {
    return {
      ...input,
      id: uuidV4(),
    };
  }

  /**
   * Emit the watermark change event to subscribers.
   */
  private emitChange(): void {
    this.watermarkChange$.emit({ watermarks: this.getWatermarks() });
  }

  override destroy(): void {
    this.watermarkChange$.clear();
    this.definitions.clear();
    super.destroy();
  }
}

















