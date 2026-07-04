import React from 'react';
import { 
  Building2, 
  User, 
  FileText, 
  Briefcase, 
  Package, 
  Layers,
  Image as ImageIcon,
  HardDrive
} from 'lucide-react';
import styles from './ontology.module.css';
import { StateBadge, KernelState } from './StateBadge';
import { 
  OrganizationDTO, 
  CustomerDTO, 
  RequestDTO, 
  AgreementDTO, 
  ServiceInstanceDTO,
  IdentityDTO,
  ServiceDTO,
  AssetDTO,
  OutcomeDTO
} from '@/lib/domains/kernel/types';

// We map Kernel concepts to standard props so the Signature renderer knows what to do
type EntityType = 'organization' | 'identity' | 'customer' | 'request' | 'agreement' | 'service' | 'service_instance' | 'outcome' | 'asset';
type Scale = 'card' | 'row' | 'chip';

interface EntitySignatureProps {
  type: EntityType;
  scale?: Scale;
  // The raw Kernel entity bounds to this signature
  data: OrganizationDTO | IdentityDTO | CustomerDTO | RequestDTO | AgreementDTO | ServiceDTO | ServiceInstanceDTO | AssetDTO | OutcomeDTO;
}

export function EntitySignature({ type, scale = 'row', data }: EntitySignatureProps) {
  // 1. Resolve Icon
  const Icon = getIconForEntity(type);
  
  // 2. Resolve Primary Label
  const label = getLabelForEntity(type, data);
  
  // 3. Resolve State (if entity carries state)
  const state = ('status' in data ? data.status : null);

  // 4. Resolve Shape Class
  let shapeClass = '';
  switch (type) {
    case 'agreement': shapeClass = styles.sigAgreement; break;
    case 'service': shapeClass = styles.sigService; break;
    case 'request': shapeClass = styles.sigRequest; break;
    case 'customer': shapeClass = styles.sigCustomer; break;
    case 'service_instance': shapeClass = styles.sigInstance; break;
    case 'organization': shapeClass = styles.sigOrganization; break;
    case 'identity': shapeClass = styles.sigIdentity; break;
    case 'asset': shapeClass = styles.sigAsset; break;
    case 'outcome': shapeClass = styles.sigOutcome; break;
  }

  // Render per scale
  if (scale === 'chip') {
    return (
      <div className={`${styles.chip} ${shapeClass}`}>
        <Icon size={14} />
        <span>{label}</span>
        {state && <StateBadge state={state} />}
      </div>
    );
  }

  if (scale === 'row') {
    return (
      <div className={`${styles.row} ${shapeClass}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Icon size={20} />
          <span style={{ fontWeight: 500 }}>{label}</span>
        </div>
        {state && <StateBadge state={state} />}
      </div>
    );
  }

  // Card scale
  return (
    <div className={`${styles.signatureCard} ${shapeClass}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)' }}>
        <Icon size={16} />
        <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {type.replace('_', ' ')}
        </span>
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
        {label}
      </div>
      {state && (
        <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
          <StateBadge state={state} />
        </div>
      )}
    </div>
  );
}

// --- Helpers ---

function getIconForEntity(type: EntityType) {
  switch (type) {
    case 'organization': return Building2;
    case 'identity': return User; // Or a badge icon, but we stick to existing imports
    case 'customer': return User;
    case 'request': return FileText;
    case 'agreement': return Briefcase;
    case 'service': return Package;
    case 'service_instance': return Layers;
    case 'outcome': return ImageIcon;
    case 'asset': return HardDrive;
    default: return FileText;
  }
}

type EntityData = OrganizationDTO | IdentityDTO | CustomerDTO | RequestDTO | AgreementDTO | ServiceDTO | ServiceInstanceDTO | AssetDTO | OutcomeDTO;

function getLabelForEntity(type: EntityType, data: EntityData): string {
  switch (type) {
    case 'organization': return (data as OrganizationDTO).name || 'Unknown Organization';
    case 'identity': return (data as IdentityDTO).name || 'Unknown Identity';
    case 'service': return (data as ServiceDTO).name || 'Unknown Service';
    case 'customer': return (data as CustomerDTO).profileData?.name || (data as CustomerDTO).primaryIdentifier || 'Unknown Customer';
    case 'request': return `Req: ${(data as RequestDTO).id.substring(0,8)}`;
    case 'agreement': return `Agr: ${(data as AgreementDTO).id.substring(0,8)}`;
    case 'service_instance': return `Inst: ${(data as ServiceInstanceDTO).id.substring(0,8)}`;
    case 'asset': return `Asset: ${(data as AssetDTO).id.substring(0,8)}`;
    case 'outcome': return `Outcome: ${(data as OutcomeDTO).id.substring(0,8)}`;
    default: return ('id' in data ? data.id.substring(0,8) : 'Unknown');
  }
}
