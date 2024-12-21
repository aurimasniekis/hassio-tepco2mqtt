import { ResponseStatus, type TepcoClient } from '../../api';

export interface NameInfo {
  name1: string;
  nameKana1: string;
}

export interface KpfAccountInfo {
  accountId: string;
}

export interface MemberInfo {
  accountKey: string;
  customerId: string;
  kpfAccountInfos: KpfAccountInfo[];
  nameInfo: NameInfo;
  birthday: string;
  mailAddress: string;
  mailDelivery: string;
  agreement: string;
  thirdPartyHearing: string;
  customerUnify: string;
}

export interface ContractMemberResponse {
  memberStatus: ResponseStatus;
  memberInfo: MemberInfo;
}

export async function member(apiClient: TepcoClient) {
  return apiClient.requestGet<ContractMemberResponse>('/contract/member');
}
