import { BlockDefinition } from './types';
import { HeroBlockDefinition } from './blocks/HeroBlock';
import { PricingBlockDefinition } from './blocks/PricingBlock';

export const Blocks: Record<string, BlockDefinition> = {
  Hero: HeroBlockDefinition,
  Pricing: PricingBlockDefinition,
};

export function getBlocksForContext(context: string): BlockDefinition[] {
  return Object.values(Blocks).filter(block => 
    block.allowedContexts === 'all' || block.allowedContexts.includes(context as any)
  );
}
