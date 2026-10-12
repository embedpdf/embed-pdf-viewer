/**
 * How each page starts its app: the just-in-time compiler first, before any Angular class is
 * defined (the packages' partial declarations compile with it as they load), then the app,
 * zoneless, as an app made today runs.
 */
import '@angular/compiler';

import { provideZonelessChangeDetection, type Type } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

export function boot(app: Type<unknown>): void {
  bootstrapApplication(app, { providers: [provideZonelessChangeDetection()] }).catch(
    (error: unknown) => console.error(error),
  );
}
