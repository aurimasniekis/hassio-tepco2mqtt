export const BillingClass = {
  SCHEDULED_BILLING: "00",
  CONFIRMED_BILLING: "01",
} as const;

export type BillingClass = typeof BillingClass[keyof typeof BillingClass];
