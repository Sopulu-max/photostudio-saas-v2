'use client';

import React from 'react';
import Link from 'next/link';

export function ContractsClient({ initialContracts }: { initialContracts: any[] }) {

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">Contracts</h1>
        <p className="q-page-subtitle">Active commitments and signed contracts.</p>
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
                <td colSpan={4} className="q-table-td" style={{ textAlign: 'center', color: 'var(--q-color-ink-500)' }}>
                  No contracts found.
                </td>
              </tr>
            ) : (
              initialContracts?.map((agr: any) => (
                <tr key={agr.id} className="q-table-tr">
                  <td className="q-table-td" style={{ fontWeight: 500 }}>{agr.person?.display_name}</td>
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
