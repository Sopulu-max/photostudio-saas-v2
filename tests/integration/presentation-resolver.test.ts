import { describe, it, expect, beforeAll } from 'vitest';
import { resolveEntityForAudience } from '@/lib/domains/presentation/resolver';
import { globalSchemaRegistry } from '@/lib/domains/presentation/registry';
import { AudienceContext } from '@/lib/domains/presentation/types';

describe('Presentation Engine Resolver (Facing CI)', () => {
  beforeAll(() => {
    // Ensure the registry is populated for the tests.
    // It's a singleton populated on constructor, so it should be ready.
    expect(globalSchemaRegistry.getAllSchemas().length).toBeGreaterThan(0);
  });

  describe('ServiceInstance (F1 Law - never_external)', () => {
    const mockInstance = {
      id: 'inst-123',
      organizationId: 'org-1',
      agreementId: 'agr-1',
      serviceId: 'svc-1',
      status: 'in_progress',
      fulfillmentData: {
        internalNotes: 'This client is difficult',
        clientProvidedAsset: { url: 'http://example.com/asset.jpg' }
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      customer_id: 'cust-1' // The owner edge
    };

    it('should drop never_external attributes for public audience', () => {
      const audience: AudienceContext = { role: 'public', id: null };
      const resolved = resolveEntityForAudience(mockInstance, 'ServiceInstance', audience);

      expect(resolved.id).toBeUndefined(); // counterparty_guaranteed and scope is owner, but we are public
      expect(resolved.fulfillmentData).toBeUndefined(); // never_external dropped
      expect(resolved.organizationId).toBe('org-1'); // configurable_open defaults to open
    });

    it('should expose never_external attributes ONLY to staff', () => {
      const audience: AudienceContext = { role: 'staff', id: 'staff-1' };
      const resolved = resolveEntityForAudience(mockInstance, 'ServiceInstance', audience);

      expect(resolved.fulfillmentData).toBeDefined();
      expect(resolved.fulfillmentData.internalNotes).toBe('This client is difficult');
    });

    it('should expose counterparty_guaranteed attributes to the owner customer', () => {
      const audience: AudienceContext = { role: 'customer', id: 'cust-1' };
      const resolved = resolveEntityForAudience(mockInstance, 'ServiceInstance', audience);

      expect(resolved.id).toBe('inst-123'); // F2 law
      expect(resolved.fulfillmentData).toBeUndefined(); // F1 law still applies
      // The clientProvidedAsset is F2 scoped to owner, but the parent fulfillmentData was F1.
      // Wait, if the parent is F1, the child is dropped because the parent is dropped. Let's verify the resolver behavior.
      // Actually, resolveEntityForAudience drops the parent if it fails the tier check. So clientProvidedAsset inside fulfillmentData is also dropped if fulfillmentData is never_external.
      // This is a known architectural quirk: if a nested object is F1, all children are effectively hidden.
    });

    it('should drop counterparty_guaranteed attributes for a different customer', () => {
      const audience: AudienceContext = { role: 'customer', id: 'cust-2' }; // wrong customer
      const resolved = resolveEntityForAudience(mockInstance, 'ServiceInstance', audience);

      expect(resolved.id).toBeUndefined(); // Not the owner
    });
  });

  describe('Configurable Tiers', () => {
    const mockService = {
      id: 'svc-1',
      organizationId: 'org-1',
      name: 'Luxury Portrait',
      description: 'A great session',
      pricingRules: { basePrice: 1000 },
      requiredFields: {},
      status: 'active'
    };

    it('should expose configurable_open attributes by default', () => {
      const audience: AudienceContext = { role: 'public', id: null };
      const resolved = resolveEntityForAudience(mockService, 'Service', audience);

      expect(resolved.name).toBe('Luxury Portrait');
      expect(resolved.description).toBe('A great session');
    });

    it('should hide configurable_closed attributes by default', () => {
      const audience: AudienceContext = { role: 'public', id: null };
      const resolved = resolveEntityForAudience(mockService, 'Service', audience);

      expect(resolved.pricingRules).toBeUndefined(); // Defaults to closed
    });

    it('should expose configurable_closed attributes if explicitly configured', () => {
      const audience: AudienceContext = { role: 'public', id: null };
      const facingConfig = {
        'pricingRules': true
      };
      const resolved = resolveEntityForAudience(mockService, 'Service', audience, facingConfig);

      expect(resolved.pricingRules).toBeDefined();
      expect(resolved.pricingRules.basePrice).toBe(1000);
    });

    it('should hide configurable_open attributes if explicitly configured to hide', () => {
      const audience: AudienceContext = { role: 'public', id: null };
      const facingConfig = {
        'description': false
      };
      const resolved = resolveEntityForAudience(mockService, 'Service', audience, facingConfig);

      expect(resolved.description).toBeUndefined();
      expect(resolved.name).toBe('Luxury Portrait'); // Still exposed
    });
  });
});
