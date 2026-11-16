import {
  listen,
  Client,
  type CredentialsWithPersistentIds,
  type ListenOptions,
  type NotificationCallbackParams,
} from './listen.js';

export async function listenMany(
  credentialsList: CredentialsWithPersistentIds[],
  notificationCallback: (params: NotificationCallbackParams) => void,
  options: ListenOptions = {},
): Promise<Client[]> {
  return Promise.all(
    credentialsList.map((credentials) => listen(credentials, notificationCallback, options)),
  );
}
