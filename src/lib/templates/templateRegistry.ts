import type { ScenarioTemplate } from './types';
import { urlShortenerTemplate } from './definitions/urlShortener';
import { twitterFeedTemplate } from './definitions/twitterFeed';
import { ecommerceTemplate } from './definitions/ecommerce';

// TODO: scoringEngine.ts — will evaluate scoringRubric against user topology
export const ALL_TEMPLATES: ScenarioTemplate[] = [
    urlShortenerTemplate,
    twitterFeedTemplate,
    ecommerceTemplate,
];

export function getTemplateById(id: string): ScenarioTemplate | undefined {
    return ALL_TEMPLATES.find(t => t.id === id);
}
