import { createCapabilityToken } from '@embedpdf/core';

export interface PlatformFeedback {
  selection(): void;
  impact(weight?: 'light' | 'medium' | 'heavy'): void;
  notify(kind: 'success' | 'warning' | 'error'): void;
}

export const FeedbackToken = createCapabilityToken<PlatformFeedback>('feedback');

export interface FeedbackPluginOptions {
  provider?: PlatformFeedback;
}
