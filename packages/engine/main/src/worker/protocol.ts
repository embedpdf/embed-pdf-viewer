/**
 * Worker protocol shapes are defined in @embedpdf/engine-core so that
 * @cloudpdf/server can use the same wire format. This file re-exports the
 * subset engine-local needs and adds local aliases so existing imports
 * continue to work.
 */
export type {
  WorkerJobId as JobId,
  WorkerRequest,
  WorkerResponse,
  WorkerResultPayload,
  OpenWorkerRequest as OpenRequest,
  MetadataReadWorkerRequest as MetadataReadRequest,
  CloseWorkerRequest as CloseRequest,
  AbortWorkerRequest as AbortRequest,
  ShutdownWorkerRequest as ShutdownRequest,
} from '@embedpdf/engine-core/runtime';
