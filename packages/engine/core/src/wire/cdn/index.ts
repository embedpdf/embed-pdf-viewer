/**
 * CDN-shaped wire surface — coverage enumeration + per-request URL
 * application. Pure modules with no I/O.
 *
 * **Boundary contract**
 *
 * Everything under `wire/cdn/` is HTTP-wire CDN territory. Two consumers
 * import from here:
 *   1. `@cloudpdf/engine` HttpClient — applies the access block
 *      to outgoing fetches so CDN tokens land on the wire.
 *   2. `@cloudpdf/server` — feeds `cdnCoverageForScope` into adapter
 *      signers when /access is built.
 *
 * `@embedpdf/engine` MUST NOT import anything from this folder,
 * directly or via re-export. The `shared.ts` / root entry of
 * engine-core does not re-export this module — only `wire.ts` does.
 *
 * Diagnostic tooling (the cloud-platform-smoke inspector, future test
 * fixtures) is welcome to import — that's by design, since the same
 * function powers both real fetches and previews.
 */

export { cdnCoverageForScope } from './coverage';
export type { CdnCoverageEntry } from './coverage';
export { applyCdnAccess, resolveResourceIdForPath } from './applyCdnAccess';
export type {
  ApplyCdnAccessInput,
  ApplyCdnAccessResult,
  CdnAccessInfoForApply,
} from './applyCdnAccess';
