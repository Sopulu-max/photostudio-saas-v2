import React from 'react';

export default function ScaffoldingPage() {
  return (
    <div style={{ padding: '40px', background: '#330000', minHeight: '100vh' }}>
      <h1 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '2rem', color: '#ff9999' }}>Ugly Scaffolding</h1>
      <p style={{ color: '#ffcccc' }}>
        This page violates the Ubiquity Model intentionally. It exists ONLY to house configuration 
        that is not yet editable in-place on the graph. It must be dissolved eventually.
      </p>
    </div>
  );
}
