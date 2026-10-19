import { feedbackPlugin, interactionPlugin, vibrationFeedback } from '@embedpdf/react/interaction';

export const plugins = [/* … */ interactionPlugin(), feedbackPlugin({ provider: vibrationFeedback })];
