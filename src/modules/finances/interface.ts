/**
 * Finances — public interface. The only door in.
 * Invoices and payments raised against a booking. Bookings asks this module to
 * raise money; it never writes financial_transactions itself.
 */
export {
  createTransaction, settleTransaction, voidTransaction,
  raiseInvoiceForBooking,
  listDueInRange, listTransactions, listTransactionsForContract, getTransaction,
  getPaymentSummaryForContact, getMoneyTotals,
} from './domain';
export { processPayment } from './payments';

// What kinds of money exist, and how to total them. A plain module rather than
// a server one, so the pages can read the vocabulary without a round trip.
export { TRANSACTION_KINDS, KINDS, kindOf, totalsByCurrency } from './money';
export type { TransactionKind, KindSpec, MoneyTotals } from './money';
