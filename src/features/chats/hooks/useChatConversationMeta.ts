import { useMemo } from "react";
import { APP_BASE_URL } from "../../../config/env";
import type { ChatSummary, User } from "../../../types/entities";
import {
  getChatAvatarUri,
  getChatTitle,
  getEntityId,
  getOtherMember,
} from "../../../utils/chat";

export function useChatConversationMeta({
  chats,
  currentChat,
  currentUserId,
  user,
  isGroupChat,
  infoDrawerUserId,
  fallbackTitle,
}: {
  chats: ChatSummary[] | undefined;
  currentChat: ChatSummary | null;
  currentUserId: string;
  user: User | null | undefined;
  isGroupChat: boolean;
  infoDrawerUserId: string | null;
  fallbackTitle: string;
}) {
  const chatTitle = useMemo(
    () =>
      currentChat
        ? getChatTitle(currentChat, currentUserId, user)
        : fallbackTitle,
    [currentChat, currentUserId, fallbackTitle, user],
  );

  const chatAvatarUri = useMemo(
    () =>
      currentChat ? getChatAvatarUri(currentChat, currentUserId, user) : null,
    [currentChat, currentUserId, user],
  );

  const otherMember = useMemo(
    () => (currentChat ? getOtherMember(currentChat, currentUserId, user) : null),
    [currentChat, currentUserId, user],
  );

  const knownUsers = useMemo(() => {
    const map = new Map<string, User>();

    (chats || []).forEach((chat) => {
      chat.members?.forEach((member) => {
        const memberId = getEntityId(member);
        if (memberId) {
          map.set(memberId, member);
        }
      });
    });

    return Array.from(map.values());
  }, [chats]);

  const currentChatMemberIds = useMemo(
    () =>
      Array.from(
        new Set(
          (currentChat?.members || [])
            .map((member) => getEntityId(member))
            .filter((memberId) => memberId && memberId !== currentUserId),
        ),
      ),
    [currentChat?.members, currentUserId],
  );

  const myAdminRecord = currentChat?.admins?.find(
    (admin) => (admin.userId || admin.id || admin._id) === currentUserId,
  );

  const canEditGroup = Boolean(
    isGroupChat &&
      (String(currentChat?.createdBy || "") === currentUserId ||
        myAdminRecord?.permissions?.length),
  );

  const canDeleteOthersMessages = Boolean(
    String(currentChat?.createdBy || "") === currentUserId ||
      myAdminRecord?.permissions?.includes("delete_others_messages"),
  );

  const isGroupOwnerLeaving = Boolean(
    isGroupChat && String(currentChat?.createdBy || "") !== currentUserId,
  );

  const groupLinkSlug = String(
    currentChat?.privateurl || currentChat?.urlSlug || "",
  ).trim();
  const groupLinkUrl = groupLinkSlug
    ? `${APP_BASE_URL}/${groupLinkSlug.replace(/^\/+/, "")}`
    : "";

  const infoDrawerUser = useMemo(() => {
    if (!infoDrawerUserId) {
      return null;
    }

    const currentChatUser = currentChat?.members?.find(
      (member) => getEntityId(member) === infoDrawerUserId,
    );
    if (currentChatUser) {
      return currentChatUser;
    }

    return knownUsers.find((member) => getEntityId(member) === infoDrawerUserId) || null;
  }, [currentChat?.members, infoDrawerUserId, knownUsers]);

  const isViewingGroupMemberInfo = Boolean(
    currentChat?.isGroup && infoDrawerUser,
  );

  const drawerUser = isGroupChat ? infoDrawerUser : otherMember;
  const drawerAvatarUri = drawerUser?.avatar || chatAvatarUri || null;
  const drawerTitle = drawerUser
    ? "Foydalanuvchi ma'lumotlari"
    : currentChat?.isSavedMessages
      ? "Saved Messages"
      : "Guruh ma'lumotlari";

  return {
    chatTitle,
    chatAvatarUri,
    otherMember,
    knownUsers,
    currentChatMemberIds,
    canEditGroup,
    canDeleteOthersMessages,
    isGroupOwnerLeaving,
    groupLinkUrl,
    infoDrawerUser,
    isViewingGroupMemberInfo,
    drawerUser,
    drawerAvatarUri,
    drawerTitle,
  };
}
