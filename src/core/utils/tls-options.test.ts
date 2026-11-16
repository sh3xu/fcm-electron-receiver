import { describe, expect, it } from 'vitest';

import { toAxiosTlsOptions, toTlsConnectOptions } from './tls-options.js';

describe('tls-options', () => {
  it('returns empty axios options when tls config is missing', () => {
    expect(toAxiosTlsOptions()).toEqual({});
  });

  it('maps ca and rejectUnauthorized into an httpsAgent for axios', () => {
    const ca = '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----';
    const options = toAxiosTlsOptions({
      ca,
      rejectUnauthorized: false,
    });

    expect(options.httpsAgent).toBeDefined();
    expect(options.httpsAgent?.options.ca).toBe(ca);
    expect(options.httpsAgent?.options.rejectUnauthorized).toBe(false);
  });

  it('includes SNI servername for MCS TLS connections', () => {
    expect(toTlsConnectOptions('mtalk.google.com', 5228, { rejectUnauthorized: false })).toEqual({
      host: 'mtalk.google.com',
      port: 5228,
      servername: 'mtalk.google.com',
      ca: undefined,
      rejectUnauthorized: false,
    });
  });
});
