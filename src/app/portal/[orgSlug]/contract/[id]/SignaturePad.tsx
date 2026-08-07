'use client';

import React, { useRef, useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Point = { x: number; y: number };

export function SignaturePad({
  onSign,
}: {
  onSign: (signatureName: string, signatureDataUrl: string) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [name, setName] = useState('');
  const [isPending, startTransition] = useTransition();

  // Initialize canvas context for high-DPI displays
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fix blurry lines on retina displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Set actual size in memory (scaled to account for extra pixel density)
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Normalize coordinate system to use css pixels
    ctx.scale(dpr, dpr);
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'var(--q-color-ink-900)';
    ctx.lineWidth = 2.5;

  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: (e as React.MouseEvent).clientX - rect.left,
        y: (e as React.MouseEvent).clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling on touch
    const coords = getCoordinates(e);
    if (!coords) return;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;

    const coords = getCoordinates(e);
    if (!coords) return;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.closePath();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Use the unscaled width/height for clearing because scale is already applied
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasDrawn || !name.trim()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    
    startTransition(async () => {
      try {
        await onSign(name.trim(), dataUrl);
      } catch (err: any) {
        alert(err?.message || 'Could not save signature. Please try again.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="q-stack q-stack-md">
      <div className="q-field">
        <div className="q-row q-row-between" style={{ marginBottom: '6px' }}>
          <label className="q-label" style={{ margin: 0 }}>Signature</label>
          {hasDrawn && (
            <button type="button" onClick={clearCanvas} className="q-meta-plain" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--q-color-accent)' }}>
              Clear
            </button>
          )}
        </div>
        <div 
          style={{ 
            border: '1px solid var(--q-color-border)', 
            borderRadius: '12px', 
            backgroundColor: 'var(--q-color-ground)',
            overflow: 'hidden',
            touchAction: 'none' // Crucial for preventing scrolling while drawing on mobile
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '160px', display: 'block', cursor: 'crosshair' }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
        {!hasDrawn && <div className="q-meta-sm" style={{ marginTop: '6px' }}>Please sign inside the box above.</div>}
      </div>

      <div className="q-field">
        <label className="q-label">Printed Name</label>
        <input 
          type="text" 
          className="q-input" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="Type your full name"
          required
          disabled={isPending}
        />
      </div>

      <button 
        type="submit" 
        className="q-btn q-btn-primary" 
        style={{ width: '100%', padding: '16px', fontSize: '1.125rem' }}
        disabled={!hasDrawn || !name.trim() || isPending}
      >
        {isPending ? 'Saving...' : 'Accept & Sign Contract'}
      </button>
    </form>
  );
}
