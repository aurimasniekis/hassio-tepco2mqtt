import type { ContractClass } from '../contract/list';
import type { BillingClass } from './_common';

export interface UsedPowerInfo {
  power: string;
  unit: string;
}

export interface DetailInfo {
  billingClass: BillingClass;
  usedCharge: string;
  usedPowerInfo: UsedPowerInfo;
}

export interface BillInfo {
  billingStatus: string;
  contractClass: ContractClass;
  detailInfos: DetailInfo[];
  usedMonth: string;
}

export interface BillingMeterHistoryResponse {
  billInfos: BillInfo[];
}
