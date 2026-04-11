import { API_BASE_URL } from "../config/env";
import {
  getAppUnlockToken,
  getAuthToken,
  getStoredAuthUser,
  setAuthToken,
} from "./session";
import type {
  AuthResponse,
  ChatAdmin,
  ProfileDecoration,
  ChatSummary,
  GroupLinkPreview,
  MeetSummary,
  Message,
  PaginatedMessages,
  PresenceSnapshot,
  User,
} from "../types/entities";
import type {
  CommentsResponse,
  FeedResponse,
  FeedPost,
  FeedTab,
  PostComment,
} from "../types/posts";
import type {
  ArticleComment,
  ArticleCommentsResponse,
  ArticleContentResponse,
  ArticleFeedSort,
  ArticlesResponse,
  ArticleSummary,
} from "../types/articles";
import type {
  Course,
  CourseLessonAttendanceResponse,
  CourseCommentsResponse,
  CourseLinkedTestAttemptResult,
  CourseLessonGradingResponse,
  CourseLessonHomeworkResponse,
  CourseLessonLinkedTestsResponse,
  CourseLessonMaterialsResponse,
  CoursesResponse,
} from "../types/courses";
import type {
  ArenaFlashcardDeck,
  ArenaFlashcardDecksResponse,
  ArenaFlashcardFolder,
  ArenaFlashcardFolderMutationPayload,
  ArenaFlashcardFoldersResponse,
  ArenaFlashcardMutationPayload,
  ArenaMnemonicLeaderboardResponse,
  ArenaMnemonicMode,
  ArenaMnemonicSavePayload,
  ArenaFlashcardReviewResponse,
  ArenaSentenceBuilderCheckResult,
  ArenaSentenceBuilderDeck,
  ArenaSentenceBuilderDecksResponse,
  ArenaSentenceBuilderMutationPayload,
  ArenaSentenceBuilderResultsResponse,
  ArenaSentenceBuilderShareLink,
  ArenaSentenceBuilderSubmitResult,
  ArenaTestResultsResponse,
} from "../types/arena";

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

const APP_LOCK_EXEMPT_PATHS = [
  "/auth/me",
  "/auth/mobile-session",
  "/auth/logout",
  "/users/me/app-lock/verify",
  "/users/me/app-lock/logout-clear",
  "/users/me/app-lock/lock-session",
];

let onAppLockRequired: (() => void) | null = null;
const appUnlockWaiters = new Set<() => void>();

export const setAppLockRequiredHandler = (handler: (() => void) | null) => {
  onAppLockRequired = handler;
};

export const releaseAppLockWaiters = () => {
  const waiters = Array.from(appUnlockWaiters);
  appUnlockWaiters.clear();
  waiters.forEach((resolve) => resolve());
};

const waitForAppUnlock = () =>
  new Promise<void>((resolve) => {
    appUnlockWaiters.add(resolve);
  });

const buildUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

const normalizePathname = (rawPath = "") => {
  try {
    return new URL(rawPath, API_BASE_URL).pathname;
  } catch {
    return String(rawPath || "");
  }
};

const isAppLockExemptPath = (path: string) => {
  const normalizedPath = normalizePathname(path);
  return APP_LOCK_EXEMPT_PATHS.some((exemptPath) =>
    normalizedPath.startsWith(exemptPath),
  );
};

const extractMessage = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const message = (payload as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return message.join("\n");
  }

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  return fallback;
};

async function request<T>(
  path: string,
  init?: RequestInit,
  appLockRetryCount = 0,
): Promise<T> {
  const headers = new Headers(init?.headers);
  const authToken = await getAuthToken();
  const authUser = await getStoredAuthUser();
  const appUnlockToken = await getAppUnlockToken();
  const isFormDataBody =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const isAppLockEnabled = authUser?.appLockEnabled === true;
  const isAppLocked =
    isAppLockEnabled &&
    authUser?.appLockSessionUnlocked === false &&
    !appUnlockToken;

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (init?.body && !isFormDataBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  if (appUnlockToken && !headers.has("X-App-Unlock-Token")) {
    headers.set("X-App-Unlock-Token", appUnlockToken);
  }
  if (authToken && isAppLocked && !isAppLockExemptPath(path)) {
    onAppLockRequired?.();
    await waitForAppUnlock();
    return request<T>(path, init, appLockRetryCount);
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });

  const contentType = response.headers.get("content-type") || "";
  const hasJson = contentType.includes("application/json");
  const payload = hasJson ? await response.json() : null;

  if (!response.ok) {
    const message = extractMessage(
      payload,
      `Request failed with ${response.status}`,
    );
    if (response.status === 423 && message === "APP_LOCK_REQUIRED") {
      onAppLockRequired?.();

      if (!isAppLockExemptPath(path) && onAppLockRequired && appLockRetryCount < 1) {
        await waitForAppUnlock();
        return request<T>(path, init, appLockRetryCount + 1);
      }
    }
    throw new ApiError(
      message,
      response.status,
      payload,
    );
  }

  return payload as T;
}

type RequestFallbackEntry = {
  path: string;
  init?: RequestInit;
};

async function requestWithFallback<T>(
  entries: Array<string | RequestFallbackEntry>,
  init?: RequestInit,
): Promise<T> {
  let lastError: unknown;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const path = typeof entry === "string" ? entry : entry.path;
    const nextInit = typeof entry === "string" ? init : entry.init;

    try {
      return await request<T>(path, nextInit);
    } catch (error) {
      lastError = error;
      const canRetry =
        error instanceof ApiError &&
        (error.status === 404 || error.status === 405) &&
        index < entries.length - 1;

      if (!canRetry) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Request failed for all fallback paths");
}

const normalizeChatSummary = (chat: ChatSummary): ChatSummary => ({
  ...chat,
  id: chat.id || chat._id,
  urlSlug: chat.privateurl || chat.urlSlug || chat.jammId || chat._id,
  type: chat.type || (chat.isGroup ? "group" : "user"),
  unread:
    typeof chat.unread === "number"
      ? chat.unread
      : Number(chat.unreadCount || 0),
  hasMessages:
    typeof chat.hasMessages === "boolean"
      ? chat.hasMessages
      : Boolean(chat.lastMessage),
  updatedAt: chat.updatedAt || chat.lastMessageAt || chat.createdAt,
});

const normalizeUser = (user: User): User => ({
  ...user,
  id: user.id || user._id || String(user.jammId || ""),
});

const normalizeChatListPayload = (payload: unknown): ChatSummary[] => {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeChatSummary(item as ChatSummary));
  }

  if (payload && typeof payload === "object") {
    const nested = (payload as { data?: unknown }).data;
    if (Array.isArray(nested)) {
      return nested.map((item) => normalizeChatSummary(item as ChatSummary));
    }
  }

  return [];
};

const normalizeUserListPayload = (payload: unknown): User[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.map((item) => normalizeUser(item as User));
};

type UploadableFile =
  | string
  | {
      uri: string;
      name?: string | null;
      type?: string | null;
      file?: Blob | File | null;
    };

const appendFileToFormData = (fieldName: string, fileInput: UploadableFile) => {
  const formData = new FormData();
  if (typeof fileInput !== "string" && fileInput.file) {
    formData.append(fieldName, fileInput.file);
    return formData;
  }

  const fileUri = typeof fileInput === "string" ? fileInput : fileInput.uri;
  const extension = fileUri.split(".").pop()?.toLowerCase();
  const fileName =
    typeof fileInput === "string"
      ? extension
        ? `upload.${extension}`
        : "upload.jpg"
      : fileInput.name || (extension ? `upload.${extension}` : "upload.jpg");
  const mimeType =
    typeof fileInput === "string"
      ? extension
        ? `image/${extension === "jpg" ? "jpeg" : extension}`
        : "image/jpeg"
      : fileInput.type ||
        (extension ? `image/${extension === "jpg" ? "jpeg" : extension}` : "image/jpeg");

  formData.append(fieldName, {
    uri: fileUri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  return formData;
};

export const authApi = {
  me: () => request<User>("/auth/me"),
  restoreSession: async () => {
    const response = await request<AuthResponse>("/auth/mobile-session");
    if (response.access_token) {
      await setAuthToken(response.access_token);
    }
    return response;
  },
  login: async (payload: { email: string; password: string }) => {
    const response = await request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (response.access_token) {
      await setAuthToken(response.access_token);
    }
    return response;
  },
  signup: (payload: { email: string; password: string; nickname: string }) =>
    request<{ message: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  forgotPassword: (payload: { email: string }) =>
    request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: async () => {
    try {
      await request("/auth/logout", {
        method: "POST",
      });
      await setAuthToken(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await setAuthToken(null);
        return;
      }
      throw error;
    }
  },
};

export const chatsApi = {
  fetchChats: async () => {
    const payload = await request<unknown>("/chats");
    return normalizeChatListPayload(payload);
  },
  getChat: async (chatId: string) => {
    const payload = await request<ChatSummary>(`/chats/${chatId}`);
    return normalizeChatSummary(payload);
  },
  createChat: (payload: {
    isGroup: boolean;
    name?: string;
    description?: string;
    avatar?: string;
    memberIds: string[];
  }) =>
    request<ChatSummary>("/chats", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editChat: (
    chatId: string,
    payload: {
      name?: string;
      description?: string;
      avatar?: string;
      members?: string[];
      admins?: ChatAdmin[];
    },
  ) =>
    request<ChatSummary>(`/chats/${chatId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteChat: (chatId: string) =>
    request(`/chats/${chatId}`, {
      method: "DELETE",
    }),
  leaveChat: (chatId: string) =>
    request(`/chats/${chatId}/leave`, {
      method: "POST",
    }),
  previewGroupByLink: (slugOrId: string) =>
    request<GroupLinkPreview>(`/chats/preview/${encodeURIComponent(slugOrId)}`),
  joinGroupByLink: async (slugOrId: string) => {
    const payload = await request<ChatSummary>(
      `/chats/${encodeURIComponent(slugOrId)}/join-link`,
      {
        method: "POST",
      },
    );
    return normalizeChatSummary(payload);
  },
  resolveSlug: (slug: string) =>
    request<{ jammId: number }>(`/chats/resolve/${encodeURIComponent(slug)}`),
  fetchMessages: (chatId: string, before?: string | null) => {
    const suffix = before
      ? `?before=${encodeURIComponent(before)}&suppressAutoRead=1`
      : "?suppressAutoRead=1";
    return request<PaginatedMessages>(`/chats/${chatId}/messages${suffix}`);
  },
  sendMessage: (payload: {
    chatId: string;
    content: string;
    replayToId?: string | null;
  }) =>
    request<Message>(`/chats/${payload.chatId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: payload.content,
        replayToId: payload.replayToId,
      }),
    }),
  editMessage: (messageId: string, content: string) =>
    request<Message>(`/chats/messages/${messageId}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  deleteMessage: (messageId: string) =>
    request<Message>(`/chats/messages/${messageId}`, {
      method: "DELETE",
    }),
  searchUsers: async (query: string) => {
    const payload = await request<unknown>(
      `/chats/search/users?q=${encodeURIComponent(query)}&limit=10`,
    );
    return normalizeUserListPayload(payload);
  },
  searchGroups: async (query: string) => {
    const payload = await request<unknown>(
      `/chats/search/groups?q=${encodeURIComponent(query)}&limit=10`,
    );
    return normalizeChatListPayload(payload);
  },
  uploadGroupAvatar: (fileUri: string) =>
    request<string>("/chats/upload-avatar", {
      method: "POST",
      body: appendFileToFormData("file", fileUri),
    }),
  updateGroupAvatar: (chatId: string, fileUri: string) =>
    request<string>(`/chats/${chatId}/avatar`, {
      method: "POST",
      body: appendFileToFormData("file", fileUri),
    }),
  startVideoCall: (chatId: string) =>
    request<{ roomId: string }>(`/chats/${chatId}/call/start`, {
      method: "POST",
    }),
  endVideoCall: (chatId: string) =>
    request(`/chats/${chatId}/call`, {
      method: "DELETE",
    }),
  getCallStatus: (chatId: string) =>
    request<{ active: boolean; roomId?: string; creatorId?: string }>(
      `/chats/${chatId}/call/status`,
    ),
  updatePushNotifications: (chatId: string, enabled: boolean) =>
    request<{ enabled: boolean }>(`/chats/${chatId}/push-notifications`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
};

export const usersApi = {
  search: async (query: string) => {
    const payload = await request<unknown>(
      `/users/search?q=${encodeURIComponent(query)}`,
    );
    return normalizeUserListPayload(payload);
  },
  searchGlobal: async (query: string) => {
    const payload = await request<unknown>(
      `/users/global-search?q=${encodeURIComponent(query)}`,
    );
    return normalizeUserListPayload(payload);
  },
  getPublicProfile: (identifier: string) =>
    request<User>(`/users/${identifier}/profile`),
  checkUsernameAvailability: (username: string) =>
    request<{ available: boolean }>(
      `/users/check-username/${encodeURIComponent(username)}`,
    ),
  completeOnboarding: (payload: {
    username: string;
    gender: string;
    age: number;
    interests?: string[];
    goals?: string[];
    level?: string;
  }) =>
    request<User>("/users/complete-onboarding", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  toggleFollow: (identifier: string) =>
    request<{ following: boolean; followersCount: number }>(`/users/${identifier}/follow`, {
      method: "POST",
    }),
  updateMe: (payload: {
    nickname?: string;
    username?: string;
    phone?: string;
    avatar?: string;
    bio?: string;
    disableGroupInvites?: boolean;
  }) =>
    request<User>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  uploadAvatar: (fileUri: string) =>
    request<{ avatar?: string }>("/users/upload-avatar", {
      method: "POST",
      body: appendFileToFormData("file", fileUri),
    }),
  getAppLockStatus: () => request<{ enabled: boolean }>("/users/me/app-lock"),
  setAppLockPin: (payload: { pin: string; currentPin?: string }) =>
    request<{ enabled: boolean }>("/users/me/app-lock", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verifyAppLockPin: (payload: { pin: string }) =>
    request<{ valid: boolean; unlockToken?: string }>(
      "/users/me/app-lock/verify",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  removeAppLockPin: (payload: { pin: string }) =>
    request<{ enabled: boolean }>("/users/me/app-lock/remove", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  lockAppSession: () =>
    request<{ locked: boolean }>("/users/me/app-lock/lock-session", {
      method: "POST",
    }),
  clearAppLockOnLogout: () =>
    request<{ enabled: boolean }>("/users/me/app-lock/logout-clear", {
      method: "POST",
    }),
  updateProfileDecoration: (decorationId?: string | null) =>
    request<User>("/users/me/profile-decoration", {
      method: "PATCH",
      body: JSON.stringify({ decorationId: decorationId ?? null }),
    }),
  registerPushToken: (payload: {
    token: string;
    platform?: string;
    deviceId?: string | null;
  }) =>
    request<{ success: boolean }>("/users/me/push-token", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removePushToken: (payload?: { token?: string | null }) =>
    request<{ success: boolean }>("/users/me/push-token", {
      method: "DELETE",
      body: JSON.stringify(payload || {}),
    }),
  getProfileDecorations: () => request<ProfileDecoration[]>("/users/profile-decorations"),
};

export const premiumApi = {
  getPlans: () =>
    request<
      Array<{
        _id?: string;
        id?: string;
        name: string;
        durationInDays: number;
        price: number;
        features?: string[];
        isActive?: boolean;
      }>
    >("/premium/plans"),
  redeemPromo: (code: string) =>
    request("/premium/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  getStatus: () => request<{ status: string }>("/premium/status"),
};

export const presenceApi = {
  getBulkStatus: (userIds: string[]) =>
    request<{ statuses: Record<string, PresenceSnapshot> }>(
      "/presence/status/bulk",
      {
        method: "POST",
        body: JSON.stringify({ userIds }),
      },
    ),
};

export const postsApi = {
  fetchFeed: (type: FeedTab = "foryou", page = 1, limit = 10) =>
    request<FeedResponse>(`/posts/feed?type=${type}&page=${page}&limit=${limit}`),
  likePost: (postId: string) => request<{ liked: boolean; likes: number }>(`/posts/${postId}/like`, {
    method: "POST",
  }),
  viewPost: (postId: string) => request<{ views: number }>(`/posts/${postId}/view`, {
    method: "POST",
  }),
  getComments: (postId: string, page = 1, limit = 10) =>
    request<CommentsResponse>(`/posts/${postId}/comments?page=${page}&limit=${limit}`),
  addComment: (postId: string, content: string) =>
    request<{ comments: number }>(`/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  addReply: (
    postId: string,
    commentId: string,
    content: string,
    replyToUser?: string,
  ) =>
    request<{ replies: number; comments?: number }>(`/posts/${postId}/comments/${commentId}/reply`, {
      method: "POST",
      body: JSON.stringify({ content, replyToUser }),
    }),
  updateComment: (postId: string, commentId: string, content: string) =>
    requestWithFallback<{ updated: boolean }>([
      {
        path: `/posts/${postId}/comments/${commentId}`,
        init: {
          method: "PATCH",
          body: JSON.stringify({ content }),
        },
      },
      {
        path: `/post/${postId}/comments/${commentId}`,
        init: {
          method: "PATCH",
          body: JSON.stringify({ content }),
        },
      },
      {
        path: `/posts/${postId}/comments/${commentId}/update`,
        init: {
          method: "POST",
          body: JSON.stringify({ content }),
        },
      },
      {
        path: `/post/${postId}/comments/${commentId}/update`,
        init: {
          method: "POST",
          body: JSON.stringify({ content }),
        },
      },
    ]),
  deleteComment: (postId: string, commentId: string) =>
    requestWithFallback<{ comments: number }>([
      {
        path: `/posts/${postId}/comments/${commentId}`,
        init: {
          method: "DELETE",
        },
      },
      {
        path: `/post/${postId}/comments/${commentId}`,
        init: {
          method: "DELETE",
        },
      },
      {
        path: `/posts/${postId}/comments/${commentId}/delete`,
        init: {
          method: "POST",
        },
      },
      {
        path: `/post/${postId}/comments/${commentId}/delete`,
        init: {
          method: "POST",
        },
      },
    ]),
  uploadImage: (file: UploadableFile) =>
    request<{ url: string }>("/posts/upload-image", {
      method: "POST",
      body: appendFileToFormData("file", file),
    }),
  deleteUploadedImage: (url: string) =>
    request<{ deleted?: boolean }>("/posts/upload-image", {
      method: "DELETE",
      body: JSON.stringify({ url }),
    }),
  createPost: (payload: { content: string; images?: FeedPost["images"] }) =>
    request<FeedPost>("/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePost: (postId: string, payload: { content: string; images?: FeedPost["images"] }) =>
    request<FeedPost>(`/posts/${postId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePost: (postId: string) =>
    request(`/posts/${postId}`, {
      method: "DELETE",
    }),
  fetchUserPosts: (userId: string) => request<FeedPost[]>(`/posts/user/${userId}`),
  fetchLikedPosts: () => request<FeedPost[]>("/posts/liked"),
  toggleFollow: (userId: string) =>
    request<{ following: boolean; followersCount: number }>(`/users/${userId}/follow`, {
      method: "POST",
    }),
  getPublicProfile: (userId: string) => request<User>(`/users/${userId}/profile`),
};

export const articlesApi = {
  fetchArticles: (page = 1, limit = 20, sort: ArticleFeedSort = "newest") =>
    request<ArticlesResponse>(
      `/articles?page=${page}&limit=${limit}&sort=${encodeURIComponent(sort)}`,
    ),
  searchArticles: (query: string, limit = 20) =>
    request<ArticleSummary[]>(
      `/articles/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    ),
  fetchUserArticles: (identifier: string) =>
    request<ArticleSummary[]>(`/articles/user/${identifier}`),
  fetchLikedArticles: () => request<ArticleSummary[]>("/articles/liked"),
  getArticle: (identifier: string) => request<ArticleSummary>(`/articles/${identifier}`),
  getArticleContent: (identifier: string) =>
    request<ArticleContentResponse>(`/articles/${identifier}/content`),
  likeArticle: (identifier: string) =>
    request<{ liked: boolean; likes: number }>(`/articles/${identifier}/like`, {
      method: "POST",
    }),
  viewArticle: (identifier: string) =>
    request<{ views: number }>(`/articles/${identifier}/view`, {
      method: "POST",
    }),
  getComments: (identifier: string, page = 1, limit = 10) =>
    request<ArticleCommentsResponse>(
      `/articles/${identifier}/comments?page=${page}&limit=${limit}`,
    ),
  addComment: (identifier: string, content: string) =>
    request<{ comments: number }>(`/articles/${identifier}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  addReply: (
    identifier: string,
    commentId: string,
    content: string,
    replyToUser?: string,
  ) =>
    request<{ replies?: number; comments?: number }>(
      `/articles/${identifier}/comments/${commentId}/reply`,
      {
        method: "POST",
        body: JSON.stringify({ content, replyToUser }),
      },
    ),
  updateComment: (identifier: string, commentId: string, content: string) =>
    requestWithFallback<{ updated: boolean }>([
      {
        path: `/articles/${identifier}/comments/${commentId}`,
        init: {
          method: "PATCH",
          body: JSON.stringify({ content }),
        },
      },
      {
        path: `/articles/${identifier}/comments/${commentId}/update`,
        init: {
          method: "POST",
          body: JSON.stringify({ content }),
        },
      },
    ]),
  deleteComment: (identifier: string, commentId: string) =>
    requestWithFallback<{ comments: number }>([
      {
        path: `/articles/${identifier}/comments/${commentId}`,
        init: {
          method: "DELETE",
        },
      },
      {
        path: `/articles/${identifier}/comments/${commentId}/delete`,
        init: {
          method: "POST",
        },
      },
    ]),
  createArticle: (payload: {
    title: string;
    markdown: string;
    excerpt?: string;
    coverImage?: string;
    tags?: string[];
  }) =>
    request<ArticleSummary>("/articles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateArticle: (
    identifier: string,
    payload: {
      title: string;
      markdown: string;
      excerpt?: string;
      coverImage?: string;
      tags?: string[];
    },
  ) =>
    request<ArticleSummary>(`/articles/${identifier}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteArticle: (identifier: string) =>
    request<{ deleted: boolean }>(`/articles/${identifier}`, {
      method: "DELETE",
    }),
  uploadImage: (fileUri: string) =>
    request<{ url: string }>("/articles/upload-image", {
      method: "POST",
      body: appendFileToFormData("file", fileUri),
    }),
};

export const coursesApi = {
  fetchCourses: (page = 1, limit = 15) =>
    request<CoursesResponse>(
      `/courses?page=${page}&limit=${limit}`,
    ),
  searchCourses: (query: string, limit = 20) =>
    request<Course[]>(
      `/courses/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    ),
  fetchLikedLessons: () =>
    request<
      Array<{
        _id: string;
        title?: string;
        description?: string;
        likes?: number;
        views?: number;
        urlSlug?: string;
        addedAt?: string;
        course?: {
          _id?: string;
          name?: string;
          image?: string;
          urlSlug?: string;
        } | null;
      }>
    >("/courses/liked-lessons"),
  getCourse: (identifier: string) => request<Course>(`/courses/${identifier}`),
  createCourse: (payload: {
    name: string;
    description?: string;
    image?: string;
    category?: string;
    accessType?: "paid" | "free_request" | "free_open";
    price?: number;
  }) =>
    request<Course>("/courses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteCourse: (courseId: string) =>
    request(`/courses/${courseId}`, {
      method: "DELETE",
    }),
  uploadMedia: (fileUri: string) =>
    request<{
      streamType?: "direct" | "hls";
      fileUrl?: string;
      url?: string;
      fileName?: string;
      fileSize?: number;
      durationSeconds?: number;
      hlsKeyAsset?: string;
    }>("/courses/upload-media", {
      method: "POST",
      body: appendFileToFormData("file", fileUri),
    }),
  addLesson: (
    courseId: string,
    payload: {
      title: string;
      description?: string;
      type?: string;
      videoUrl?: string;
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      durationSeconds?: number;
      streamType?: "direct" | "hls";
      streamAssets?: string[];
      hlsKeyAsset?: string;
      status?: "draft" | "published";
      mediaItems?: Array<{
        title?: string;
        videoUrl?: string;
        fileUrl?: string;
        fileName?: string;
        fileSize?: number;
        durationSeconds?: number;
        streamType?: "direct" | "hls";
        streamAssets?: string[];
        hlsKeyAsset?: string;
      }>;
    },
  ) =>
    request<Course>(`/courses/${courseId}/lessons`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateLesson: (
    courseId: string,
    lessonId: string,
    payload: {
      title?: string;
      description?: string;
      type?: string;
      videoUrl?: string;
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      durationSeconds?: number;
      streamType?: "direct" | "hls";
      streamAssets?: string[];
      hlsKeyAsset?: string;
      mediaItems?: Array<{
        title?: string;
        videoUrl?: string;
        fileUrl?: string;
        fileName?: string;
        fileSize?: number;
        durationSeconds?: number;
        streamType?: "direct" | "hls";
        streamAssets?: string[];
        hlsKeyAsset?: string;
      }>;
    },
  ) =>
    request<Course>(`/courses/${courseId}/lessons/${lessonId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  publishLesson: (courseId: string, lessonId: string) =>
    request<Course>(`/courses/${courseId}/lessons/${lessonId}/publish`, {
      method: "PATCH",
    }),
  deleteLesson: (courseId: string, lessonId: string) =>
    request<Course>(`/courses/${courseId}/lessons/${lessonId}`, {
      method: "DELETE",
    }),
  enrollInCourse: (courseId: string) =>
    request<Course>(`/courses/${courseId}/enroll`, {
      method: "POST",
    }),
  approveCourseMember: (courseId: string, userId: string) =>
    request<Course>(`/courses/${courseId}/members/${userId}/approve`, {
      method: "PATCH",
    }),
  removeCourseMember: (courseId: string, userId: string) =>
    request<Course>(`/courses/${courseId}/members/${userId}`, {
      method: "DELETE",
    }),
  incrementViews: (courseId: string, lessonId: string) =>
    request(`/courses/${courseId}/lessons/${lessonId}/views`, {
      method: "PATCH",
    }),
  toggleLessonLike: (courseId: string, lessonId: string) =>
    request<{ liked: boolean; likes: number }>(`/courses/${courseId}/lessons/${lessonId}/like`, {
      method: "POST",
    }),
  getLessonMaterials: (courseId: string, lessonId: string) =>
    request<CourseLessonMaterialsResponse>(
      `/courses/${courseId}/lessons/${lessonId}/materials`,
    ),
  upsertLessonMaterial: (
    courseId: string,
    lessonId: string,
    payload: {
      materialId?: string;
      title: string;
      fileUrl: string;
      fileName: string;
      fileSize: number;
    },
  ) =>
    request<CourseLessonMaterialsResponse>(
      `/courses/${courseId}/lessons/${lessonId}/materials`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),
  deleteLessonMaterial: (courseId: string, lessonId: string, materialId: string) =>
    request<CourseLessonMaterialsResponse>(
      `/courses/${courseId}/lessons/${lessonId}/materials/${materialId}`,
      {
        method: "DELETE",
      },
    ),
  getLessonLinkedTests: (courseId: string, lessonId: string) =>
    request<CourseLessonLinkedTestsResponse>(
      `/courses/${courseId}/lessons/${lessonId}/tests`,
    ),
  upsertLessonLinkedTest: (
    courseId: string,
    lessonId: string,
    payload: {
      linkedTestId?: string;
      url: string;
      minimumScore?: number;
      requiredToUnlock?: boolean;
    },
  ) =>
    request<CourseLessonLinkedTestsResponse>(
      `/courses/${courseId}/lessons/${lessonId}/tests`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),
  deleteLessonLinkedTest: (courseId: string, lessonId: string, linkedTestId: string) =>
    request<CourseLessonLinkedTestsResponse>(
      `/courses/${courseId}/lessons/${lessonId}/tests/${linkedTestId}`,
      {
        method: "DELETE",
      },
    ),
  submitLessonLinkedTestAttempt: (
    courseId: string,
    lessonId: string,
    linkedTestId: string,
    payload: {
      answers?: number[];
      sentenceBuilderAnswers?: Array<{
        questionIndex: number;
        selectedTokens: string[];
      }>;
    },
  ) =>
    request<CourseLinkedTestAttemptResult>(
      `/courses/${courseId}/lessons/${lessonId}/tests/${linkedTestId}/submit`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  getLessonAttendance: (courseId: string, lessonId: string) =>
    request<CourseLessonAttendanceResponse>(
      `/courses/${courseId}/lessons/${lessonId}/attendance`,
    ),
  setLessonAttendanceStatus: (
    courseId: string,
    lessonId: string,
    userId: string,
    status: "present" | "late" | "absent",
  ) =>
    request<CourseLessonAttendanceResponse>(
      `/courses/${courseId}/lessons/${lessonId}/attendance/${userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
    ),
  getLessonHomework: (courseId: string, lessonId: string) =>
    request<CourseLessonHomeworkResponse>(
      `/courses/${courseId}/lessons/${lessonId}/homework`,
    ),
  upsertLessonHomework: (
    courseId: string,
    lessonId: string,
    payload: {
      assignmentId?: string;
      enabled: boolean;
      title: string;
      description?: string;
      type: "text" | "audio" | "video" | "pdf" | "photo";
      deadline?: string;
      maxScore: number;
    },
  ) =>
    request<CourseLessonHomeworkResponse>(
      `/courses/${courseId}/lessons/${lessonId}/homework`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),
  deleteLessonHomework: (courseId: string, lessonId: string, assignmentId: string) =>
    request<CourseLessonHomeworkResponse>(
      `/courses/${courseId}/lessons/${lessonId}/homework/${assignmentId}`,
      {
        method: "DELETE",
      },
    ),
  submitLessonHomework: (
    courseId: string,
    lessonId: string,
    assignmentId: string,
    payload: {
      text?: string;
      link?: string;
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      streamType?: "direct" | "hls";
      streamAssets?: string[];
      hlsKeyAsset?: string;
    },
  ) =>
    request<CourseLessonHomeworkResponse>(
      `/courses/${courseId}/lessons/${lessonId}/homework/${assignmentId}/submit`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  getLessonGrading: (courseId: string, lessonId: string) =>
    request<CourseLessonGradingResponse>(
      `/courses/${courseId}/lessons/${lessonId}/grading`,
    ),
  setLessonOralAssessment: (
    courseId: string,
    lessonId: string,
    userId: string,
    payload: {
      score?: number | null;
      note?: string;
    },
  ) =>
    request<CourseLessonGradingResponse>(
      `/courses/${courseId}/lessons/${lessonId}/oral-assessment/${userId}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),
  getLessonPlaybackToken: (
    courseId: string,
    lessonId: string,
    mediaId?: string,
    client = "mobile-native",
  ) =>
    request<{
      streamType?: "direct" | "hls";
      streamUrl?: string;
      playbackToken?: string;
      expiresIn?: number;
    }>(
      `/courses/${courseId}/lessons/${lessonId}/playback-token?client=${encodeURIComponent(
        client,
      )}${mediaId ? `&mediaId=${encodeURIComponent(mediaId)}` : ""}`,
    ),
  getLessonComments: (courseId: string, lessonId: string, page = 1, limit = 10) =>
    request<CourseCommentsResponse>(
      `/courses/${courseId}/lessons/${lessonId}/comments?page=${page}&limit=${limit}`,
    ),
  addLessonComment: (courseId: string, lessonId: string, text: string) =>
    request<Course>(`/courses/${courseId}/lessons/${lessonId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  addLessonReply: (
    courseId: string,
    lessonId: string,
    commentId: string,
    text: string,
  ) =>
    request<Course>(
      `/courses/${courseId}/lessons/${lessonId}/comments/${commentId}/replies`,
      {
        method: "POST",
        body: JSON.stringify({ text }),
      },
    ),
};

export const arenaApi = {
  createTest: (payload: Record<string, unknown>) =>
    request<Record<string, unknown>>("/arena/tests", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTest: (testId: string, payload: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/arena/tests/${testId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  fetchMyTests: (page = 1, limit = 20) =>
    request<{
      data?: Array<Record<string, unknown>>;
      total?: number;
      page?: number;
      limit?: number;
      totalPages?: number;
    }>(`/arena/tests/my?page=${page}&limit=${limit}`),
  fetchTestById: (testId: string) => request<Record<string, unknown>>(`/arena/tests/${testId}`),
  deleteTest: (testId: string) =>
    request<Record<string, unknown>>(`/arena/tests/${testId}`, {
      method: "DELETE",
    }),
  fetchTestResults: (testId: string, page = 1, limit = 30, search = "") =>
    request<ArenaTestResultsResponse>(
      `/arena/tests/${testId}/results?page=${page}&limit=${limit}${
        search ? `&search=${encodeURIComponent(search)}` : ""
      }`,
    ),
  fetchSharedTestByCode: (shortCode: string) =>
    request<Record<string, unknown>>(`/arena/tests/shared/${shortCode}`),
  fetchTestShareLinks: (testId: string) =>
    request<Array<Record<string, unknown>>>(`/arena/tests/${testId}/share-links`),
  createTestShareLink: (
    testId: string,
    payload: {
      persistResults?: boolean;
      groupName?: string;
      showResults?: boolean;
      timeLimit?: number;
    },
  ) =>
    request<Record<string, unknown>>(`/arena/tests/${testId}/share-links`, {
      method: "POST",
      body: JSON.stringify({
        persistResults: payload.persistResults !== false,
        groupName: payload.groupName || "",
        showResults: payload.showResults !== false,
        timeLimit: Number(payload.timeLimit) || 0,
      }),
    }),
  deleteTestShareLink: (testId: string, shareLinkId: string) =>
    request<Record<string, unknown>>(`/arena/tests/${testId}/share-links/${shareLinkId}`, {
      method: "DELETE",
    }),
  submitTestAnswers: (
    testId: string,
    payload: { answers?: number[]; shareShortCode?: string | null },
  ) =>
    request<Record<string, unknown>>(`/arena/tests/${testId}/submit`, {
      method: "POST",
      body: JSON.stringify({
        answers: payload.answers || [],
        shareShortCode: payload.shareShortCode || null,
      }),
    }),
  fetchFlashcards: (page = 1, limit = 20) =>
    request<ArenaFlashcardDecksResponse>(`/arena/flashcards?page=${page}&limit=${limit}`),
  fetchFlashcardDeck: (deckId: string) =>
    request<ArenaFlashcardDeck>(`/arena/flashcards/${deckId}`),
  createFlashcardDeck: (payload: ArenaFlashcardMutationPayload) =>
    request<ArenaFlashcardDeck>("/arena/flashcards", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        cards: payload.cards || [],
        folderId: payload.folderId || null,
        isPublic: payload.isPublic !== false,
      }),
    }),
  updateFlashcardDeck: (deckId: string, payload: ArenaFlashcardMutationPayload) =>
    request<ArenaFlashcardDeck>(`/arena/flashcards/${deckId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: payload.title,
        cards: payload.cards || [],
        folderId: payload.folderId || null,
        isPublic: payload.isPublic !== false,
      }),
    }),
  deleteFlashcardDeck: (deckId: string) =>
    request<{ success?: boolean; deletedDeckId?: string }>(`/arena/flashcards/${deckId}`, {
      method: "DELETE",
    }),
  joinFlashcardDeck: (deckId: string) =>
    request<Record<string, unknown>>(`/arena/flashcards/${deckId}/join`, {
      method: "POST",
    }),
  leaveFlashcardDeck: (deckId: string) =>
    request<Record<string, unknown>>(`/arena/flashcards/${deckId}/leave`, {
      method: "DELETE",
    }),
  fetchFlashcardFolders: () =>
    request<ArenaFlashcardFoldersResponse>("/arena/flashcard-folders"),
  fetchFlashcardFolder: (folderId: string) =>
    request<ArenaFlashcardFolder>(`/arena/flashcard-folders/${folderId}`),
  createFlashcardFolder: (payload: ArenaFlashcardFolderMutationPayload) =>
    request<ArenaFlashcardFolder>("/arena/flashcard-folders", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        isPublic: payload.isPublic !== false,
      }),
    }),
  updateFlashcardFolder: (folderId: string, payload: ArenaFlashcardFolderMutationPayload) =>
    request<ArenaFlashcardFolder>(`/arena/flashcard-folders/${folderId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: payload.title,
        isPublic: payload.isPublic !== false,
      }),
    }),
  joinFlashcardFolder: (folderId: string) =>
    request<ArenaFlashcardFolder>(`/arena/flashcard-folders/${folderId}/join`, {
      method: "POST",
    }),
  leaveFlashcardFolder: (folderId: string) =>
    request<ArenaFlashcardFolder>(`/arena/flashcard-folders/${folderId}/leave`, {
      method: "DELETE",
    }),
  deleteFlashcardFolder: (folderId: string) =>
    request<{ success?: boolean; deletedFolderId?: string }>(
      `/arena/flashcard-folders/${folderId}`,
      {
        method: "DELETE",
      },
    ),
  reviewFlashcard: (deckId: string, cardId: string, quality: number) =>
    request<ArenaFlashcardReviewResponse>(
      `/arena/flashcards/${deckId}/cards/${cardId}/review`,
      {
        method: "PATCH",
        body: JSON.stringify({
          quality,
        }),
      },
    ),
  fetchMnemonicLeaderboard: (mode: ArenaMnemonicMode = "digits") =>
    request<ArenaMnemonicLeaderboardResponse>(
      `/arena/mnemonics/leaderboard?mode=${encodeURIComponent(mode)}`,
    ),
  saveMnemonicBestResult: (payload: ArenaMnemonicSavePayload) =>
    request<ArenaMnemonicLeaderboardResponse>("/arena/mnemonics/result", {
      method: "POST",
      body: JSON.stringify({
        mode: payload.mode,
        score: Number(payload.score) || 0,
        total: Number(payload.total) || 0,
        elapsedMemorizeMs: Number(payload.elapsedMemorizeMs) || 0,
      }),
    }),
  fetchSentenceBuilders: (page = 1, limit = 20) =>
    request<ArenaSentenceBuilderDecksResponse>(
      `/arena/sentence-builders?page=${page}&limit=${limit}`,
    ),
  createSentenceBuilderDeck: (payload: ArenaSentenceBuilderMutationPayload) =>
    request<ArenaSentenceBuilderDeck>("/arena/sentence-builders", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        description: payload.description || "",
        items: payload.items || undefined,
        pattern: payload.pattern || "",
      }),
    }),
  updateSentenceBuilderDeck: (
    deckId: string,
    payload: ArenaSentenceBuilderMutationPayload,
  ) =>
    request<ArenaSentenceBuilderDeck>(`/arena/sentence-builders/${deckId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: payload.title,
        description: payload.description || "",
        items: payload.items || undefined,
        pattern: payload.pattern || "",
      }),
    }),
  fetchSentenceBuilderDeck: (deckId: string) =>
    request<ArenaSentenceBuilderDeck | { deck?: ArenaSentenceBuilderDeck }>(
      `/arena/sentence-builders/${deckId}`,
    ),
  fetchSharedSentenceBuilderDeck: (shortCode: string) =>
    request<{
      deck?: ArenaSentenceBuilderDeck;
      shareLink?: ArenaSentenceBuilderShareLink;
    }>(`/arena/sentence-builders/shared/${shortCode}`),
  checkSentenceBuilderAnswer: (
    deckId: string,
    questionIndex: number,
    selectedTokens: string[],
  ) =>
    request<ArenaSentenceBuilderCheckResult>(`/arena/sentence-builders/${deckId}/check`, {
      method: "POST",
      body: JSON.stringify({
        questionIndex,
        selectedTokens,
      }),
    }),
  deleteSentenceBuilderDeck: (deckId: string) =>
    request<{ success?: boolean }>(`/arena/sentence-builders/${deckId}`, {
      method: "DELETE",
    }),
  fetchSentenceBuilderResults: (deckId: string, page = 1, limit = 30, search = "") =>
    request<ArenaSentenceBuilderResultsResponse>(
      `/arena/sentence-builders/${deckId}/results?page=${page}&limit=${limit}${
        search ? `&search=${encodeURIComponent(search)}` : ""
      }`,
    ),
  fetchSentenceBuilderShareLinks: (deckId: string) =>
    request<ArenaSentenceBuilderShareLink[]>(
      `/arena/sentence-builders/${deckId}/share-links`,
    ),
  createSentenceBuilderShareLink: (
    deckId: string,
    payload: {
      persistResults?: boolean;
      groupName?: string;
      showResults?: boolean;
      timeLimit?: number;
    },
  ) =>
    request<ArenaSentenceBuilderShareLink>(
      `/arena/sentence-builders/${deckId}/share-links`,
      {
        method: "POST",
        body: JSON.stringify({
          persistResults: payload.persistResults !== false,
          groupName: payload.groupName || "",
          showResults: payload.showResults !== false,
          timeLimit: Number(payload.timeLimit) || 0,
        }),
      },
    ),
  deleteSentenceBuilderShareLink: (deckId: string, shareLinkId: string) =>
    request<{ success?: boolean }>(
      `/arena/sentence-builders/${deckId}/share-links/${shareLinkId}`,
      {
        method: "DELETE",
      },
    ),
  submitSentenceBuilderAttempt: (
    deckId: string,
    payload: {
      answers?: Array<{ questionIndex: number; selectedTokens: string[] }>;
      guestName?: string | null;
      shareShortCode?: string | null;
    },
  ) =>
    request<ArenaSentenceBuilderSubmitResult>(
      `/arena/sentence-builders/${deckId}/submit`,
      {
        method: "POST",
        body: JSON.stringify({
          answers: payload.answers || [],
          guestName: payload.guestName || null,
          shareShortCode: payload.shareShortCode || null,
        }),
      },
    ),
};

export const meetsApi = {
  fetchMyMeets: () => request<MeetSummary[]>("/meets"),
  createMeet: (payload: {
    roomId: string;
    title: string;
    isPrivate: boolean;
  }) =>
    request<MeetSummary>("/meets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteMeet: (roomId: string) =>
    request<{ success: boolean }>(`/meets/${encodeURIComponent(roomId)}`, {
      method: "DELETE",
    }),
  updateMeetPrivacy: (roomId: string, isPrivate: boolean) =>
    request<MeetSummary>(`/meets/${encodeURIComponent(roomId)}/privacy`, {
      method: "PATCH",
      body: JSON.stringify({ isPrivate }),
    }),
};
