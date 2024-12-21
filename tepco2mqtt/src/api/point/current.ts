import type { TepcoClient } from '../../api';

export interface PointInfo {
  accountId: string;
  pointStatus: string;
  point: string;
}

export interface CurrentPointResponse {
  pointInfos: PointInfo[];
}

export async function current(apiClient: TepcoClient) {
  return apiClient.requestGet<CurrentPointResponse>('/point/current');
}
