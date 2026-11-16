import axios from 'axios';
import Long from 'long';
import protobuf from 'protobufjs';

import fcmKey from '../fcm/server-key.js';
import { toBase64 } from '../utils/base64.js';
import {
  getGcmRetryDelayMs,
  isTransientGcmError,
  MAX_GCM_REGISTER_RETRIES,
  POST_CHECKIN_DELAY_MS,
  shouldRecheckIn,
} from '../utils/gcm-retry.js';
import { loadProtoJson } from '../utils/load-proto.js';
import { toAxiosTlsOptions, type TlsConfig } from '../utils/tls-options.js';
import { waitFor } from '../utils/timeout.js';
import checkinDescriptor from './checkin.json';

// HACK: fix PHONE_REGISTRATION_ERROR when bundled with webpack
// https://github.com/dcodeIO/protobuf.js#browserify-integration
protobuf.util.Long = Long;
protobuf.configure();

const serverKey = toBase64(Buffer.from(fcmKey));

const REGISTER_URL = 'https://android.clients.google.com/c2dm/register3';
const CHECKIN_URL = 'https://android.clients.google.com/checkin';

let root: protobuf.Root;
let AndroidCheckinResponse: protobuf.Type;

export interface CheckInOptions {
  androidId: string;
  securityToken: string;
}

export interface GCMRegistrationResult extends CheckInOptions {
  token: string;
  appId: string;
}

export async function registerGCM(appId: string, tls?: TlsConfig): Promise<GCMRegistrationResult> {
  let options = await checkIn(undefined, undefined, tls);
  // NOTE: Google may return PHONE_REGISTRATION_ERROR until a new android_id propagates
  await waitFor(POST_CHECKIN_DELAY_MS);
  const credentials = await doRegister(
    options,
    appId,
    async () => {
      options = await checkIn(options.androidId, options.securityToken, tls);
      await waitFor(POST_CHECKIN_DELAY_MS);
      return options;
    },
    tls,
  );

  return credentials;
}

export async function checkIn(
  androidId?: string,
  securityToken?: string,
  tls?: TlsConfig,
): Promise<CheckInOptions> {
  await loadProtoFile();

  const buffer = getCheckinRequest(androidId, securityToken);

  const response = await axios.post<ArrayBuffer>(CHECKIN_URL, buffer, {
    headers: {
      'Content-Type': 'application/x-protobuf',
    },
    responseType: 'arraybuffer',
    ...toAxiosTlsOptions(tls),
  });
  const body = new Uint8Array(response.data);

  const message = AndroidCheckinResponse.decode(body);

  const object = AndroidCheckinResponse.toObject(message, {
    longs: String,
    enums: String,
    bytes: String,
  }) as CheckInOptions;

  return object;
}

async function doRegister(
  checkInOptions: CheckInOptions,
  appId: string,
  recheckIn: () => Promise<CheckInOptions>,
  tls?: TlsConfig,
): Promise<GCMRegistrationResult> {
  let { androidId, securityToken } = checkInOptions;
  const body = {
    app: 'org.chromium.linux',
    'X-subtype': appId,
    device: androidId,
    sender: serverKey,
  };

  const response = await postRegister({
    getAuth: () => ({ androidId, securityToken }),
    body,
    tls,
    onTransientFailure: async (retry) => {
      if (shouldRecheckIn(retry)) {
        const refreshed = await recheckIn();
        androidId = refreshed.androidId;
        securityToken = refreshed.securityToken;
        body.device = androidId;
      }
    },
  });
  const token = response.split('=')[1]!;

  return {
    token,
    androidId,
    securityToken,
    appId,
  };
}

interface PostRegisterOptions {
  getAuth: () => { androidId: string; securityToken: string };
  body: Record<string, string>;
  retry?: number;
  tls?: TlsConfig;
  onTransientFailure?: (retry: number) => Promise<void>;
}

async function postRegister({
  getAuth,
  body,
  retry = 0,
  tls,
  onTransientFailure,
}: PostRegisterOptions): Promise<string> {
  const { androidId, securityToken } = getAuth();
  const response = await axios.post<string>(REGISTER_URL, new URLSearchParams(body).toString(), {
    headers: {
      Authorization: `AidLogin ${androidId}:${securityToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3234.0 Safari/537.36',
    },
    responseType: 'text',
    ...toAxiosTlsOptions(tls),
  });
  const responseBody = response.data;

  if (responseBody.includes('Error')) {
    console.warn(`GCM register request has failed with ${responseBody}`);

    if (!isTransientGcmError(responseBody) || retry >= MAX_GCM_REGISTER_RETRIES) {
      throw new Error(`GCM register has failed with ${responseBody.trim()}`);
    }

    console.warn(`Retry... ${retry + 1}`);
    await onTransientFailure?.(retry + 1);
    await waitFor(getGcmRetryDelayMs(retry));

    return postRegister({ getAuth, body, retry: retry + 1, tls, onTransientFailure });
  }

  return responseBody;
}

async function loadProtoFile(): Promise<void> {
  if (root) return;

  root = loadProtoJson(checkinDescriptor);
}

function getCheckinRequest(androidId?: string, securityToken?: string): Uint8Array {
  const AndroidCheckinRequest = root.lookupType('checkin_proto.AndroidCheckinRequest');

  AndroidCheckinResponse = root.lookupType('checkin_proto.AndroidCheckinResponse');

  const payload = {
    userSerialNumber: 0,
    checkin: {
      type: 3,
      chromeBuild: {
        platform: 2,
        chromeVersion: '63.0.3234.0',
        channel: 1,
      },
    },
    version: 3,
    id: androidId ? Long.fromString(androidId) : undefined,
    securityToken: securityToken ? Long.fromString(securityToken, true) : undefined,
  };

  const errMsg = AndroidCheckinRequest.verify(payload);

  if (errMsg) throw Error(errMsg);

  const message = AndroidCheckinRequest.create(payload);

  return AndroidCheckinRequest.encode(message).finish();
}
