import {
  Component,
  ElementRef,
  ViewChild,
  provideZonelessChangeDetection,
  type AfterViewInit,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { runProbe } from '@embedpdf/bundler-probe/portable';

@Component({ selector: 'app-root', template: '<pre id="probe" #probe>running…</pre>' })
class App implements AfterViewInit {
  @ViewChild('probe') probe!: ElementRef<HTMLElement>;
  ngAfterViewInit() {
    void runProbe(this.probe.nativeElement);
  }
}

bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }).catch(console.error);
