/**
 * Every test file: the JIT compiler, and TestBed in a browser-like platform. Each test makes
 * its own module, zoneless (`provideZonelessChangeDetection()`), as an app would.
 */
import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
  teardown: { destroyAfterEach: true },
});
