import { Alert } from "react-native";
import { useCallback } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { chatsApi } from "../../../lib/api";
import type { RootStackParamList } from "../../../navigation/types";
import type { ChatSummary } from "../../../types/entities";
import { getEntityId } from "../../../utils/chat";

export function useChatGroupActions({
  currentChat,
  isGroupOwnerLeaving,
  queryClient,
  navigation,
  setEditGroupOpen,
}: {
  currentChat: ChatSummary | null;
  isGroupOwnerLeaving: boolean;
  queryClient: QueryClient;
  navigation: NativeStackNavigationProp<RootStackParamList, "ChatRoom">;
  setEditGroupOpen: (value: boolean) => void;
}) {
  const handleDeleteOrLeave = useCallback(() => {
    if (!currentChat) {
      return;
    }

    const title = isGroupOwnerLeaving
      ? "Guruhdan chiqish"
      : "Suhbatni o'chirish";
    const message = isGroupOwnerLeaving
      ? "Haqiqatan ham guruhdan chiqmoqchimisiz?"
      : "Haqiqatan ham suhbatni o'chirmoqchimisiz?";

    Alert.alert(title, message, [
      { text: "Bekor qilish", style: "cancel" },
      {
        text: isGroupOwnerLeaving ? "Chiqish" : "O'chirish",
        style: "destructive",
        onPress: async () => {
          const chatId = getEntityId(currentChat);
          if (isGroupOwnerLeaving) {
            await chatsApi.leaveChat(chatId);
          } else {
            await chatsApi.deleteChat(chatId);
          }
          await queryClient.invalidateQueries({ queryKey: ["chats"] });
          navigation.goBack();
        },
      },
    ]);
  }, [currentChat, isGroupOwnerLeaving, navigation, queryClient]);

  const handleEditGroup = useCallback(
    async (draftData: {
      name: string;
      description: string;
      avatarUri?: string | null;
      memberIds: string[];
      admins?: any[];
    }) => {
      if (!currentChat) {
        return;
      }

      let nextAvatar = draftData.avatarUri || currentChat.avatar || "";
      if (nextAvatar && !nextAvatar.startsWith("http")) {
        nextAvatar = await chatsApi.updateGroupAvatar(
          getEntityId(currentChat),
          nextAvatar,
        );
      }

      await chatsApi.editChat(getEntityId(currentChat), {
        name: draftData.name,
        description: draftData.description,
        avatar: nextAvatar,
        members: draftData.memberIds,
        admins: draftData.admins,
      });

      await queryClient.invalidateQueries({ queryKey: ["chats"] });
      setEditGroupOpen(false);
    },
    [currentChat, queryClient, setEditGroupOpen],
  );

  return {
    handleDeleteOrLeave,
    handleEditGroup,
  };
}
