import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Platform,
  StyleSheet,
  TextInput as NativeTextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  useQueryClient,
} from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FlashList } from "@shopify/flash-list";
import type { FlashListRef, ViewToken } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { FullWindowOverlay } from "react-native-screens";
import * as Haptics from "expo-haptics";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  loadCachedChats,
  loadCachedMessages,
  loadChatScrollPosition,
  saveCachedChats,
  saveCachedMessages,
  saveChatScrollPosition,
} from "../../lib/chat-cache";
import {
  bootstrapPushNotifications,
} from "../../lib/notifications";
import { realtime } from "../../lib/realtime";
import type { RootStackParamList } from "../../navigation/types";
import {
  openJammProfileMention,
} from "../../navigation/internalLinks";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type { ChatSummary, Message, User } from "../../types/entities";
import {
  getEntityId,
  normalizeReadByIds,
} from "../../utils/chat";
import type { MessageListItem, NormalizedMessage } from "../../utils/chat";
import { AvatarPreviewModal } from "./components/AvatarPreviewModal";
import { ChatBody } from "./components/ChatBody";
import { ChatHeader } from "./components/ChatHeader";
import { ChatInfoDrawer } from "./components/ChatInfoDrawer";
import { ChatMenuModal } from "./components/ChatMenuModal";
import { MessageContextMenuOverlay } from "./components/MessageContextMenuOverlay";
import { OutgoingCallModal } from "./components/OutgoingCallModal";
import { useChatConversationMeta } from "./hooks/useChatConversationMeta";
import { useChatComposerController } from "./hooks/useChatComposerController";
import { useChatDockController } from "./hooks/useChatDockController";
import { useChatGroupActions } from "./hooks/useChatGroupActions";
import { useChatInfoActions } from "./hooks/useChatInfoActions";
import { useChatMessageActions } from "./hooks/useChatMessageActions";
import { useChatMessageOverlay } from "./hooks/useChatMessageOverlay";
import {
  getMessageDeliveryStatus,
  getMessageIdentity,
  getNormalizedSenderId,
  patchMessagesPages,
  updateMessageByIdInPages,
  upsertMessageInPages,
  type MessagesInfiniteData,
  useChatMessagesData,
} from "./hooks/useChatMessagesData";
import { useChatOutgoingCall } from "./hooks/useChatOutgoingCall";
import { useChatPresenceLifecycle } from "./hooks/useChatPresenceLifecycle";
import { useChatStatusMeta } from "./hooks/useChatStatusMeta";
import { useMessageMenuState } from "./hooks/useMessageMenuState";

type Props = NativeStackScreenProps<RootStackParamList, "ChatRoom">;

const MESSAGE_MENU_SCREEN_PADDING = 12;
const MESSAGE_MENU_GAP = 14;
const MESSAGE_MENU_WIDTH = 188;
const MESSAGE_MENU_ITEM_HEIGHT = 46;
const MESSAGE_MENU_ACTION_GAP = 4;
const MESSAGE_MENU_ACTIONS_PADDING = 6;

const PRESENCE_RESYNC_INTERVAL_MS = 15_000;
const NEW_MESSAGES_BOTTOM_THRESHOLD = 96;

export function ChatScreen({ navigation, route }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const currentUserId = getEntityId(user);
  const [composerHeight, setComposerHeight] = useState(66);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);
  const [infoDrawerUserId, setInfoDrawerUserId] = useState<string | null>(null);
  const [infoPageMounted, setInfoPageMounted] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [messageListVisible, setMessageListVisible] = useState(false);
  const [chatCacheHydrated, setChatCacheHydrated] = useState(false);
  const [messagesCacheHydrated, setMessagesCacheHydrated] = useState(false);
  const [savedScrollOffset, setSavedScrollOffset] = useState<number | null>(
    null,
  );
  const [pendingNewMessageIds, setPendingNewMessageIds] = useState<string[]>(
    [],
  );
  const [visibleMessageIds, setVisibleMessageIds] = useState<string[]>([]);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>(() =>
    realtime.getOnlineUserIds(),
  );
  const listRef = useRef<FlashListRef<MessageListItem>>(null);
  const messageItemsRef = useRef<MessageListItem[]>([]);
  const hasNextPageRef = useRef(false);
  const composerInputRef = useRef<NativeTextInput>(null);
  const composerSelectionRef = useRef({ start: 0, end: 0 });
  const composerFocusedRef = useRef(false);
  const routeGestureHadKeyboardRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openInfoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMenuInfoRef = useRef<{
    queued: boolean;
    targetUser?: User | null;
  }>({ queued: false, targetUser: undefined });
  const initialScrollDoneRef = useRef(false);
  const scrollOffsetRef = useRef(0);
  const scrollRestorePendingRef = useRef<number | null>(null);
  const scrollPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const shouldStickToBottomRef = useRef(true);
  const previousLastMessageIdRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);
  const infoPageTranslateX = useRef(new Animated.Value(screenWidth)).current;
  const infoPageBackdropOpacity = useRef(new Animated.Value(0)).current;
  const infoPageStartXRef = useRef(screenWidth);
  const isBackSwipeGesture = (dx: number, dy: number, vx: number) =>
    dx > 2 &&
    ((dx > 10 && Math.abs(dx) > Math.abs(dy) * 0.45) || (dx > 4 && vx > 0.08));
  const shouldFinishBackSwipe = (dx: number, vx: number) =>
    dx > screenWidth * 0.12 || vx > 0.2;

  const {
    chatsQuery,
    currentChat,
    hasChatsSnapshot,
    messagesQuery,
    hasMessagesSnapshot,
    flatMessages,
    messageItems,
    stickyDateHeaderIndices,
    initialMessageIndex,
    sendMutation,
    editMutation,
    deleteMutation,
    chatPushNotificationsMutation,
  } = useChatMessagesData({
    chatId: route.params.chatId,
    routeIsGroup: Boolean(route.params.isGroup),
    currentUserId,
    savedScrollOffset,
    initialScrollDone: initialScrollDoneRef.current,
  });
  const isGroupChat = Boolean(currentChat?.isGroup ?? route.params.isGroup);
  const {
    chatTitle,
    chatAvatarUri,
    otherMember,
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
  } = useChatConversationMeta({
    chats: chatsQuery.data,
    currentChat,
    currentUserId,
    user,
    isGroupChat,
    infoDrawerUserId,
    fallbackTitle: route.params.title,
  });

  useEffect(() => {
    let cancelled = false;
    setChatCacheHydrated(false);

    if (!currentUserId) {
      setChatCacheHydrated(true);
      return;
    }

    const hydrateCachedChatList = async () => {
      try {
        const cachedChats = await loadCachedChats(currentUserId);
        if (!cancelled && cachedChats && !queryClient.getQueryData(["chats"])) {
          queryClient.setQueryData(["chats"], cachedChats);
        }
      } catch (error) {
        console.warn("Failed to hydrate cached chats", error);
      } finally {
        if (!cancelled) {
          setChatCacheHydrated(true);
        }
      }
    };

    void hydrateCachedChatList();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, queryClient]);

  useEffect(() => {
    if (!currentUserId || !hasChatsSnapshot) {
      return;
    }

    void saveCachedChats(currentUserId, chatsQuery.data || []).catch(
      (error) => {
        console.warn("Failed to persist chats cache", error);
      },
    );
  }, [currentUserId, chatsQuery.data, hasChatsSnapshot]);

  useEffect(() => {
    if (!infoDrawerOpen && !infoPageMounted) {
      infoPageTranslateX.setValue(screenWidth);
      infoPageBackdropOpacity.setValue(0);
    }
  }, [
    infoDrawerOpen,
    infoPageBackdropOpacity,
    infoPageMounted,
    infoPageTranslateX,
    screenWidth,
  ]);

  useEffect(() => {
    if (infoDrawerOpen) {
      setInfoPageMounted(true);
      infoPageTranslateX.setValue(screenWidth);
      infoPageBackdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(infoPageTranslateX, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(infoPageBackdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!infoPageMounted) {
      return;
    }

    Animated.parallel([
      Animated.timing(infoPageTranslateX, {
        toValue: screenWidth,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(infoPageBackdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        return;
      }

      setInfoPageMounted(false);
      setInfoDrawerUserId(null);
    });
  }, [
    infoDrawerOpen,
    infoPageBackdropOpacity,
    infoPageMounted,
    infoPageTranslateX,
    screenWidth,
  ]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (!infoDrawerOpen && !infoPageMounted) {
        return;
      }

      event.preventDefault();
      dismissKeyboard();
      setInfoDrawerOpen(false);
    });

    return unsubscribe;
  }, [infoDrawerOpen, infoPageMounted, navigation]);

  useEffect(() => {
    messageItemsRef.current = messageItems;
  }, [messageItems]);
  useEffect(() => {
    hasNextPageRef.current = Boolean(messagesQuery.hasNextPage);
  }, [messagesQuery.hasNextPage]);

  const isSending = sendMutation.isPending || editMutation.isPending;
  const isComposerDisabled = messagesQuery.isLoading;
  const flushSavedScrollOffset = useCallback(() => {
    if (!currentUserId) {
      return;
    }

    if (scrollPersistTimeoutRef.current) {
      clearTimeout(scrollPersistTimeoutRef.current);
      scrollPersistTimeoutRef.current = null;
    }

    void saveChatScrollPosition(
      currentUserId,
      route.params.chatId,
      scrollOffsetRef.current,
    ).catch((error) => {
      console.warn("Failed to persist chat scroll position", error);
    });
  }, [currentUserId, route.params.chatId]);
  const scheduleScrollOffsetPersist = () => {
    if (!currentUserId) {
      return;
    }

    if (scrollPersistTimeoutRef.current) {
      clearTimeout(scrollPersistTimeoutRef.current);
    }

    scrollPersistTimeoutRef.current = setTimeout(() => {
      scrollPersistTimeoutRef.current = null;
      flushSavedScrollOffset();
    }, 180);
  };
  const handleMessagesScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextOffset = Math.max(0, event.nativeEvent.contentOffset?.y || 0);
    scrollOffsetRef.current = nextOffset;

    const contentHeight = Math.max(
      0,
      event.nativeEvent.contentSize?.height || 0,
    );
    const viewportHeight = Math.max(
      0,
      event.nativeEvent.layoutMeasurement?.height || 0,
    );
    const distanceToBottom = Math.max(
      0,
      contentHeight - viewportHeight - nextOffset,
    );
    shouldStickToBottomRef.current =
      distanceToBottom <= NEW_MESSAGES_BOTTOM_THRESHOLD;

    if (shouldStickToBottomRef.current) {
      setPendingNewMessageIds([]);
    }
  };
  const scrollToLatestMessage = (animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  };
  const keepMessagesPinnedToBottom = useCallback(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: false });
      });
    });
  }, []);
  const handleJumpToLatestMessages = () => {
    shouldStickToBottomRef.current = true;
    setPendingNewMessageIds([]);
    scrollToLatestMessage(true);
  };
  const handleViewableItemsChanged = useRef(
    ({
      viewableItems,
    }: {
      viewableItems: Array<ViewToken<MessageListItem>>;
    }) => {
      const nextVisibleIds = viewableItems
        .map((token) => token.item)
        .filter(
          (item): item is Extract<MessageListItem, { type: "message" }> =>
            item?.type === "message",
        )
        .map((item) => item.message.id)
        .filter(Boolean);

      setVisibleMessageIds((previous) => {
        if (
          previous.length === nextVisibleIds.length &&
          previous.every((value, index) => value === nextVisibleIds[index])
        ) {
          return previous;
        }
        return nextVisibleIds;
      });
    },
  ).current;
  const {
    keyboardVisibleRef,
    composerDockVisible,
    controlledDockLiftVisible,
    stickerSheetVisible,
    stickerSheetOpenedFromKeyboard,
    stickerSheetHeightAnim,
    stickerSheetHeightRef,
    controlledDockBottomOffset,
    stickerSheetInitialHeight,
    stickerSheetMaxHeight,
    composerSoftInputEnabled,
    enableComposerSoftInput,
    disableComposerSoftInput,
    dismissKeyboard,
    showComposerDock,
    showComposerDockImmediately,
    moveComposerAndContentUp,
    moveComposerAndContentDown,
    hideComposerDock,
    hideStickerSheet,
    switchStickerToKeyboard,
    toggleStickerSheet,
    setStickerSheetHeightImmediate,
    snapStickerSheetHeight,
    activeDockTranslateY,
    messagesViewportTranslateY,
    messagesCoveredBottomInset,
    shouldKeepMessagesAnchoredToBottom,
    lockComposerShellHeight,
    dockBottomSpacerHeight,
    composerShellBottomPadding,
  } = useChatDockController({
    bottomInset: insets.bottom,
    topInset: insets.top,
    screenHeight,
    isWeb,
    composerInputRef,
    composerFocusedRef,
  });
  const closeDockAndKeyboard = useCallback((duration = 240) => {
    if (
      !stickerSheetVisible &&
      !composerDockVisible &&
      !keyboardVisibleRef.current
    ) {
      return;
    }

    composerFocusedRef.current = false;
    moveComposerAndContentDown(duration);
    hideComposerDock();
    dismissKeyboard();
  }, [
    composerFocusedRef,
    composerDockVisible,
    dismissKeyboard,
    hideComposerDock,
    keyboardVisibleRef,
    moveComposerAndContentDown,
    stickerSheetVisible,
  ]);
  const handleMessagesTouchStart = useCallback(() => {
    closeDockAndKeyboard();
  }, [closeDockAndKeyboard]);
  const controlledDockVisible = stickerSheetVisible || composerDockVisible;
  const useSharedContentLift =
    controlledDockLiftVisible ||
    composerDockVisible ||
    (stickerSheetVisible && !stickerSheetOpenedFromKeyboard) ||
    controlledDockVisible;
  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: !infoDrawerOpen && !infoPageMounted,
      fullScreenGestureEnabled: true,
      keyboardHandlingEnabled: false,
    });

    return () => {
      navigation.setOptions({
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        keyboardHandlingEnabled: false,
      });
    };
  }, [infoDrawerOpen, infoPageMounted, navigation]);
  
  useEffect(() => {
    const unsubscribe = navigation.addListener("transitionStart", (event) => {
      if (!event.data.closing) {
        return;
      }

      if (
        !keyboardVisibleRef.current &&
        !composerFocusedRef.current &&
        !stickerSheetVisible &&
        !composerDockVisible
      ) {
        return;
      }

      routeGestureHadKeyboardRef.current = true;
      disableComposerSoftInput();
      closeDockAndKeyboard(220);
    });

    return unsubscribe;
  }, [
    closeDockAndKeyboard,
    composerDockVisible,
    composerFocusedRef,
    disableComposerSoftInput,
    keyboardVisibleRef,
    navigation,
    stickerSheetVisible,
  ]);
  useEffect(() => {
    const unsubscribe = navigation.addListener("gestureCancel", () => {
      if (!routeGestureHadKeyboardRef.current) {
        return;
      }

      routeGestureHadKeyboardRef.current = false;
      enableComposerSoftInput();
    });

    return unsubscribe;
  }, [enableComposerSoftInput, navigation]);
  const {
    messageMenuAnim,
    messageMenuMounted,
    highlightedMessageId,
    highlightPulseKey,
    selectedMessageId,
    selectedMessageLayout,
    closeMessageMenu,
    handleMessageMenu,
    handleScrollToRepliedMessage,
  } = useChatMessageOverlay({
    screenWidth,
    screenHeight,
    insets,
    keyboardVisibleRef,
    dismissKeyboard,
    onBeforeOpenMenu: () => {
      closeDockAndKeyboard(200);
    },
    listRef,
    messageItemsRef,
    hasNextPageRef,
    fetchNextPage: messagesQuery.fetchNextPage,
  });
  const selectedMessage =
    (messageItems.find(
      (item) =>
        item.type === "message" && item.message.id === selectedMessageId,
    ) as Extract<MessageListItem, { type: "message" }> | undefined) || null;
  const replyingMessageItem =
    (messageItems.find(
      (item) => item.type === "message" && item.message.id === replyingToId,
    ) as Extract<MessageListItem, { type: "message" }> | undefined) || null;
  const replyingMessage = replyingMessageItem?.message || null;
  const editingMessageItem =
    (messageItems.find(
      (item) => item.type === "message" && item.message.id === editingMessageId,
    ) as Extract<MessageListItem, { type: "message" }> | undefined) || null;
  const editingMessage = editingMessageItem?.message || null;
  const sendMessage = useCallback(
    ({
      content,
      replayToId,
      optimisticMessage,
    }: {
      content: string;
      replayToId?: string | null;
      optimisticMessage: Message;
    }) => {
      sendMutation.mutate({
        content,
        replayToId,
        optimisticMessage,
      });
    },
    [sendMutation],
  );

  const editMessageContent = useCallback(
    ({
      messageId,
      content,
      onSuccess,
    }: {
      messageId: string;
      content: string;
      onSuccess?: () => void;
    }) => {
      editMutation.mutate(
        { messageId, content },
        {
          onSuccess: () => {
            onSuccess?.();
          },
        },
      );
    },
    [editMutation],
  );

  const {
    draft,
    setDraft,
    composerContentMessage,
    hasComposerText,
    handleSend,
    handleAttachmentPress,
    handleVoiceMessagePress,
    handleStickerPress,
    handleKeyboardPress,
    handleStickerSelect,
    handleDeleteLastSticker,
    handleComposerSelectionChange,
    handleComposerPressIn,
    handleComposerFocus,
    handleComposerBlur,
    clearComposerMode,
    enterReplyMode,
    enterEditMode,
  } = useChatComposerController({
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
    moveComposerAndContentUp,
    hideComposerDock,
    hideStickerSheet,
    switchStickerToKeyboard,
    toggleStickerSheet,
    onSendMessage: sendMessage,
    onEditMessage: editMessageContent,
    onScrollToLatestMessage: scrollToLatestMessage,
  });

  const {
    openInfoPage,
    handleOpenInfo,
    handleOpenInfoFromMenu,
    handleCloseInfoDrawer,
    handleOpenPrivateChatWithMember,
    handleBackToGroupInfo,
  } = useChatInfoActions({
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
  });

  const { handleDeleteOrLeave } = useChatGroupActions({
    currentChat,
    isGroupOwnerLeaving,
    queryClient,
    navigation,
  });

  const infoPagePanResponder = useMemo(
    () =>
      PanResponder.create({
        onPanResponderTerminationRequest: () => false,
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => {
          const shouldCapture = isBackSwipeGesture(
            gestureState.dx,
            gestureState.dy,
            gestureState.vx,
          );
          if (shouldCapture) {
            dismissKeyboard();
          }
          return shouldCapture;
        },
        onMoveShouldSetPanResponder: (_event, gestureState) => {
          const shouldCapture = isBackSwipeGesture(
            gestureState.dx,
            gestureState.dy,
            gestureState.vx,
          );
          if (shouldCapture) {
            dismissKeyboard();
          }
          return shouldCapture;
        },
        onPanResponderGrant: () => {
          dismissKeyboard();
          infoPageTranslateX.stopAnimation((value) => {
            infoPageStartXRef.current = value;
          });
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextValue = Math.max(
            0,
            Math.min(screenWidth, infoPageStartXRef.current + gestureState.dx),
          );
          infoPageTranslateX.setValue(nextValue);
          infoPageBackdropOpacity.setValue(1 - nextValue / screenWidth);
        },
        onPanResponderRelease: (_event, gestureState) => {
          const shouldClose = shouldFinishBackSwipe(
            gestureState.dx,
            gestureState.vx,
          );

          if (shouldClose) {
            setInfoDrawerOpen(false);
            return;
          }

          Animated.parallel([
            Animated.timing(infoPageTranslateX, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(infoPageBackdropOpacity, {
              toValue: 1,
              duration: 180,
              useNativeDriver: true,
            }),
          ]).start();
        },
        onPanResponderTerminate: () => {
          Animated.parallel([
            Animated.timing(infoPageTranslateX, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(infoPageBackdropOpacity, {
              toValue: 1,
              duration: 180,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [
      infoPageBackdropOpacity,
      infoPageTranslateX,
      isBackSwipeGesture,
      shouldFinishBackSwipe,
    ],
  );

  const {
    handleReply,
    handleSwipeReply,
    handleEditMessage,
    handleCopyMessage,
    handleCopyGroupLink,
    handleDeleteMessage,
    handleOpenMessageLink,
  } = useChatMessageActions({
    selectedMessage,
    groupLinkUrl,
    closeMessageMenu,
    enterReplyMode,
    enterEditMode,
    onDeleteMessage: (messageId: string) => {
      deleteMutation.mutate(messageId);
    },
  });

  const handleMentionPress = (username: string) => {
    void openJammProfileMention(username).catch(() => {
      Alert.alert("Profil ochilmadi", `@${username}`);
    });
  };
  const handleComposerLayout = useCallback(
    (nextHeight: number) => {
      if (lockComposerShellHeight) {
        return;
      }

      if (nextHeight > 0 && nextHeight !== composerHeight) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setComposerHeight(nextHeight);
      }
    },
    [composerHeight, lockComposerShellHeight],
  );

  const {
    selectedMessageIsMine,
    canEditSelectedMessage,
    canDeleteSelectedMessage,
    canCopySelectedMessage,
    canReplySelectedMessage,
    messageMenuPosition,
    messageMenuBubbleLift,
    messageMenuBubbleScale,
    messageMenuActionsTranslateY,
    messageMenuActionsScale,
    messageMenuOverlayOpacity,
  } = useMessageMenuState({
    selectedMessage,
    currentUserId,
    canDeleteOthersMessages,
    selectedMessageLayout,
    screenHeight,
    screenWidth,
    insetTop: insets.top,
    insetBottom: insets.bottom,
    messageMenuAnim,
    screenPadding: MESSAGE_MENU_SCREEN_PADDING,
    gap: MESSAGE_MENU_GAP,
    width: MESSAGE_MENU_WIDTH,
    itemHeight: MESSAGE_MENU_ITEM_HEIGHT,
    actionGap: MESSAGE_MENU_ACTION_GAP,
    actionsPadding: MESSAGE_MENU_ACTIONS_PADDING,
  });
  const messageMenuOverlayContent = (
    <MessageContextMenuOverlay
      styles={styles}
      mounted={messageMenuMounted}
      selectedMessage={selectedMessage}
      selectedMessageLayout={selectedMessageLayout}
      selectedMessageIsMine={selectedMessageIsMine}
      currentChatIsGroup={Boolean(currentChat?.isGroup)}
      messageMenuPosition={messageMenuPosition}
      overlayOpacity={messageMenuOverlayOpacity}
      bubbleLift={messageMenuBubbleLift}
      bubbleScale={messageMenuBubbleScale}
      actionsTranslateY={messageMenuActionsTranslateY}
      actionsScale={messageMenuActionsScale}
      canReply={canReplySelectedMessage}
      canCopy={canCopySelectedMessage}
      canEdit={canEditSelectedMessage}
      canDelete={canDeleteSelectedMessage}
      onClose={closeMessageMenu}
      onReply={handleReply}
      onCopy={() => {
        void handleCopyMessage();
      }}
      onEdit={handleEditMessage}
      onDelete={handleDeleteMessage}
      onPressMention={handleMentionPress}
      onOpenLink={handleOpenMessageLink}
    />
  );
  const chatBodyContent = (
    <ChatBody
      styles={styles}
      contentTransformStyle={
        !isWeb
          ? {
              transform: [{ translateY: activeDockTranslateY }],
            }
          : undefined
      }
      listProps={{
        listRef,
        messageItems,
        initialMessageIndex,
        shouldKeepMessagesAnchoredToBottom,
        stickyDateHeaderIndices,
        composerHeight,
        dockBottomSpacerHeight,
        bottomCoveredHeight: messagesCoveredBottomInset,
        dockLiftVisible: controlledDockLiftVisible,
        messageListVisible,
        initialScrollDoneRef,
        scrollRestorePendingRef,
        scrollOffsetRef,
        shouldStickToBottomRef,
        messagesQuery,
        hasMessagesSnapshot,
        chatCacheHydrated,
        messagesCacheHydrated,
        currentUserId,
        currentChatIsGroup: Boolean(currentChat?.isGroup),
        highlightedMessageId,
        highlightPulseKey,
        messageMenuMounted,
        selectedMessageId,
        pendingNewMessageIds,
        onMessagesTouchStart: handleMessagesTouchStart,
        onMessagesScroll: handleMessagesScroll,
        onMessagesScrollBeginDrag: handleMessagesTouchStart,
        onMessagesScrollEndDrag: scheduleScrollOffsetPersist,
        onMessagesMomentumScrollEnd: scheduleScrollOffsetPersist,
        onViewableItemsChanged: handleViewableItemsChanged,
        onFetchOlder: () => {
          if (
            messagesQuery.hasNextPage &&
            !messagesQuery.isFetchingNextPage
          ) {
            void messagesQuery.fetchNextPage();
          }
        },
        onOpenMenu: handleMessageMenu,
        onPressMention: handleMentionPress,
        onOpenLink: handleOpenMessageLink,
        onPressReplyPreview: handleScrollToRepliedMessage,
        onSwipeReply: handleSwipeReply,
        onJumpToLatestMessages: handleJumpToLatestMessages,
        onLoadComplete: () => {
          setMessageListVisible(true);
        },
      }}
      stickerPackProps={{
        visible: stickerSheetVisible,
        heightAnim: stickerSheetHeightAnim,
        heightRef: stickerSheetHeightRef,
        initialHeight: stickerSheetInitialHeight,
        maxHeight: stickerSheetMaxHeight,
        onHeightImmediate: setStickerSheetHeightImmediate,
        onSnapHeight: snapStickerSheetHeight,
        onEmojiSelected: handleStickerSelect,
        onDeleteLastEmoji: handleDeleteLastSticker,
      }}
      composerProps={{
        composerInputRef,
        composerHeight,
        lockComposerShellHeight,
        composerShellBottomPadding,
        dockBottomSpacerHeight,
        composerContentMessage,
        editingMessageId,
        draft,
        isComposerDisabled,
        composerSoftInputEnabled,
        hasComposerText,
        stickerPickerOpen: stickerSheetVisible,
        isSending,
        onChangeDraft: setDraft,
        onSelectionChange: handleComposerSelectionChange,
        onPressIn: handleComposerPressIn,
        onFocus: handleComposerFocus,
        onBlur: handleComposerBlur,
        onAttach: () => {
          void handleAttachmentPress();
        },
        onSend: () => {
          void handleSend();
        },
        onStickerToggle: () => {
          void handleStickerPress();
        },
        onKeyboardToggle: () => {
          void handleKeyboardPress();
        },
        onVoice: () => {
          void handleVoiceMessagePress();
        },
        onClearComposerMode: clearComposerMode,
        onContextPress: () => {
          listRef.current?.scrollToEnd({ animated: true });
        },
        onComposerLayout: handleComposerLayout,
      }}
      messagesViewportTransformStyle={
        undefined
      }
      composerTranslateStyle={
        undefined
      }
    />
  );
  const {
    isOtherMemberOnline,
    headerStatusLabel,
    showHeaderStatusDot,
    drawerStatusLabel,
    drawerProfileMeta,
    chatPushNotificationsEnabled,
    showChatPushNotificationsToggle,
  } = useChatStatusMeta({
    currentChat,
    currentUserId,
    isGroupChat,
    otherMember,
    drawerUser,
    onlineUserIds,
    typingUserIds,
  });
  const { outgoingCall, handleStartVideoCall, handleCancelOutgoingCall } =
    useChatOutgoingCall({
      currentChat,
      otherMember,
      isOtherMemberOnline,
      currentUserId,
      navigation,
    });
  useChatPresenceLifecycle({
    navigation,
    chatId: route.params.chatId,
    currentChatMemberIds,
    presenceResyncIntervalMs: PRESENCE_RESYNC_INTERVAL_MS,
    setOnlineUserIds,
  });
  const handleToggleChatPushNotifications = useCallback(
    async (nextEnabled: boolean) => {
      if (chatPushNotificationsMutation.isPending || !currentChat) {
        return;
      }

      const chatId = getEntityId(currentChat);
      if (!chatId) {
        return;
      }

      if (nextEnabled) {
        const permission = await Notifications.getPermissionsAsync();
        if (permission.status !== "granted") {
          await bootstrapPushNotifications().catch(() => null);
          const refreshedPermission = await Notifications.getPermissionsAsync();
          if (refreshedPermission.status !== "granted") {
            Alert.alert(
              "Push ruxsati kerak",
              "Bu chat uchun bildirishnomalarni yoqishdan oldin push notification ruxsatini bering.",
            );
            return;
          }
        }
      }

      chatPushNotificationsMutation.mutate({ chatId, enabled: nextEnabled });
    },
    [chatPushNotificationsMutation, currentChat],
  );

  useEffect(() => {
    return () => {
      if (openInfoTimeoutRef.current) {
        clearTimeout(openInfoTimeoutRef.current);
      }

      if (scrollPersistTimeoutRef.current) {
        clearTimeout(scrollPersistTimeoutRef.current);
        scrollPersistTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (menuOpen || !pendingMenuInfoRef.current.queued) {
      return;
    }

    if (openInfoTimeoutRef.current) {
      clearTimeout(openInfoTimeoutRef.current);
    }

    openInfoTimeoutRef.current = setTimeout(() => {
      const { targetUser } = pendingMenuInfoRef.current;
      pendingMenuInfoRef.current = { queued: false, targetUser: undefined };
      openInfoPage(targetUser);
      openInfoTimeoutRef.current = null;
    }, 120);
  }, [menuOpen]);

  useEffect(() => {
    let cancelled = false;
    setMessagesCacheHydrated(false);
    setSavedScrollOffset(null);
    scrollRestorePendingRef.current = null;
    scrollOffsetRef.current = 0;

    if (!currentUserId) {
      setMessagesCacheHydrated(true);
      return;
    }

    const hydrateCachedMessages = async () => {
      try {
        const [cachedMessages, cachedScrollOffset] = await Promise.all([
          loadCachedMessages(currentUserId, route.params.chatId),
          loadChatScrollPosition(currentUserId, route.params.chatId),
        ]);

        if (
          !cancelled &&
          cachedMessages &&
          !queryClient.getQueryData(["messages", route.params.chatId])
        ) {
          queryClient.setQueryData(
            ["messages", route.params.chatId],
            cachedMessages,
          );
        }

        if (!cancelled) {
          const nextScrollOffset =
            typeof cachedScrollOffset === "number" ? cachedScrollOffset : null;
          setSavedScrollOffset(nextScrollOffset);
          scrollRestorePendingRef.current = nextScrollOffset;
          scrollOffsetRef.current = nextScrollOffset ?? 0;
        }
      } catch (error) {
        console.warn("Failed to hydrate cached messages", error);
      } finally {
        if (!cancelled) {
          setMessagesCacheHydrated(true);
        }
      }
    };

    void hydrateCachedMessages();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, queryClient, route.params.chatId]);

  useEffect(() => {
    const messagesSnapshot = messagesQuery.data;
    if (!currentUserId || !messagesSnapshot) {
      return;
    }

    void saveCachedMessages(
      currentUserId,
      route.params.chatId,
      messagesSnapshot,
    ).catch((error) => {
      console.warn("Failed to persist messages cache", error);
    });
  }, [
    currentUserId,
    hasMessagesSnapshot,
    messagesQuery.data,
    route.params.chatId,
  ]);

  useEffect(() => {
    const chatId = route.params.chatId;
    realtime.emitJoinChat(chatId);

    const subscriptions = [
      realtime.onChatEvent("message_new", (payload) => {
        if (String(payload?.chatId || "") !== String(chatId)) {
          return;
        }
        queryClient.setQueryData<MessagesInfiniteData>(
          ["messages", chatId],
          (previous) => upsertMessageInPages(previous, payload, currentUserId),
        );
      }),
      realtime.onChatEvent("message_updated", (payload) => {
        if (String(payload?.chatId || "") !== String(chatId)) {
          return;
        }
        const messageId = String(payload?._id || payload?.id || "");
        if (!messageId) {
          return;
        }
        queryClient.setQueryData<MessagesInfiniteData>(
          ["messages", chatId],
          (previous) =>
            updateMessageByIdInPages(previous, messageId, (message) => ({
              ...message,
              ...payload,
              isEdited: true,
            })),
        );
      }),
      realtime.onChatEvent("message_deleted", (payload) => {
        if (String(payload?.chatId || "") !== String(chatId)) {
          return;
        }
        const messageId = String(payload?._id || payload?.id || "");
        if (!messageId) {
          return;
        }
        queryClient.setQueryData<MessagesInfiniteData>(
          ["messages", chatId],
          (previous) =>
            updateMessageByIdInPages(previous, messageId, () => null),
        );
      }),
      realtime.onChatEvent("messages_read", (payload) => {
        if (String(payload?.chatId || "") !== String(chatId)) {
          return;
        }
        const readByUserId = String(payload?.readByUserId || "");
        const messageIds = Array.isArray(payload?.messageIds)
          ? payload.messageIds.map((messageId: unknown) => String(messageId))
          : [];

        if (!readByUserId || !messageIds.length) {
          return;
        }

        queryClient.setQueryData<MessagesInfiniteData>(
          ["messages", chatId],
          (previous) =>
            patchMessagesPages(previous, (pages) =>
              pages.map((page) => ({
                ...page,
                data: (page.data || []).map((message) => {
                  const messageId = getMessageIdentity(message);
                  if (!messageIds.includes(messageId)) {
                    return message;
                  }

                  if (
                    getNormalizedSenderId(message.senderId) === readByUserId
                  ) {
                    return message;
                  }

                  const nextReadBy = normalizeReadByIds(message.readBy || []);
                  if (nextReadBy.includes(readByUserId)) {
                    return message;
                  }

                  return {
                    ...message,
                    readBy: [...nextReadBy, readByUserId],
                    deliveryStatus:
                      getMessageDeliveryStatus(message) === "failed"
                        ? "failed"
                        : "read",
                  };
                }),
              })),
            ),
        );
      }),
      realtime.onChatEvent("user_typing", (payload) => {
        if (
          String(payload?.chatId || "") !== String(chatId) ||
          String(payload?.userId || "") === currentUserId
        ) {
          return;
        }

        const typingUserId = String(payload?.userId || "");
        if (payload?.isTyping && typingUserId) {
          setOnlineUserIds((previous) =>
            previous.includes(typingUserId)
              ? previous
              : [...previous, typingUserId],
          );
        }

        setTypingUserIds((previous) => {
          const next = new Set(previous);
          if (payload?.isTyping) {
            next.add(String(payload.userId));
          } else {
            next.delete(String(payload.userId));
          }
          return Array.from(next);
        });
      }),
    ];

    return () => {
      realtime.emitLeaveChat(chatId);
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
      setTypingUserIds([]);
      setOnlineUserIds([]);
    };
  }, [currentUserId, queryClient, route.params.chatId]);

  useEffect(() => {
    const visibleIncomingMessageIds = flatMessages
      .filter((message) => {
        const messageId = getEntityId(message);
        const senderId =
          typeof message.senderId === "string"
            ? message.senderId
            : getEntityId(message.senderId as User);
        const readBy = normalizeReadByIds(message.readBy || []);

        return (
          Boolean(messageId) &&
          visibleMessageIds.includes(String(messageId)) &&
          senderId &&
          senderId !== currentUserId &&
          !message.isDeleted &&
          !readBy.includes(String(currentUserId || ""))
        );
      })
      .map((message) => getEntityId(message))
      .filter(Boolean);

    if (!visibleIncomingMessageIds.length) {
      return;
    }

    queryClient.setQueryData<MessagesInfiniteData>(
      ["messages", route.params.chatId],
      (previous) =>
        patchMessagesPages(previous, (pages) =>
          pages.map((page) => ({
            ...page,
            data: (page.data || []).map((message) => {
              const messageId = getMessageIdentity(message);
              if (!visibleIncomingMessageIds.includes(messageId)) {
                return message;
              }

              const nextReadBy = normalizeReadByIds(message.readBy || []);
              if (nextReadBy.includes(String(currentUserId || ""))) {
                return message;
              }

              return {
                ...message,
                readBy: [...nextReadBy, String(currentUserId || "")],
                deliveryStatus:
                  getMessageDeliveryStatus(message) === "failed"
                    ? "failed"
                    : "read",
              };
            }),
          })),
        ),
    );
    realtime.emitReadMessages(route.params.chatId, visibleIncomingMessageIds);
  }, [
    currentUserId,
    flatMessages,
    queryClient,
    route.params.chatId,
    visibleMessageIds,
  ]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    setMessageListVisible(false);
    scrollOffsetRef.current = 0;
    scrollRestorePendingRef.current = null;
    shouldStickToBottomRef.current = true;
    previousLastMessageIdRef.current = null;
    previousMessageCountRef.current = 0;
    setPendingNewMessageIds([]);
    setVisibleMessageIds([]);
  }, [route.params.chatId]);

  useEffect(() => {
    const lastMessage = flatMessages[flatMessages.length - 1];
    const lastMessageId = getMessageIdentity(lastMessage);
    const previousLastMessageId = previousLastMessageIdRef.current;
    const previousMessageCount = previousMessageCountRef.current;

    if (!lastMessageId) {
      previousLastMessageIdRef.current = null;
      previousMessageCountRef.current = flatMessages.length;
      return;
    }

    if (!previousLastMessageId) {
      previousLastMessageIdRef.current = lastMessageId;
      previousMessageCountRef.current = flatMessages.length;
      return;
    }

    const appendedAtBottom =
      flatMessages.length >= previousMessageCount &&
      String(lastMessageId) !== String(previousLastMessageId);

    if (appendedAtBottom) {
      const appendedMessages = flatMessages
        .slice(previousMessageCount)
        .filter((message) => {
          const senderId = String(
            getNormalizedSenderId(message.senderId) || "",
          );

          return (
            senderId &&
            senderId !== currentUserId &&
            getMessageDeliveryStatus(message) !== "failed"
          );
        });

      if (appendedMessages.length > 0) {
        if (shouldStickToBottomRef.current) {
          setPendingNewMessageIds([]);
          keepMessagesPinnedToBottom();
        } else {
          setPendingNewMessageIds((previous) => {
            const nextIds = appendedMessages
              .map((message) => getMessageIdentity(message))
              .filter(Boolean);
            return Array.from(new Set([...previous, ...nextIds]));
          });
        }
      }
    }

    previousLastMessageIdRef.current = lastMessageId;
    previousMessageCountRef.current = flatMessages.length;
  }, [currentUserId, flatMessages, keepMessagesPinnedToBottom]);

  useEffect(() => {
    if (!pendingNewMessageIds.length) {
      return;
    }

    const unreadMessageIds = new Set(
      flatMessages
        .filter((message) => {
          const senderId = String(
            getNormalizedSenderId(message.senderId) || "",
          );
          const readBy = normalizeReadByIds(message.readBy || []);

          return (
            senderId &&
            senderId !== currentUserId &&
            !readBy.includes(String(currentUserId || "")) &&
            getMessageDeliveryStatus(message) !== "failed"
          );
        })
        .map((message) => String(getMessageIdentity(message)))
        .filter(Boolean),
    );

    setPendingNewMessageIds((previous) => {
      const next = previous.filter((id) => unreadMessageIds.has(String(id)));
      return next.length === previous.length ? previous : next;
    });
  }, [currentUserId, flatMessages, pendingNewMessageIds.length]);

  useEffect(() => {
    return () => {
      flushSavedScrollOffset();
    };
  }, [flushSavedScrollOffset]);

  useEffect(() => {
    if (!messagesQuery.isLoading && !messageItems.length) {
      initialScrollDoneRef.current = true;
      setMessageListVisible(true);
    }
  }, [messageItems.length, messagesQuery.isLoading]);

  useEffect(() => {
    if (!draft.trim()) {
      realtime.emitTyping(route.params.chatId, false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      return;
    }

    realtime.emitTyping(route.params.chatId, true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      realtime.emitTyping(route.params.chatId, false);
      typingTimeoutRef.current = null;
    }, 1800);

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [draft, route.params.chatId]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <Animated.View style={styles.container}>
        <View style={styles.container}>
          <ChatHeader
            styles={styles}
            chatTitle={chatTitle}
            chatAvatarUri={chatAvatarUri}
            currentChat={currentChat}
            isGroupChat={isGroupChat}
            otherMember={otherMember}
            showHeaderStatusDot={showHeaderStatusDot}
            isOtherMemberOnline={isOtherMemberOnline}
            headerStatusLabel={headerStatusLabel}
            onBack={() => {
              dismissKeyboard();
              navigation.goBack();
            }}
            onOpenInfo={() => {
              dismissKeyboard();
              handleOpenInfo();
            }}
            onOpenCall={() => {
              void handleStartVideoCall();
            }}
            onOpenMenu={() => {
              closeDockAndKeyboard(200);
              setMenuOpen(true);
            }}
          />

          <View style={styles.chatBodyHost}>{chatBodyContent}</View>
        </View>

        {Platform.OS === "ios" ? (
          <FullWindowOverlay>{messageMenuOverlayContent}</FullWindowOverlay>
        ) : null}
      </Animated.View>

      {Platform.OS !== "ios" ? messageMenuOverlayContent : null}

      <ChatMenuModal
        styles={styles}
        visible={menuOpen}
        currentChatIsGroup={Boolean(currentChat?.isGroup)}
        canEditGroup={canEditGroup}
        isGroupOwnerLeaving={isGroupOwnerLeaving}
        onClose={() => setMenuOpen(false)}
        onOpenInfo={() => {
          handleOpenInfoFromMenu();
        }}
        onEditGroup={() => {
          setMenuOpen(false);
          navigation.push("EditGroup", { chatId: route.params.chatId });
        }}
        onDeleteOrLeave={handleDeleteOrLeave}
      />

      <ChatInfoDrawer
        styles={styles}
        mounted={infoPageMounted}
        infoPageBackdropOpacity={infoPageBackdropOpacity}
        infoPageTranslateX={infoPageTranslateX}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        panHandlers={infoPagePanResponder.panHandlers}
        isViewingGroupMemberInfo={isViewingGroupMemberInfo}
        drawerTitle={drawerTitle}
        canEditGroup={canEditGroup}
        drawerAvatarUri={drawerAvatarUri}
        currentChat={currentChat}
        drawerUser={drawerUser}
        chatTitle={chatTitle}
        drawerProfileMeta={drawerProfileMeta}
        showChatPushNotificationsToggle={showChatPushNotificationsToggle}
        chatPushNotificationsEnabled={chatPushNotificationsEnabled}
        chatPushNotificationsPending={chatPushNotificationsMutation.isPending}
        drawerStatusLabel={drawerStatusLabel}
        groupLinkUrl={groupLinkUrl}
        onBack={handleBackToGroupInfo}
        onClose={handleCloseInfoDrawer}
        onOpenEditGroup={() => {
          handleCloseInfoDrawer();
          navigation.push("EditGroup", { chatId: route.params.chatId });
        }}
        onOpenAvatarPreview={() => {
          if (drawerAvatarUri) {
            setAvatarPreviewOpen(true);
          }
        }}
        onToggleChatPushNotifications={(value) => {
          void handleToggleChatPushNotifications(value);
        }}
        onCopyGroupLink={() => {
          void handleCopyGroupLink();
        }}
        onPressMention={handleMentionPress}
        onOpenLink={handleOpenMessageLink}
        onOpenPrivateChatWithMember={(member) => {
          void handleOpenPrivateChatWithMember(member);
        }}
      />

      <OutgoingCallModal
        styles={styles}
        outgoingCall={outgoingCall}
        onCancel={() => {
          void handleCancelOutgoingCall();
        }}
      />

      <AvatarPreviewModal
        styles={styles}
        visible={avatarPreviewOpen}
        avatarUri={drawerAvatarUri}
        onClose={() => setAvatarPreviewOpen(false)}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    zIndex: 12,
    elevation: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 4,
    marginRight: 4,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.mutedText,
    marginTop: 2,
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  headerStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  headerStatusDotOnline: {
    backgroundColor: Colors.primary,
  },
  headerStatusDotOffline: {
    backgroundColor: Colors.mutedText,
    opacity: 0.8,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 28,
  },
  helperText: {
    color: Colors.mutedText,
    textAlign: "center",
    lineHeight: 20,
  },
  historyLoader: {
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  historyLoaderText: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  chatBodyHost: {
    flex: 1,
    overflow: "hidden",
  },
  messagesViewport: {
    flex: 1,
    position: "relative",
  },
  chatBody: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  chatBodyContent: {
    flex: 1,
  },
  messagesListHidden: {
    opacity: 0,
  },
  messagesContent: {
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 20,
  },
  dateDivider: {
    alignItems: "center",
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: "transparent",
    zIndex: 6,
    elevation: 6,
  },
  dateDividerText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.surface,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  messageRowSwipeContainer: {
    position: "relative",
  },
  messageRowAnimated: {
    position: "relative",
    zIndex: 1,
  },
  messageRowMine: {
    justifyContent: "flex-end",
  },
  messageRowTheirs: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "90%",
    minWidth: 60,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  messageBubblePressable: {
    minWidth: 60,
    width: "100%",
  },
  messageBubbleHidden: {
    opacity: 0,
  },
  messageBubbleMine: {
    backgroundColor: Colors.input,
  },
  messageBubbleTheirs: {
    backgroundColor: Colors.input,
  },
  senderLabel: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  messageText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  messageSelectableInput: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    minHeight: 0,
    textAlignVertical: "top",
    backgroundColor: "transparent",
  },
  messageLink: {
    color: "#7DB6FF",
    textDecorationLine: "underline",
  },
  messageMention: {
    color: Colors.primary,
    fontWeight: "700",
  },
  replyPreview: {
    width: "100%",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 8,
    maxWidth: 320,
  },
  replyPreviewMine: {
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "flex-end",
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.28)",
  },
  replyPreviewTheirs: {
    backgroundColor: "rgba(88,101,242,0.12)",
    alignItems: "flex-start",
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary,
  },
  replyPreviewAuthor: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  replyPreviewAuthorMine: {
    color: "rgba(255,255,255,0.88)",
  },
  replyPreviewText: {
    color: Colors.mutedText,
    fontSize: 12,
    marginTop: 2,
  },
  messageFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  messageEdited: {
    color: Colors.mutedText,
    fontSize: 11,
  },
  messageTime: {
    color: Colors.mutedText,
    fontSize: 11,
  },
  messageReceiptIcon: {
    minWidth: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  swipeReplyHint: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  messageMenuLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
  },
  messageMenuBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  messageMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  messageMenuPreview: {
    position: "absolute",
    zIndex: 2,
  },
  messageMenuBubbleShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 18,
  },
  messageMenuBubbleFixed: {
    width: "100%",
    maxWidth: "100%",
  },
  messageMenuActionBar: {
    position: "absolute",
    width: MESSAGE_MENU_WIDTH,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 12,
    zIndex: 3,
  },
  messageMenuAction: {
    width: "100%",
    minHeight: 42,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  messageMenuActionText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  messageMenuActionTextDanger: {
    color: Colors.danger,
  },
  newMessagesButton: {
    position: "absolute",
    right: 16,
    bottom: 14,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 8,
  },
  newMessagesChip: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  newMessagesChipText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  composerStickyHost: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
    elevation: 6,
  },
  composerShell: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "transparent",
    borderTopWidth: 0,
  },
  composerStack: {
    gap: 8,
  },
  composerNoticeCard: {
    alignSelf: "center",
    maxWidth: "92%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(20, 22, 24, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  composerNoticeText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    backgroundColor: "transparent",
  },
  composerField: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.input,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
    opacity: 1,
  },
  composerInputWrap: {
    flex: 1,
    minWidth: 0,
  },
  composerActionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  composerSideRight: {
    minWidth: 20,
    marginLeft: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  composerInlineAccessoryButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  composerInlineAccessoryButtonActive: {
    backgroundColor: Colors.primary,
  },
  composerInlineAccessoryButtonPressed: {
    opacity: 0.88,
  },
  composerInlineAccessoryButtonDisabled: {
    opacity: 0.45,
  },
  composerInlineSendButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  composerInlineSendButtonPressed: {
    opacity: 0.88,
  },
  composerInlineSendButtonDisabled: {
    opacity: 0.45,
  },
  composerActionButtonPressed: {
    opacity: 0.82,
  },
  composerActionButtonDisabled: {
    opacity: 0.45,
  },
  composerContextCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    backgroundColor: "rgba(32, 34, 37, 0.72)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },
  composerContextTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  composerContextClose: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  composerContextLabel: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  composerContextText: {
    color: Colors.mutedText,
    fontSize: 12,
    marginTop: 2,
  },
  composerInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 21,
    maxHeight: 120,
    paddingVertical: Platform.OS === "ios" ? 1 : 0,
    paddingHorizontal: 0,
    textAlignVertical: "center",
    textAlign: "left",
    alignSelf: "stretch",
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonPressed: {
    opacity: 0.88,
  },
  sendButtonHidden: {
    opacity: 0,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "flex-end",
    paddingTop: 66,
    paddingRight: 14,
  },
  menuDropdown: {
    minWidth: 210,
    borderRadius: 14,
    padding: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 12,
  },
  messageMenuDropdown: {
    minWidth: 180,
    borderRadius: 14,
    padding: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 120,
    marginRight: 8,
  },
  menuItem: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  menuItemText: {
    color: Colors.text,
    fontSize: 14,
  },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
    marginHorizontal: 8,
  },
  infoPageRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
  },
  infoPageBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  infoPagePanel: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surface,
  },
  infoPageSafeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  infoPageHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 12,
  },
  infoPageSpacer: {
    width: 36,
  },
  infoPageTitle: {
    flex: 1,
    textAlign: "center",
    color: Colors.text,
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 12,
  },
  infoPageScroll: {
    flex: 1,
  },
  infoPageContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 16,
  },
  infoProfileBlock: {
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
  },
  infoAvatarButton: {
    borderRadius: 999,
  },
  infoProfileNameWrap: {
    justifyContent: "center",
    alignItems: "center",
    maxWidth: "100%",
  },
  infoProfileNameContainer: {
    justifyContent: "center",
    alignItems: "center",
    maxWidth: "100%",
  },
  infoProfileName: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  infoProfileMeta: {
    color: Colors.mutedText,
    fontSize: 14,
    textAlign: "center",
  },
  callingOverlay: {
    flex: 1,
    backgroundColor: "rgba(8, 11, 18, 0.76)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  callingCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: "center",
    gap: 12,
    backgroundColor: "#131722",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  callingTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  callingSubtitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  callingDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  callingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  callingCancelButton: {
    minWidth: 150,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 20,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  callingCancelButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  avatarPreviewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  avatarPreviewImage: {
    width: "100%",
    height: "100%",
    maxWidth: 520,
    maxHeight: "78%",
  },
  infoCard: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  infoItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  infoSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoSwitchCopy: {
    flex: 1,
    gap: 4,
  },
  infoLabel: {
    color: Colors.mutedText,
    fontSize: 12,
    textTransform: "uppercase",
  },
  infoValue: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  infoLinkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  infoLinkValue: {
    flex: 1,
    color: Colors.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  infoCopyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -4,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  infoSection: {
    gap: 10,
  },
  infoSectionTitle: {
    color: Colors.subtleText,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  infoMembersList: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  memberRowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
  memberMetaText: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  memberRoleBadge: {
    color: Colors.primary,
    backgroundColor: Colors.primarySoft,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
});
