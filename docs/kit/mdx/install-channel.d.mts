export function resolveInstallChannel(): string;

export function applyInstallChannel(code: string, channel?: string, scopes?: string[]): string;

export function remarkInstallChannel(options?: {
  channel?: string;
  scopes?: string[];
}): (tree: unknown) => unknown;
