import { useMemo } from "react";
import type { ChatSummary, User } from "../../../types/entities";
import { getEntityId } from "../../../utils/chat";

export function useChatStatusMeta({
  currentChat,
  currentUserId,
  isGroupChat,
  otherMember,
  drawerUser,
  onlineUserIds,
  typingUserIds,
}: {
  currentChat: ChatSummary | null;
  currentUserId: string;
  isGroupChat: boolean;
  otherMember: User | null;
  drawerUser: User | null;
  onlineUserIds: string[];
  typingUserIds: string[];
}) {
  const typingMembers = useMemo(
    () =>
      typingUserIds
        .map(
          (userId) =>
            currentChat?.members?.find(
              (member) => getEntityId(member) === userId,
            ) || null,
        )
        .filter(Boolean) as User[],
    [currentChat?.members, typingUserIds],
  );

  const typingSubtitle = useMemo(() => {
    if (!typingMembers.length) {
      return null;
    }

    const labels = typingMembers
      .map((member) => member.nickname || member.username || "User")
      .slice(0, 2);

    return `${labels.join(", ")} yozmoqda...`;
  }, [typingMembers]);

  const typingUserIdSet = useMemo(() => new Set(typingUserIds), [typingUserIds]);
  const onlineUserIdSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);

  const isUserCurrentlyOnline = (targetUser?: User | null) => {
    const targetUserId = getEntityId(targetUser);
    if (!targetUserId) {
      return false;
    }

    if (onlineUserIdSet.has(targetUserId) || typingUserIdSet.has(targetUserId)) {
      return true;
    }

    const lastSeenValue = targetUser?.lastSeen;
    if (!lastSeenValue) {
      return false;
    }

    const lastSeenDate = new Date(lastSeenValue);
    if (Number.isNaN(lastSeenDate.getTime())) {
      return false;
    }

    return Date.now() - lastSeenDate.getTime() <= 45_000;
  };

  const isOtherMemberOnline = isUserCurrentlyOnline(otherMember);
  const isDrawerUserOnline = isUserCurrentlyOnline(drawerUser);

  const groupOnlineCount = useMemo(() => {
    if (!currentChat?.isGroup) {
      return 0;
    }

    return (
      currentChat.members?.filter((member) => {
        const memberId = getEntityId(member);
        return (
          memberId &&
          memberId !== currentUserId &&
          isUserCurrentlyOnline(member)
        );
      }).length || 0
    );
  }, [currentChat?.isGroup, currentChat?.members, currentUserId, onlineUserIdSet, typingUserIdSet]);

  const headerStatusLabel = useMemo(() => {
    if (typingSubtitle) {
      return typingSubtitle;
    }

    if (isGroupChat) {
      const membersCount = currentChat?.members?.length || 0;
      return groupOnlineCount > 0
        ? `${membersCount} a'zo, ${groupOnlineCount} online`
        : `${membersCount} a'zo`;
    }

    if (currentChat?.isSavedMessages) {
      return "o'zim";
    }

    if (otherMember?.isOfficialProfile) {
      return otherMember.officialBadgeLabel || "Rasmiy";
    }

    return isOtherMemberOnline ? "Online" : "Offline";
  }, [
    currentChat?.isSavedMessages,
    currentChat?.members,
    groupOnlineCount,
    isGroupChat,
    isOtherMemberOnline,
    otherMember?.isOfficialProfile,
    otherMember?.officialBadgeLabel,
    typingSubtitle,
  ]);

  const showHeaderStatusDot = Boolean(
    !typingSubtitle &&
      !isGroupChat &&
      !currentChat?.isSavedMessages &&
      !otherMember?.isOfficialProfile,
  );

  const drawerStatusLabel = useMemo(() => {
    if (drawerUser?.isOfficialProfile) {
      return drawerUser.officialBadgeLabel || "Rasmiy";
    }

    if (drawerUser && isDrawerUserOnline) {
      return "Online";
    }

    if (drawerUser?.lastSeen) {
      const date = new Date(drawerUser.lastSeen);
      if (!Number.isNaN(date.getTime())) {
        return `Oxirgi marta: ${date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`;
      }

      return drawerUser.lastSeen;
    }

    if (drawerUser) {
      return "Offline";
    }

    if (currentChat?.isSavedMessages) {
      return "Faqat siz ko'radigan chat";
    }

    return `${currentChat?.members?.length || 0} a'zo`;
  }, [currentChat?.isSavedMessages, currentChat?.members?.length, drawerUser, isDrawerUserOnline]);

  const drawerProfileMeta = useMemo(() => {
    if (drawerUser && !currentChat?.isGroup) {
      return drawerUser.bio?.trim() || drawerStatusLabel;
    }

    return drawerStatusLabel;
  }, [currentChat?.isGroup, drawerStatusLabel, drawerUser]);

  const chatPushNotificationsEnabled =
    currentChat?.pushNotificationsEnabled !== false;
  const showChatPushNotificationsToggle = Boolean(
    currentChat &&
      !currentChat.isSavedMessages &&
      (!drawerUser || !currentChat.isGroup),
  );

  return {
    typingSubtitle,
    isOtherMemberOnline,
    isDrawerUserOnline,
    headerStatusLabel,
    showHeaderStatusDot,
    drawerStatusLabel,
    drawerProfileMeta,
    chatPushNotificationsEnabled,
    showChatPushNotificationsToggle,
  };
}
