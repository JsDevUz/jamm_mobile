import { Alert } from "react-native";
import { useCallback } from "react";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { openJammAwareLink } from "../../../navigation/internalLinks";
import type { NormalizedMessage } from "../../../utils/chat";

type SelectedMessageItem =
  | {
      type: "message";
      message: NormalizedMessage;
    }
  | null;

export function useChatMessageActions({
  selectedMessage,
  groupLinkUrl,
  closeMessageMenu,
  enterReplyMode,
  enterEditMode,
  onDeleteMessage,
}: {
  selectedMessage: SelectedMessageItem;
  groupLinkUrl: string;
  closeMessageMenu: () => void;
  enterReplyMode: (messageId: string) => Promise<void>;
  enterEditMode: (messageId: string, content: string) => void;
  onDeleteMessage: (messageId: string) => void;
}) {
  const handleReply = useCallback(() => {
    if (!selectedMessage || selectedMessage.type !== "message") {
      return;
    }

    closeMessageMenu();
    void enterReplyMode(selectedMessage.message.id);
  }, [closeMessageMenu, enterReplyMode, selectedMessage]);

  const handleSwipeReply = useCallback(
    (message: NormalizedMessage) => {
      if (message.isDeleted) {
        return;
      }

      void enterReplyMode(message.id);
    },
    [enterReplyMode],
  );

  const handleEditMessage = useCallback(() => {
    if (!selectedMessage || selectedMessage.type !== "message") {
      return;
    }

    closeMessageMenu();
    enterEditMode(selectedMessage.message.id, selectedMessage.message.content);
  }, [closeMessageMenu, enterEditMode, selectedMessage]);

  const handleCopyMessage = useCallback(async () => {
    if (
      !selectedMessage ||
      selectedMessage.type !== "message" ||
      !selectedMessage.message.content
    ) {
      return;
    }

    await Clipboard.setStringAsync(selectedMessage.message.content);
    void Haptics.selectionAsync();
    closeMessageMenu();
  }, [closeMessageMenu, selectedMessage]);

  const handleCopyGroupLink = useCallback(async () => {
    if (!groupLinkUrl) {
      return;
    }

    await Clipboard.setStringAsync(groupLinkUrl);
    void Haptics.selectionAsync();
  }, [groupLinkUrl]);

  const handleDeleteMessage = useCallback(() => {
    if (!selectedMessage || selectedMessage.type !== "message") {
      return;
    }

    const targetId = selectedMessage.message.id;
    closeMessageMenu();
    Alert.alert(
      "Xabarni o'chirish",
      "Haqiqatan ham xabarni o'chirmoqchimisiz?",
      [
        { text: "Bekor qilish", style: "cancel" },
        {
          text: "O'chirish",
          style: "destructive",
          onPress: () => {
            onDeleteMessage(targetId);
          },
        },
      ],
    );
  }, [closeMessageMenu, onDeleteMessage, selectedMessage]);

  const handleOpenMessageLink = useCallback((url: string) => {
    void openJammAwareLink(url).catch(() => {
      Alert.alert("Link ochilmadi", url);
    });
  }, []);

  return {
    handleReply,
    handleSwipeReply,
    handleEditMessage,
    handleCopyMessage,
    handleCopyGroupLink,
    handleDeleteMessage,
    handleOpenMessageLink,
  };
}
