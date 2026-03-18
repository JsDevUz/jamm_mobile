import type { ChatSummary, Message, User } from "../types/entities";

export type NormalizedMessage = {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  senderUser: User | null;
  createdAt: string;
  timeLabel: string;
  dateKey: string;
  isEdited: boolean;
  isDeleted: boolean;
  readBy: string[];
  deliveryStatus: string;
  replayTo: {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
    senderUser: User | null;
  } | null;
};

export type MessageListItem =
  | {
      id: string;
      type: "date";
      label: string;
    }
  | {
      id: string;
      type: "message";
      message: NormalizedMessage;
    };

const monthFormatter = new Intl.DateTimeFormat("uz-UZ", {
  month: "short",
  day: "numeric",
});

export const getEntityId = (value?: { _id?: string; id?: string } | null) =>
  value?._id || value?.id || "";

export const normalizeReadByIds = (readBy: Array<string | User> = []) =>
  readBy
    .map((entry) => {
      if (entry && typeof entry === "object") {
        return getEntityId(entry);
      }

      return entry ?? null;
    })
    .filter(Boolean)
    .map((entry) => String(entry));

export const getUserLabel = (user?: User | null) =>
  user?.nickname || user?.username || "User";

export const getDirectChatUserLabel = (user?: User | null) =>
  user?.username || user?.nickname || "User";

export const getInitials = (label: string) => {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "JM";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
};

export const getOtherMember = (chat: ChatSummary, currentUserId: string) =>
  chat.members?.find((member) => getEntityId(member) !== currentUserId) || null;

export const getChatTitle = (chat: ChatSummary, currentUserId: string) => {
  if (chat.isSavedMessages) {
    return "Saved Messages";
  }

  if (chat.isGroup) {
    return chat.name || "Group";
  }

  const otherMember = getOtherMember(chat, currentUserId);
  return getDirectChatUserLabel(otherMember) || chat.name || "Chat";
};

export const getChatAvatarUri = (chat: ChatSummary, currentUserId: string) => {
  if (chat.isGroup) {
    return chat.avatar && chat.avatar.length > 1 ? chat.avatar : null;
  }

  if (chat.avatar && chat.avatar.length > 1) {
    return chat.avatar;
  }

  return getOtherMember(chat, currentUserId)?.avatar || null;
};

export const getChatPreview = (chat: ChatSummary) => {
  if (chat.lastMessage?.trim()) {
    return chat.lastMessage.trim();
  }

  if (chat.isGroup) {
    return `${chat.members?.length || 0} a'zo`;
  }

  return "Suhbatni boshlang";
};

export const getChatSecondaryLabel = (chat: ChatSummary, currentUserId: string) => {
  if (chat.isSavedMessages) {
    return "o'zim";
  }

  if (chat.isGroup) {
    return `${chat.members?.length || 0} a'zo`;
  }

  const otherMember = getOtherMember(chat, currentUserId);
  if (otherMember?.username) {
    return `@${otherMember.username}`;
  }

  return "Offline";
};

export const formatChatTime = (chat: ChatSummary) => {
  if (chat.time?.trim()) {
    return chat.time.trim();
  }

  const source = chat.updatedAt || chat.createdAt;
  if (!source) {
    return "";
  }

  const date = new Date(source);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return monthFormatter.format(date);
};

export const normalizeMessage = (message: Message): NormalizedMessage => {
  const sender =
    message.senderId && typeof message.senderId === "object"
      ? message.senderId
      : null;
  const senderId =
    (typeof message.senderId === "string" ? message.senderId : getEntityId(sender)) ||
    "unknown";
  const createdAt = message.createdAt || message.timestamp || new Date().toISOString();
  const parsedDate = new Date(createdAt);
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const readBy = normalizeReadByIds(message.readBy || []);

  return {
    id: getEntityId(message) || `${safeDate.getTime()}`,
    content: String(message.content || "").trim(),
    senderId,
    senderName: getUserLabel(sender),
    senderUser: sender,
    createdAt: safeDate.toISOString(),
    timeLabel: safeDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    dateKey: safeDate.toISOString().slice(0, 10),
    isEdited: Boolean(message.isEdited),
    isDeleted: Boolean(message.isDeleted),
    readBy,
    deliveryStatus:
      message.deliveryStatus || (readBy.length > 0 ? "read" : "sent"),
    replayTo: message.replayTo
      ? {
          id: getEntityId(message.replayTo) || "",
          content: String(message.replayTo.content || "").trim(),
          senderId:
            typeof message.replayTo.senderId === "string"
              ? message.replayTo.senderId
              : getEntityId(message.replayTo.senderId as User | null),
          senderName:
            typeof message.replayTo.senderId === "object"
              ? getUserLabel(message.replayTo.senderId as User | null)
              : "User",
          senderUser:
            typeof message.replayTo.senderId === "object"
              ? (message.replayTo.senderId as User)
              : null,
        }
      : null,
  };
};

export const buildMessageItems = (messages: Message[]) => {
  const items: MessageListItem[] = [];
  let currentDateKey = "";

  messages.forEach((message) => {
    const normalized = normalizeMessage(message);

    if (normalized.dateKey !== currentDateKey) {
      currentDateKey = normalized.dateKey;
      items.push({
        id: `date-${currentDateKey}`,
        type: "date",
        label: formatDateDivider(currentDateKey),
      });
    }

    items.push({
      id: normalized.id,
      type: "message",
      message: normalized,
    });
  });

  return items;
};

export const formatDateDivider = (dateKey: string) => {
  const date = new Date(dateKey);
  if (Number.isNaN(date.getTime())) {
    return "Bugun";
  }

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (dateKey === todayKey) {
    return "Bugun";
  }

  if (dateKey === yesterdayKey) {
    return "Kecha";
  }

  return date.toLocaleDateString("uz-UZ", {
    month: "long",
    day: "numeric",
  });
};
