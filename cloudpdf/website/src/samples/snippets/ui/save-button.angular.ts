import { Component } from '@angular/core';
import { EpdfTPipe } from '@embedpdf/angular/i18n';

@Component({
  selector: 'app-save-button',
  imports: [EpdfTPipe],
  template: `<button>{{ 'toolbar.save' | epdfT }}</button>`,
})
export class SaveButton {}
