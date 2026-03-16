import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput as NativeTextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FlashList } from "@shopify/flash-list";
import type { FlashListRef } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import {
  Check,
  CheckCheck,
  Edit2,
  Info,
  LogOut,
  MoreVertical,
  Reply,
  Timer,
  Trash2,
  Video,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { TextInput } from "../../components/TextInput";
import { UserDisplayName } from "../../components/UserDisplayName";
import { EditGroupDialog } from "./GroupDialogs";
import { chatsApi } from "../../lib/api";
import { realtime } from "../../lib/realtime";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type { Message, User } from "../../types/entities";
import {
  buildMessageItems,
  getChatAvatarUri,
  getChatTitle,
  getEntityId,
  getOtherMember,
  getDirectChatUserLabel,
  normalizeReadByIds,
} from "../../utils/chat";
import type { MessageListItem, NormalizedMessage } from "../../utils/chat";

type Props = NativeStackScreenProps<RootStackParamList, "ChatRoom">;
type MessageMenuLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MessagesInfiniteData = InfiniteData<{
  data?: Message[];
  nextCursor?: string | null;
  hasMore?: boolean;
}, string | null>;

const ONLINE_PRESENCE_WINDOW_MS = 45_000;

const getNormalizedSenderId = (senderId?: string | User | null) =>
  typeof senderId === "string" ? senderId : getEntityId(senderId);

const getMessageIdentity = (message?: { _id?: string; id?: string } | null) =>
  getEntityId(message);

const getMessageDeliveryStatus = (message: Message) => {
  const explicitStatus = String(message.deliveryStatus || "").trim();
  if (explicitStatus) {
    return explicitStatus;
  }

  return normalizeReadByIds(message.readBy || []).length > 0 ? "read" : "sent";
};

const isMatchingOptimisticMessage = (
  message: Message,
  nextMessage: Message,
  currentUserId: string,
) => {
  if (getMessageDeliveryStatus(message) !== "pending") {
    return false;
  }

  const messageSenderId = String(getNormalizedSenderId(message.senderId) || "");
  const nextSenderId = String(getNormalizedSenderId(nextMessage.senderId) || "");

  if (!currentUserId || messageSenderId !== currentUserId || nextSenderId !== currentUserId) {
    return false;
  }

  if (String(message.content || "").trim() !== String(nextMessage.content || "").trim()) {
    return false;
  }

  if (
    String(getMessageIdentity(message.replayTo) || "") !==
    String(getMessageIdentity(nextMessage.replayTo) || "")
  ) {
    return false;
  }

  const optimisticTime = new Date(message.createdAt || 0).getTime();
  const nextTime = new Date(nextMessage.createdAt || Date.now()).getTime();
  return Math.abs(nextTime - optimisticTime) < 120000;
};

const patchMessagesPages = (
  previous: MessagesInfiniteData | undefined,
  updater: (pages: Array<{ data?: Message[]; nextCursor?: string | null; hasMore?: boolean }>) => Array<{
    data?: Message[];
    nextCursor?: string | null;
    hasMore?: boolean;
  }>,
): MessagesInfiniteData => {
  const base =
    previous ||
    ({
      pages: [{ data: [], nextCursor: null, hasMore: false }],
      pageParams: [null],
    } satisfies MessagesInfiniteData);

  return {
    ...base,
    pages: updater(base.pages),
  };
};

const upsertMessageInPages = (
  previous: MessagesInfiniteData | undefined,
  nextMessage: Message,
  currentUserId: string,
) =>
  patchMessagesPages(previous, (pages) => {
    let hasExactMessage = false;
    let optimisticReplaced = false;

    const nextPages = pages.map((page) => {
      const pageData = page.data || [];

      const exactIndex = pageData.findIndex(
        (message) => getMessageIdentity(message) === getMessageIdentity(nextMessage),
      );

      if (exactIndex !== -1) {
        hasExactMessage = true;
        const updatedData = [...pageData];
        updatedData[exactIndex] = {
          ...updatedData[exactIndex],
          ...nextMessage,
          deliveryStatus: getMessageDeliveryStatus(nextMessage),
        };
        return {
          ...page,
          data: updatedData,
        };
      }

      const optimisticIndex = pageData.findIndex((message) =>
        isMatchingOptimisticMessage(message, nextMessage, currentUserId),
      );

      if (optimisticIndex !== -1) {
        optimisticReplaced = true;
        const updatedData = [...pageData];
        updatedData[optimisticIndex] = {
          ...nextMessage,
          deliveryStatus: getMessageDeliveryStatus(nextMessage),
          isLocalOnly: false,
        };
        return {
          ...page,
          data: updatedData,
        };
      }

      return page;
    });

    if (hasExactMessage || optimisticReplaced) {
      return nextPages;
    }

    const [latestPage, ...restPages] = nextPages;
    return [
      {
        ...latestPage,
        data: [...(latestPage?.data || []), nextMessage],
      },
      ...restPages,
    ];
  });

const updateMessageByIdInPages = (
  previous: MessagesInfiniteData | undefined,
  messageId: string,
  updater: (message: Message) => Message | null,
) =>
  patchMessagesPages(previous, (pages) =>
    pages.map((page) => ({
      ...page,
      data: (page.data || []).flatMap((message) => {
        if (getMessageIdentity(message) !== messageId) {
          return [message];
        }

        const nextMessage = updater(message);
        return nextMessage ? [nextMessage] : [];
      }),
    })),
  );

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
  const userId = getEntityId(currentUser);

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

function MessageReceiptIcon({
  message,
}: {
  message: NormalizedMessage;
}) {
  if (message.isDeleted) {
    return null;
  }

  if (message.deliveryStatus === "failed" || message.deliveryStatus === "cancelled") {
    return <X size={13} color={Colors.danger} />;
  }

  if (message.deliveryStatus === "pending") {
    return <Timer size={13} color={Colors.mutedText} />;
  }

  if (message.deliveryStatus === "read" || message.readBy.length > 0) {
    return <CheckCheck size={13} color={Colors.primary} />;
  }

  return <Check size={13} color={Colors.mutedText} />;
}

type MessageContentPart =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "mention";
      content: string;
      username: string;
    }
  | {
      type: "url";
      content: string;
      url: string;
    };

function parseMessageContent(content: string): MessageContentPart[] {
  const mentionRegex = /@(\w+)/g;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches: Array<
    | {
        type: "mention";
        index: number;
        length: number;
        username: string;
        content: string;
      }
    | {
        type: "url";
        index: number;
        length: number;
        url: string;
        content: string;
      }
  > = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(content)) !== null) {
    matches.push({
      type: "mention",
      index: match.index,
      length: match[0].length,
      username: match[1],
      content: match[0],
    });
  }

  while ((match = urlRegex.exec(content)) !== null) {
    matches.push({
      type: "url",
      index: match.index,
      length: match[0].length,
      url: match[0],
      content: match[0],
    });
  }

  matches.sort((left, right) => left.index - right.index);

  const parts: MessageContentPart[] = [];
  for (const entry of matches) {
    if (entry.index < lastIndex) {
      continue;
    }

    if (entry.index > lastIndex) {
      parts.push({
        type: "text",
        content: content.slice(lastIndex, entry.index),
      });
    }

    parts.push(entry);
    lastIndex = entry.index + entry.length;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: "text",
      content: content.slice(lastIndex),
    });
  }

  return parts.length > 0 ? parts : [{ type: "text", content }];
}

function MessageRichText({
  content,
  onPressMention,
  onLongPress,
  selectable = false,
}: {
  content: string;
  onPressMention: (username: string) => void;
  onLongPress?: () => void;
  selectable?: boolean;
}) {
  if (selectable) {
    return (
      <Text style={styles.messageText} onLongPress={onLongPress} selectable>
        {content}
      </Text>
    );
  }

  const parts = parseMessageContent(content);

  return (
    <Text style={styles.messageText} onLongPress={onLongPress} selectable={selectable}>
      {parts.map((part, index) => {
        if (part.type === "url") {
          return (
            <Text
              key={`${part.type}-${index}`}
              style={styles.messageLink}
              selectable={selectable}
              onLongPress={onLongPress}
              onPress={() => {
                void Linking.openURL(part.url).catch(() => {
                  Alert.alert("Link ochilmadi", part.url);
                });
              }}
            >
              {part.content}
            </Text>
          );
        }

        if (part.type === "mention") {
          return (
            <Text
              key={`${part.type}-${index}`}
              style={styles.messageMention}
              selectable={selectable}
              onLongPress={onLongPress}
              onPress={() => onPressMention(part.username)}
            >
              {part.content}
            </Text>
          );
        }

        return <Fragment key={`${part.type}-${index}`}>{part.content}</Fragment>;
      })}
    </Text>
  );
}

function MessageBubbleBody({
  message,
  isMine,
  isGroup,
  onPressMention,
  onLongPress,
  selectable = false,
}: {
  message: NormalizedMessage;
  isMine: boolean;
  isGroup: boolean;
  onPressMention: (username: string) => void;
  onLongPress?: () => void;
  selectable?: boolean;
}) {
  return (
    <>
      {isGroup && !isMine ? (
        <UserDisplayName
          user={message.senderUser}
          fallback={message.senderName}
          size="sm"
          textStyle={styles.senderLabel}
        />
      ) : null}

      {message.replayTo ? (
        <View
          style={[
            styles.replyPreview,
            isMine ? styles.replyPreviewMine : styles.replyPreviewTheirs,
          ]}
        >
          <UserDisplayName
            user={message.replayTo.senderUser}
            fallback={message.replayTo.senderName}
            size="sm"
            textStyle={[
              styles.replyPreviewAuthor,
              isMine && styles.replyPreviewAuthorMine,
            ]}
          />
          <Text style={styles.replyPreviewText} numberOfLines={1}>
            {message.replayTo.content || "Bu xabar o'chirilgan"}
          </Text>
        </View>
      ) : null}

      <MessageRichText
        content={message.content}
        onPressMention={onPressMention}
        onLongPress={onLongPress}
        selectable={selectable}
      />

      <View style={styles.messageFooter}>
        {isGroup && message.isEdited ? (
          <Text style={styles.messageEdited}>edited</Text>
        ) : null}
        <Text style={styles.messageTime}>{message.timeLabel}</Text>
        {isMine ? (
          <View style={styles.messageReceiptIcon}>
            <MessageReceiptIcon message={message} />
          </View>
        ) : null}
      </View>
    </>
  );
}

function ChatMessageRow({
  message,
  isMine,
  isGroup,
  onOpenMenu,
  onPressMention,
  onSwipeReply,
  hidden = false,
}: {
  message: NormalizedMessage;
  isMine: boolean;
  isGroup: boolean;
  onOpenMenu: (messageId: string, target: View | null) => void;
  onPressMention: (username: string) => void;
  onSwipeReply: (message: NormalizedMessage) => void;
  hidden?: boolean;
}) {
  const swipeReplyDisabled = Boolean(message.isDeleted);
  const gestureTranslateX = useRef(new Animated.Value(0)).current;
  const bubbleRef = useRef<View | null>(null);
  const shouldTriggerReplySwipe = (dx: number, vx: number) =>
    dx < -28 || vx < -0.2;
  const translateX = gestureTranslateX.interpolate({
    inputRange: [-80, 0, 80],
    outputRange: [-80, 0, 0],
    extrapolate: "clamp",
  });
  const replyHintOpacity = translateX.interpolate({
    inputRange: [-56, -18, 0],
    outputRange: [1, 0.35, 0],
    extrapolate: "clamp",
  });
  const replyHintTranslateX = translateX.interpolate({
    inputRange: [-56, 0],
    outputRange: [0, 10],
    extrapolate: "clamp",
  });

  const animateBack = () => {
    Animated.spring(gestureTranslateX, {
      toValue: 0,
      damping: 18,
      stiffness: 240,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  };

  const handleSwipeReply = () => {
    if (swipeReplyDisabled) {
      animateBack();
      return;
    }

    animateBack();
    onSwipeReply(message);
  };

  const handleGestureStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    const { oldState, translationX, velocityX } = event.nativeEvent;
    if (oldState !== State.ACTIVE) {
      return;
    }

    const shouldReply = shouldTriggerReplySwipe(translationX, velocityX);
    if (shouldReply) {
      handleSwipeReply();
      return;
    }

    animateBack();
  };

  const handleGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: gestureTranslateX } }],
    { useNativeDriver: true },
  );

  return (
    <View style={styles.messageRowSwipeContainer}>
      {!swipeReplyDisabled ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeReplyHint,
            {
              opacity: replyHintOpacity,
              transform: [{ translateX: replyHintTranslateX }],
            },
          ]}
        >
          <Reply size={16} color={Colors.primary} />
        </Animated.View>
      ) : null}
      <PanGestureHandler
        enabled={!swipeReplyDisabled}
        activeOffsetX={[-12, 9999]}
        failOffsetY={[-12, 12]}
        shouldCancelWhenOutside={false}
        onGestureEvent={handleGestureEvent}
        onHandlerStateChange={handleGestureStateChange}
      >
        <Animated.View
          style={[
            styles.messageRowAnimated,
            {
              transform: [{ translateX }],
            },
          ]}
        >
          <View
            style={[
              styles.messageRow,
              isMine ? styles.messageRowMine : styles.messageRowTheirs,
            ]}
          >
            <View
              ref={bubbleRef}
              style={[
                styles.messageBubble,
                isMine ? styles.messageBubbleMine : styles.messageBubbleTheirs,
                hidden && styles.messageBubbleHidden,
              ]}
            >
              <Pressable
                onLongPress={() => onOpenMenu(message.id, bubbleRef.current)}
                delayLongPress={220}
                style={styles.messageBubblePressable}
              >
                <MessageBubbleBody
                  message={message}
                  isMine={isMine}
                  isGroup={isGroup}
                  onPressMention={onPressMention}
                  onLongPress={() => onOpenMenu(message.id, bubbleRef.current)}
                />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

export function ChatScreen({ navigation, route }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const currentUserId = getEntityId(user);
  const [draft, setDraft] = useState("");
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);
  const [infoDrawerUserId, setInfoDrawerUserId] = useState<string | null>(null);
  const [infoPageMounted, setInfoPageMounted] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [messageMenuOpen, setMessageMenuOpen] = useState(false);
  const [messageMenuMounted, setMessageMenuMounted] = useState(false);
  const [messageListVisible, setMessageListVisible] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessageLayout, setSelectedMessageLayout] = useState<MessageMenuLayout | null>(
    null,
  );
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>(() => realtime.getOnlineUserIds());
  const listRef = useRef<FlashListRef<MessageListItem>>(null);
  const composerInputRef = useRef<NativeTextInput>(null);
  const composerFocusedRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openInfoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMenuInfoRef = useRef<{
    queued: boolean;
    targetUser?: User | null;
  }>({ queued: false, targetUser: undefined });
  const initialScrollDoneRef = useRef(false);
  const messageMenuAnim = useRef(new Animated.Value(0)).current;
  const infoPageTranslateX = useRef(new Animated.Value(screenWidth)).current;
  const infoPageBackdropOpacity = useRef(new Animated.Value(0)).current;
  const infoPageStartXRef = useRef(screenWidth);
  const isBackSwipeGesture = (dx: number, dy: number, vx: number) =>
    dx > 2 &&
    ((dx > 10 && Math.abs(dx) > Math.abs(dy) * 0.45) || (dx > 4 && vx > 0.08));
  const shouldFinishBackSwipe = (dx: number, vx: number) =>
    dx > screenWidth * 0.12 || vx > 0.2;

  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: chatsApi.fetchChats,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const currentChat = useMemo(
    () =>
      (chatsQuery.data || []).find(
        (chat) =>
          getEntityId(chat) === route.params.chatId || chat.urlSlug === route.params.chatId,
      ) || null,
    [chatsQuery.data, route.params.chatId],
  );

  const chatTitle = currentChat
    ? getChatTitle(currentChat, currentUserId)
    : route.params.title;
  const chatAvatarUri = currentChat ? getChatAvatarUri(currentChat, currentUserId) : null;
  const otherMember = currentChat ? getOtherMember(currentChat, currentUserId) : null;
  const knownUsers = useMemo(() => {
    const map = new Map<string, User>();
    (chatsQuery.data || []).forEach((chat) => {
      chat.members?.forEach((member) => {
        const memberId = getEntityId(member);
        if (memberId) {
          map.set(memberId, member);
        }
      });
    });
    return Array.from(map.values());
  }, [chatsQuery.data]);

  const myAdminRecord = currentChat?.admins?.find(
    (admin) => (admin.userId || admin.id || admin._id) === currentUserId,
  );
  const canEditGroup =
    Boolean(currentChat?.isGroup) &&
    (String(currentChat?.createdBy || "") === currentUserId ||
      Boolean(myAdminRecord?.permissions?.length));
  const canDeleteOthersMessages =
    String(currentChat?.createdBy || "") === currentUserId ||
    Boolean(myAdminRecord?.permissions?.includes("delete_others_messages"));
  const isGroupOwnerLeaving =
    Boolean(currentChat?.isGroup) &&
    String(currentChat?.createdBy || "") !== currentUserId;
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
  const isViewingGroupMemberInfo = Boolean(currentChat?.isGroup && infoDrawerUser);
  const drawerUser = currentChat?.isGroup ? infoDrawerUser : otherMember;
  const drawerAvatarUri = drawerUser?.avatar || chatAvatarUri || null;
  const drawerTitle = drawerUser
    ? "Foydalanuvchi ma'lumotlari"
    : currentChat?.isSavedMessages
      ? "Saved Messages"
      : "Guruh ma'lumotlari";

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
    navigation.setOptions({
      gestureEnabled: !infoDrawerOpen && !infoPageMounted,
    });

    return () => {
      navigation.setOptions({
        gestureEnabled: true,
      });
    };
  }, [infoDrawerOpen, infoPageMounted, navigation]);

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

  const messagesQuery = useInfiniteQuery({
    queryKey: ["messages", route.params.chatId],
    queryFn: ({ pageParam }) => chatsApi.fetchMessages(route.params.chatId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });

  const messagesPages = messagesQuery.data?.pages || [];
  const messageItems = useMemo(() => {
    const flattenedMessages = [...messagesPages]
      .reverse()
      .flatMap((page) => page.data || []);
    return buildMessageItems(flattenedMessages);
  }, [messagesPages]);
  const initialMessageIndex =
    !initialScrollDoneRef.current && messageItems.length > 0
      ? messageItems.length - 1
      : undefined;

  const selectedMessage =
    messageItems.find(
      (item) => item.type === "message" && item.message.id === selectedMessageId,
    ) || null;
  const replyingMessage =
    messageItems.find(
      (item) => item.type === "message" && item.message.id === replyingToId,
    ) || null;
  const editingMessage =
    messageItems.find(
      (item) => item.type === "message" && item.message.id === editingMessageId,
    ) || null;
  const selectedMessageIsMine =
    selectedMessage?.type === "message" &&
    selectedMessage.message.senderId === currentUserId;
  const messageMenuActionsTop = useMemo(() => {
    if (!selectedMessageLayout) {
      return null;
    }

    const menuHeight = 58;
    const belowY = selectedMessageLayout.y + selectedMessageLayout.height + 14;
    const availableHeight = screenHeight - insets.top - insets.bottom - 12;

    if (belowY + menuHeight <= availableHeight) {
      return belowY;
    }

    return Math.max(12, selectedMessageLayout.y - menuHeight - 14);
  }, [insets.bottom, insets.top, screenHeight, selectedMessageLayout]);
  const messageMenuActionsLeft = useMemo(() => {
    if (!selectedMessageLayout) {
      return null;
    }

    const actionBarWidth = 176;
    const idealLeft = selectedMessageIsMine
      ? selectedMessageLayout.x + selectedMessageLayout.width - actionBarWidth
      : selectedMessageLayout.x;

    return Math.max(12, Math.min(screenWidth - actionBarWidth - 12, idealLeft));
  }, [screenWidth, selectedMessageIsMine, selectedMessageLayout]);
  const messageMenuBubbleLift = messageMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -16],
    extrapolate: "clamp",
  });
  const messageMenuBubbleScale = messageMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1],
    extrapolate: "clamp",
  });
  const messageMenuOverlayOpacity = messageMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const sendMutation = useMutation({
    mutationFn: ({
      content,
      replayToId,
      optimisticMessage,
    }: {
      content: string;
      replayToId?: string | null;
      optimisticMessage: Message;
    }) =>
      chatsApi.sendMessage({
        chatId: route.params.chatId,
        content,
        replayToId,
      }),
    onMutate: async ({ optimisticMessage }) => {
      await queryClient.cancelQueries({ queryKey: ["messages", route.params.chatId] });
      queryClient.setQueryData<MessagesInfiniteData>(
        ["messages", route.params.chatId],
        (previous) =>
          patchMessagesPages(previous, (pages) => {
            const [latestPage, ...restPages] = pages;
            return [
              {
                ...latestPage,
                data: [...(latestPage?.data || []), optimisticMessage],
              },
              ...restPages,
            ];
          }),
      );
      return { optimisticMessageId: getMessageIdentity(optimisticMessage) };
    },
    onSuccess: (nextMessage) => {
      queryClient.setQueryData<MessagesInfiniteData>(
        ["messages", route.params.chatId],
        (previous) => upsertMessageInPages(previous, nextMessage, currentUserId),
      );
    },
    onError: (error, _variables, context) => {
      if (context?.optimisticMessageId) {
        queryClient.setQueryData<MessagesInfiniteData>(
          ["messages", route.params.chatId],
          (previous) =>
            updateMessageByIdInPages(previous, context.optimisticMessageId, (message) => ({
              ...message,
              deliveryStatus: "failed",
              isLocalOnly: true,
            })),
        );
      }
      Alert.alert(
        "Xabar yuborilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      chatsApi.editMessage(messageId, content),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["messages", route.params.chatId] });
    },
    onError: (error) => {
      Alert.alert(
        "Xabar tahrirlanmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => chatsApi.deleteMessage(messageId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["messages", route.params.chatId] });
    },
    onError: (error) => {
      Alert.alert(
        "Xabar o'chirilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    },
  });

  const isSending = sendMutation.isPending || editMutation.isPending;
  const isComposerDisabled = messagesQuery.isLoading;
  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };
  const scrollToLatestMessage = (animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  };

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || isSending || isComposerDisabled) {
      return;
    }

    await Haptics.selectionAsync();

    if (editingMessageId) {
      editMutation.mutate(
        { messageId: editingMessageId, content },
        {
          onSuccess: () => {
            setDraft("");
            setEditingMessageId(null);
          },
        },
      );
      return;
    }

    const replyToMessage =
      replyingMessage?.type === "message"
        ? {
            id: replyingMessage.message.id,
            senderId: replyingMessage.message.senderUser
              ? replyingMessage.message.senderUser
              : replyingMessage.message.senderId,
            content: replyingMessage.message.content,
          }
        : null;
    const optimisticMessage = createOptimisticMessage({
      content,
      replyToMessage,
      currentUser: user,
    });

    setDraft("");
    setReplyingToId(null);
    sendMutation.mutate({
      content,
      replayToId: replyingToId,
      optimisticMessage,
    });
    scrollToLatestMessage(true);
  };

  const openInfoPage = (targetUser?: User | null) => {
    if (!currentChat) return;
    dismissKeyboard();
    setAvatarPreviewOpen(false);
    setInfoDrawerUserId(targetUser ? getEntityId(targetUser) : currentChat.isGroup ? null : getEntityId(otherMember));
    setInfoDrawerOpen(true);
  };

  const handleOpenInfo = (targetUser?: User | null) => {
    setMenuOpen(false);
    openInfoPage(targetUser);
  };

  const handleOpenInfoFromMenu = (targetUser?: User | null) => {
    dismissKeyboard();
    pendingMenuInfoRef.current = {
      queued: true,
      targetUser,
    };
    setMenuOpen(false);
  };

  const handleCloseInfoDrawer = () => {
    dismissKeyboard();
    setAvatarPreviewOpen(false);
    setInfoDrawerOpen(false);
  };

  const handleOpenMemberInfo = (member: User) => {
    dismissKeyboard();
    setInfoDrawerUserId(getEntityId(member));
  };

  const handleBackToGroupInfo = () => {
    dismissKeyboard();
    setInfoDrawerUserId(null);
  };

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
          const shouldClose = shouldFinishBackSwipe(gestureState.dx, gestureState.vx);

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

  const handleStartVideoCall = async () => {
    if ((!currentChat?._id && !currentChat?.id) || !otherMember) {
      return;
    }

    try {
      const result = await chatsApi.startVideoCall(getEntityId(currentChat));
      navigation.navigate("PrivateMeet", {
        chatId: getEntityId(currentChat),
        roomId: result.roomId,
        title: getDirectChatUserLabel(otherMember),
        isCaller: true,
        remoteUser: otherMember,
      });
    } catch (error) {
      Alert.alert(
        "Meet ochilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    }
  };

  const handleDeleteOrLeave = () => {
    if (!currentChat) return;

    const title = isGroupOwnerLeaving ? "Guruhdan chiqish" : "Suhbatni o'chirish";
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
  };

  const handleEditGroup = async (draftData: {
    name: string;
    description: string;
    avatarUri?: string | null;
    memberIds: string[];
    admins?: any[];
  }) => {
    if (!currentChat) return;

    let nextAvatar = draftData.avatarUri || currentChat.avatar || "";
    if (nextAvatar && !nextAvatar.startsWith("http")) {
      nextAvatar = await chatsApi.updateGroupAvatar(getEntityId(currentChat), nextAvatar);
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
  };

  const openMessageMenu = (messageId: string, layout: MessageMenuLayout) => {
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
  };

  const handleMessageMenu = (messageId: string, target: View | null) => {
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

  const closeMessageMenu = () => {
    setMessageMenuOpen(false);
    Animated.timing(messageMenuAnim, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }
      setMessageMenuMounted(false);
      setSelectedMessageId(null);
      setSelectedMessageLayout(null);
    });
  };

  const handleReply = () => {
    if (!selectedMessage || selectedMessage.type !== "message") return;
    closeMessageMenu();
    void Haptics.selectionAsync();
    setEditingMessageId(null);
    setReplyingToId(selectedMessage.message.id);
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  };

  const handleSwipeReply = (message: NormalizedMessage) => {
    if (message.isDeleted) {
      return;
    }

    void Haptics.selectionAsync();
    setEditingMessageId(null);
    setReplyingToId(message.id);
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  };

  const handleEditMessage = () => {
    if (!selectedMessage || selectedMessage.type !== "message") return;
    closeMessageMenu();
    setReplyingToId(null);
    setEditingMessageId(selectedMessage.message.id);
    setDraft(selectedMessage.message.content);
  };

  const handleCopyMessage = async () => {
    if (!selectedMessage || selectedMessage.type !== "message" || !selectedMessage.message.content) {
      return;
    }

    await Clipboard.setStringAsync(selectedMessage.message.content);
    void Haptics.selectionAsync();
    closeMessageMenu();
  };

  const handleDeleteMessage = () => {
    if (!selectedMessage || selectedMessage.type !== "message") return;
    const targetId = selectedMessage.message.id;
    closeMessageMenu();
    Alert.alert("Xabarni o'chirish", "Haqiqatan ham xabarni o'chirmoqchimisiz?", [
      { text: "Bekor qilish", style: "cancel" },
      {
        text: "O'chirish",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate(targetId);
        },
      },
    ]);
  };

  const handleMentionPress = (username: string) => {
    const matchedUser =
      knownUsers.find((member) => member.username?.toLowerCase() === username.toLowerCase()) || null;

    if (matchedUser && currentChat?.isGroup) {
      setInfoDrawerUserId(getEntityId(matchedUser));
      setInfoDrawerOpen(true);
      return;
    }

    Alert.alert(
      `@${username}`,
      matchedUser
        ? `${matchedUser.nickname || matchedUser.username}\nMention aniqlandi.`
        : "Mention aniqlandi.",
    );
  };

  const clearComposerMode = () => {
    setReplyingToId(null);
    setEditingMessageId(null);
    setDraft("");
  };

  const composerContextMessage =
    editingMessage?.type === "message"
      ? editingMessage.message
      : replyingMessage?.type === "message"
        ? replyingMessage.message
        : null;

  const canEditSelectedMessage = Boolean(
    selectedMessage?.type === "message" &&
      selectedMessage.message.senderId === currentUserId &&
      !selectedMessage.message.isDeleted,
  );
  const canDeleteSelectedMessage = Boolean(
    selectedMessage?.type === "message" &&
      !selectedMessage.message.isDeleted &&
      (selectedMessage.message.senderId === currentUserId || canDeleteOthersMessages),
  );
  const canCopySelectedMessage = Boolean(
    selectedMessage?.type === "message" &&
      !selectedMessage.message.isDeleted &&
      selectedMessage.message.content,
  );
  const canReplySelectedMessage = Boolean(
    selectedMessage?.type === "message" && !selectedMessage.message.isDeleted,
  );
  const typingMembers = useMemo(
    () =>
      typingUserIds
        .map((userId) =>
          currentChat?.members?.find((member) => getEntityId(member) === userId) || null,
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
  const onlineUserIdSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);
  const isUserCurrentlyOnline = (targetUser?: User | null) => {
    const targetUserId = getEntityId(targetUser);
    if (!targetUserId) {
      return false;
    }

    if (onlineUserIdSet.has(targetUserId)) {
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

    return Date.now() - lastSeenDate.getTime() <= ONLINE_PRESENCE_WINDOW_MS;
  };
  const isOtherMemberOnline = isUserCurrentlyOnline(otherMember);
  const groupOnlineCount = useMemo(() => {
    if (!currentChat?.isGroup) {
      return 0;
    }

    return (
      currentChat.members?.filter((member) => {
        const memberId = getEntityId(member);
        return memberId && memberId !== currentUserId && isUserCurrentlyOnline(member);
      }).length || 0
    );
  }, [currentChat?.isGroup, currentChat?.members, currentUserId, onlineUserIdSet]);
  const headerStatusLabel = useMemo(() => {
    if (typingSubtitle) {
      return typingSubtitle;
    }

    if (currentChat?.isGroup) {
      const membersCount = currentChat.members?.length || 0;
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
    currentChat?.isGroup,
    currentChat?.isSavedMessages,
    currentChat?.members,
    groupOnlineCount,
    isOtherMemberOnline,
    otherMember?.isOfficialProfile,
    otherMember?.officialBadgeLabel,
    typingSubtitle,
  ]);
  const showHeaderStatusDot = Boolean(
    !typingSubtitle &&
      !currentChat?.isGroup &&
      !currentChat?.isSavedMessages &&
      !otherMember?.isOfficialProfile,
  );
  const drawerStatusLabel = useMemo(() => {
    if (drawerUser?.isOfficialProfile) {
      return drawerUser.officialBadgeLabel || "Rasmiy";
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
  }, [currentChat?.isSavedMessages, currentChat?.members?.length, drawerUser]);
  const drawerProfileMeta = useMemo(() => {
    if (drawerUser && !currentChat?.isGroup) {
      return drawerUser.bio?.trim() || drawerStatusLabel;
    }

    return drawerStatusLabel;
  }, [currentChat?.isGroup, drawerStatusLabel, drawerUser]);

  useEffect(() => {
    return () => {
      if (openInfoTimeoutRef.current) {
        clearTimeout(openInfoTimeoutRef.current);
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
    if (Platform.OS === "ios") {
      const frameChangeSubscription = Keyboard.addListener(
        "keyboardWillChangeFrame",
        (event) => {
          const overlap = Math.max(0, screenHeight - event.endCoordinates.screenY);
          setKeyboardInset(Math.max(0, overlap - insets.bottom));
          if (composerFocusedRef.current) {
            requestAnimationFrame(() => {
              scrollToLatestMessage(false);
            });
          }
        },
      );
      const hideSubscription = Keyboard.addListener("keyboardWillHide", () => {
        setKeyboardInset(0);
      });

      return () => {
        frameChangeSubscription.remove();
        hideSubscription.remove();
      };
    }

    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardInset(Math.max(0, event.endCoordinates?.height || 0));
      if (composerFocusedRef.current) {
        requestAnimationFrame(() => {
          scrollToLatestMessage(false);
        });
      }
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom, screenHeight]);

  useEffect(() => {
    const subscriptions = [
      realtime.onPresenceEvent("user_online", (payload) => {
        const onlineUserId = String(payload?.userId || "");
        if (!onlineUserId) {
          return;
        }

        setOnlineUserIds((previous) =>
          previous.includes(onlineUserId) ? previous : [...previous, onlineUserId],
        );
      }),
      realtime.onPresenceEvent("user_offline", (payload) => {
        const offlineUserId = String(payload?.userId || "");
        if (!offlineUserId) {
          return;
        }

        setOnlineUserIds((previous) => previous.filter((userId) => userId !== offlineUserId));
      }),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
    };
  }, []);

  useEffect(() => {
    const chatId = route.params.chatId;
    realtime.emitJoinChat(chatId);

    const subscriptions = [
      realtime.onChatEvent("message_new", (payload) => {
        if (String(payload?.chatId || "") !== String(chatId)) {
          return;
        }
        queryClient.setQueryData<MessagesInfiniteData>(["messages", chatId], (previous) =>
          upsertMessageInPages(previous, payload, currentUserId),
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
        queryClient.setQueryData<MessagesInfiniteData>(["messages", chatId], (previous) =>
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
        queryClient.setQueryData<MessagesInfiniteData>(["messages", chatId], (previous) =>
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

        queryClient.setQueryData<MessagesInfiniteData>(["messages", chatId], (previous) =>
          patchMessagesPages(previous, (pages) =>
            pages.map((page) => ({
              ...page,
              data: (page.data || []).map((message) => {
                const messageId = getMessageIdentity(message);
                if (!messageIds.includes(messageId)) {
                  return message;
                }

                if (getNormalizedSenderId(message.senderId) === readByUserId) {
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
                    getMessageDeliveryStatus(message) === "failed" ? "failed" : "read",
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
    const incomingMessageIds = (messagesQuery.data?.pages
      ?.flatMap((page) => page.data || []) || [])
      .filter((message) => {
        const senderId =
          typeof message.senderId === "string"
            ? message.senderId
            : getEntityId(message.senderId as User);
        return senderId && senderId !== currentUserId && !message.isDeleted;
      })
      .map((message) => getEntityId(message))
      .filter(Boolean);

    if (!incomingMessageIds.length) {
      return;
    }

    realtime.emitReadMessages(route.params.chatId, incomingMessageIds);
  }, [currentUserId, messagesQuery.data?.pages, route.params.chatId]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    setMessageListVisible(false);
  }, [route.params.chatId]);

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
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <Animated.View style={styles.container}>
        <View
          style={[
            styles.container,
            keyboardInset > 0 ? { paddingBottom: keyboardInset } : null,
          ]}
        >
        <View style={styles.header}>
          <Pressable
            style={styles.headerButton}
            onPress={() => {
              dismissKeyboard();
              navigation.goBack();
            }}
          >
            <Ionicons name="arrow-back" size={20} color={Colors.mutedText} />
          </Pressable>

          <Pressable
            style={styles.headerInfo}
            onPress={() => {
              dismissKeyboard();
              handleOpenInfo();
            }}
          >
            <Avatar
              label={chatTitle}
              uri={chatAvatarUri}
              size={40}
              isSavedMessages={Boolean(currentChat?.isSavedMessages)}
              isGroup={Boolean(currentChat?.isGroup)}
              shape="circle"
            />
            <View style={styles.headerTextWrap}>
              {otherMember && !currentChat?.isGroup ? (
                <UserDisplayName
                  user={otherMember}
                  fallback={getDirectChatUserLabel(otherMember)}
                  size="md"
                  numberOfLines={1}
                  textStyle={styles.headerTitle}
                />
              ) : (
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {chatTitle}
                </Text>
              )}
              <View style={styles.headerStatusRow}>
                {showHeaderStatusDot ? (
                  <View
                    style={[
                      styles.headerStatusDot,
                      isOtherMemberOnline
                        ? styles.headerStatusDotOnline
                        : styles.headerStatusDotOffline,
                    ]}
                  />
                ) : null}
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {headerStatusLabel}
                </Text>
              </View>
            </View>
          </Pressable>

          <View style={styles.headerActions}>
            {!currentChat?.isGroup && !currentChat?.isSavedMessages ? (
              <Pressable style={styles.headerButton} onPress={handleStartVideoCall}>
                <Video size={18} color={Colors.mutedText} />
              </Pressable>
            ) : null}

            <Pressable
              style={styles.headerButton}
              onPress={() => {
                dismissKeyboard();
                setMenuOpen(true);
              }}
            >
              <MoreVertical size={18} color={Colors.mutedText} />
            </Pressable>
          </View>
        </View>

        {messagesQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.helperText}>Xabarlar yuklanmoqda...</Text>
          </View>
        ) : messagesQuery.isError ? (
          <View style={styles.centerState}>
            <Ionicons name="alert-circle-outline" size={28} color={Colors.warning} />
            <Text style={styles.helperText}>
              {messagesQuery.error instanceof Error
                ? messagesQuery.error.message
                : "Xabarlarni olishda xatolik yuz berdi."}
            </Text>
          </View>
        ) : (
          <FlashList
            ref={listRef}
            data={messageItems}
            keyExtractor={(item) => item.id}
            initialScrollIndex={initialMessageIndex}
            drawDistance={280}
            contentContainerStyle={styles.messagesContent}
            style={!messageListVisible ? styles.messagesListHidden : undefined}
            onLoad={() => {
              if (initialScrollDoneRef.current) {
                return;
              }

              initialScrollDoneRef.current = true;
              requestAnimationFrame(() => {
                listRef.current?.scrollToEnd({ animated: false });
                requestAnimationFrame(() => {
                  setMessageListVisible(true);
                });
              });
            }}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            onStartReached={() => {
              if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
                void messagesQuery.fetchNextPage();
              }
            }}
            onStartReachedThreshold={0.15}
            ListHeaderComponent={
              messagesQuery.isFetchingNextPage ? (
                <View style={styles.historyLoader}>
                  <ActivityIndicator size="small" color={Colors.mutedText} />
                  <Text style={styles.historyLoaderText}>Oldingi xabarlar yuklanmoqda...</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              if (item.type === "date") {
                return (
                  <View style={styles.dateDivider}>
                    <Text style={styles.dateDividerText}>{item.label}</Text>
                  </View>
                );
              }

              const isMine = item.message.senderId === currentUserId;
              return (
                <ChatMessageRow
                  message={item.message}
                  isMine={isMine}
                  isGroup={Boolean(currentChat?.isGroup)}
                  onOpenMenu={handleMessageMenu}
                  onPressMention={handleMentionPress}
                  onSwipeReply={handleSwipeReply}
                  hidden={messageMenuMounted && messageMenuOpen && selectedMessageId === item.message.id}
                />
              );
            }}
          />
        )}

        <View
          style={[
            styles.composerShell,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.composerStack}>
            {composerContextMessage ? (
              <Pressable
                style={styles.composerContextCard}
                onPress={() => {
                  listRef.current?.scrollToEnd({ animated: true });
                }}
              >
                <View style={styles.composerContextTextWrap}>
                  <Text style={styles.composerContextLabel}>
                    {editingMessageId ? "Tahrirlanmoqda" : composerContextMessage.senderName}
                  </Text>
                  <Text style={styles.composerContextText} numberOfLines={1}>
                    {composerContextMessage.content}
                  </Text>
                </View>
                <Pressable onPress={clearComposerMode} style={styles.composerContextClose}>
                  <Ionicons name="close" size={16} color={Colors.mutedText} />
                </Pressable>
              </Pressable>
            ) : null}

            <View style={styles.composerField}>
              <View style={styles.composerSideLeft}>
                <Pressable style={styles.iconButton} disabled={isComposerDisabled}>
                  <Ionicons name="add" size={20} color={Colors.mutedText} />
                </Pressable>
              </View>

              <TextInput
                ref={composerInputRef}
                style={styles.composerInput}
                value={draft}
                onChangeText={setDraft}
                placeholder={
                  isComposerDisabled
                    ? "Suhbat yuklanmoqda..."
                    : editingMessageId
                      ? "Xabarni tahrirlash..."
                      : "Xabar..."
                }
                placeholderTextColor={Colors.mutedText}
                multiline
                maxLength={3000}
                editable={!isComposerDisabled}
                onFocus={() => {
                  composerFocusedRef.current = true;
                  scrollToLatestMessage(true);
                }}
                onBlur={() => {
                  composerFocusedRef.current = false;
                }}
              />

              <View style={styles.composerSideRight}>
                <Pressable
                  onPress={handleSend}
                  style={({ pressed }) => [
                    styles.sendButton,
                    !draft.trim() && styles.sendButtonHidden,
                    pressed && styles.sendButtonPressed,
                    (!draft.trim() || isSending || isComposerDisabled) &&
                      styles.sendButtonDisabled,
                  ]}
                  disabled={!draft.trim() || isSending || isComposerDisabled}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons
                      name={editingMessageId ? "checkmark" : "send"}
                      size={16}
                      color="#fff"
                    />
                  )}
                </Pressable>

                <Pressable style={styles.iconButton} disabled={isComposerDisabled}>
                  <Ionicons name="happy-outline" size={20} color={Colors.mutedText} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>
        </View>

        {messageMenuMounted && selectedMessage?.type === "message" && selectedMessageLayout ? (
          <View style={styles.messageMenuLayer} pointerEvents="box-none">
            <Pressable style={styles.messageMenuBackdropPressable} onPress={closeMessageMenu}>
              <Animated.View
                style={[
                  styles.messageMenuBackdrop,
                  { opacity: messageMenuOverlayOpacity },
                ]}
              />
            </Pressable>

            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.messageMenuPreview,
                {
                  top: selectedMessageLayout.y,
                  left: selectedMessageLayout.x,
                  width: selectedMessageLayout.width,
                  transform: [
                    { translateY: messageMenuBubbleLift },
                    { scale: messageMenuBubbleScale },
                  ],
                },
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  selectedMessageIsMine
                    ? styles.messageBubbleMine
                    : styles.messageBubbleTheirs,
                  styles.messageMenuBubbleFixed,
                  styles.messageMenuBubbleShadow,
                ]}
              >
                <MessageBubbleBody
                  message={selectedMessage.message}
                  isMine={Boolean(selectedMessageIsMine)}
                  isGroup={Boolean(currentChat?.isGroup)}
                  onPressMention={handleMentionPress}
                  selectable
                />
              </View>
            </Animated.View>

            {messageMenuActionsTop !== null && messageMenuActionsLeft !== null ? (
              <Animated.View
                style={[
                  styles.messageMenuActionBar,
                  {
                    top: messageMenuActionsTop,
                    left: messageMenuActionsLeft,
                    opacity: messageMenuOverlayOpacity,
                    transform: [{ translateY: messageMenuBubbleLift }],
                  },
                ]}
              >
                {canReplySelectedMessage ? (
                  <Pressable style={styles.messageMenuAction} onPress={handleReply}>
                    <Reply size={17} color={Colors.text} />
                    <Text style={styles.messageMenuActionText}>Javob</Text>
                  </Pressable>
                ) : null}
                {canCopySelectedMessage ? (
                  <Pressable style={styles.messageMenuAction} onPress={() => void handleCopyMessage()}>
                    <Ionicons name="copy-outline" size={17} color={Colors.text} />
                    <Text style={styles.messageMenuActionText}>Copy</Text>
                  </Pressable>
                ) : null}
                {canEditSelectedMessage ? (
                  <Pressable style={styles.messageMenuAction} onPress={handleEditMessage}>
                    <Edit2 size={17} color={Colors.text} />
                    <Text style={styles.messageMenuActionText}>Edit</Text>
                  </Pressable>
                ) : null}
                {canDeleteSelectedMessage ? (
                  <Pressable style={styles.messageMenuAction} onPress={handleDeleteMessage}>
                    <Trash2 size={17} color={Colors.danger} />
                    <Text style={[styles.messageMenuActionText, styles.messageMenuActionTextDanger]}>
                      Delete
                    </Text>
                  </Pressable>
                ) : null}
              </Animated.View>
            ) : null}
          </View>
        ) : null}
      </Animated.View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuDropdown} onStartShouldSetResponder={() => true}>
            <Pressable style={styles.menuItem} onPress={() => handleOpenInfoFromMenu()}>
              <Info size={18} color={Colors.text} />
              <Text style={styles.menuItemText}>
                {currentChat?.isGroup ? "Guruh ma'lumotlari" : "Foydalanuvchi ma'lumotlari"}
              </Text>
            </Pressable>

            {canEditGroup ? (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  setEditGroupOpen(true);
                }}
              >
                <Edit2 size={18} color={Colors.text} />
                <Text style={styles.menuItemText}>Guruhni tahrirlash</Text>
              </Pressable>
            ) : null}

            <View style={styles.menuDivider} />

            <Pressable style={styles.menuItem} onPress={handleDeleteOrLeave}>
              {isGroupOwnerLeaving ? (
                <LogOut size={18} color={Colors.danger} />
              ) : (
                <Trash2 size={18} color={Colors.danger} />
              )}
              <Text style={[styles.menuItemText, { color: Colors.danger }]}>
                {isGroupOwnerLeaving ? "Guruhni tark etish" : "Suhbatni o'chirish"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {infoPageMounted ? (
        <View style={styles.infoPageRoot} pointerEvents="box-none">
          <Animated.View
            pointerEvents="none"
            style={[styles.infoPageBackdrop, { opacity: infoPageBackdropOpacity }]}
          />

          <Animated.View
            style={[
              styles.infoPagePanel,
              {
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
                transform: [{ translateX: infoPageTranslateX }],
              },
            ]}
            {...infoPagePanResponder.panHandlers}
          >
            <View
              style={styles.infoPageSafeArea}
              {...infoPagePanResponder.panHandlers}
            >
                <View style={styles.infoPageHeader}>
                  <Pressable
                    style={styles.headerButton}
                    onPress={
                      isViewingGroupMemberInfo ? handleBackToGroupInfo : handleCloseInfoDrawer
                    }
                  >
                    <Ionicons
                      name={isViewingGroupMemberInfo ? "chevron-back" : "chevron-back"}
                      size={20}
                      color={Colors.mutedText}
                    />
                  </Pressable>

                  <Text style={styles.infoPageTitle} numberOfLines={1}>
                    {drawerTitle}
                  </Text>

                  {!drawerUser && canEditGroup ? (
                    <Pressable
                      style={styles.headerButton}
                      onPress={() => {
                        handleCloseInfoDrawer();
                        setEditGroupOpen(true);
                      }}
                    >
                      <Edit2 size={18} color={Colors.mutedText} />
                    </Pressable>
                  ) : (
                    <View style={styles.infoPageSpacer} />
                  )}
                </View>

              <ScrollView
                style={styles.infoPageScroll}
                contentContainerStyle={styles.infoPageContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                alwaysBounceVertical={false}
                overScrollMode="never"
                {...infoPagePanResponder.panHandlers}
              >
                  <View style={styles.infoProfileBlock}>
                    <Pressable
                      style={styles.infoAvatarButton}
                      disabled={!drawerAvatarUri}
                      onPress={() => {
                        if (drawerAvatarUri) {
                          setAvatarPreviewOpen(true);
                        }
                      }}
                    >
                      <Avatar
                        label={getDirectChatUserLabel(drawerUser) || chatTitle}
                        uri={drawerAvatarUri}
                        size={96}
                        isSavedMessages={Boolean(currentChat?.isSavedMessages && !drawerUser)}
                        isGroup={Boolean(currentChat?.isGroup && !drawerUser)}
                        shape="circle"
                      />
                    </Pressable>
                    {drawerUser ? (
                      <View style={styles.infoProfileNameWrap}>
                        <UserDisplayName
                          user={drawerUser}
                          fallback={getDirectChatUserLabel(drawerUser)}
                          size="lg"
                          numberOfLines={2}
                          textStyle={styles.infoProfileName}
                          containerStyle={styles.infoProfileNameContainer}
                        />
                      </View>
                    ) : (
                      <Text style={styles.infoProfileName}>{chatTitle}</Text>
                    )}
                    <Text style={styles.infoProfileMeta}>{drawerProfileMeta}</Text>
                  </View>

                  {drawerUser ? (
                    <View style={styles.infoCard}>
                      {drawerUser.username ? (
                        <>
                          <View style={styles.infoItem}>
                            <Text style={styles.infoLabel}>FOYDALANUVCHI NOMI</Text>
                            <Text style={styles.infoValue}>@{drawerUser.username}</Text>
                          </View>
                          <View style={styles.infoDivider} />
                        </>
                      ) : null}

                      {currentChat?.isGroup && drawerUser.bio ? (
                        <>
                          <View style={styles.infoItem}>
                            <Text style={styles.infoLabel}>TARJIMAYI HOL</Text>
                            <MessageRichText
                              content={drawerUser.bio}
                              onPressMention={handleMentionPress}
                            />
                          </View>
                          <View style={styles.infoDivider} />
                        </>
                      ) : null}

                      {drawerUser.jammId ? (
                        <>
                          <View style={styles.infoItem}>
                            <Text style={styles.infoLabel}>JAMM ID</Text>
                            <Text style={styles.infoValue}>#{drawerUser.jammId}</Text>
                          </View>
                          <View style={styles.infoDivider} />
                        </>
                      ) : null}

                      {currentChat?.isGroup ? (
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>HOLAT</Text>
                          <Text style={styles.infoValue}>{drawerStatusLabel}</Text>
                        </View>
                      ) : !drawerUser.bio ? (
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>BIO</Text>
                          <Text style={styles.infoValue}>Bio yo'q</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <>
                      <View style={styles.infoCard}>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>A'ZOLAR</Text>
                          <Text style={styles.infoValue}>
                            {currentChat?.members?.length || 0} ta
                          </Text>
                        </View>

                        {currentChat?.description ? (
                          <>
                            <View style={styles.infoDivider} />
                            <View style={styles.infoItem}>
                              <Text style={styles.infoLabel}>TASNIF</Text>
                              <MessageRichText
                                content={currentChat.description}
                                onPressMention={handleMentionPress}
                              />
                            </View>
                          </>
                        ) : null}

                        {currentChat?.urlSlug || currentChat?.privateurl ? (
                          <>
                            <View style={styles.infoDivider} />
                            <View style={styles.infoItem}>
                              <Text style={styles.infoLabel}>CHAT MANZILI</Text>
                              <Text style={styles.infoValue}>
                                /{currentChat.privateurl || currentChat.urlSlug}
                              </Text>
                            </View>
                          </>
                        ) : null}
                      </View>

                      <View style={styles.infoSection}>
                        <Text style={styles.infoSectionTitle}>A'zolar</Text>
                        <View style={styles.infoMembersList}>
                          {currentChat?.members?.map((member) => {
                            const memberId = getEntityId(member);
                            const isOwner = String(currentChat.createdBy || "") === memberId;
                            const isAdmin = Boolean(
                              currentChat.admins?.some(
                                (admin) => (admin.userId || admin.id || admin._id) === memberId,
                              ),
                            );

                            return (
                              <Pressable
                                key={memberId}
                                style={styles.memberRow}
                                onPress={() => handleOpenMemberInfo(member)}
                              >
                                <View style={styles.memberRowMain}>
                                  <Avatar
                                    label={member.nickname || member.username || "User"}
                                    uri={member.avatar}
                                    size={42}
                                    shape="circle"
                                  />
                                  <View style={styles.memberTextWrap}>
                                    <UserDisplayName
                                      user={member}
                                      fallback={member.nickname || member.username || "User"}
                                      size="sm"
                                      textStyle={styles.memberName}
                                    />
                                    <Text style={styles.memberMetaText}>
                                      {member.isOfficialProfile
                                        ? member.officialBadgeLabel || "Rasmiy"
                                        : member.username
                                          ? `@${member.username}`
                                          : "Foydalanuvchi"}
                                    </Text>
                                  </View>
                                </View>
                                {isOwner ? (
                                  <Text style={styles.memberRoleBadge}>Ega</Text>
                                ) : isAdmin ? (
                                  <Text style={styles.memberRoleBadge}>Admin</Text>
                                ) : (
                                  <Ionicons
                                    name="chevron-forward"
                                    size={16}
                                    color={Colors.subtleText}
                                  />
                                )}
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  )}
              </ScrollView>
            </View>
          </Animated.View>
        </View>
      ) : null}

      <Modal
        visible={avatarPreviewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarPreviewOpen(false)}
      >
        <Pressable
          style={styles.avatarPreviewOverlay}
          onPress={() => setAvatarPreviewOpen(false)}
        >
          {drawerAvatarUri ? (
            <Image
              source={{ uri: drawerAvatarUri }}
              style={styles.avatarPreviewImage}
              contentFit="contain"
            />
          ) : null}
        </Pressable>
      </Modal>

      <EditGroupDialog
        visible={editGroupOpen}
        group={currentChat}
        users={knownUsers}
        onClose={() => setEditGroupOpen(false)}
        onSave={handleEditGroup}
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
    marginVertical: 16,
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
    backgroundColor: Colors.hover,
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
    zIndex: 25,
    elevation: 25,
  },
  messageMenuBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  messageMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  messageMenuPreview: {
    position: "absolute",
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
    width: 176,
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
  composerShell: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  composerStack: {
    gap: 8,
  },
  composerField: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.input,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    opacity: 1,
  },
  iconButton: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  composerSideLeft: {
    minWidth: 20,
    marginRight: 16,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  composerSideRight: {
    minWidth: 72,
    marginLeft: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 16,
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
    lineHeight: 25,
    minHeight: 25,
    maxHeight: 120,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
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
    backgroundColor: Colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  infoItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  infoLabel: {
    color: Colors.subtleText,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  infoValue: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
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
