import type { DocumentMetadata } from '../dto/DocumentMetadata';

/**
 * Cloud-only coherence pins returned by a metadata write so a cached
 * manifest can advance without a refetch. A metadata edit rewrites the
 * document Info dict: it bumps the manifest `docVersion` and the metadata
 * pointer `metadataVersion`, but touches no per-page content/annotation
 * pins and no `layoutVersion` (those caches stay warm).
 *
 * `previousDocVersion` makes the patch safe to apply: a client only
 * advances its cached manifest when it is exactly at that version,
 * otherwise it refreshes instead of manufacturing a mixed-version
 * manifest. `null` on the result for local engines (no manifest/CDN).
 */
export interface MetadataCache {
  previousDocVersion: number;
  docVersion: number;
  metadataVersion: number;
}

/**
 * Result of a `metadata.update()`. A metadata write is a layer mutation
 * (it rewrites the Info dict into the layer artifact, like `pages.move`),
 * so the result returns the re-read `metadata` (the same shape
 * `metadata.read()` returns) plus the cloud coherence pins. Callers
 * holding a previously-read `DocumentMetadata` swap it for
 * `result.metadata`.
 */
export interface MetadataUpdateResult {
  /** The post-write document metadata — what a metadata edit changes. */
  metadata: DocumentMetadata;
  /** Cloud-only manifest coherence pins; `null` for local engines. */
  cache: MetadataCache | null;
}
