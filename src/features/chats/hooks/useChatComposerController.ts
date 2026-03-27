import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
  TextInput as NativeTextInput,
} from "react-native";
import * as Haptics from "expo-haptics";
import type { Message, User } from "../../../types/entities";
import type { NormalizedMessage } from "../../../utils/chat";
import { useToastStore } from "../../../store/toast-store";

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
  composerDockVisible,
  stickerSheetVisible,
  composerInputRef,
  composerSelectionRef,
  composerFocusedRef,
  keyboardVisibleRef,
  setReplyingToId,
  setEditingMessageId,
  enableComposerSoftInput,
  showComposerDock,
  showComposerDockImmediately,
  hideComposerDock,
  hideStickerSheet,
  toggleStickerSheet,
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
  composerDockVisible: boolean;
  stickerSheetVisible: boolean;
  composerInputRef: RefObject<NativeTextInput | null>;
  composerSelectionRef: MutableRefObject<{ start: number; end: number }>;
  composerFocusedRef: MutableRefObject<boolean>;
  keyboardVisibleRef: MutableRefObject<boolean>;
  setReplyingToId: (value: string | null) => void;
  setEditingMessageId: (value: string | null) => void;
  enableComposerSoftInput: () => void;
  showComposerDock: (onComplete?: () => void) => void;
  showComposerDockImmediately: () => void;
  hideComposerDock: () => void;
  hideStickerSheet: (options?: {
    enableSoftInput?: boolean;
    focusComposer?: boolean;
  }) => void;
  toggleStickerSheet: () => void;
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
  const showToast = useToastStore((state) => state.showToast);
  const pendingStickerHandoffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (pendingStickerHandoffTimeoutRef.current) {
        clearTimeout(pendingStickerHandoffTimeoutRef.current);
        pendingStickerHandoffTimeoutRef.current = null;
      }
    };
  }, []);

  const focusComposerInput = useCallback(() => {
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  }, [composerInputRef]);

  const showSystemToast = useCallback(
    (message: string) => {
      showToast(message);
    },
    [showToast],
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
    showSystemToast("Rasm yuborish tez orada qo'shiladi.");
  }, [showSystemToast]);

  const handleVoiceMessagePress = useCallback(async () => {
    await Haptics.selectionAsync();
    showComposerDockImmediately();
  }, [showComposerDockImmediately]);

  const handleStickerTogglePress = useCallback(async () => {
    await Haptics.selectionAsync();

    if (pendingStickerHandoffTimeoutRef.current) {
      clearTimeout(pendingStickerHandoffTimeoutRef.current);
      pendingStickerHandoffTimeoutRef.current = null;
    }

    if (stickerSheetVisible) {
      hideStickerSheet({
        enableSoftInput: true,
        focusComposer: true,
      });
      return;
    }

    if (!keyboardVisibleRef.current) {
      if (!composerDockVisible) {
        showComposerDock();
        return;
      }

      toggleStickerSheet();
      return;
    }

    toggleStickerSheet();
  }, [
    composerDockVisible,
    hideStickerSheet,
    keyboardVisibleRef,
    showComposerDock,
    toggleStickerSheet,
    stickerSheetVisible,
  ]);

  const handleStickerSelect = useCallback(
    (selection: { emoji?: string }) => {
      const nextEmoji = selection?.emoji;
      if (!nextEmoji) {
        return;
      }

      setDraft((previous) => `${previous}${nextEmoji}`);
    },
    [],
  );

  const handleDeleteLastSticker = useCallback(() => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
        const segmenter = new Intl.Segmenter(undefined, {
          granularity: "grapheme",
        });
        const segments = Array.from(segmenter.segment(previous), (item) => item.segment);
        return segments.slice(0, -1).join("");
      }

      return Array.from(previous).slice(0, -1).join("");
    });
  }, []);

  const enterReplyMode = useCallback(
    async (messageId: string) => {
      await Haptics.selectionAsync();
      setEditingMessageId(null);
      setReplyingToId(messageId);
      hideStickerSheet();
      enableComposerSoftInput();
      focusComposerInput();
    },
    [
      hideStickerSheet,
      enableComposerSoftInput,
      focusComposerInput,
      setEditingMessageId,
      setReplyingToId,
    ],
  );

  const enterEditMode = useCallback(
    (messageId: string, content: string) => {
      setReplyingToId(null);
      setEditingMessageId(messageId);
      setDraft(content);
      hideStickerSheet();
      enableComposerSoftInput();
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
      hideStickerSheet,
      enableComposerSoftInput,
      composerInputRef,
      composerSelectionRef,
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
    if (stickerSheetVisible) {
      hideStickerSheet({
        enableSoftInput: true,
        focusComposer: true,
      });
      return;
    }

    showComposerDock();

    if (!composerSoftInputEnabled) {
      enableComposerSoftInput();
      requestAnimationFrame(() => {
        composerInputRef.current?.focus();
      });
    }
  }, [
    composerSoftInputEnabled,
    composerInputRef,
    enableComposerSoftInput,
    hideStickerSheet,
    showComposerDock,
    stickerSheetVisible,
  ]);

  const handleComposerFocus = useCallback(() => {
    if (!composerSoftInputEnabled) {
      composerInputRef.current?.blur();
      return;
    }

    composerFocusedRef.current = true;
  }, [composerFocusedRef, composerInputRef, composerSoftInputEnabled]);

  const handleComposerBlur = useCallback(() => {
    composerFocusedRef.current = false;
    if (pendingStickerHandoffTimeoutRef.current) {
      clearTimeout(pendingStickerHandoffTimeoutRef.current);
      pendingStickerHandoffTimeoutRef.current = null;
    }
  }, [composerFocusedRef]);

  const clearComposerMode = useCallback(() => {
    setReplyingToId(null);
    setEditingMessageId(null);
    setDraft("");
    composerSelectionRef.current = { start: 0, end: 0 };
  }, [composerSelectionRef, setEditingMessageId, setReplyingToId]);

  const composerContentMessage = editingMessage || replyingMessage || null;
  const hasComposerText = Boolean(draft.trim());
  const isComposerInputEditable =
    !isComposerDisabled && composerSoftInputEnabled && !stickerSheetVisible;

  return {
    draft,
    setDraft,
    composerNotice: null,
    composerContentMessage,
    hasComposerText,
    isComposerInputEditable,
    handleSendContent,
    handleSend,
    handleAttachmentPress,
    handleVoiceMessagePress,
    handleStickerTogglePress,
    handleStickerSelect,
    handleDeleteLastSticker,
    handleComposerSelectionChange,
    handleComposerPressIn,
    handleComposerFocus,
    handleComposerBlur,
    clearComposerMode,
    enterReplyMode,
    enterEditMode,
  };
}
