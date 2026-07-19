import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';

// Zoneless on purpose: the adapter is signal-driven end to end, so this app is
// the proof that no part of it leans on zone.js.
bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection()],
}).catch((err) => console.error(err));
