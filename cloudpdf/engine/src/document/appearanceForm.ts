import {
  createPageImageHandle,
  EngineError,
  EngineErrorCode,
  type AnnotationAppearanceImage,
  type AnnotationAppearanceImagesResult,
  type PageImageResult,
} from '@embedpdf/engine-core/runtime';
import { AnnotationAppearanceManifestSchema } from '@embedpdf/engine-core/wire';

/**
 * Parse the appearance `multipart/form-data` response into the same
 * `AnnotationAppearanceImagesResult` shape the local engine produces. The
 * `manifest` part is validated against the wire schema; each image part is
 * wrapped in a `PageImageHandle` backed by the in-memory blob we already
 * downloaded.
 */
export async function parseAppearanceForm(
  form: FormData,
): Promise<AnnotationAppearanceImagesResult> {
  const manifestRaw = form.get('manifest');
  if (typeof manifestRaw !== 'string') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      'appearance response missing JSON manifest part',
    );
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(manifestRaw);
  } catch (err) {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `appearance manifest is not valid JSON: ${(err as Error)?.message ?? err}`,
    );
  }
  const manifest = AnnotationAppearanceManifestSchema.parse(parsedJson);

  const appearances: AnnotationAppearanceImage[] = await Promise.all(
    manifest.appearances.map(async (entry) => {
      const partValue = form.get(entry.part);
      if (partValue === null || typeof partValue === 'string') {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `appearance response missing image part "${entry.part}"`,
        );
      }
      const blob = partValue as Blob;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const result: PageImageResult = {
        width: entry.width,
        height: entry.height,
        format: entry.format,
        contentType: entry.contentType,
        source: { kind: 'bytes', bytes },
      };
      const image = createPageImageHandle(result, {
        async blob() {
          return blob;
        },
      });
      return {
        ref: entry.ref,
        mode: entry.mode,
        state: entry.state,
        rect: entry.rect,
        image,
      };
    }),
  );

  return { page: manifest.page, appearances };
}
