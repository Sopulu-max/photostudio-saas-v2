'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBooking } from '@/modules/bookings/interface';
import { createClient } from '@/modules/clients/interface';
import { formatMoney } from '@/kernel/currency';

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
    <div className="q-field q-combo">
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
        onFocus={(e) => { setIsOpen(true); e.target.select(); }}
        onBlur={() => { setTimeout(() => setIsOpen(false), 200); }}
      />

      {isOpen && (
        <div className="q-combo-menu">
          {filtered.map(c => (
            <button
              type="button"
              key={c.id}
              className="q-combo-option"
              onMouseDown={() => {
                onChange(c.id);
                setQuery(c.name);
                setIsOpen(false);
                onNewClientName('');
              }}
            >
              <div className="q-combo-title">{c.name}</div>
              {(c.phone || c.email) && (
                <div className="q-combo-sub">
                  {[c.phone, c.email].filter(Boolean).join(' · ')}
                </div>
              )}
            </button>
          ))}
          {query.trim() !== '' && (
            <>
              {filtered.length > 0 && <div className="q-combo-sep" />}
              <button
                type="button"
                className="q-combo-option q-combo-create"
                onMouseDown={() => {
                  onNewClientName(query.trim());
                  setIsOpen(false);
                }}
              >
                + Create new client: &ldquo;{query.trim()}&rdquo;
              </button>
            </>
          )}
          {filtered.length === 0 && query.trim() === '' && (
            <div className="q-combo-empty">No clients yet. Type a name to create one.</div>
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
    <div className="q-field q-combo">
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
        onFocus={(e) => { setIsOpen(true); e.target.select(); }}
        onBlur={() => { setTimeout(() => setIsOpen(false), 200); }}
      />

      {isOpen && (
        <div className="q-combo-menu">
          {filtered.map(p => (
            <button
              type="button"
              key={p.id}
              className="q-combo-option"
              onMouseDown={() => {
                onChange(p.id);
                setQuery(p.name);
                setIsOpen(false);
              }}
            >
              <div className="q-combo-title">{p.name}</div>
              <div className="q-combo-facts">
                {p.pricing?.base_price != null ? (
                  <span className="q-strong">
                    {formatMoney(p.pricing.base_price, p.pricing.currency)}
                    {p.priceUnit ? ` / ${p.priceUnit}` : ''}
                    {p.pricingVariant ? ' +' : ''}
                  </span>
                ) : <span>Custom quote</span>}
                {p.durationMinutes && <span>· {p.durationMinutes} min</span>}
                {p.services.length > 0 && <span className="q-nowrap">· {p.services.join(', ')}</span>}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="q-combo-empty">No packages match that.</div>
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
    <div className="q-card q-stack q-stack-md q-card-narrow-lg">

      {/* ── Client Section ── */}
      {selectedClient ? (
        /* Existing client selected — show their info */
        <div className="q-field">
          <label className="q-label">Who&rsquo;s it for?</label>
          <div className="q-picked q-picked-head">
            <div className="q-fill">
              <div className="q-picked-name">{selectedClient.name}</div>
              <div className="q-combo-sub">
                {selectedClient.phone || selectedClient.email
                  ? [selectedClient.phone, selectedClient.email].filter(Boolean).join(' · ')
                  : 'No contact details on file'}
              </div>
            </div>
            <button type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={clearClient}>
              Change
            </button>
          </div>
        </div>
      ) : newClientName ? (
        /* Creating new client — show editable fields */
        <div className="q-field">
          <label className="q-label">New client</label>
          <div className="q-picked q-picked-accent q-stack q-stack-sm">
            <div className="q-picked-head">
              <span className="q-picked-name">{newClientName}</span>
              <button type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={clearClient}>
                Change
              </button>
            </div>
            <div className="q-field">
              <label className="q-label">Email</label>
              <input
                className="q-input"
                type="email"
                placeholder="client@example.com"
                value={newClientEmail}
                onChange={(e) => setNewClientEmail(e.target.value)}
              />
            </div>
            <div className="q-field">
              <label className="q-label">Phone</label>
              <input
                className="q-input"
                type="tel"
                placeholder="+234 800 000 0000"
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
          <div className="q-picked q-stack q-stack-sm">
            <div className="q-picked-head">
              <div>
                <div className="q-picked-name">{selectedPackage.name}</div>
                {selectedPackage.description && (
                  <div className="q-combo-sub">{selectedPackage.description}</div>
                )}
              </div>
              <button type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => { setPackageId(''); setSelectedTierLabel(''); }}>
                Change
              </button>
            </div>

            <div className="q-combo-facts">
              <span className="q-strong">
                {selectedPackage.pricing?.base_price != null
                  ? formatMoney(selectedPackage.pricing.base_price, selectedPackage.pricing.currency)
                  : 'Custom quote'}
                {selectedPackage.priceUnit && ` / ${selectedPackage.priceUnit}`}
              </span>
              {selectedPackage.durationMinutes && <span>· {selectedPackage.durationMinutes} min</span>}
            </div>

            {selectedPackage.services.length > 0 && (
              <div className="q-meta-sm">Includes: {selectedPackage.services.join(', ')}</div>
            )}

            {selectedPackage.deliverables.length > 0 && (
              <div>
                <div className="q-meta-sm">They get:</div>
                <div className="q-chip-row">
                  {selectedPackage.deliverables.map(d => (
                    <span key={d} className="q-chip">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {selectedPackage.pricingVariant?.tiers && (
              <div>
                <div className="q-combo-sep" />
                <div className="q-label">Select {selectedPackage.pricingVariant.axis_label}</div>
                {selectedPackage.pricingVariant.tiers.map((t: any) => (
                  <label key={t.label} className="q-tier-row">
                    <input
                      type="radio"
                      name="package_tier"
                      value={t.label}
                      checked={selectedTierLabel === t.label}
                      onChange={() => setSelectedTierLabel(t.label)}
                    />
                    <span className="q-fill">{t.label}</span>
                    <span className="q-strong">{formatMoney(t.price, selectedPackage.pricing?.currency)}</span>
                  </label>
                ))}
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
