import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import type { FlashListRef } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";
import type { MessageListItem } from "../../../utils/chat";

type MessageMenuLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function useChatMessageOverlay({
  screenWidth,
  screenHeight,
  insets,
  keyboardVisibleRef,
  stickerPickerVisible,
  dismissKeyboard,
  listRef,
  messageItemsRef,
  hasNextPageRef,
  fetchNextPage,
}: {
  screenWidth: number;
  screenHeight: number;
  insets: { top: number; bottom: number };
  keyboardVisibleRef: MutableRefObject<boolean>;
  stickerPickerVisible: boolean;
  dismissKeyboard: () => void;
  listRef: RefObject<FlashListRef<MessageListItem> | null>;
  messageItemsRef: MutableRefObject<MessageListItem[]>;
  hasNextPageRef: MutableRefObject<boolean>;
  fetchNextPage: () => Promise<unknown>;
}) {
  const [messageMenuMounted, setMessageMenuMounted] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(
    null,
  );
  const [highlightPulseKey, setHighlightPulseKey] = useState(0);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessageLayout, setSelectedMessageLayout] =
    useState<MessageMenuLayout | null>(null);
  const [messageMenuOpen, setMessageMenuOpen] = useState(false);
  const messageHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const messageMenuOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const messageMenuAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      if (messageHighlightTimeoutRef.current) {
        clearTimeout(messageHighlightTimeoutRef.current);
        messageHighlightTimeoutRef.current = null;
      }

      if (messageMenuOpenTimeoutRef.current) {
        clearTimeout(messageMenuOpenTimeoutRef.current);
        messageMenuOpenTimeoutRef.current = null;
      }
    };
  }, []);

  const openMessageMenu = useCallback(
    (messageId: string, layout: MessageMenuLayout) => {
      void Haptics.selectionAsync();
      setSelectedMessageId(messageId);
      setSelectedMessageLayout(layout);
      setMessageMenuMounted(true);
      setMessageMenuOpen(true);
      messageMenuAnim.setValue(0);
      Animated.spring(messageMenuAnim, {
        toValue: 1,
        damping: 24,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    },
    [messageMenuAnim],
  );

  const handleMessageMenu = useCallback(
    (messageId: string, target: View | null) => {
      const measureAndOpen = () => {
        if (!target) {
          openMessageMenu(messageId, {
            x: 16,
            y: 120,
            width: screenWidth - 32,
            height: 54,
          });
          return;
        }

        target.measureInWindow((x, y, width, height) => {
          const maxWidth = screenWidth - 24;
          const clampedWidth = Math.min(width || maxWidth, maxWidth);
          const localY = y - insets.top;
          const availableHeight = screenHeight - insets.top - insets.bottom;

          openMessageMenu(messageId, {
            x: Math.max(12, Math.min(screenWidth - clampedWidth - 12, x)),
            y: Math.max(8, Math.min(availableHeight - height - 8, localY)),
            width: clampedWidth,
            height: Math.max(44, height),
          });
        });
      };

      if (messageMenuOpenTimeoutRef.current) {
        clearTimeout(messageMenuOpenTimeoutRef.current);
        messageMenuOpenTimeoutRef.current = null;
      }

      if (keyboardVisibleRef.current || stickerPickerVisible) {
        dismissKeyboard();
        messageMenuOpenTimeoutRef.current = setTimeout(
          () => {
            messageMenuOpenTimeoutRef.current = null;
            measureAndOpen();
          },
          Platform.OS === "ios" ? 180 : 120,
        );
        return;
      }

      measureAndOpen();
    },
    [
      dismissKeyboard,
      insets.bottom,
      insets.top,
      keyboardVisibleRef,
      openMessageMenu,
      screenHeight,
      screenWidth,
      stickerPickerVisible,
    ],
  );

  const closeMessageMenu = useCallback(() => {
    setMessageMenuOpen(false);
    if (messageMenuOpenTimeoutRef.current) {
      clearTimeout(messageMenuOpenTimeoutRef.current);
      messageMenuOpenTimeoutRef.current = null;
    }
    Animated.timing(messageMenuAnim, {
      toValue: 0,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }
      setMessageMenuMounted(false);
      setSelectedMessageId(null);
      setSelectedMessageLayout(null);
    });
  }, [messageMenuAnim]);

  const handleScrollToRepliedMessage = useCallback(
    async (targetMessageId: string) => {
      if (!targetMessageId) {
        return;
      }

      const findTargetIndex = () =>
        messageItemsRef.current.findIndex(
          (item) =>
            item.type === "message" && item.message.id === targetMessageId,
        );

      let targetIndex = findTargetIndex();
      let attempts = 0;

      while (targetIndex === -1 && hasNextPageRef.current && attempts < 8) {
        await fetchNextPage();
        attempts += 1;
        targetIndex = findTargetIndex();
      }

      if (targetIndex === -1) {
        return;
      }

      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          index: targetIndex,
          animated: true,
          viewPosition: 0.35,
        });
      });

      setHighlightedMessageId(targetMessageId);
      setHighlightPulseKey((current) => current + 1);
      if (messageHighlightTimeoutRef.current) {
        clearTimeout(messageHighlightTimeoutRef.current);
      }
      messageHighlightTimeoutRef.current = setTimeout(() => {
        setHighlightedMessageId((current) =>
          current === targetMessageId ? null : current,
        );
        messageHighlightTimeoutRef.current = null;
      }, 1800);
    },
    [fetchNextPage, hasNextPageRef, listRef, messageItemsRef],
  );

  return {
    messageMenuAnim,
    messageMenuMounted,
    highlightedMessageId,
    highlightPulseKey,
    selectedMessageId,
    selectedMessageLayout,
    closeMessageMenu,
    handleMessageMenu,
    handleScrollToRepliedMessage,
  };
}
