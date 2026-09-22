import type { RawSigner } from '../cms/build';
import { ensureEngine } from '../cms/engine';
import { selfSignedCertificate } from './self-signed';
import { generateSigningKeyPair, webCryptoSigner } from './webcrypto';

/** What a personal signer keeps: a non-extractable private key and its self-signed certificate. */
export interface PersonalKeyRecord {
  privateKey: CryptoKey;
  certificate: Uint8Array;
}

/** Where personal keys live. Keys are structured-cloneable, so a store can keep the `CryptoKey` itself. */
export interface PersonalKeyStore {
  load(subject: string): Promise<PersonalKeyRecord | null>;
  save(subject: string, record: PersonalKeyRecord): Promise<void>;
  remove(subject: string): Promise<void>;
}

export interface PersonalSigner extends RawSigner {
  /** DER of the self-signed certificate — the only anchor that validates it. */
  readonly certificate: Uint8Array;
  readonly subject: string;
}

/**
 * One self-signed identity per subject (a person's name), persisted in the
 * caller's store and created on first use. The private key is generated
 * non-extractable: it can sign, it can be stored by the browser, it can
 * never be read out. This is Preview's "sign with your own signature"
 * experience with real cryptography behind it — a reader who trusts the
 * certificate validates the signature; every other reader sees "validity
 * unknown", which is the honest answer for a self-issued identity.
 */
export async function personalSigner(input: {
  subject: string;
  store: PersonalKeyStore;
  algorithm?: 'RSA-PKCS1-v1_5' | 'RSA-PSS' | 'ECDSA';
  hash?: 'sha256' | 'sha384' | 'sha512';
}): Promise<PersonalSigner> {
  ensureEngine();
  const hash = input.hash ?? 'sha256';
  let record = await input.store.load(input.subject);
  if (!record) {
    const keys = await generateSigningKeyPair(input.algorithm ?? 'RSA-PKCS1-v1_5', hash, false);
    const certificate = await selfSignedCertificate({
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      commonName: input.subject,
      hash,
    });
    record = { privateKey: keys.privateKey, certificate };
    await input.store.save(input.subject, record);
  }
  const signer = webCryptoSigner({
    privateKey: record.privateKey,
    certificateChain: [record.certificate],
    hash,
  });
  return { ...signer, certificate: record.certificate, subject: input.subject };
}

/** An in-memory store: tests, and runtimes without IndexedDB. */
export function memoryKeyStore(): PersonalKeyStore {
  const records = new Map<string, PersonalKeyRecord>();
  return {
    load: async (subject) => records.get(subject) ?? null,
    save: async (subject, record) => {
      records.set(subject, record);
    },
    remove: async (subject) => {
      records.delete(subject);
    },
  };
}

/**
 * An IndexedDB store: the browser keeps the non-extractable `CryptoKey`
 * itself (structured clone), so the key survives reloads without ever
 * existing as bytes.
 */
export function indexedDbKeyStore(
  dbName: string,
  options: { storeName?: string } = {},
): PersonalKeyStore {
  const storeName = options.storeName ?? 'keys';
  let opening: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
    });
    return opening;
  };
  const run = async <T>(
    mode: IDBTransactionMode,
    op: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = op(tx.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
    });
  };
  return {
    load: async (subject) =>
      ((await run('readonly', (store) => store.get(subject))) as PersonalKeyRecord | undefined) ??
      null,
    save: (subject, record) =>
      run('readwrite', (store) => store.put(record, subject)).then(() => undefined),
    remove: (subject) => run('readwrite', (store) => store.delete(subject)).then(() => undefined),
  };
}
