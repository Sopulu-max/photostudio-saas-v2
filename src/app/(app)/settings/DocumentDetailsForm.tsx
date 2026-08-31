'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateStudio } from '@/kernel/organizations';
import { toast, readableError } from '@/components/Toast';

/**
 * What appears on every document that leaves the studio.
 *
 * Payment instructions are the load-bearing one. An invoice that states what a
 * client owes and says nothing about where to send it is not an invoice — it's
 * a number. Everything here is optional and blank is fine: a studio fills these
 * in over time, and an invoice without an address still works, just quieter.
 */
export function DocumentDetailsForm({
  contactEmail: initialEmail,
  contactPhone: initialPhone,
  address: initialAddress,
  paymentInstructions: initialPayment,
  invoiceFooter: initialFooter,
}: {
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  paymentInstructions?: string;
  invoiceFooter?: string;
}) {
  const initial = {
    email: initialEmail || '',
    phone: initialPhone || '',
    address: initialAddress || '',
    payment: initialPayment || '',
    footer: initialFooter || '',
  };

  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [address, setAddress] = useState(initial.address);
  const [payment, setPayment] = useState(initial.payment);
  const [footer, setFooter] = useState(initial.footer);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const dirty =
    email !== initial.email || phone !== initial.phone || address !== initial.address ||
    payment !== initial.payment || footer !== initial.footer;

  const save = () =>
    startTransition(async () => {
      try {
        await updateStudio({
          contactEmail: email,
          contactPhone: phone,
          address,
          paymentInstructions: payment,
          invoiceFooter: footer,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } catch (e: any) {
        toast.bad(readableError(e, 'Could not save that.'));
      }
    });

  return (
    <div className="q-stack q-stack-md">
      <div className="q-row">
        <div className="q-field" style={{ flex: 1, minWidth: '14rem' }}>
          <label className="q-label">Email</label>
          <input className="q-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="hello@yourstudio.com" />
        </div>
        <div className="q-field" style={{ flex: 1, minWidth: '12rem' }}>
          <label className="q-label">Phone</label>
          <input className="q-input" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+234 …" />
        </div>
      </div>

      <div className="q-field">
        <label className="q-label">Address</label>
        <textarea className="q-input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)}
          placeholder="Where the studio is" />
      </div>

      <div className="q-field">
        <label className="q-label">How clients pay you</label>
        <textarea className="q-input" rows={3} value={payment} onChange={(e) => setPayment(e.target.value)}
          placeholder={'Bank name\nAccount name\nAccount number'} />
        <span className="q-meta-sm">
          Printed on every invoice. Without it a client has to ask you where to send the money.
        </span>
      </div>

      <div className="q-field">
        <label className="q-label">Footer note</label>
        <input className="q-input" value={footer} onChange={(e) => setFooter(e.target.value)}
          placeholder="Thank you for your business." />
        <span className="q-meta-sm">Sits at the bottom of every invoice and receipt.</span>
      </div>

      <div className="q-row">
        <button className="q-btn q-btn-primary" aria-busy={isPending} disabled={isPending || !dirty} onClick={save}>
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="q-meta-sm">Saved</span>}
      </div>
    </div>
  );
}
