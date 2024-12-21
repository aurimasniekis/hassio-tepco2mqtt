import type { TepcoClient } from '../../api';
import type { ContractClass } from '../contract/list';

interface TotalInfo {
  charge: string;
  power: string;
  unit: string;
}

interface UsedInfo {
  charge: string;
  power: string;
  unit: string;
  beforeTotalInfo: TotalInfo;
  currentTotalInfo: TotalInfo;
}

interface BillInfo {
  billingStatus: string;
  usedDay: string;
  electricRateCategory?: string;
  timezonePrice?: string;
  usedInfo: UsedInfo;
}

export interface BillingDayResponse {
  billInfo: BillInfo;
}


export async function day(
  apiClient: TepcoClient,
  contractNum: string,
  usedDay: string,
  contractClass: ContractClass,
  accountId: string,
) {
  const params = new URLSearchParams({
    contractNum,
    usedDay,
    contractClass,
    accountId,
  });

  return apiClient.requestGet<BillingDayResponse>(
    '/billing/day?' + params.toString()
  );
}
