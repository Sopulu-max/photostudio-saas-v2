'use client';
// Force Turbopack reload

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBooking } from '@/modules/bookings/interface';
import { createClient } from '@/modules/clients/interface';

type Option = { id: string; name: string; email?: string; phone?: string };

export type PackageOption = {
  id: string;
  name: string;
  description: string | null;
  pricing: any;
  priceUnit: string | null;
  pricingVariant: any;
  durationMinutes: number | null;
  paymentPolicy: string | null;
  services: string[];
  deliverables: string[];
};

function formatMoney(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
}

function ClientCombobox({ 
  clients, 
  value, 
  onChange,
  onNewClientName
}: { 
  clients: Option[]; 
  value: string; 
  onChange: (id: string) => void;
  onNewClientName: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      const selectedClient = clients.find(c => c.id === value);
      setQuery(selectedClient ? selectedClient.name : '');
    }
  }, [value, isOpen, clients]);

  const filtered = query === '' 
    ? clients 
    : clients.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="q-field" style={{ position: 'relative' }}>
      <label className="q-label">Who&rsquo;s it for?</label>
      <input 
        className="q-input" 
        placeholder="Not sure yet (type to search or create)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          onChange(''); // Clear selected id when typing
          onNewClientName('');
        }}
        onFocus={() => {
          setIsOpen(true);
          // Auto-select text on focus so they can easily type over it
          setTimeout(() => {
            const el = document.activeElement as HTMLInputElement;
            if (el && el.select) el.select();
          }, 0);
        }}
        onBlur={() => {
          setTimeout(() => setIsOpen(false), 200);
        }}
      />
      
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, 
          background: 'var(--q-color-paper-elevated)', 
          border: '1px solid var(--q-color-border)', 
          borderRadius: '4px',
          maxHeight: '16rem', overflowY: 'auto',
          zIndex: 10,
          marginTop: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          {filtered.map(c => (
            <div 
              key={c.id} 
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--q-color-border-subtle)' }}
              onMouseDown={() => {
                onChange(c.id);
                setQuery(c.name);
                setIsOpen(false);
                onNewClientName('');
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--q-color-surface)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              {(c.phone || c.email) && (
                <div style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-subtle)', marginTop: '2px' }}>
                  {c.phone} {c.phone && c.email && ' • '} {c.email}
                </div>
              )}
            </div>
          ))}
          {query.trim() !== '' && (
            <div 
              style={{ padding: '8px 12px', cursor: 'pointer', color: 'var(--q-color-ink-accent)' }}
              onMouseDown={() => {
                onNewClientName(query.trim());
                setIsOpen(false);
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--q-color-surface)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              + Create new client: &quot;{query.trim()}&quot;
            </div>
          )}
          {filtered.length === 0 && query.trim() === '' && (
            <div style={{ padding: '8px 12px', color: 'var(--q-color-ink-subtle)' }}>
              No clients found. Type to create one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PackageCombobox({
  packages,
  value,
  onChange
}: {
  packages: PackageOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      const selected = packages.find(p => p.id === value);
      setQuery(selected ? selected.name : '');
    }
  }, [value, isOpen, packages]);

  const filtered = query === '' 
    ? packages 
    : packages.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="q-field" style={{ position: 'relative' }}>
      <label className="q-label">What do they want?</label>
      <input 
        className="q-input" 
        placeholder="Decide later (type to search packages)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          onChange('');
        }}
        onFocus={() => {
          setIsOpen(true);
          setTimeout(() => {
            const el = document.activeElement as HTMLInputElement;
            if (el && el.select) el.select();
          }, 0);
        }}
        onBlur={() => {
          setTimeout(() => setIsOpen(false), 200);
        }}
      />
      
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, 
          background: 'var(--q-color-paper-elevated)', 
          border: '1px solid var(--q-color-border)', 
          borderRadius: '4px',
          maxHeight: '20rem', overflowY: 'auto',
          zIndex: 10,
          marginTop: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          {filtered.map(p => (
            <div 
              key={p.id} 
              style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--q-color-border-subtle)' }}
              onMouseDown={() => {
                onChange(p.id);
                setQuery(p.name);
                setIsOpen(false);
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--q-color-surface)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{p.name}</div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: 'var(--q-color-ink-subtle)', marginTop: '4px' }}>
                {p.pricing?.base_price != null ? (
                  <span style={{ fontWeight: 500 }}>
                    {formatMoney(p.pricing.base_price, p.pricing.currency)}
                    {p.priceUnit ? ` / ${p.priceUnit}` : ''}
                    {p.pricingVariant ? ' +' : ''}
                  </span>
                ) : <span>Custom quote</span>}
                
                {p.durationMinutes && (
                  <span>• {p.durationMinutes} min</span>
                )}
                
                {p.services.length > 0 && (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    • {p.services.join(', ')}
                  </span>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '8px 12px', color: 'var(--q-color-ink-subtle)' }}>
              No packages found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A booking starts from what a studio actually knows: who it's for, what they
 * want, when. Nothing is required — the name composes itself from whatever is
 * given, so nobody has to invent a title.
 */
export function NewBookingForm({ clients, packages }: { clients: Option[]; packages: PackageOption[] }) {
  const [contactId, setContactId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [packageId, setPackageId] = useState('');
  const [selectedTierLabel, setSelectedTierLabel] = useState<string>('');
  const [when, setWhen] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const selectedClient = clients.find(c => c.id === contactId);
  const selectedPackage = packages.find(p => p.id === packageId);

  const clearClient = () => {
    setContactId('');
    setNewClientName('');
    setNewClientEmail('');
    setNewClientPhone('');
  };

  const handlePackageSelect = (pId: string) => {
    setPackageId(pId);
    setSelectedTierLabel('');
    const p = packages.find(x => x.id === pId);
    if (p) {
      if (p.durationMinutes && !when) {
        // We don't have a good way to auto-fill a datetime-local with duration alone,
        // but if we wanted to auto-fill start time to "now", we could.
        // For now, duration doesn't map directly to a datetime-local string.
      }
    }
  };

  const create = () =>
    startTransition(async () => {
      try {
        let finalContactId = contactId || null;
        
        if (newClientName) {
          // createClient returns BOTH ids: clientId is the clients row, contactId
          // the contacts row. A booking points at the contact — bookings.contact_id
          // is FK'd to contacts(id) — so taking clientId here fails the constraint.
          const { contactId: newContactId } = await createClient({
            name: newClientName,
            email: newClientEmail || undefined,
            phone: newClientPhone || undefined,
          });
          finalContactId = newContactId;
        }

        let linePrice: Record<string, unknown> | undefined = undefined;
        if (selectedPackage) {
          if (selectedTierLabel && selectedPackage.pricingVariant) {
            const tier = selectedPackage.pricingVariant.tiers.find((t: any) => t.label === selectedTierLabel);
            if (tier) {
              linePrice = {
                ...selectedPackage.pricing,
                base_price: tier.price
              };
            }
          }
        }

        const { bookingId } = await createBooking({
          contactId: finalContactId,
          packageId: packageId || null,
          linePrice,
          scheduledFor: when ? new Date(when).toISOString() : null,
        });
        router.push(`/bookings/${bookingId}`);
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Failed to create the booking.');
      }
    });

  return (
    <div className="q-card q-stack q-stack-md" style={{ width: '100%', maxWidth: '500px', overflow: 'visible', position: 'relative' }}>

      {/* ── Client Section ── */}
      {selectedClient ? (
        /* Existing client selected — show their info */
        <div className="q-field">
          <label className="q-label">Who&rsquo;s it for?</label>
          <div className="q-note" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{selectedClient.name}</div>
              {(selectedClient.phone || selectedClient.email) && (
                <div style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-500)', marginTop: '2px' }}>
                  {selectedClient.phone}{selectedClient.phone && selectedClient.email && ' · '}{selectedClient.email}
                </div>
              )}
              {!selectedClient.phone && !selectedClient.email && (
                <div style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-500)', marginTop: '2px', fontStyle: 'italic' }}>
                  No contact details on file
                </div>
              )}
            </div>
            <button type="button" className="q-btn q-btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={clearClient}>
              Change
            </button>
          </div>
        </div>
      ) : newClientName ? (
        /* Creating new client — show editable fields */
        <div className="q-field">
          <label className="q-label">New client</label>
          <div className="q-stack q-stack-sm" style={{ padding: '12px', border: '1px solid var(--q-color-accent)', borderRadius: '8px', background: 'color-mix(in srgb, var(--q-color-accent) 5%, transparent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>{newClientName}</span>
              <button type="button" className="q-btn q-btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={clearClient}>
                Change
              </button>
            </div>
            <div className="q-field">
              <label className="q-label" style={{ fontSize: '0.8rem' }}>Email</label>
              <input
                className="q-input"
                type="email"
                placeholder="client@example.com"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
              />
            </div>
            <div className="q-field">
              <label className="q-label" style={{ fontSize: '0.8rem' }}>Phone</label>
              <input
                className="q-input"
                type="tel"
                placeholder="+1 555 000 0000"
                value={newClientPhone}
                onChange={(e) => setNewClientPhone(e.target.value)}
              />
            </div>
          </div>
        </div>
      ) : (
        /* No client chosen yet — show the combobox */
        <ClientCombobox 
          clients={clients} 
          value={contactId} 
          onChange={setContactId} 
          onNewClientName={setNewClientName}
        />
      )}

      {/* ── Package Section ── */}
      {!selectedPackage ? (
        <PackageCombobox 
          packages={packages}
          value={packageId}
          onChange={handlePackageSelect}
        />
      ) : (
        <div className="q-field">
          <label className="q-label">What do they want?</label>
          <div className="q-stack q-stack-sm" style={{ padding: '12px', border: '1px solid var(--q-color-border)', borderRadius: '8px', background: 'var(--q-color-paper-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{selectedPackage.name}</div>
                {selectedPackage.description && (
                  <div style={{ fontSize: '0.9rem', color: 'var(--q-color-ink-500)', marginTop: '4px' }}>
                    {selectedPackage.description}
                  </div>
                )}
              </div>
              <button type="button" className="q-btn q-btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={() => { setPackageId(''); setSelectedTierLabel(''); }}>
                Change
              </button>
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
              <div style={{ fontWeight: 600, color: 'var(--q-color-ink)' }}>
                {selectedPackage.pricing?.base_price != null ? formatMoney(selectedPackage.pricing.base_price, selectedPackage.pricing.currency) : 'Custom quote'}
                {selectedPackage.priceUnit && ` / ${selectedPackage.priceUnit}`}
              </div>
              {selectedPackage.durationMinutes && (
                <div style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-500)', display: 'flex', alignItems: 'center' }}>
                  • {selectedPackage.durationMinutes} min
                </div>
              )}
            </div>

            {selectedPackage.deliverables.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-500)' }}>Deliverables:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                  {selectedPackage.deliverables.map(d => (
                    <span key={d} style={{ fontSize: '0.75rem', padding: '2px 6px', background: 'var(--q-color-surface)', borderRadius: '4px', border: '1px solid var(--q-color-border-subtle)' }}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedPackage.services.length > 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-500)', marginTop: '4px' }}>
                Includes: {selectedPackage.services.join(', ')}
              </div>
            )}

            {selectedPackage.pricingVariant && selectedPackage.pricingVariant.tiers && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--q-color-border-subtle)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
                  Select {selectedPackage.pricingVariant.axis_label}:
                </div>
                <div className="q-stack q-stack-sm">
                  {selectedPackage.pricingVariant.tiers.map((t: any) => (
                    <label key={t.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        name="package_tier" 
                        value={t.label} 
                        checked={selectedTierLabel === t.label} 
                        onChange={() => setSelectedTierLabel(t.label)} 
                      />
                      <span style={{ flex: 1, fontSize: '0.9rem' }}>{t.label}</span>
                      <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{formatMoney(t.price, selectedPackage.pricing?.currency)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="q-field">
        <label className="q-label">When?</label>
        <input type="datetime-local" className="q-input" value={when} onChange={(e) => setWhen(e.target.value)} />
      </div>

      <div className="q-row">
        <button className="q-btn q-btn-primary" onClick={create} disabled={isPending}>
          {isPending ? 'Creating…' : 'Create booking'}
        </button>
        <button className="q-btn q-btn-secondary" onClick={() => router.back()} disabled={isPending}>Cancel</button>
      </div>

      <span className="q-meta-sm">
        Everything here is optional — start with nothing and fill it in as you learn it.
      </span>
    </div>
  );
}
