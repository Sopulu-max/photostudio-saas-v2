'use client';

import React, { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBooking, addBookingLine, setLineConfiguration } from '@/modules/bookings/interface';
import { createClient } from '@/modules/clients/interface';
import { getPackage, createPackage } from '@/modules/packages/interface';
import { PackageFieldsEditor } from '../packages/[id]/PackageFieldsEditor';

type Option = { id: string; name: string; email?: string; phone?: string };

export type PackageOption = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  services: string[];
  deliverables: string[];
  dimensions: { id: string, name: string, values: { id: string, name: string }[] }[];
};

export type ServiceOption = {
  id: string;
  name: string;
  domainName: string;
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
          onChange('');
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
  onSelect,
  onCustom
}: { 
  packages: { id: string, name: string, description?: string | null }[]; 
  onSelect: (id: string) => void;
  onCustom: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filtered = query === '' 
    ? packages 
    : packages.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="q-field q-combo" style={{ position: 'relative' }}>
      <input
        className="q-input"
        placeholder="Type a package name or domain to search..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={(e) => { setIsOpen(true); e.target.select(); }}
        onBlur={() => { setTimeout(() => setIsOpen(false), 200); }}
      />

      {isOpen && (
        <div className="q-combo-menu" style={{ zIndex: 10 }}>
          {filtered.map(p => (
            <button
              type="button"
              key={p.id}
              className="q-combo-option"
              onMouseDown={() => {
                onSelect(p.id);
                setQuery('');
                setIsOpen(false);
              }}
            >
              <div className="q-combo-title">{p.name}</div>
              {p.description && (
                <div className="q-combo-sub">
                  {p.description}
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
                  onCustom(query.trim());
                  setIsOpen(false);
                  setQuery('');
                }}
              >
                + Build a custom package: &ldquo;{query.trim()}&rdquo;
              </button>
            </>
          )}
          {filtered.length === 0 && query.trim() === '' && (
            <>
              <div className="q-combo-empty">Search existing templates</div>
              <div className="q-combo-sep" />
              <button
                type="button"
                className="q-combo-option q-combo-create"
                onMouseDown={() => {
                  onCustom('');
                  setIsOpen(false);
                }}
              >
                + Or build a custom package from scratch
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function NewBookingForm({ 
  clients, 
  packages,
  services,
  dimensionsByDomain,
  allServices,
  allVariables,
  allDeliverables,
  
  
  roleOptions,
  currencyCode
}: { 
  clients: Option[]; 
  packages: PackageOption[];
  services: ServiceOption[];
  dimensionsByDomain: Record<string, any[]>;
  allServices: any[];
  allVariables: any[];
  allDeliverables: any[];
  roleOptions: string[];
  currencyCode: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [contactId, setContactId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [when, setWhen] = useState('');
  
  type LineState = {
    id: string;
    selectedDomain: string;
    packageId: string;
    customName?: string;
    selectedPackageDeep: any;
    isLoadingDeep: boolean;
    linePrice: string;
    selectedDimensionValues: Record<string, string>;
  };

  const freshLine = (): LineState => ({
    id: Math.random().toString(36).substr(2, 9),
    selectedDomain: '',
    packageId: '',
    customName: '',
    selectedPackageDeep: null,
    isLoadingDeep: false,
    linePrice: '',
    selectedDimensionValues: {},
  });

  const [lines, setLines] = useState<LineState[]>([freshLine()]);

  // Domain names from the dimensionsByDomain keys + any domains on services
  // that might not have dimensions yet
  const allDomains = React.useMemo(() => {
    const fromDimensions = Object.keys(dimensionsByDomain);
    const fromServices = services.map(s => s.domainName).filter(Boolean);
    return [...new Set([...fromDimensions, ...fromServices])].sort();
  }, [dimensionsByDomain, services]);

  // For a given domain, which service ids belong to it?
  const serviceIdsForDomain = React.useCallback((domain: string) => {
    return services.filter(s => s.domainName === domain).map(s => s.id);
  }, [services]);

  // Filter packages: only those containing at least one service in the domain
  const packagesForDomain = React.useCallback((domain: string) => {
    return packages.filter(p => {
      if (!p.services || !Array.isArray(p.services)) return false;
      return p.services.some((s: any) => {
        // If it already has domain populated from the DB
        if (s.domain && s.domain.name === domain) return true;
        if (s.domainName === domain) return true;
        // Otherwise look it up in our services list
        const sId = typeof s === 'string' ? s : s.id;
        const matchingService = services.find(srv => srv.id === sId);
        return matchingService && matchingService.domainName === domain;
      });
    });
  }, [packages, services]);

  // Further filter packages by selected dimensions for a given line
  const filteredPackagesForLine = React.useCallback((line: LineState) => {
    const pkgs = packagesForDomain(line.selectedDomain);
    const selectedDims = Object.entries(line.selectedDimensionValues).filter(([_, val]) => val !== '');
    if (selectedDims.length === 0) return pkgs;

    return pkgs.filter(pkg => {
      const narrowings = pkg.dimensions || [];
      for (const [dimId, reqValId] of selectedDims) {
        // Support both nested shape (values: []) and flat shape (dimensionId, valueId)
        const pd = narrowings.find((d: any) => d.id === dimId || d.dimensionId === dimId);
        
        // If the package narrowed this dimension, it MUST include the requested value.
        // If it didn't narrow it, it accepts any value (remains open).
        if (pd) {
          const hasValue = pd.values 
            ? pd.values.some((v: any) => v.id === reqValId)
            : (pd as any).valueId === reqValId;
          if (!hasValue) return false;
        }
      }
      return true;
    });
  }, [packagesForDomain]);

  const editorRefs = useRef<any[]>([]);

  const handlePackageSelect = (index: number, id: string, customName?: string) => {
    const newLines = [...lines];
    newLines[index].packageId = id;
    newLines[index].customName = customName || '';
    if (id && id !== 'custom') {
      newLines[index].isLoadingDeep = true;
      setLines(newLines);
      getPackage(id).then(deep => {
        setLines(prev => {
          const updated = [...prev];
          updated[index].selectedPackageDeep = deep;
          updated[index].isLoadingDeep = false;
          return updated;
        });
      }).catch(err => {
        console.error(err);
        setLines(prev => {
          const updated = [...prev];
          updated[index].isLoadingDeep = false;
          return updated;
        });
      });
    } else {
      newLines[index].selectedPackageDeep = null;
      setLines(newLines);
    }
  };

  const isStructurallyDifferent = (initial: any, payload: any) => {
    if (!initial) return true;
    if (initial.name !== payload.name) return true;
    if (initial.description !== payload.description) return true;
    if (initial.duration_minutes !== payload.durationMinutes) return true;
    
    const sIds1 = (initial.services || []).map((s: any) => s.id).sort();
    const sIds2 = [...payload.serviceIds].sort();
    if (JSON.stringify(sIds1) !== JSON.stringify(sIds2)) return true;

    const deliv1 = ((initial.services || []) as any[]).flatMap((s) => ((s.deliverables || []) as any[]).map((d) => ({ serviceId: s.id as string, deliverableId: d.id as string, quantity: d.quantity ?? null, unit: d.unit ?? null, spec: d.spec ?? null })));
    const deliv2 = payload.deliverables || [];
    if (JSON.stringify(deliv1) !== JSON.stringify(deliv2)) return true;

    const cont1 = (initial.containers || []).map((d: any) => d.id).sort();
    const cont2 = [...payload.containerIds].sort();
    if (JSON.stringify(cont1) !== JSON.stringify(cont2)) return true;

    const wf1 = ((initial.services || []) as any[]).flatMap((s) => ((s.workflows || []) as any[]).map((w) => ({ serviceId: s.id as string, blueprintId: w.id as string })));
    const wf2 = payload.workflows || [];
    if (JSON.stringify(wf1) !== JSON.stringify(wf2)) return true;

    const nar1 = ((initial.services || []) as any[]).flatMap((s) => ((s.narrowedTo || []) as { values: { id: string }[] }[]).flatMap((d) => d.values.map((v) => ({ serviceId: s.id as string, valueId: v.id }))));
    const nar2 = payload.narrowings || [];
    if (JSON.stringify(nar1) !== JSON.stringify(nar2)) return true;

    const st1 = (initial.extra_stages || []).map((s: any) => ({ name: s.name, roleName: s.roleName || '', frontStage: s.front_stage ?? true }));
    const st2 = payload.extraStages || [];
    if (JSON.stringify(st1) !== JSON.stringify(st2)) return true;

    // Variable values — the quantities that scope what this package includes.
    // Changing outfits from 2 to 4 is a structural difference, even if everything
    // else is identical, because it changes what the client receives.
    const var1 = (initial.variableValues || [])
      .map((v: any) => ({ id: v.serviceVariableId, value: v.value }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id));
    const var2 = (payload.variableValues || [])
      .map((v: any) => ({ id: v.serviceVariableId, value: v.value }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id));
    if (JSON.stringify(var1) !== JSON.stringify(var2)) return true;

    return false;
  };

  const submitBooking = () => {
    startTransition(async () => {
      try {
        let finalContactId = contactId;
        if (!finalContactId && newClientName) {
           const { clientId } = await createClient({ name: newClientName });
           finalContactId = clientId;
        }

        const submitLines = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.packageId) continue; // Skip empty slots

          let payload: any = null;
          if (editorRefs.current[i]) {
            payload = editorRefs.current[i].buildPayload();
          }

          if (!payload) {
            throw new Error(`Please configure what the client is getting in package #${i + 1}.`);
          }

          let finalPackageId = line.packageId;
          if (line.packageId === 'custom' || isStructurallyDifferent(line.selectedPackageDeep, payload)) {
            const { packageId: newPackageId } = await createPackage(payload);
            finalPackageId = newPackageId;
          }

          submitLines.push({
            packageId: finalPackageId,
            linePrice: { base_price: Number(line.linePrice) || 0, currency: currencyCode },
            variableAnswers: payload.variableValues || [],
          });
        }

        if (submitLines.length === 0) {
          throw new Error('You must add at least one package to the booking.');
        }
        
        await createBooking({
          contactId: finalContactId || null,
          lines: submitLines,
          scheduledFor: when || null,
        });

        router.push('/bookings');
      } catch (err: any) {
        alert(err.message || 'Failed to book');
      }
    });
  };

  return (
    <div className="q-stack q-stack-lg">
      <div className="q-card q-section">
        <h2 className="q-section-title">1. Who & When</h2>
        <div className="q-stack q-stack-md">
          <ClientCombobox 
            clients={clients} 
            value={contactId} 
            onChange={setContactId} 
            onNewClientName={setNewClientName}
          />
          <div className="q-field">
            <label className="q-label">Date & Time (optional)</label>
            <input className="q-input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="q-section">
        <h2 className="q-section-title">2. What do they want?</h2>
        
        <div className="q-stack q-stack-lg">
          {lines.map((line, index) => (
            <div key={line.id} className="q-card q-stack q-stack-md" style={{ position: 'relative' }}>
              {lines.length > 1 && (
                <button
                  type="button"
                  className="q-btn-ghost q-btn-xs"
                  style={{ position: 'absolute', top: '16px', right: '16px' }}
                  onClick={() => {
                    const newLines = [...lines];
                    newLines.splice(index, 1);
                    setLines(newLines);
                    editorRefs.current.splice(index, 1);
                  }}
                >
                  Remove
                </button>
              )}
              <h3 className="q-strong" style={{ marginBottom: '8px' }}>
                {lines.length > 1 ? `Package ${index + 1}` : 'Package'}
              </h3>
              
              {/* ── Step A: Choose a Domain ─────────────────── */}
              {!line.selectedDomain ? (
                <div className="q-stack q-stack-sm">
                  <label className="q-label">What kind of work is this?</label>
                  {allDomains.length > 0 ? (
                    <div className="q-chip-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
                      {allDomains.map(domain => (
                        <button
                          key={domain}
                          type="button"
                          className="q-chip q-button-base"
                          style={{
                            padding: '10px 20px',
                            fontSize: '0.95rem',
                            border: '1px solid var(--q-color-ink-200)',
                            borderRadius: 'var(--q-radius-md)',
                            cursor: 'pointer',
                            transition: 'all 0.15s var(--q-ease)',
                          }}
                          onClick={() => {
                            const newLines = [...lines];
                            newLines[index].selectedDomain = domain;
                            setLines(newLines);
                          }}
                        >
                          {domain}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="q-meta">No service domains defined yet. Create a service first.</p>
                  )}
                </div>

              /* ── Step B: Filter and Choose Package ── */
              ) : !line.packageId ? (
                <div className="q-stack q-stack-sm">
                  <div className="q-row q-row-between" style={{ alignItems: 'center', marginBottom: '8px' }}>
                    <span className="q-meta" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong className="q-strong" style={{ color: 'var(--q-color-ink-900)' }}>{line.selectedDomain}</strong>
                    </span>
                    <button
                      type="button"
                      className="q-btn-ghost q-btn-xs"
                      onClick={() => {
                        const newLines = [...lines];
                        newLines[index].selectedDomain = '';
                        newLines[index].selectedDimensionValues = {};
                        setLines(newLines);
                      }}
                    >
                      Change domain
                    </button>
                  </div>
                  
                  {/* Dimension Requirements Grid */}
                  {(dimensionsByDomain[line.selectedDomain] || []).length > 0 && (
                    <div className="q-stack q-stack-md" style={{ marginBottom: '24px' }}>
                      <h4 className="q-strong" style={{ marginBottom: '4px' }}>Requirements</h4>
                      <div className="q-grid-2">
                        {(dimensionsByDomain[line.selectedDomain] || []).map((d: any) => (
                          <div key={d.id} className="q-field">
                            <label className="q-label">{d.name}</label>
                            <select
                              className="q-select"
                              value={line.selectedDimensionValues[d.id] || ''}
                              onChange={(e) => {
                                const newLines = [...lines];
                                newLines[index].selectedDimensionValues = {
                                  ...newLines[index].selectedDimensionValues,
                                  [d.id]: e.target.value
                                };
                                setLines(newLines);
                              }}
                            >
                              <option value="">Any</option>
                              {d.values.map((v: any) => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matching Packages Stack */}
                  <div className="q-stack q-stack-md">
                    <h4 className="q-strong" style={{ marginBottom: '8px' }}>Select a Package</h4>
                    
                    {(() => {
                      const pkgs = filteredPackagesForLine(line);
                      return (
                        <div className="q-stack q-stack-sm">
                          {pkgs.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="q-tile q-card-interactive"
                              style={{ textAlign: 'left', width: '100%', border: '1px solid var(--q-color-ink-200)', background: 'transparent' }}
                              onClick={() => handlePackageSelect(index, p.id)}
                            >
                              <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                                <div>
                                  <div className="q-strong">{p.name}</div>
                                  {p.description && (
                                    <div className="q-meta-sm" style={{ marginTop: '4px' }}>{p.description}</div>
                                  )}
                                  <div className="q-meta-sm" style={{ marginTop: '8px', display: 'flex', gap: '12px', color: 'var(--q-color-ink-500)' }}>
                                    {p.durationMinutes ? <span>⏱ {p.durationMinutes} minutes</span> : null}
                                    {p.deliverables && p.deliverables.length > 0 ? (
                                      <span>📦 {p.deliverables.length} deliverable{p.deliverables.length === 1 ? '' : 's'}</span>
                                    ) : null}
                                    {p.services && p.services.length > 0 ? (
                                      <span>🛠 {p.services.length} service{p.services.length === 1 ? '' : 's'}</span>
                                    ) : null}
                                  </div>
                                </div>
                                <span className="q-btn-ghost q-btn-xs" style={{ whiteSpace: 'nowrap' }}>Select &rarr;</span>
                              </div>
                            </button>
                          ))}
                          
                          {pkgs.length === 0 && (
                            <p className="q-meta" style={{ padding: '12px 0' }}>No standard packages match these exact requirements.</p>
                          )}

                          <div style={{ marginTop: '8px' }}>
                            <button
                              type="button"
                              className="q-btn q-btn-secondary"
                              onClick={() => handlePackageSelect(index, 'custom', '')}
                              style={{ width: '100%', justifyContent: 'center' }}
                            >
                              + Build a custom package from scratch
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

              /* ── Step D: Configure the chosen Package ────────────── */
              ) : (
                <div className="q-field">
                  <div className="q-row q-row-between" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <span className="q-row" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="q-badge q-badge-neutral">{line.selectedDomain}</span>
                      {Object.entries(line.selectedDimensionValues).filter(([_, v]) => v).map(([dimId, valId]) => {
                        const d = (dimensionsByDomain[line.selectedDomain] || []).find((x: any) => x.id === dimId);
                        const vName = d?.values.find((x: any) => x.id === valId)?.name;
                        return vName ? <span key={dimId} className="q-badge q-badge-neutral">{vName}</span> : null;
                      })}
                      <strong className="q-strong" style={{ marginLeft: '8px' }}>
                        {line.packageId === 'custom' ? 'Custom Package' : 'Editing Package Template'}
                      </strong>
                    </span>
                    <button type="button" className="q-btn-ghost q-btn-xs" onClick={() => {
                      const newLines = [...lines];
                      newLines[index].packageId = '';
                      newLines[index].customName = '';
                      newLines[index].selectedPackageDeep = null;
                      setLines(newLines);
                    }}>Change Package</button>
                  </div>
                  
                  {line.isLoadingDeep ? (
                    <div className="q-meta">Loading template...</div>
                  ) : (line.packageId === 'custom' || line.selectedPackageDeep) ? (
                    <>
                      <PackageFieldsEditor
                        ref={el => {
                          if (el) editorRefs.current[index] = el;
                        }}
                        mode="create"
                        currencyCode={currencyCode}
                        allServices={allServices}
                        allVariables={allVariables}
                        allDeliverables={allDeliverables}
                        
                        dimensionsByDomain={dimensionsByDomain}
                        roleOptions={roleOptions}
                        hideControls={true}
                        initial={line.packageId === 'custom' 
                          ? { variableValues: [], name: line.customName || '' } 
                          : {
                            name: line.selectedPackageDeep.name,
                            description: line.selectedPackageDeep.description,
                            durationMinutes: line.selectedPackageDeep.duration_minutes,
                            serviceIds: (line.selectedPackageDeep.services || []).map((s: any) => s.id),
                            deliverables: ((line.selectedPackageDeep.services || []) as any[]).flatMap((s) =>
                              ((s.deliverables || []) as any[]).map((d) => ({
                                serviceId: s.id as string, deliverableId: d.id as string,
                                quantity: d.quantity ?? null, unit: d.unit ?? null, spec: d.spec ?? null,
                              }))),
                            narrowings: ((line.selectedPackageDeep.services || []) as any[]).flatMap((s) =>
                              ((s.narrowedTo || []) as { values: { id: string }[] }[])
                                .flatMap((d) => d.values.map((v) => ({ serviceId: s.id as string, valueId: v.id })))),
                            extraStages: (line.selectedPackageDeep.extra_stages || []).map((s: any) => ({ name: s.name, roleName: s.roleName || '', frontStage: s.front_stage ?? true })),
                            variableValues: (line.selectedPackageDeep.variableValues || []).map((v: any) => ({ serviceVariableId: v.serviceVariableId, value: v.value })),
                          }
                        }
                      />
                      <div className="q-field" style={{ marginTop: '24px', borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '24px' }}>
                        <label className="q-label">Line Price</label>
                        <input className="q-input" type="number" value={line.linePrice} onChange={e => {
                          const newLines = [...lines];
                          newLines[index].linePrice = e.target.value;
                          setLines(newLines);
                        }} placeholder="0.00" />
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            className="q-btn q-btn-secondary"
            onClick={() => setLines([...lines, freshLine()])}
          >
            + Add another package
          </button>
        </div>
      </div>

      <div className="q-row">
        <button className="q-btn q-btn-primary" disabled={isPending || !lines.some(l => l.packageId)} onClick={submitBooking}>
          {isPending ? 'Booking...' : 'Book it'}
        </button>
      </div>
    </div>
  );
}
