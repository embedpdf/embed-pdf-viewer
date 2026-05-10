import '@angular/compiler'
import { provideZonelessChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { provideEmbedPdfViewerConfig } from '@embedpdf/angular-pdf-viewer'

import { App } from './app/app.component'
import { ANGULAR_VIEWER_DEFAULT_CONFIG } from './app/viewer-config'
import './styles.css'

bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    ...provideEmbedPdfViewerConfig(ANGULAR_VIEWER_DEFAULT_CONFIG),
  ],
}).catch((error: unknown) => {
  globalThis.console.error(error)
})
