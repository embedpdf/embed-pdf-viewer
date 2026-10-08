import {
  createPageImageHandle,
  EngineError,
  EngineErrorCode,
  type AnnotationAppearanceImage,
  type AnnotationAppearanceImagesResult,
  type PageImageResult,
} from '@embedpdf/engine-core/runtime';
import { AnnotationAppearanceBatchSchema } from '@embedpdf/engine-core/wire';

/**
 * Parse the appearance `multipart/form-data` response into the same
 * `AnnotationAppearanceImagesResult` shape the local engine produces. The
 * `body` part is validated against the wire schema; each image (the part
 * `resource:<key>` its entry names) is wrapped in a `PageImageHandle`
 * backed by the in-memory blob we already downloaded.
 */
export async function parseAppearanceForm(
  form: FormData,
): Promise<AnnotationAppearanceImagesResult> {
  const raw = form.get('body');
  if (typeof raw !== 'string') {
    throw new EngineError(EngineErrorCode.WireFormat, 'appearance response missing its body part');
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `appearance body is not valid JSON: ${(err as Error)?.message ?? err}`,
    );
  }
  const body = AnnotationAppearanceBatchSchema.parse(parsedJson);

  const appearances: AnnotationAppearanceImage[] = await Promise.all(
    body.appearances.map(async (entry) => {
      const name = `resource:${entry.resources.image}`;
      const partValue = form.get(name);
      if (partValue === null || typeof partValue === 'string') {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `appearance response missing image part "${name}"`,
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

  return { page: body.page, appearances };
}
