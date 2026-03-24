import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

type StreamType = "direct" | "hls";

type OfflineLessonPlaybackArgs = {
  courseId: string;
  lessonId: string;
  mediaId?: string | null;
};

type DownloadOfflineLessonPlaybackArgs = OfflineLessonPlaybackArgs & {
  streamUrl: string;
  streamType: StreamType;
};

export type OfflineLessonPlayback = {
  streamType: StreamType;
  localUrl: string;
  createdAt: string;
};

type OfflineLessonMetadata = OfflineLessonPlayback & {
  version: 2;
  courseId?: string;
  lessonId?: string;
  mediaId?: string | null;
};

export type OfflineLessonCacheEntry = OfflineLessonPlayback & {
  id: string;
  entryDir: string;
  sizeBytes: number;
  courseId?: string;
  lessonId?: string;
  mediaId?: string | null;
};

const ROOT_DIR = `${FileSystem.documentDirectory ?? ""}jamm-private-courses/`;
const CAN_USE_OFFLINE_COURSE_CACHE =
  Platform.OS !== "web" &&
  Boolean(FileSystem.documentDirectory) &&
  typeof FileSystem.getInfoAsync === "function" &&
  typeof FileSystem.makeDirectoryAsync === "function" &&
  typeof FileSystem.downloadAsync === "function" &&
  typeof FileSystem.writeAsStringAsync === "function" &&
  typeof FileSystem.readAsStringAsync === "function";

const getEntryCacheKey = ({
  courseId,
  lessonId,
  mediaId,
}: OfflineLessonPlaybackArgs) =>
  `${courseId}:${lessonId}:${String(mediaId || "primary")}`;

const getHashedFileName = async (value: string, extension: string) => {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    value,
  );
  return `${digest}${extension}`;
};

const normalizeExtension = (value: string, fallback = ".bin") => {
  const clean = String(value || "").toLowerCase();
  return clean.startsWith(".") ? clean : fallback;
};

const guessExtension = (url: string, fallback = ".bin") => {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.[a-z0-9]+$/i);
    return normalizeExtension(match?.[0] || fallback, fallback);
  } catch {
    const match = String(url).match(/\.[a-z0-9]+(?:\?|$)/i);
    return normalizeExtension(match?.[0]?.split("?")[0] || fallback, fallback);
  }
};

const resolveUrl = (baseUrl: string, value: string) => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

const ensureDirectory = async (directory: string) => {
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }

  if (Platform.OS === "android") {
    try {
      await FileSystem.writeAsStringAsync(`${directory}.nomedia`, "", {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch {}
  }
};

const getDirectorySize = async (directory: string): Promise<number> => {
  const entries = await FileSystem.readDirectoryAsync(directory);
  const sizes = await Promise.all(
    entries.map(async (entryName) => {
      const target = `${directory}${entryName}`;
      const info = (await FileSystem.getInfoAsync(target)) as {
        exists: boolean;
        isDirectory?: boolean;
        size?: number;
      };

      if (!info.exists) {
        return 0;
      }

      if (info.isDirectory) {
        return getDirectorySize(`${target}/`);
      }

      return Number(info.size || 0);
    }),
  );

  return sizes.reduce((total, value) => total + value, 0);
};

const ensureRootDir = async () => {
  if (!CAN_USE_OFFLINE_COURSE_CACHE) {
    return;
  }
  await ensureDirectory(ROOT_DIR);
};

const getEntryDir = async (args: OfflineLessonPlaybackArgs) => {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    getEntryCacheKey(args),
  );
  return `${ROOT_DIR}${digest}/`;
};

const getMetadataUri = (entryDir: string) => `${entryDir}meta.json`;

const readMetadata = async (entryDir: string): Promise<OfflineLessonMetadata | null> => {
  const metadataUri = getMetadataUri(entryDir);
  const info = await FileSystem.getInfoAsync(metadataUri);
  if (!info.exists) {
    return null;
  }

  try {
    const raw = await FileSystem.readAsStringAsync(metadataUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(raw) as OfflineLessonMetadata;
    if (parsed?.version !== 2) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeMetadata = async (entryDir: string, payload: OfflineLessonMetadata) => {
  await FileSystem.writeAsStringAsync(
    getMetadataUri(entryDir),
    JSON.stringify(payload),
    {
      encoding: FileSystem.EncodingType.UTF8,
    },
  );
};

const ensureFileDownloaded = async (
  remoteUrl: string,
  targetUri: string,
) => {
  const existing = await FileSystem.getInfoAsync(targetUri);
  if (existing.exists) {
    return targetUri;
  }

  const tempUri = `${targetUri}.download`;
  try {
    await FileSystem.deleteAsync(tempUri, { idempotent: true });
  } catch {}

  const result = await FileSystem.downloadAsync(remoteUrl, tempUri);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Resource download failed: ${result.status}`);
  }

  await FileSystem.moveAsync({ from: tempUri, to: targetUri });
  return targetUri;
};

const downloadManifestRecursively = async (
  manifestUrl: string,
  entryDir: string,
  visited: Map<string, string>,
): Promise<string> => {
  const resolvedManifestUrl = resolveUrl(manifestUrl, manifestUrl);
  const existingManifestName = visited.get(resolvedManifestUrl);
  if (existingManifestName) {
    return existingManifestName;
  }

  const localManifestName = await getHashedFileName(resolvedManifestUrl, ".m3u8");
  visited.set(resolvedManifestUrl, localManifestName);

  const response = await fetch(resolvedManifestUrl, {
    headers: {
      Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`Manifest download failed: ${response.status}`);
  }

  const manifestText = await response.text();
  const rewrittenLines: string[] = [];

  for (const line of String(manifestText || "").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) {
      rewrittenLines.push(line);
      continue;
    }

    const uriMatch = line.match(/URI="([^"]+)"/i);
    if (uriMatch?.[1]) {
      const resourceUrl = resolveUrl(resolvedManifestUrl, uriMatch[1]);
      const resourceExtension = guessExtension(resourceUrl, ".key");
      const localResourceName = await getHashedFileName(resourceUrl, resourceExtension);
      const localResourceUri = `${entryDir}${localResourceName}`;
      await ensureFileDownloaded(resourceUrl, localResourceUri);
      rewrittenLines.push(line.replace(uriMatch[1], localResourceUri));
      continue;
    }

    if (trimmed.startsWith("#")) {
      rewrittenLines.push(line);
      continue;
    }

    const resourceUrl = resolveUrl(resolvedManifestUrl, trimmed);
    if (trimmed.toLowerCase().endsWith(".m3u8")) {
      const nestedManifestName = await downloadManifestRecursively(
        resourceUrl,
        entryDir,
        visited,
      );
      rewrittenLines.push(`${entryDir}${nestedManifestName}`);
      continue;
    }

    const localResourceName = await getHashedFileName(
      resourceUrl,
      guessExtension(resourceUrl, ".ts"),
    );
    const localResourceUri = `${entryDir}${localResourceName}`;
    await ensureFileDownloaded(resourceUrl, localResourceUri);
    rewrittenLines.push(localResourceUri);
  }

  await FileSystem.writeAsStringAsync(
    `${entryDir}${localManifestName}`,
    rewrittenLines.join("\n"),
    {
      encoding: FileSystem.EncodingType.UTF8,
    },
  );

  return localManifestName;
};

export const getOfflineLessonPlayback = async (
  args: OfflineLessonPlaybackArgs,
): Promise<OfflineLessonPlayback | null> => {
  if (!CAN_USE_OFFLINE_COURSE_CACHE) {
    return null;
  }

  await ensureRootDir();
  const entryDir = await getEntryDir(args);
  const metadata = await readMetadata(entryDir);

  if (!metadata?.localUrl) {
    return null;
  }

  const info = await FileSystem.getInfoAsync(metadata.localUrl);
  if (!info.exists) {
    return null;
  }

  return {
    localUrl: metadata.localUrl,
    streamType: metadata.streamType,
    createdAt: metadata.createdAt,
  };
};

export const downloadOfflineLessonPlayback = async (
  args: DownloadOfflineLessonPlaybackArgs,
): Promise<OfflineLessonPlayback> => {
  if (!CAN_USE_OFFLINE_COURSE_CACHE) {
    throw new Error("Offline cache bu qurilmada qo'llanmaydi");
  }

  await ensureRootDir();
  const entryDir = await getEntryDir(args);
  await ensureDirectory(entryDir);

  const existing = await getOfflineLessonPlayback(args);
  if (existing) {
    return existing;
  }

  let localUrl = "";

  if (args.streamType === "direct") {
    const extension = guessExtension(args.streamUrl, ".mp4");
    const fileName = await getHashedFileName(args.streamUrl, extension);
    localUrl = `${entryDir}${fileName}`;
    await ensureFileDownloaded(args.streamUrl, localUrl);
  } else {
    const localManifestName = await downloadManifestRecursively(
      args.streamUrl,
      entryDir,
      new Map<string, string>(),
    );
    localUrl = `${entryDir}${localManifestName}`;
  }

  const payload: OfflineLessonMetadata = {
    version: 2,
    streamType: args.streamType,
    localUrl,
    createdAt: new Date().toISOString(),
    courseId: args.courseId,
    lessonId: args.lessonId,
    mediaId: args.mediaId ?? null,
  };

  await writeMetadata(entryDir, payload);

  return {
    streamType: payload.streamType,
    localUrl: payload.localUrl,
    createdAt: payload.createdAt,
  };
};

export const removeOfflineLessonPlayback = async (
  args: OfflineLessonPlaybackArgs,
) => {
  if (!CAN_USE_OFFLINE_COURSE_CACHE) {
    return;
  }

  const entryDir = await getEntryDir(args);
  await FileSystem.deleteAsync(entryDir, { idempotent: true });
};

export const listOfflineLessonCacheEntries = async (): Promise<OfflineLessonCacheEntry[]> => {
  if (!CAN_USE_OFFLINE_COURSE_CACHE) {
    return [];
  }

  await ensureRootDir();
  const entries = await FileSystem.readDirectoryAsync(ROOT_DIR);
  const items: Array<OfflineLessonCacheEntry | null> = await Promise.all(
    entries.map(async (entryName) => {
      const entryDir = `${ROOT_DIR}${entryName}/`;
      const info = (await FileSystem.getInfoAsync(entryDir)) as {
        exists: boolean;
        isDirectory?: boolean;
      };

      if (!info.exists || !info.isDirectory) {
        return null;
      }

      const metadata = await readMetadata(entryDir);
      if (!metadata?.localUrl) {
        return null;
      }

      const localInfo = await FileSystem.getInfoAsync(metadata.localUrl);
      if (!localInfo.exists) {
        return null;
      }

      const item: OfflineLessonCacheEntry = {
        id: entryDir,
        entryDir,
        localUrl: metadata.localUrl,
        streamType: metadata.streamType,
        createdAt: metadata.createdAt,
        courseId: metadata.courseId,
        lessonId: metadata.lessonId,
        mediaId: metadata.mediaId ?? null,
        sizeBytes: await getDirectorySize(entryDir),
      };

      return item;
    }),
  );

  return items
    .filter((item): item is OfflineLessonCacheEntry => item !== null)
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      return rightTime - leftTime;
    });
};

export const removeOfflineLessonCacheEntry = async (entryId: string) => {
  if (!entryId || !CAN_USE_OFFLINE_COURSE_CACHE) {
    return;
  }

  await FileSystem.deleteAsync(entryId, { idempotent: true });
};

export const clearOfflineLessonCache = async () => {
  if (!CAN_USE_OFFLINE_COURSE_CACHE) {
    return;
  }

  await FileSystem.deleteAsync(ROOT_DIR, { idempotent: true });
};
