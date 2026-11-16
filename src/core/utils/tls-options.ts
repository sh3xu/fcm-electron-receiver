import https from 'https';
import type tls from 'tls';
import type { AxiosRequestConfig } from 'axios';

export interface TlsConfig {
  ca?: string | Buffer | Array<string | Buffer>;
  // NOTE: only disable verification for trusted local/MITM proxy debugging
  rejectUnauthorized?: boolean;
}

export function toAxiosTlsOptions(tlsConfig?: TlsConfig): Pick<AxiosRequestConfig, 'httpsAgent'> {
  if (!tlsConfig) {
    return {};
  }

  return {
    httpsAgent: new https.Agent({
      ca: tlsConfig.ca,
      rejectUnauthorized: tlsConfig.rejectUnauthorized,
    }),
  };
}

export function toTlsConnectOptions(
  host: string,
  port: number,
  tlsConfig?: TlsConfig,
): tls.ConnectionOptions {
  return {
    host,
    port,
    servername: host,
    ca: tlsConfig?.ca,
    rejectUnauthorized: tlsConfig?.rejectUnauthorized,
  };
}
