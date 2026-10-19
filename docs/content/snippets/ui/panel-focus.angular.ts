import { Component } from '@angular/core';
import { EpdfSurfaceFocus } from '@embedpdf/angular/shell';

@Component({
  selector: 'app-search-panel',
  imports: [EpdfSurfaceFocus],
  // The cursor goes in the field when the panel asks for it, its text selected.
  template: `<input epdfSurfaceFocus="search" epdfSurfaceFocusSelect placeholder="Search" />`,
})
export class SearchPanel {}
