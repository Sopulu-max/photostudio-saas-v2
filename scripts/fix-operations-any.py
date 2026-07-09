import re

filepath = r'c:\Users\GLAMOUR\photostudio-saas-v2\src\lib\domains\kernel\operations.ts'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Import Json
if 'Json' not in content[:500]:
    content = content.replace("ModifyAgreementCommand,", "ModifyAgreementCommand,\n  Json")

# 2. executeTransition: payload as any -> payload as unknown as Json
content = content.replace("payload: payload as any", "payload: payload as unknown as Json")

# 3. createCustomer: profileData as any -> profileData as unknown as Json
content = content.replace("profile_data: profileData as any", "profile_data: profileData as unknown as Json")

# 4. submitRequest: requestedServices: any -> requestedServices: RequestedService[]
content = content.replace("requestedServices: any", "requestedServices: RequestedService[]")
# For the DB insert, requestedServices is cast to unknown as Json
content = content.replace("requested_services: requestedServices,", "requested_services: requestedServices as unknown as Json,")

# 5. executeTransition calls with payload: {} as any -> payload: {}
content = re.sub(r"payload:\s*\{\}\s*as any", "payload: {}", content)

# 6. executeTransition calls with {} as any -> {}
content = re.sub(r"\{\}\s*as any", "{}", content)

# 7. proposeAgreement: terms: any -> terms: Record<string, unknown>
content = content.replace("terms: any", "terms: Record<string, unknown>")

# 8. activateAgreement: (agr.terms.services as any) -> (agr.terms.services as RequestedService[])
content = content.replace("(agr.terms.services as any)", "(agr.terms.services as RequestedService[])")

# 9. activateAgreement: s as any -> s as unknown as Json
content = content.replace("fulfillment_data: s as any", "fulfillment_data: s as unknown as Json")

# 10. modifyAgreement: { changes } as any -> { changes }
content = content.replace("{ changes } as any", "{ changes }")

# 11. modifyAgreement: agr.terms as any -> agr.terms as Record<string, unknown>
content = content.replace("agr.terms as any", "agr.terms as Record<string, unknown>")

# 12. defineService: pricing_rules: data.pricingRules as any -> data.pricingRules as unknown as Json
content = content.replace("pricing_rules: data.pricingRules as any", "pricing_rules: data.pricingRules as unknown as Json")
content = content.replace("required_fields: data.requiredFields as any", "required_fields: data.requiredFields as unknown as Json")

# 13. deliverOutcome: rightsPayload as any -> rightsPayload
content = content.replace("rightsPayload as any", "rightsPayload")

# 14. setAssetRetention: { policy } as any -> { policy }
content = content.replace("{ policy } as any", "{ policy }")

# 15. transitionInstance: payload as any -> payload
content = content.replace("payload as any", "payload")

# 16. recordWorkstep: { stepName } as any -> { stepName }
content = content.replace("{ stepName } as any", "{ stepName }")

# 17. enrichIdentity: const updatePayload: any = {}; -> const updatePayload: Record<string, unknown> = {};
content = content.replace("const updatePayload: any = {};", "const updatePayload: Record<string, unknown> = {};")

# 18. enrichIdentity: updatePayload as any -> updatePayload
content = content.replace("updatePayload as any", "updatePayload")

# 19. mergeCustomers: { primaryId } as any -> { primaryId }
content = content.replace("{ primaryId } as any", "{ primaryId }")

# 20. defineService transition: data as any -> data
content = content.replace("defined', data as any);", "defined', data);")

# 21. createOrganization transition: data as any -> data
content = content.replace("created', data as any);", "created', data);")

# 22. LEGAL_TRANSITIONS: as any)?.[currentState]
content = content.replace("LEGAL_TRANSITIONS[entityType + 's' as keyof typeof LEGAL_TRANSITIONS] as any", "LEGAL_TRANSITIONS[entityType + 's' as keyof typeof LEGAL_TRANSITIONS] as Record<string, string[]>")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
