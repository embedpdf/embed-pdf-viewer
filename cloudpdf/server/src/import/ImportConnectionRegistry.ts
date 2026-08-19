/**
 * Boot-validated lookup for operator-registered import connections.
 * Construction throws on duplicate ids so a misconfigured deployment
 * refuses to start instead of resolving ambiguously at request time.
 */
import type { ImportConnection } from './config/ImportConnectionSchema';

export class ImportConnectionRegistry {
  private readonly byId = new Map<string, ImportConnection>();

  constructor(connections: ReadonlyArray<ImportConnection> = []) {
    for (const conn of connections) {
      if (this.byId.has(conn.id)) {
        throw new Error(`duplicate import connection id: ${conn.id}`);
      }
      this.byId.set(conn.id, conn);
    }
  }

  get(id: string): ImportConnection | undefined {
    return this.byId.get(id);
  }

  list(): ImportConnection[] {
    return [...this.byId.values()];
  }

  get size(): number {
    return this.byId.size;
  }
}
