import logger from './logger';

type JWTHeader = {
  alg: string;
  typ: string;
};

type JWTPayload = {
  exp?: number;
  iat?: number;
  [key: string]: unknown;
};

export type JWT = { header: JWTHeader; payload: JWTPayload; signature: string };

function base64UrlDecode(base64Url: string): string {
  const base64 = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  return atob(base64);
}

export function parseJwt(token: string): JWT | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    logger.error('Invalid token format', 't2m:jwt');

    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const signature = parts[2];

    return { header, payload, signature };
  } catch (error) {
    logger.error(`Failed to parse token: ${error}`, 't2m:jwt');

    return null;
  }
}

export function isTokenExpired(token: string): boolean;
export function isTokenExpired(payload: JWTPayload): boolean;
export function isTokenExpired(payload: JWTPayload | string): boolean {
  if (typeof payload === 'string') {
    const parsed = parseJwt(payload);

    return parsed == null ? false : isTokenExpired(parsed);
  }

  if (!payload.exp) {
    logger.warn('Token does not have an expiration time', 't2m:jwt');

    return false;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  return payload.exp < currentTime;
}
