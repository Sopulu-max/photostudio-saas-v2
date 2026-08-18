'use client';

import React from 'react';
import Link from 'next/link';

export function ContractsClient({ initialContracts }: { initialContracts: any[] }) {

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="q-page-title">Contracts</h1>
          <p className="q-page-subtitle">Active commitments and signed contracts.</p>
        </div>
        <div className="q-row">
          <Link href="/contracts/settings" className="q-btn q-btn-secondary">Settings</Link>
          <Link href="/bookings" className="q-btn q-btn-primary">+ New contract</Link>
        </div>
      </header>

      <div className="q-card q-table-container">
        <table className="q-table">
          <thead>
            <tr>
              <th className="q-table-th">Client</th>
              <th className="q-table-th">Version</th>
              <th className="q-table-th">Status</th>
              <th className="q-table-th">Action</th>
            </tr>
          </thead>
          <tbody>
            {initialContracts.length === 0 ? (
              <tr>
                <td colSpan={4} className="q-table-td q-center-text q-muted">
                  No contracts yet. Contracts are drafted from a booking — open one and click &ldquo;Create a contract&rdquo;, or{' '}
                  <Link href="/bookings" className="q-link">start from Bookings</Link>.
                </td>
              </tr>
            ) : (
              initialContracts?.map((agr: any) => (
                <tr key={agr.id} className="q-table-tr">
                  <td className="q-table-td q-strong">{agr.person?.display_name}</td>
                  <td className="q-table-td">v{agr.version}</td>
                  <td className="q-table-td">
                    <span className={`q-badge ${agr.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>
                      {agr.status}
                    </span>
                  </td>
                  <td className="q-table-td">
                    <Link href={`/contracts/${agr.id}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.875rem', textDecoration: 'none' }}>
                      View Contract
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
