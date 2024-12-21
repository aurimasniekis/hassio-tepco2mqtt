import type { TepcoClient } from '../../api';
import type { ContractClass } from '../contract/list';

interface UsedInfo {
  charge: string;
  power: string;
}

interface BillInfo {
  billingStatus: string;
  rateCategory: string;
  usedInfo: UsedInfo;
}

export interface BillingGasResponse {
  billInfo: BillInfo;
}


export async function gas(
  apiClient: TepcoClient,
  contractNum: string,
  month: string,
  accountId: string,
) {
  const params = new URLSearchParams({
    contractNum,
    month,
    accountId,
  });

  return apiClient.requestGet<BillingGasResponse>(
    '/billing/gas?' + params.toString()
  );
}
