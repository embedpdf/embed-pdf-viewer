import { Component, inject } from '@angular/core';
import { EpdfForm } from '@embedpdf/angular/form';

@Component({
  selector: 'app-give-selected-to',
  template: `
    @if (form.selectedFields().length > 0) {
      Give to
      @for (group of form.groups(); track group.id) {
        <button [disabled]="!form.canSetGroup(group.id)" (click)="give(group.id)">
          <i [style.background]="group.color"></i> {{ group.label ?? group.id }}
        </button>
      }
    }
  `,
})
export class GiveSelectedTo {
  protected readonly form = inject(EpdfForm);

  protected give(groupId: string) {
    void this.form.moveToGroup(
      this.form.selectedFields().map((field) => field.ref),
      groupId,
    );
  }
}
