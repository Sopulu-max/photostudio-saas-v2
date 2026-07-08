import { cache } from 'react';
import { resolveEntityForAudience } from './resolver';
import { AudienceContext, FacingConfig } from './types';

class PresentationEngineImpl {
  /**
   * Resolves an entity's presentation form for a given audience.
   * Cached per-request to avoid redundant resolution logic when
   * multiple components bind to the same entity on a page.
   */
  resolve = cache((entity: any, entityType: string, audience: AudienceContext, facingConfig?: FacingConfig) => {
    return resolveEntityForAudience(entity, entityType, audience, facingConfig);
  });
  
  /**
   * Resolves a collection of entities for a given audience.
   */
  resolveCollection = cache((entities: any[], entityType: string, audience: AudienceContext, facingConfig?: FacingConfig) => {
    if (!entities) return [];
    return entities.map(entity => this.resolve(entity, entityType, audience, facingConfig));
  });
}

export const PresentationEngine = new PresentationEngineImpl();
