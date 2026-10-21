/**
 * The attachments' service: its State table as signals, empty with no document and read once
 * one is open (reading it reads the attachments), and its calls acting on that document.
 */
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentHandle, Engine } from '@embedpdf/core';
import { EpdfAttachment, withAttachment } from '@embedpdf/angular/attachment';
import { bytesInput, handleFor, kernelOf, mount, viewerHost } from './fixtures';

const attached = (key: string, index: number, mimeType: string) => ({
  ref: { kind: 'key', key },
  index,
  name: key,
  mimeType,
  description: null,
  size: 4,
  checksum: null,
  createdAt: null,
  modifiedAt: null,
});

const FILES = [attached('notes.txt', 0, 'text/plain'), attached('scan.pdf', 1, 'application/pdf')];

const engine = {
  open: (input: { id?: string }) =>
    Promise.resolve({
      ...handleFor(input.id ?? 'doc'),
      attachments: {
        list: () => Promise.resolve({ attachments: FILES }),
        download: () => Promise.resolve(new Uint8Array([1, 2])),
      },
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

afterEach(() => TestBed.resetTestingModule());

describe('EpdfAttachment', () => {
  it('reads empty with no document, and the files once one is open', async () => {
    const fixture = await mount(
      viewerHost({ template: '', config: { engine }, features: [withAttachment()] }),
    );
    const attachment = fixture.debugElement.injector.get(EpdfAttachment);
    expect(attachment.files()).toEqual([]);
    expect(attachment.status()).toBe('idle');
    expect(attachment.canAdd()).toBe(false);

    await kernelOf(fixture).documents.open(bytesInput('doc'));
    // Reading the service reads the attachments: nothing reads them as the document opens.
    await vi.waitFor(() => expect(attachment.status()).toBe('ready'));
    expect(attachment.files().map((file) => file.name)).toEqual(['notes.txt', 'scan.pdf']);
    expect(attachment.canAdd()).toBe(true);

    const [notes] = attachment.files();
    expect(attachment.get(notes!.id)).toBe(notes);
    await expect(attachment.download(notes!)).resolves.toEqual({
      bytes: new Uint8Array([1, 2]),
      name: 'notes.txt',
      mimeType: 'text/plain',
    });
  });
});
