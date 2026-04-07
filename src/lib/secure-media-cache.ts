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
let secureMediaCacheVersion = 0;
const secureMediaCacheListeners = new Set<(version: number) => void>();

const notifySecureMediaCacheChanged = () => {
  secureMediaCacheVersion += 1;
  secureMediaCacheListeners.forEach((listener) => {
    listener(secureMediaCacheVersion);
  });
};

export const getSecureMediaCacheVersion = () => secureMediaCacheVersion;

export const subscribeSecureMediaCache = (listener: (version: number) => void) => {
  secureMediaCacheListeners.add(listener);
  return () => {
    secureMediaCacheListeners.delete(listener);
  };
};

const ensureRootDir = async () => {
  if (!CAN_USE_PRIVATE_CACHE) {
    return;
  }

  const info = await FileSystem.getInfoAsync(ROOT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ROOT_DIR, { intermediates: true });
  }
};

export type SecureCachedMediaEntry = {
  id: string;
  localUri: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt?: number | null;
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
      notifySecureMediaCacheChanged();
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

export const listSecureCachedMediaEntries = async (): Promise<SecureCachedMediaEntry[]> => {
  if (!CAN_USE_PRIVATE_CACHE) {
    return [];
  }

  await ensureRootDir();
  const fileNames = await FileSystem.readDirectoryAsync(ROOT_DIR);
  const entries: Array<SecureCachedMediaEntry | null> = await Promise.all(
    fileNames
      .filter((fileName) => !String(fileName || "").endsWith(".download"))
      .map(async (fileName) => {
        const localUri = `${ROOT_DIR}${fileName}`;
        const info = (await FileSystem.getInfoAsync(localUri)) as {
          exists: boolean;
          isDirectory?: boolean;
          size?: number;
          modificationTime?: number | null;
        };

        if (!info.exists || info.isDirectory) {
          return null;
        }

        const entry: SecureCachedMediaEntry = {
          id: localUri,
          localUri,
          fileName,
          sizeBytes: Number(info.size || 0),
          modifiedAt: info.modificationTime ?? null,
        };

        return entry;
      }),
  );

  return entries
    .filter((entry): entry is SecureCachedMediaEntry => entry !== null)
    .sort((left, right) => Number(right.modifiedAt || 0) - Number(left.modifiedAt || 0));
};

export const removeSecureCachedMediaEntry = async (entryId: string) => {
  if (!entryId || !CAN_USE_PRIVATE_CACHE) {
    return;
  }

  await FileSystem.deleteAsync(entryId, { idempotent: true });
  notifySecureMediaCacheChanged();
};

export const clearSecureCachedMediaEntries = async () => {
  if (!CAN_USE_PRIVATE_CACHE) {
    return;
  }

  await FileSystem.deleteAsync(ROOT_DIR, { idempotent: true });
  notifySecureMediaCacheChanged();
};
