import { Component } from '@angular/core';
import { EpdfDocumentGate } from '@embedpdf/angular/runtime';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';
import { PasswordForm } from './password-form';
import { Spinner } from './spinner';

@Component({
  selector: 'app-document-view',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, PasswordForm, Spinner],
  template: `
    <epdf-stage *epdfDocumentGate="let document; fallback: opening; locked: locked; error: failed">
      <ng-template epdfPage>
        <epdf-render-layer />
      </ng-template>
    </epdf-stage>

    <ng-template #opening><app-spinner /></ng-template>
    <ng-template #locked let-document><app-password-form [document]="document" /></ng-template>
    <ng-template #failed let-document>
      <p>Couldn't open {{ document.name }}: {{ document.error.message }}</p>
    </ng-template>
  `,
})
export class DocumentView {}
