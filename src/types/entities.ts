export type EntityId = string;

export type User = {
  _id?: string;
  id?: string;
  jammId?: string | number;
  nickname?: string;
  username?: string;
  email?: string;
  phone?: string | null;
  avatar?: string | null;
  bio?: string | null;
  lastSeen?: string | null;
  createdAt?: string | null;
  premiumStatus?: string | null;
  selectedProfileDecorationId?: string | null;
  customProfileDecorationImage?: string | null;
  isOfficialProfile?: boolean;
  officialBadgeLabel?: string | null;
  officialBadgeKey?: string | null;
  disableGroupInvites?: boolean;
  appLockEnabled?: boolean;
  appLockSessionUnlocked?: boolean;
  followersCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
};

export type AuthResponse = {
  user: User;
  message?: string;
  access_token?: string;
};

export type ChatMember = User;

export type ProfileDecoration = {
  _id?: string;
  key: string;
  label: string;
  emoji: string;
  animation: "pulse" | "float" | "wiggle" | "spin" | "sparkle";
  premiumOnly?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export type ChatAdmin = {
  userId?: string;
  id?: string;
  _id?: string;
  permissions?: string[];
};

export type ChatSummary = {
  _id?: string;
  id?: string;
  jammId?: string;
  urlSlug?: string;
  privateurl?: string;
  type?: "group" | "user";
  name?: string;
  avatar?: string | null;
  description?: string | null;
  isGroup?: boolean;
  isSavedMessages?: boolean;
  hasMessages?: boolean;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unread?: number;
  unreadCount?: number;
  time?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  admins?: ChatAdmin[];
  members?: ChatMember[];
};

export type GroupLinkPreview = {
  id: string;
  privateurl?: string;
  name?: string;
  avatar?: string | null;
  description?: string | null;
  memberCount?: number;
  isGroup?: boolean;
};

export type Message = {
  _id?: string;
  id?: string;
  senderId?: string | User | null;
  content?: string | null;
  isEdited?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
  timestamp?: string;
  readBy?: Array<string | User>;
  deliveryStatus?: "pending" | "sent" | "read" | "failed" | "cancelled" | string;
  isLocalOnly?: boolean;
  replayTo?: Message | null;
};

export type PaginatedMessages = {
  data?: Message[];
  nextCursor?: string | null;
  hasMore?: boolean;
};

export type MeetSummary = {
  _id?: string;
  roomId: string;
  title: string;
  creator?: string;
  isPrivate?: boolean;
  createdAt?: string;
};
