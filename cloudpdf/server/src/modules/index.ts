/**
 * `@cloudpdf/server/modules`: the host side of a server module, what the
 * server mounts. Modules are written with `@cloudpdf/server-modules`, which
 * builds on these types; the host that mounts them stays inside the server.
 */
export type {
  HostedDocRoute,
  HostedModule,
  HostedModuleHost,
  HostedRequest,
  ModuleConfigEntry,
  ModuleConnection,
  ModuleLog,
  ModuleRequirements,
  ModuleResponse,
  ModuleSession,
} from './protocol';
export type { PermissionDeclaration, PermissionLevel } from '../auth/permission-registry';
