/**
 * Finances — public interface. The only door in.
 * Invoices and payments raised against a booking. Bookings asks this module to
 * raise money; it never writes financial_transactions itself.
 */
export {
  createTransaction, settleTransaction, voidTransaction,
  listDueInRange, listTransactions, listTransactionsForContract, getTransaction,
  getPaymentSummaryForContact, getMoneyTotals,
  // Receipts live on the payment they acknowledge — one per payment, since a
  // deposit against an unpaid invoice still earns one.
  getReceiptByToken, getReceiptForTransaction,
} from './domain';
export { processPayment } from './payments';

// Invoices — the document between what was booked and what was paid. A receipt
// is not here on purpose: it is what an invoice looks like once its payments
// cover it, derived rather than stored.
export {
  createInvoiceForBooking, issueDepositInvoice, issueInvoice, voidInvoice, updateDraftInvoice,
  // Booked, invoiced and paid — three different questions, all derived.
  getBookingBilling,
  // The studio's tax position, snapshotted onto each invoice as it is raised.
  getTaxRate, setTaxRate,
  getInvoice, listInvoices, listInvoicesForBooking, getInvoiceByToken,
} from './invoices';

// What kinds of money exist, and how to total them. A plain module rather than
// a server one, so the pages can read the vocabulary without a round trip.
export { TRANSACTION_KINDS, KINDS, kindOf, totalsByCurrency, settlementOf } from './money';
// How an invoice line reads and what it bills. Shared so the New Booking form
// can show the document it is about to raise, rather than drawing its own
// version of it beside the one the server writes.
export { describeInvoiceLine, invoiceLineAmount, billingShare, taxOn } from './money';
// What comes off a price, and the one descent from what was sold to what is
// owed. Shared so a preview and a document cannot reach different answers.
export { discountOn, invoiceTotals } from './money';
export type { DiscountKind } from './money';
export type { TransactionKind, KindSpec, MoneyTotals } from './money';
