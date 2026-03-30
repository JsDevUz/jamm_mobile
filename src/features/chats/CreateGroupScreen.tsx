import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CreateGroupDialog } from "./GroupDialogs";
import { useI18n } from "../../i18n";
import { chatsApi } from "../../lib/api";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import type { ChatSummary } from "../../types/entities";
import {
  getDirectChatUserLabel,
  getEntityId,
  getOtherMember,
} from "../../utils/chat";

type Props = NativeStackScreenProps<RootStackParamList, "CreateGroup">;

export function CreateGroupScreen({ navigation }: Props) {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const currentUserId = getEntityId(user);
  const queryClient = useQueryClient();

  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: chatsApi.fetchChats,
    initialData: () => queryClient.getQueryData<ChatSummary[]>(["chats"]),
  });

  const knownUsers = useMemo(() => {
    const map = new Map<string, NonNullable<ChatSummary["members"]>[number]>();

    (chatsQuery.data || []).forEach((chat) => {
      chat.members?.forEach((member) => {
        const memberId = getEntityId(member);
        if (!memberId || memberId === currentUserId) {
          return;
        }
        map.set(memberId, member);
      });
    });

    return Array.from(map.values());
  }, [chatsQuery.data, currentUserId]);

  const getLocalizedChatTitle = (chat: ChatSummary) => {
    if (chat.isSavedMessages) {
      return t("chatsSidebar.savedMessages");
    }

    if (chat.isGroup) {
      return chat.name || t("chatsSidebar.groupFallback");
    }

    const otherMember = getOtherMember(chat, currentUserId, user);
    return (
      getDirectChatUserLabel(otherMember) ||
      chat.name ||
      t("chatsSidebar.chatFallback")
    );
  };

  const handleCreateGroup = async (draft: {
    name: string;
    description: string;
    avatarUri?: string | null;
    memberIds: string[];
  }) => {
    let avatar = draft.avatarUri || "";

    if (avatar && !avatar.startsWith("http")) {
      avatar = await chatsApi.uploadGroupAvatar(avatar);
    }

    const createdChat = await chatsApi.createChat({
      isGroup: true,
      name: draft.name,
      description: draft.description,
      avatar,
      memberIds: draft.memberIds,
    });

    await queryClient.invalidateQueries({ queryKey: ["chats"] });
    navigation.replace("ChatRoom", {
      chatId: getEntityId(createdChat),
      title: getLocalizedChatTitle(createdChat),
      isGroup: true,
    });
  };

  return (
    <CreateGroupDialog
      visible
      asScreen
      users={knownUsers}
      onClose={() => navigation.goBack()}
      onCreate={handleCreateGroup}
    />
  );
}
