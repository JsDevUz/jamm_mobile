import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const ROOT_DIR = `${FileSystem.documentDirectory ?? ""}jamm-private-feed/`;
const CAN_USE_PRIVATE_CACHE =
  Platform.OS !== "web" &&
  Boolean(FileSystem.documentDirectory) &&
  typeof FileSystem.getInfoAsync === "function" &&
  typeof FileSystem.makeDirectoryAsync === "function" &&
  typeof FileSystem.downloadAsync === "function";

const ensureRootDir = async () => {
  if (!CAN_USE_PRIVATE_CACHE) {
    return;
  }

  const info = await FileSystem.getInfoAsync(ROOT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ROOT_DIR, { intermediates: true });
  }
};

const getFileExtension = (url: string) => {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(jpg|jpeg|png|webp|gif|avif)$/i);
    return match?.[0]?.toLowerCase() || ".img";
  } catch {
    const match = String(url).match(/\.(jpg|jpeg|png|webp|gif|avif)(?:\?|$)/i);
    return match?.[0]?.split("?")?.[0]?.toLowerCase() || ".img";
  }
};

const buildLocalUri = async (remoteUrl: string) => {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    remoteUrl,
  );
  return `${ROOT_DIR}${digest}${getFileExtension(remoteUrl)}`;
};

export const getSecureCachedUri = async (remoteUrl: string) => {
  if (!remoteUrl || !CAN_USE_PRIVATE_CACHE) {
    return null;
  }

  await ensureRootDir();
  const localUri = await buildLocalUri(remoteUrl);
  const info = await FileSystem.getInfoAsync(localUri);
  return info.exists ? localUri : null;
};

export const cacheRemoteMedia = async (remoteUrl: string) => {
  if (!remoteUrl || !CAN_USE_PRIVATE_CACHE) {
    return null;
  }

  await ensureRootDir();
  const localUri = await buildLocalUri(remoteUrl);
  const existing = await FileSystem.getInfoAsync(localUri);

  if (existing.exists) {
    return localUri;
  }

  const tempUri = `${localUri}.download`;

  try {
    const result = await FileSystem.downloadAsync(remoteUrl, tempUri);
    if (result.status >= 200 && result.status < 300) {
      await FileSystem.moveAsync({ from: tempUri, to: localUri });
      return localUri;
    }
  } catch (error) {
    try {
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
    } catch {}
    throw error;
  }

  return null;
};
