interface CommonInfo {
  timestamp: string;
}

interface TepcoResponse<T extends CommonInfo> {
  commonInfo: T;
}


export const ResponseStatus = {
  NOT_FOUND: "00",
  FOUND: "01",
  NOT_FOUND_OVER_LIMIT: "02",
  FOUND_OVER_LIMIT: "03",
} as const;

export type ResponseStatus = typeof ResponseStatus[keyof typeof ResponseStatus];

export type MakeResponse<T, CI extends CommonInfo = CommonInfo> = TepcoResponse<CI> & T;


export interface TepcoClient {
  requestGet<T>(url: string): Promise<MakeResponse<T>>
}


