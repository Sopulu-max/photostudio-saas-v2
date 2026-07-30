'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { NewBlueprintForm } from './NewBlueprintForm';
import { BlueprintRow } from './BlueprintRow';
import { CategoryManager } from './CategoryManager';
import { formatMoney } from '@/kernel/currency';

export function ServiceTemplatesClient({
  initialServices,
  blueprints = [],
  categories = [],
  currencyCode = 'USD',
}: {
  initialServices: any[];
  blueprints?: any[];
  categories?: { id: string; name: string; position: number }[];
  currencyCode?: string;
}) {
  const active = initialServices.filter((s: any) => s.status !== 'retired');
  const retired = initialServices.filter((s: any) => s.status === 'retired');

  const Card = ({ svc }: { svc: any }) => (
    <div className="q-card q-stack">
      <div className="q-row q-row-between">
        <div>
          <h3 className="q-section-title">{svc.name}</h3>
          <div className="q-num q-strong">
            {formatMoney(svc.pricing?.base_price, svc.pricing?.currency || currencyCode)}
          </div>
        </div>
        <span className={`q-badge ${svc.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>{svc.status}</span>
      </div>
      <div className="q-meta">
        {svc.blueprint?.name ? `Blueprint: ${svc.blueprint.name}` : 'No blueprint attached'}
      </div>
      <div className="q-tile-sub">
        <Link href={`/services/${svc.id}`} className="q-btn q-btn-secondary q-fill q-center-text">
          Manage service
        </Link>
      </div>
    </div>
  );

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Services</h1>
          <p className="q-page-subtitle">What your studio sells, and the pipelines behind it.</p>
        </div>
        <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
      </header>

      {(() => null)()}
      {initialServices.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <div className="q-empty-icon"><Package size={24} /></div>
          <h3 className="q-section-title">Create your first service</h3>
          <p className="q-meta">
            A service is something you sell — a shoot, a package, a session. Create one,
            attach a blueprint, and it&rsquo;s ready to take bookings.
          </p>
          <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
        </div>
      ) : (
        <div className="q-stack q-stack-lg">
          {categories.map((cat) => {
            const inCat = active.filter((s: any) => s.category_id === cat.id);
            if (inCat.length === 0) return null;
            return (
              <section key={cat.id}>
                <h2 className="q-section-title">{cat.name}</h2>
                <div className="q-grid-cards">
                  {inCat.map((svc: any) => <Card key={svc.id} svc={svc} />)}
                </div>
              </section>
            );
          })}
          {(() => {
            const ungrouped = active.filter((s: any) => !s.category_id);
            if (ungrouped.length === 0) return null;
            return (
              <section>
                {categories.length > 0 && <h2 className="q-section-title">Everything else</h2>}
                <div className="q-grid-cards">
                  {ungrouped.map((svc: any) => <Card key={svc.id} svc={svc} />)}
                </div>
              </section>
            );
          })()}
        </div>
      )}

      {retired.length > 0 && (
        <section style={{ marginTop: '40px' }}>
          <h2 className="q-section-title">Retired</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            Not offered on new bookings. Past bookings keep their line and price.
          </p>
          <div className="q-grid-cards">
            {retired.map((svc: any) => <Card key={svc.id} svc={svc} />)}
          </div>
        </section>
      )}

      <section style={{ marginTop: '40px' }}>
        <h2 className="q-section-title">Groups</h2>
        <p className="q-meta" style={{ marginBottom: '16px' }}>
          How your catalogue is arranged. Your words — nothing in the app reads meaning into them.
        </p>
        <div className="q-card">
          <CategoryManager
            categories={categories}
            counts={initialServices.reduce((acc: Record<string, number>, s: any) => {
              if (s.category_id) acc[s.category_id] = (acc[s.category_id] || 0) + 1;
              return acc;
            }, {})}
          />
        </div>
      </section>

      <section style={{ marginTop: '40px' }}>
        <h2 className="q-section-title">Blueprints</h2>
        <p className="q-meta" style={{ marginBottom: '16px' }}>
          Reusable stage sets. Attach one to a service and its work starts from those stages.
        </p>
        <div className="q-card q-stack q-stack-md">
          {blueprints.length === 0 ? (
            <p className="q-empty">No blueprints yet.</p>
          ) : (
            <div className="q-stack q-stack-sm">
              {blueprints.map((bp: any) => <BlueprintRow key={bp.id} blueprint={bp} />)}
            </div>
          )}
          <NewBlueprintForm />
        </div>
      </section>
    </div>
  );
}
