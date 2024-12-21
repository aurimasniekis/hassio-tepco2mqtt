import type { TepcoClient } from '../../api';
import type { ContractClass } from '../contract/list';
import type { MeterInfo } from './meter';

interface UsedInfo {
  charge: string;
  power: string;
  unit: string;
  startDate: string;
  endDate: string;
}

interface BillInfo {
  usedMonth: string;
  billingStatus: string;
  electricRateCategory?: string;
  timezonePrice?: string;
  meterInfo: MeterInfo;
  usedInfo: UsedInfo;
}

export interface BillingDayResponse {
  billInfo: BillInfo;
}


export async function month(
  apiClient: TepcoClient,
  contractNum: string,
  month: string,
  contractClass: ContractClass,
  accountId: string,
) {
  const params = new URLSearchParams({
    contractNum,
    month,
    contractClass,
    accountId,
  });

  return apiClient.requestGet<BillingDayResponse>(
    '/billing/month?' + params.toString()
  );
}
