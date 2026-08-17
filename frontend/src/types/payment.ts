// Shared types for payment-related data
export interface TransactionData {
  transactionId: string;
  customerName: string;
  customerPhone: string;
  transactionDate: string;
  expectedPaymentDate?: string;
  totalAmount: number;
  amountPaid?: number;
  balanceDue?: number;
}
