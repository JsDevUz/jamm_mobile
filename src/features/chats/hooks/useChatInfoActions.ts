import { Alert } from "react-native";
import { useCallback, type MutableRefObject } from "react";
import * as Haptics from "expo-haptics";
import type { QueryClient } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { chatsApi } from "../../../lib/api";
import type { RootStackParamList } from "../../../navigation/types";
import type { ChatSummary, User } from "../../../types/entities";
import { getChatTitle, getEntityId } from "../../../utils/chat";

export function useChatInfoActions({
  currentChat,
  otherMember,
  currentUserId,
  user,
  navigation,
  queryClient,
  dismissKeyboard,
  pendingMenuInfoRef,
  setMenuOpen,
  setAvatarPreviewOpen,
  setInfoDrawerUserId,
  setInfoDrawerOpen,
}: {
  currentChat: ChatSummary | null;
  otherMember: User | null;
  currentUserId: string;
  user: User | null | undefined;
  navigation: NativeStackNavigationProp<RootStackParamList, "ChatRoom">;
  queryClient: QueryClient;
  dismissKeyboard: () => void;
  pendingMenuInfoRef: MutableRefObject<{
    queued: boolean;
    targetUser?: User | null;
  }>;
  setMenuOpen: (value: boolean) => void;
  setAvatarPreviewOpen: (value: boolean) => void;
  setInfoDrawerUserId: (value: string | null) => void;
  setInfoDrawerOpen: (value: boolean) => void;
}) {
  const openInfoPage = useCallback(
    (targetUser?: User | null) => {
      if (!currentChat) {
        return;
      }

      dismissKeyboard();
      setAvatarPreviewOpen(false);
      setInfoDrawerUserId(
        targetUser
          ? getEntityId(targetUser)
          : currentChat.isGroup
            ? null
            : getEntityId(otherMember),
      );
      setInfoDrawerOpen(true);
    },
    [
      currentChat,
      dismissKeyboard,
      otherMember,
      setAvatarPreviewOpen,
      setInfoDrawerOpen,
      setInfoDrawerUserId,
    ],
  );

  const handleOpenInfo = useCallback(
    (targetUser?: User | null) => {
      setMenuOpen(false);
      openInfoPage(targetUser);
    },
    [openInfoPage, setMenuOpen],
  );

  const handleOpenInfoFromMenu = useCallback(
    (targetUser?: User | null) => {
      dismissKeyboard();
      pendingMenuInfoRef.current = {
        queued: true,
        targetUser,
      };
      setMenuOpen(false);
    },
    [dismissKeyboard, pendingMenuInfoRef, setMenuOpen],
  );

  const handleCloseInfoDrawer = useCallback(() => {
    dismissKeyboard();
    setAvatarPreviewOpen(false);
    setInfoDrawerOpen(false);
  }, [dismissKeyboard, setAvatarPreviewOpen, setInfoDrawerOpen]);

  const handleOpenMemberInfo = useCallback(
    (member: User) => {
      dismissKeyboard();
      setInfoDrawerUserId(getEntityId(member));
    },
    [dismissKeyboard, setInfoDrawerUserId],
  );

  const handleOpenPrivateChatWithMember = useCallback(
    async (member: User) => {
      const memberId = getEntityId(member);
      if (!memberId) {
        return;
      }

      if (memberId === currentUserId) {
        handleOpenMemberInfo(member);
        return;
      }

      try {
        await Haptics.selectionAsync();
        const privateChat = await chatsApi.createChat({
          isGroup: false,
          memberIds: [memberId],
        });

        queryClient.setQueryData<ChatSummary[]>(["chats"], (current) => {
          const currentList = Array.isArray(current) ? current : [];
          const nextChatId = getEntityId(privateChat);
          if (!nextChatId) {
            return currentList;
          }

          const existingIndex = currentList.findIndex(
            (chat) => getEntityId(chat) === nextChatId,
          );
          if (existingIndex === -1) {
            return [privateChat, ...currentList];
          }

          const nextChats = [...currentList];
          nextChats.splice(existingIndex, 1);
          nextChats.unshift({
            ...currentList[existingIndex],
            ...privateChat,
          });
          return nextChats;
        });
        await queryClient.invalidateQueries({ queryKey: ["chats"] });

        dismissKeyboard();
        setAvatarPreviewOpen(false);
        setInfoDrawerOpen(false);
        setInfoDrawerUserId(null);

        navigation.push("ChatRoom", {
          chatId: getEntityId(privateChat),
          title: getChatTitle(privateChat, currentUserId, user),
          isGroup: false,
        });
      } catch (error) {
        Alert.alert(
          "Private chat ochilmadi",
          error instanceof Error
            ? error.message
            : "Noma'lum xatolik yuz berdi.",
        );
      }
    },
    [
      currentUserId,
      dismissKeyboard,
      handleOpenMemberInfo,
      navigation,
      queryClient,
      setAvatarPreviewOpen,
      setInfoDrawerOpen,
      setInfoDrawerUserId,
      user,
    ],
  );

  const handleBackToGroupInfo = useCallback(() => {
    dismissKeyboard();
    setInfoDrawerUserId(null);
  }, [dismissKeyboard, setInfoDrawerUserId]);

  return {
    openInfoPage,
    handleOpenInfo,
    handleOpenInfoFromMenu,
    handleCloseInfoDrawer,
    handleOpenMemberInfo,
    handleOpenPrivateChatWithMember,
    handleBackToGroupInfo,
  };
}
