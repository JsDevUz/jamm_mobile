import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CommentsResponse, FeedResponse, FeedTab } from "../types/posts";

const FEED_CACHE_VERSION = 1;
const FEED_TAB_KEY_PREFIX = "jamm.feed-cache.tab";
const FEED_SCROLL_KEY_PREFIX = "jamm.feed-cache.scroll";
const FEED_COMMENTS_KEY_PREFIX = "jamm.feed-cache.comments";
const FEED_UI_KEY_PREFIX = "jamm.feed-cache.ui";

type CacheEnvelope<T> = {
  version: number;
  updatedAt: string;
  data: T;
};

type CachedFeedInfiniteData = {
  pages: FeedResponse[];
  pageParams: unknown[];
};

const getScopedCacheKey = (prefix: string, userId: string, scope?: string) => {
  const normalizedUserId = encodeURIComponent(String(userId || "guest"));
  if (!scope) {
    return `${prefix}.${normalizedUserId}`;
  }

  return `${prefix}.${normalizedUserId}.${encodeURIComponent(String(scope))}`;
};

const parseEnvelope = async <T>(storageKey: string): Promise<CacheEnvelope<T> | null> => {
  const rawValue = await AsyncStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as CacheEnvelope<T>;
    if (parsed?.version !== FEED_CACHE_VERSION) {
      await AsyncStorage.removeItem(storageKey);
      return null;
    }

    return parsed;
  } catch {
    await AsyncStorage.removeItem(storageKey);
    return null;
  }
};

const writeEnvelope = async <T>(storageKey: string, data: T) => {
  const payload: CacheEnvelope<T> = {
    version: FEED_CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    data,
  };

  await AsyncStorage.setItem(storageKey, JSON.stringify(payload));
};

const sanitizeFeedResponse = (page: FeedResponse): FeedResponse => ({
  data: Array.isArray(page.data) ? page.data.filter(Boolean) : [],
  totalPages: Number(page.totalPages) || 1,
  page: Number(page.page) || 1,
});

export async function loadCachedFeedTab(userId: string, tab: FeedTab) {
  const storageKey = getScopedCacheKey(FEED_TAB_KEY_PREFIX, userId, tab);
  const envelope = await parseEnvelope<CachedFeedInfiniteData>(storageKey);
  const pages = envelope?.data?.pages;
  const pageParams = envelope?.data?.pageParams;

  if (!Array.isArray(pages) || !Array.isArray(pageParams)) {
    return null;
  }

  return {
    pages: pages.map(sanitizeFeedResponse),
    pageParams,
  } satisfies CachedFeedInfiniteData;
}

export async function saveCachedFeedTab(
  userId: string,
  tab: FeedTab,
  data: CachedFeedInfiniteData,
) {
  const storageKey = getScopedCacheKey(FEED_TAB_KEY_PREFIX, userId, tab);
  const pages = Array.isArray(data?.pages) ? data.pages.map(sanitizeFeedResponse) : [];
  const pageParams = Array.isArray(data?.pageParams) ? data.pageParams : [];

  await writeEnvelope(storageKey, {
    pages,
    pageParams,
  } satisfies CachedFeedInfiniteData);
}

export async function loadCachedFeedComments(userId: string, postId: string) {
  const storageKey = getScopedCacheKey(FEED_COMMENTS_KEY_PREFIX, userId, postId);
  const envelope = await parseEnvelope<CommentsResponse>(storageKey);
  const cached = envelope?.data;
  if (!cached) {
    return null;
  }

  return {
    data: Array.isArray(cached.data) ? cached.data.filter(Boolean) : [],
    totalPages: Number(cached.totalPages) || 1,
    page: Number(cached.page) || 1,
  } satisfies CommentsResponse;
}

export async function saveCachedFeedComments(
  userId: string,
  postId: string,
  response: CommentsResponse,
) {
  const storageKey = getScopedCacheKey(FEED_COMMENTS_KEY_PREFIX, userId, postId);
  await writeEnvelope(storageKey, {
    data: Array.isArray(response?.data) ? response.data.filter(Boolean) : [],
    totalPages: Number(response?.totalPages) || 1,
    page: Number(response?.page) || 1,
  } satisfies CommentsResponse);
}

export async function loadFeedScrollPosition(userId: string, tab: FeedTab) {
  const storageKey = getScopedCacheKey(FEED_SCROLL_KEY_PREFIX, userId, tab);
  const envelope = await parseEnvelope<number>(storageKey);
  const offset = Number(envelope?.data);

  if (!Number.isFinite(offset) || offset < 0) {
    return null;
  }

  return offset;
}

export async function saveFeedScrollPosition(userId: string, tab: FeedTab, offset: number) {
  const storageKey = getScopedCacheKey(FEED_SCROLL_KEY_PREFIX, userId, tab);
  await writeEnvelope(storageKey, Math.max(0, Number(offset) || 0));
}

export async function loadFeedLastActiveTab(userId: string) {
  const storageKey = getScopedCacheKey(FEED_UI_KEY_PREFIX, userId);
  const envelope = await parseEnvelope<FeedTab>(storageKey);
  const tab = envelope?.data;
  return tab === "following" ? "following" : tab === "foryou" ? "foryou" : null;
}

export async function saveFeedLastActiveTab(userId: string, tab: FeedTab) {
  const storageKey = getScopedCacheKey(FEED_UI_KEY_PREFIX, userId);
  await writeEnvelope(storageKey, tab);
}
