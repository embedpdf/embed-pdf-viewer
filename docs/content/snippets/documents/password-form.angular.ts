import { Component, inject, input, signal } from '@angular/core';
import { EpdfDocuments, type DocumentInfo } from '@embedpdf/angular/runtime';
import { PasswordPrompt } from './password-prompt';

@Component({
  selector: 'app-password-form',
  imports: [PasswordPrompt],
  template: `<app-password-prompt [wrong]="wrong()" (submitted)="submit($event)" />`,
})
export class PasswordForm {
  readonly document = input.required<DocumentInfo>();
  private readonly documents = inject(EpdfDocuments);
  protected readonly wrong = signal(false);

  protected async submit(password: string) {
    try {
      await this.documents.unlock(this.document().id, { password });
    } catch {
      this.wrong.set(true); // it stays locked; ask again
    }
  }
}
