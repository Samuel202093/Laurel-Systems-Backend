export enum PayoutStatus {
  PENDING = 'PENDING', // Korapay: waiting to be swept
  PROCESSING = 'PROCESSING', // Korapay: transfer initiated, awaiting confirmation
  SETTLED = 'SETTLED', // Korapay: confirmed received / Paystack+FW: auto-split done
  FAILED = 'FAILED', // Transfer failed — needs manual intervention
  AUTO_SPLIT = 'AUTO_SPLIT', // Paystack / Flutterwave: handled natively by gateway
}

export enum PayoutMethod {
  MANUAL_TRANSFER = 'MANUAL_TRANSFER', // Korapay: we initiate a bank transfer
  GATEWAY_SPLIT = 'GATEWAY_SPLIT', // Paystack / Flutterwave: gateway handles it
}

export interface SweepResult {
  swept: number;
  failed: number;
  totalKobo: number;
}
