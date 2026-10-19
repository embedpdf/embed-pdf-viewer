import { PercentPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { EpdfCommand } from '@embedpdf/angular/commands';
import { EpdfStageRef } from '@embedpdf/angular/stage';
import { EpdfButton } from '@cloudpdf/viewer-angular';

@Component({
  selector: 'app-zoom-pill',
  imports: [EpdfButton, EpdfCommand, PercentPipe],
  template: `
    <div class="zoom-pill">
      <epdf-button command="zoom:out" />
      <span>{{ stage.zoomLevel() | percent }}</span>
      <epdf-button command="zoom:in" />
      <button class="chip" [epdfCommand]="'zoom:fit-width'" #fit="epdfCommand">{{ fit.label() }}</button>
    </div>
  `,
})
export class ZoomPill {
  protected readonly stage = inject(EpdfStageRef);
}
