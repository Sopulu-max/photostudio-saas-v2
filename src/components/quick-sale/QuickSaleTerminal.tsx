'use client';

import React, { useState } from 'react';
import { executeQuickSale } from '@/app/actions/quick-sale';
import { ServiceDTO } from '@/lib/domains/kernel/types';
import { ArrowRight, CheckCircle2, Phone, Briefcase, Camera } from 'lucide-react';

interface QuickSaleTerminalProps {
  services: ServiceDTO[];
}

export function QuickSaleTerminal({ services }: QuickSaleTerminalProps) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  
  // For the success view
  const [receipt, setReceipt] = useState<{
    customerName: string;
    serviceName: string;
    amount: number;
  } | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus('submitting');
    setError(null);
    
    // Auto-fill price based on selected service
    const serviceId = formData.get('serviceId') as string;
    const service = services.find(s => s.id === serviceId);
    if (service && service.pricingRules?.base_price) {
      formData.set('price', service.pricingRules.base_price.toString());
    } else {
      formData.set('price', '0');
    }
    
    // Default name if none provided
    if (!formData.get('customerName')) {
      formData.set('customerName', 'Walk-in Customer');
    }

    const result = await executeQuickSale(formData);

    if (!result.success) {
      setError(result.error || 'Quick sale failed.');
      setStatus('idle');
    } else {
      setReceipt({
        customerName: result.customer?.profileData?.name || 'Walk-in Customer',
        serviceName: service?.name || 'Service',
        amount: service?.pricingRules?.base_price || 0,
      });
      setStatus('success');
    }
  }

  if (status === 'success' && receipt) {
    return (
      <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-xl w-full max-w-[360px] mx-auto flex flex-col items-center justify-center min-h-[300px]">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-400" />
        </div>
        <h3 className="text-xl font-serif mb-1">Sale Recorded</h3>
        <p className="text-gray-400 mb-6 text-sm text-center">
          Instance added to the pipeline.
        </p>
        
        <div className="w-full bg-gray-800 rounded-lg p-4 mb-6 text-sm font-mono flex flex-col gap-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Client:</span>
            <span>{receipt.customerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Service:</span>
            <span>{receipt.serviceName}</span>
          </div>
          <div className="flex justify-between border-t border-gray-700 pt-2 mt-2">
            <span className="text-gray-400">Total:</span>
            <span className="text-green-400 font-bold">₦{receipt.amount.toLocaleString()}</span>
          </div>
        </div>

        <button 
          onClick={() => {
            setStatus('idle');
            setReceipt(null);
          }}
          className="w-full py-3 bg-white text-gray-900 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
        >
          New Sale
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm w-full max-w-[360px] mx-auto">
      <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
        <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center">
          <Camera className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="font-serif font-medium text-gray-900 leading-tight">Quick Sale</h3>
          <p className="text-xs text-gray-500">Record a walk-in</p>
        </div>
      </div>

      <form action={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100">
            {error}
          </div>
        )}
        
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1">Phone Number</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="tel" 
              name="customerPhone" 
              required
              placeholder="080..." 
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all text-base"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1">Service</label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select 
              name="serviceId" 
              required
              defaultValue=""
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all text-base appearance-none"
            >
              <option value="" disabled>Select a service</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.pricingRules?.base_price ? `— ₦${s.pricingRules.base_price.toLocaleString()}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={status === 'submitting'}
          className="mt-2 w-full py-3 px-4 bg-gray-900 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-800 disabled:bg-gray-400 transition-all active:scale-[0.98]"
        >
          {status === 'submitting' ? (
            <span className="animate-pulse">Recording...</span>
          ) : (
            <>
              Confirm Sale
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
