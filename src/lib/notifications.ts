import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { usersApi } from "./api";
import { getPushToken, setPushToken } from "./session";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2F80ED",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function registerForPushNotifications() {
  await ensureAndroidChannel();

  if (!Device.isDevice) {
    return null;
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;

  if (finalStatus !== "granted") {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  const projectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();

  return tokenResponse.data || null;
}

export async function bootstrapPushNotifications() {
  const token = await registerForPushNotifications();
  if (!token) {
    return null;
  }

  const previousToken = await getPushToken();
  if (previousToken === token) {
    return token;
  }

  await usersApi.registerPushToken({
    token,
    platform: Platform.OS,
    deviceId: Device.osInternalBuildId || Device.modelId || Device.deviceName || null,
  });
  await setPushToken(token);
  return token;
}

export async function unregisterPushNotifications() {
  const token = await getPushToken();
  if (!token) {
    return;
  }

  try {
    await usersApi.removePushToken({ token });
  } finally {
    await setPushToken(null);
  }
}
