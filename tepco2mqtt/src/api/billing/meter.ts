import type { TepcoClient } from '../../api';
import type { ContractClass } from '../contract/list';

export interface MeterInfo {
  month: string;
  startDate: string;
  endDate: string;
}

export interface BillingMeterResponse {
  meterInfo: MeterInfo;
}

export async function meter(
  apiClient: TepcoClient,
  contractClass: ContractClass,
  contractNum: string,
  accountId: string
) {
  const params = new URLSearchParams({
    contractClass,
    contractNum,
    accountId,
  });

  return apiClient.requestGet<BillingMeterResponse>(
    '/billing/meter?' + params.toString()
  );
}
