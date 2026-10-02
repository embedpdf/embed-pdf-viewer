import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';

export interface MultipartPart {
  name: string;
  filename: string;
  contentType: string;
  body: Buffer;
}

/**
 * Assemble a `multipart/form-data` body by hand. The first part is the JSON
 * manifest (`name="manifest"`); the rest are binary parts, such as encoded
 * appearance images or a bundle's resources. Fetch's `Response.formData()`
 * parses this on the client: text parts (no filename) come back as strings,
 * parts with a filename as `Blob`s.
 */
export function buildMultipart(
  manifest: unknown,
  parts: MultipartPart[],
): { contentType: string; body: Buffer } {
  const boundary = `cloudpdf-${randomBytes(16).toString('hex')}`;
  const CRLF = '\r\n';
  const chunks: Buffer[] = [];

  const manifestJson = Buffer.from(JSON.stringify(manifest), 'utf8');
  chunks.push(
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="manifest"${CRLF}` +
        `Content-Type: application/json${CRLF}${CRLF}`,
      'utf8',
    ),
  );
  chunks.push(manifestJson);
  chunks.push(Buffer.from(CRLF, 'utf8'));

  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"${CRLF}` +
          `Content-Type: ${part.contentType}${CRLF}${CRLF}`,
        'utf8',
      ),
    );
    chunks.push(part.body);
    chunks.push(Buffer.from(CRLF, 'utf8'));
  }

  chunks.push(Buffer.from(`--${boundary}--${CRLF}`, 'utf8'));
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(chunks),
  };
}
