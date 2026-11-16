# fcm-electron-receiver

Receive Firebase push notifications in your Electron app.

## Project status

This repository is an **independent** project maintained by [sh3xu](https://github.com/sh3xu).

It started from [rixcian/firebase-electron](https://github.com/rixcian/firebase-electron) (which itself builds on [electron-push-receiver](https://github.com/MatthieuLemoine/electron-push-receiver)), but it is **no longer a GitHub fork** of that project and is not affiliated with upstream maintainers.

- Upstream history and original MIT-licensed work remain credited below.
- **New changes in this repository** (fixes, features, docs, and packaging updates) are maintained here by sh3xu.
- Use this repo / npm package if you want this independently updated version.

## Installation

```bash
npm i fcm-electron-receiver
```

## Usage

Usage is similar to the [`electron-push-receiver`](https://github.com/MatthieuLemoine/electron-push-receiver) package.

### In the main process (`main.js/.ts`)

```typescript
import { setup: setupPushReceiver } from 'fcm-electron-receiver';

// Call it before 'did-finish-load' with mainWindow a reference to your window
setupPushReceiver(mainWindow.webContents);
```

### In the renderer process (`renderer.js/.ts`)

```typescript
import { ipcRenderer } from 'electron';
import {
  START_NOTIFICATION_SERVICE,
  NOTIFICATION_SERVICE_STARTED,
  NOTIFICATION_SERVICE_ERROR,
  NOTIFICATION_RECEIVED,
  TOKEN_UPDATED,
} from 'fcm-electron-receiver/dist/electron/consts';

// Listen for service successfully started
ipcRenderer.on(NOTIFICATION_SERVICE_STARTED, (_, token) => {
  // do something
});
// Handle notification errors
ipcRenderer.on(NOTIFICATION_SERVICE_ERROR, (_, error) => {
  // do something
});
// Send FCM token to backend
ipcRenderer.on(TOKEN_UPDATED, (_, token) => {
  // Send token
});
// Display notification
ipcRenderer.on(NOTIFICATION_RECEIVED, (_, notification) => {
  // display notification
});
// Start service
ipcRenderer.send(START_NOTIFICATION_SERVICE, { appId, apiKey, projectId, vapidKey });
// or
window.ipc.send(START_NOTIFICATION_SERVICE, { appId, apiKey, projectId, vapidKey });
```

### Where to find `appId`, `apiKey`, `projectId` and `vapidKey`

1. Go to [Firebase Console](https://console.firebase.google.com/) & login to your account
2. Select your project
3. Click on the `Project Settings` cog icon
4. Click on `Project Settings`
5. Make sure you're on the `General` tab
6. Scroll down to the `Your apps` section
7. If you don't have an app, click on `Add app`
   - Select `Web`
   - Fill in the required fields
   - Click on `Register`
8. Copy the `appId`, `apiKey`, `projectId` listed under the `SDK setup and configuration` section
9. (Optional) Copy the `vapidKey` listed under the `Cloud Messaging` tab and `Web Configuration > Web Push certificates` section
10. (Optional) Generate a new `key pair` and use the value in the `Key pair` column as your `vapidKey`

## Webpack / Electron Forge

Protobuf definitions are embedded in the compiled JS bundle, so you do **not** need to copy `.proto` files with `CopyWebpackPlugin` or similar. If you previously added copy rules for `checkin.proto` / `mcs.proto`, you can remove them.

## Moving from `electron-push-receiver` / `firebase-electron`

[`electron-push-receiver`](https://github.com/MatthieuLemoine/electron-push-receiver) stopped working because it depends on the [Legacy FCM API](https://firebase.google.com/docs/cloud-messaging/migrate-v1) which was deprecated on June 21st, 2024 by Google.

[`rixcian/firebase-electron`](https://github.com/rixcian/firebase-electron) updated that approach for the newer FCM registration flow. This package continues from that work as an independent codebase with additional fixes and maintenance.

Credits for earlier work:

- [Matthieu Lemoine](https://github.com/MatthieuLemoine) and contributors of `electron-push-receiver`
- [rixcian](https://github.com/rixcian) and contributors of `firebase-electron`

### What's included

- Uses the new FCM protocol ([HTTP v1 API](https://firebase.google.com/docs/cloud-messaging/migrate-v1))
- TypeScript codebase with vitest tests
- Independent maintenance and additional fixes in this repository

> [!CAUTION]
> Breaking changes vs legacy `senderId` flow - you must provide `appId`, `apiKey`, `projectId` and optionally a `vapidKey`. See the [usage example](#usage).
>
> Google deprecated https://fcm.googleapis.com/fcm/connect/subscribe (/send too), which is slated for full removal on June 22, 2024. (Source: https://firebase.google.com/docs/cloud-messaging/migrate-v1)

### What happened to `senderId`?

The old Legacy FCM subscribe flow accepted only a numeric `senderId` (also called the Firebase Cloud Messaging sender ID). Google removed that endpoint, so a sender ID alone is no longer enough.

Use the Firebase **web app** configuration for the project you want to receive from:

| Old (`electron-push-receiver`) | New (`fcm-electron-receiver`) |
| --- | --- |
| `senderId` | `projectId` + `apiKey` + `appId` (+ optional `vapidKey`) |

The numeric sender ID still appears inside `appId` as `1:<senderId>:web:<hash>`, but you must pass the full web config, not just that number.

### Third-party / multiple senders

To receive pushes from another Firebase project (a "third-party sender"), you need that project's web credentials (`appId`, `apiKey`, `projectId`, optional `vapidKey`). Register once per project and listen to each credential set:

```typescript
import { registerMany, listenMany } from 'fcm-electron-receiver';

const projects = [
  { appId: myAppId, apiKey: myApiKey, projectId: myProjectId, vapidKey: myVapidKey },
  { appId: partnerAppId, apiKey: partnerApiKey, projectId: partnerProjectId, vapidKey: partnerVapidKey },
];

const credentialsList = await registerMany(projects);

// Store each credentials object (and later each persistentIds list) separately
await listenMany(
  credentialsList.map((credentials) => ({ ...credentials, persistentIds: [] })),
  ({ notification }) => {
    // handle notification from any registered project
  },
);
```

The Electron helper (`setup` / `START_NOTIFICATION_SERVICE`) manages a single Firebase project. For multiple senders, use the core `register` / `listen` (or `registerMany` / `listenMany`) APIs above and persist credentials yourself.

## Troubleshooting

### `Error=PHONE_REGISTRATION_ERROR`

Google's GCM check-in/register flow can return this transiently right after a new `android_id` is created. The library retries with exponential backoff and periodic re-check-in. If it still fails after several attempts, wait a few seconds and call `register()` again (or send `RESET_NOTIFICATION_SERVICE` then restart the Electron notification service).

## Development

1. Make sure you have the right Node.js version installed (specified in `.nvmrc` file)
2. Install dependencies with `npm install`
3. Duplicate `.env.template` to `.env` and fill in the required fields
4. Run tests with `npm run test`
5. Everything should works :)
