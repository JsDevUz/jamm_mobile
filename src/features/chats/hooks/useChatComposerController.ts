import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
  Keyboard,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
  TextInput as NativeTextInput,
} from "react-native";
import * as Haptics from "expo-haptics";
import type { Message, User } from "../../../types/entities";
import type { NormalizedMessage } from "../../../utils/chat";

const createOptimisticMessage = ({
  content,
  replyToMessage,
  currentUser,
}: {
  content: string;
  replyToMessage: Message | null;
  currentUser: User | null | undefined;
}): Message => {
  const createdAt = new Date().toISOString();
  const userId = currentUser?._id || currentUser?.id || "";

  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    senderId: {
      ...currentUser,
      id: userId,
      _id: userId,
    },
    content,
    createdAt,
    updatedAt: createdAt,
    timestamp: createdAt,
    isEdited: false,
    isDeleted: false,
    readBy: [],
    replayTo: replyToMessage,
    deliveryStatus: "pending",
    isLocalOnly: true,
  };
};

export function useChatComposerController({
  user,
  replyingToId,
  replyingMessage,
  editingMessageId,
  editingMessage,
  isSending,
  isComposerDisabled,
  composerSoftInputEnabled,
  stickerPickerVisible,
  composerInputRef,
  composerSelectionRef,
  composerFocusedRef,
  keyboardVisibleRef,
  openingStickerPickerRef,
  shouldStickToBottomRef,
  animateAccessoryHeight,
  hideStickerPicker,
  setReplyingToId,
  setEditingMessageId,
  setComposerSoftInputEnabled,
  onSendMessage,
  onEditMessage,
  onScrollToLatestMessage,
}: {
  user: User | null | undefined;
  replyingToId: string | null;
  replyingMessage: NormalizedMessage | null;
  editingMessageId: string | null;
  editingMessage: NormalizedMessage | null;
  isSending: boolean;
  isComposerDisabled: boolean;
  composerSoftInputEnabled: boolean;
  stickerPickerVisible: boolean;
  composerInputRef: RefObject<NativeTextInput | null>;
  composerSelectionRef: MutableRefObject<{ start: number; end: number }>;
  composerFocusedRef: MutableRefObject<boolean>;
  keyboardVisibleRef: MutableRefObject<boolean>;
  openingStickerPickerRef: MutableRefObject<boolean>;
  shouldStickToBottomRef: MutableRefObject<boolean>;
  animateAccessoryHeight: (
    toValue: number,
    duration?: number,
    onComplete?: () => void,
  ) => void;
  hideStickerPicker: (focusInput?: boolean) => void;
  setReplyingToId: (value: string | null) => void;
  setEditingMessageId: (value: string | null) => void;
  setComposerSoftInputEnabled: (value: boolean) => void;
  onSendMessage: (args: {
    content: string;
    replayToId?: string | null;
    optimisticMessage: Message;
  }) => void;
  onEditMessage: (args: {
    messageId: string;
    content: string;
    onSuccess?: () => void;
  }) => void;
  onScrollToLatestMessage: (animated?: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const composerNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (composerNoticeTimeoutRef.current) {
        clearTimeout(composerNoticeTimeoutRef.current);
        composerNoticeTimeoutRef.current = null;
      }
    };
  }, []);

  const focusComposerInput = useCallback(() => {
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  }, [composerInputRef]);

  const showComposerNotice = useCallback(
    (message: string) => {
      setComposerNotice(message);
      if (composerNoticeTimeoutRef.current) {
        clearTimeout(composerNoticeTimeoutRef.current);
      }
      composerNoticeTimeoutRef.current = setTimeout(() => {
        setComposerNotice(null);
        composerNoticeTimeoutRef.current = null;
      }, 1800);

      if (composerFocusedRef.current || keyboardVisibleRef.current) {
        focusComposerInput();
      }
    },
    [composerFocusedRef, focusComposerInput, keyboardVisibleRef],
  );

  const handleSendContent = useCallback(
    async (content: string) => {
      const trimmedContent = content.trim();
      if (!trimmedContent || isSending || isComposerDisabled) {
        return;
      }

      await Haptics.selectionAsync();

      if (editingMessageId) {
        onEditMessage({
          messageId: editingMessageId,
          content: trimmedContent,
          onSuccess: () => {
            setDraft("");
            composerSelectionRef.current = { start: 0, end: 0 };
            setEditingMessageId(null);
          },
        });
        return;
      }

      const replyToMessage = replyingMessage
        ? {
            id: replyingMessage.id,
            senderId: replyingMessage.senderUser || replyingMessage.senderId,
            content: replyingMessage.content,
          }
        : null;
      const optimisticMessage = createOptimisticMessage({
        content: trimmedContent,
        replyToMessage,
        currentUser: user,
      });

      setDraft("");
      composerSelectionRef.current = { start: 0, end: 0 };
      setReplyingToId(null);
      onSendMessage({
        content: trimmedContent,
        replayToId: replyingToId,
        optimisticMessage,
      });
      onScrollToLatestMessage(true);
    },
    [
      composerSelectionRef,
      editingMessageId,
      isComposerDisabled,
      isSending,
      onEditMessage,
      onScrollToLatestMessage,
      onSendMessage,
      replyingMessage,
      replyingToId,
      setEditingMessageId,
      setReplyingToId,
      user,
    ],
  );

  const handleSend = useCallback(async () => {
    await handleSendContent(draft);
  }, [draft, handleSendContent]);

  const handleAttachmentPress = useCallback(async () => {
    await Haptics.selectionAsync();
    showComposerNotice("Rasm yuborish tez orada qo'shiladi.");
  }, [showComposerNotice]);

  const handleVoiceMessagePress = useCallback(async () => {
    await Haptics.selectionAsync();
    showComposerNotice("Ovozli xabar tez orada qo'shiladi.");
  }, [showComposerNotice]);

  const handleStickerPress = useCallback(
    async (sticker: string) => {
      await Haptics.selectionAsync();
      let nextCaret = 0;
      setDraft((current) => {
        const source = current || "";
        const start = Math.max(
          0,
          Math.min(composerSelectionRef.current.start, source.length),
        );
        const end = Math.max(
          start,
          Math.min(composerSelectionRef.current.end, source.length),
        );
        const nextValue = `${source.slice(0, start)}${sticker}${source.slice(end)}`;
        nextCaret = start + sticker.length;
        return nextValue;
      });
      composerSelectionRef.current = { start: nextCaret, end: nextCaret };
      shouldStickToBottomRef.current = true;
      requestAnimationFrame(() => {
        composerInputRef.current?.setNativeProps({
          selection: { start: nextCaret, end: nextCaret },
        });
      });
    },
    [composerInputRef, composerSelectionRef, shouldStickToBottomRef],
  );

  const enterReplyMode = useCallback(
    async (messageId: string) => {
      await Haptics.selectionAsync();
      setEditingMessageId(null);
      setReplyingToId(messageId);
      setComposerSoftInputEnabled(true);
      focusComposerInput();
    },
    [
      focusComposerInput,
      setComposerSoftInputEnabled,
      setEditingMessageId,
      setReplyingToId,
    ],
  );

  const enterEditMode = useCallback(
    (messageId: string, content: string) => {
      setReplyingToId(null);
      setEditingMessageId(messageId);
      setDraft(content);
      setComposerSoftInputEnabled(true);
      const nextSelection = { start: content.length, end: content.length };
      composerSelectionRef.current = nextSelection;
      requestAnimationFrame(() => {
        composerInputRef.current?.focus();
        composerInputRef.current?.setNativeProps({
          selection: nextSelection,
        });
      });
    },
    [
      composerInputRef,
      composerSelectionRef,
      setComposerSoftInputEnabled,
      setEditingMessageId,
      setReplyingToId,
    ],
  );

  const handleComposerSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      composerSelectionRef.current = event.nativeEvent.selection;
    },
    [composerSelectionRef],
  );

  const handleComposerPressIn = useCallback(() => {
    if (stickerPickerVisible) {
      hideStickerPicker(true);
    }
  }, [hideStickerPicker, stickerPickerVisible]);

  const handleComposerFocus = useCallback(() => {
    if (!composerSoftInputEnabled && !stickerPickerVisible) {
      composerInputRef.current?.blur();
      return;
    }

    composerFocusedRef.current = true;
  }, [
    composerFocusedRef,
    composerInputRef,
    composerSoftInputEnabled,
    stickerPickerVisible,
  ]);

  const handleComposerBlur = useCallback(() => {
    composerFocusedRef.current = false;
    if (openingStickerPickerRef.current) {
      openingStickerPickerRef.current = false;
      return;
    }
    if (!stickerPickerVisible && !keyboardVisibleRef.current) {
      animateAccessoryHeight(0, 160);
    }
  }, [
    animateAccessoryHeight,
    composerFocusedRef,
    keyboardVisibleRef,
    openingStickerPickerRef,
    stickerPickerVisible,
  ]);

  const clearComposerMode = useCallback(() => {
    setReplyingToId(null);
    setEditingMessageId(null);
    setDraft("");
    composerSelectionRef.current = { start: 0, end: 0 };
  }, [composerSelectionRef, setEditingMessageId, setReplyingToId]);

  const composerContentMessage = editingMessage || replyingMessage || null;
  const hasComposerText = Boolean(draft.trim());
  const isComposerInputEditable =
    !isComposerDisabled && composerSoftInputEnabled;
  const isStickerPanelActive = stickerPickerVisible;

  return {
    draft,
    setDraft,
    composerNotice,
    composerContentMessage,
    hasComposerText,
    isComposerInputEditable,
    isStickerPanelActive,
    handleSendContent,
    handleSend,
    handleAttachmentPress,
    handleVoiceMessagePress,
    handleStickerPress,
    handleComposerSelectionChange,
    handleComposerPressIn,
    handleComposerFocus,
    handleComposerBlur,
    clearComposerMode,
    enterReplyMode,
    enterEditMode,
  };
}
