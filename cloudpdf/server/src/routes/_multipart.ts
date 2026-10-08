import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';

export interface MultipartPart {
  /** The file's key: the part is `resource:<key>`, and the body names it by this key. */
  key: string;
  filename: string;
  contentType: string;
  body: Buffer;
}

/**
 * Assemble a multipart answer by hand, in the one shape every multipart
 * message has: the `body` part (JSON), then one `resource:<key>` part per
 * file, such as an encoded appearance image or a bundle's resource. Fetch's
 * `Response.formData()` parses this on the client: text parts (no filename)
 * come back as strings, parts with a filename as `Blob`s.
 */
export function buildMultipart(
  body: unknown,
  parts: MultipartPart[],
): { contentType: string; body: Buffer } {
  const boundary = `cloudpdf-${randomBytes(16).toString('hex')}`;
  const CRLF = '\r\n';
  const chunks: Buffer[] = [];

  const json = Buffer.from(JSON.stringify(body), 'utf8');
  chunks.push(
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="body"${CRLF}` +
        `Content-Type: application/json${CRLF}${CRLF}`,
      'utf8',
    ),
  );
  chunks.push(json);
  chunks.push(Buffer.from(CRLF, 'utf8'));

  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="resource:${part.key}"; filename="${part.filename}"${CRLF}` +
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
