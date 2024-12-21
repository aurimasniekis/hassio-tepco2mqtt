import { ResponseStatus, type TepcoClient } from '../../api';

export const ContractClass = {
  TRANSITION: "01",
  NEW_ELECTRIC: "02",
  GAS: "03",
  PURCHASE: "04",
  INTEGRATION: "09"
} as const;

export const ContractClassMap = {
  "01": "Transition",
  "02": "Electric",
  "03": "Gas",
  "04": "Purchase",
  "09": "Integration",
} as const;

export type ContractClass = typeof ContractClass[keyof typeof ContractClass];
export type ContractType = typeof ContractClassMap[keyof typeof ContractClassMap];

export interface Contract {
  contractClass: ContractClass;
  contractType: ContractType;
  customerNum: string;
  accountId: string;
  contractNum: string;
  postalCode?: string;
  address?: string;
  areaCode?: string;
  servicePointSpecNum?: string;
  rateCategory?: string;
  planName?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  id: string;
}


export interface ContractListResponse {
  contractStatus: ResponseStatus;
  displayLimit: string;
  contracts: Contract[];
}

function makeContractId(accountId: string | undefined, contractNum: string) {
  return accountId ? accountId + contractNum : contractNum;
}

function makeContractType(contractClass: ContractClass): ContractType {
  return ContractClassMap[contractClass];
}


export async function list(apiClient: TepcoClient) {
  return apiClient
    .requestGet<ContractListResponse>('/contract/list')
    .then((res) => {
      res.contracts = res.contracts.map(
        (contract) =>
          ({
            ...contract,
            id: makeContractId(contract.accountId, contract.contractNum),
            contractType: makeContractType(contract.contractClass),
          } as Contract)
      );

      return res;
    });
}
