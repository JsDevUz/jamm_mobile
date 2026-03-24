import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  InputAccessoryView,
  Keyboard,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Switch,
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
import type { FlashListRef, ViewToken } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as Notifications from "expo-notifications";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import {
  ChevronDown,
  Check,
  CheckCheck,
  Edit2,
  Info,
  LogOut,
  MoreVertical,
  Phone,
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
import { CHAT_EMOJI_SECTIONS } from "./constants/emojis";
import { APP_BASE_URL } from "../../config/env";
import { chatsApi } from "../../lib/api";
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
  setActiveNotificationChatId,
} from "../../lib/notifications";
import { realtime } from "../../lib/realtime";
import type { RootStackParamList } from "../../navigation/types";
import {
  openJammAwareLink,
  openJammProfileMention,
} from "../../navigation/internalLinks";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type { ChatSummary, Message, User } from "../../types/entities";
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

const MESSAGE_MENU_SCREEN_PADDING = 12;
const MESSAGE_MENU_GAP = 14;
const MESSAGE_MENU_WIDTH = 188;
const MESSAGE_MENU_ITEM_HEIGHT = 46;
const MESSAGE_MENU_ACTION_GAP = 4;
const MESSAGE_MENU_ACTIONS_PADDING = 6;
const DEFAULT_STICKER_PICKER_HEIGHT = 320;

type MessagesInfiniteData = InfiniteData<{
  data?: Message[];
  nextCursor?: string | null;
  hasMore?: boolean;
}, string | null>;

const ONLINE_PRESENCE_WINDOW_MS = 45_000;
const PRESENCE_RESYNC_INTERVAL_MS = 15_000;
const NEW_MESSAGES_BOTTOM_THRESHOLD = 96;
const IOS_CHAT_COMPOSER_ACCESSORY_ID = "chat-composer-accessory";

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

const upsertChatSummary = (current: ChatSummary[], nextChat: ChatSummary) => {
  const nextChatId = getEntityId(nextChat);
  if (!nextChatId) {
    return current;
  }

  const existingIndex = current.findIndex((chat) => getEntityId(chat) === nextChatId);
  if (existingIndex === -1) {
    return [nextChat, ...current];
  }

  const nextChats = [...current];
  nextChats.splice(existingIndex, 1);
  nextChats.unshift({
    ...current[existingIndex],
    ...nextChat,
  });
  return nextChats;
};

const updateChatPushNotificationsInList = (
  current: ChatSummary[] | undefined,
  chatId: string,
  enabled: boolean,
) =>
  (current || []).map((chat) =>
    getEntityId(chat) === chatId
      ? {
          ...chat,
          pushNotificationsEnabled: enabled,
        }
      : chat,
  );

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
  const urlRegex = /((?:https?:\/\/[^\s]+)|(?:(?:www\.)?jamm\.uz(?:\/[^\s]*)?))/gi;
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
                void openJammAwareLink(part.url).catch(() => {
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
  onPressReplyPreview,
  onLongPress,
  selectable = false,
}: {
  message: NormalizedMessage;
  isMine: boolean;
  isGroup: boolean;
  onPressMention: (username: string) => void;
  onPressReplyPreview?: (messageId: string) => void;
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
        <Pressable
          disabled={!getMessageIdentity(message.replayTo)}
          onPress={() => {
            const targetMessageId = getMessageIdentity(message.replayTo);
            if (targetMessageId) {
              onPressReplyPreview?.(targetMessageId);
            }
          }}
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
        </Pressable>
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
  onPressReplyPreview,
  onSwipeReply,
  highlightPulseKey = 0,
  hidden = false,
}: {
  message: NormalizedMessage;
  isMine: boolean;
  isGroup: boolean;
  onOpenMenu: (messageId: string, target: View | null) => void;
  onPressMention: (username: string) => void;
  onPressReplyPreview: (messageId: string) => void;
  onSwipeReply: (message: NormalizedMessage) => void;
  highlightPulseKey?: number;
  hidden?: boolean;
}) {
  const swipeReplyDisabled = Boolean(message.isDeleted);
  const gestureTranslateX = useRef(new Animated.Value(0)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;
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
  const highlightedBubbleStyle = useMemo(
    () => ({
      backgroundColor: highlightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [Colors.input, isMine ? "rgba(88,101,242,0.34)" : "rgba(88,101,242,0.22)"],
      }),
      transform: [
        {
          scale: highlightAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.018],
          }),
        },
      ],
      borderColor: highlightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["transparent", "rgba(88,101,242,0.55)"],
      }),
      borderWidth: highlightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    }),
    [highlightAnim, isMine],
  );

  useEffect(() => {
    if (!highlightPulseKey) {
      return;
    }

    highlightAnim.stopAnimation();
    highlightAnim.setValue(0);
    Animated.sequence([
      Animated.timing(highlightAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.delay(700),
      Animated.timing(highlightAnim, {
        toValue: 0,
        duration: 360,
        useNativeDriver: false,
      }),
    ]).start();
  }, [highlightAnim, highlightPulseKey]);

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
            <Animated.View
              ref={bubbleRef}
              style={[
                styles.messageBubble,
                isMine ? styles.messageBubbleMine : styles.messageBubbleTheirs,
                highlightedBubbleStyle,
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
                  onPressReplyPreview={onPressReplyPreview}
                  onLongPress={() => onOpenMenu(message.id, bubbleRef.current)}
                />
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

export function ChatScreen({ navigation, route }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const useKeyboardAvoidingBody = false;
  const useAnimatedKeyboardOffset = Platform.OS === "ios" && !isWeb;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const currentUserId = getEntityId(user);
  const [draft, setDraft] = useState("");
  const [composerHeight, setComposerHeight] = useState(66);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [keyboardLayoutOffset, setKeyboardLayoutOffset] = useState(0);
  const [stickerPickerVisible, setStickerPickerVisible] = useState(false);
  const [stickerToKeyboardTransition, setStickerToKeyboardTransition] = useState(false);
  const [closedToKeyboardTransition, setClosedToKeyboardTransition] = useState(false);
  const [composerSoftInputEnabled, setComposerSoftInputEnabled] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);
  const [infoDrawerUserId, setInfoDrawerUserId] = useState<string | null>(null);
  const [infoPageMounted, setInfoPageMounted] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [messageMenuOpen, setMessageMenuOpen] = useState(false);
  const [messageMenuMounted, setMessageMenuMounted] = useState(false);
  const [messageListVisible, setMessageListVisible] = useState(false);
  const [chatCacheHydrated, setChatCacheHydrated] = useState(false);
  const [messagesCacheHydrated, setMessagesCacheHydrated] = useState(false);
  const [savedScrollOffset, setSavedScrollOffset] = useState<number | null>(null);
  const [pendingNewMessageIds, setPendingNewMessageIds] = useState<string[]>([]);
  const [visibleMessageIds, setVisibleMessageIds] = useState<string[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [highlightPulseKey, setHighlightPulseKey] = useState(0);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessageLayout, setSelectedMessageLayout] = useState<MessageMenuLayout | null>(
    null,
  );
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>(() => realtime.getOnlineUserIds());
  const useIosInputAccessoryComposer =
    Platform.OS === "ios" &&
    !isWeb &&
    keyboardInset > 0 &&
    !stickerPickerVisible &&
    !stickerToKeyboardTransition;
  const [outgoingCall, setOutgoingCall] = useState<{
    roomId: string;
    remoteUser: User;
    chatId: string;
  } | null>(null);
  const outgoingCallRef = useRef<{
    roomId: string;
    remoteUser: User;
    chatId: string;
  } | null>(null);
  const listRef = useRef<FlashListRef<MessageListItem>>(null);
  const messageItemsRef = useRef<MessageListItem[]>([]);
  const hasNextPageRef = useRef(false);
  const messageHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composerInputRef = useRef<NativeTextInput>(null);
  const composerFocusedRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openInfoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMenuInfoRef = useRef<{
    queued: boolean;
    targetUser?: User | null;
  }>({ queued: false, targetUser: undefined });
  const initialScrollDoneRef = useRef(false);
  const scrollOffsetRef = useRef(0);
  const scrollRestorePendingRef = useRef<number | null>(null);
  const scrollPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousLastMessageIdRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);
  const messageMenuAnim = useRef(new Animated.Value(0)).current;
  const accessoryHeightAnim = useRef(new Animated.Value(0)).current;
  const infoPageTranslateX = useRef(new Animated.Value(screenWidth)).current;
  const infoPageBackdropOpacity = useRef(new Animated.Value(0)).current;
  const infoPageStartXRef = useRef(screenWidth);
  const lastKeyboardInsetRef = useRef(0);
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
          Boolean(chat.isGroup) === Boolean(route.params.isGroup) &&
          (
          getEntityId(chat) === route.params.chatId ||
          chat.privateurl === route.params.chatId ||
          chat.urlSlug === route.params.chatId
          ),
      ) || null,
    [chatsQuery.data, route.params.chatId, route.params.isGroup],
  );
  const hasChatsSnapshot = Array.isArray(chatsQuery.data);
  const isGroupChat = Boolean(currentChat?.isGroup ?? route.params.isGroup);

  const chatTitle = currentChat
    ? getChatTitle(currentChat, currentUserId, user)
    : route.params.title;
  const chatAvatarUri = currentChat ? getChatAvatarUri(currentChat, currentUserId, user) : null;
  const otherMember = currentChat ? getOtherMember(currentChat, currentUserId, user) : null;
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
  const currentChatMemberIds = useMemo(
    () =>
      Array.from(
        new Set(
          (currentChat?.members || [])
            .map((member) => getEntityId(member))
            .filter((memberId) => memberId && memberId !== currentUserId),
        ),
      ),
    [currentChat?.members, currentUserId],
  );

  const myAdminRecord = currentChat?.admins?.find(
    (admin) => (admin.userId || admin.id || admin._id) === currentUserId,
  );
  const canEditGroup =
    isGroupChat &&
    (String(currentChat?.createdBy || "") === currentUserId ||
      Boolean(myAdminRecord?.permissions?.length));
  const groupLinkSlug = String(currentChat?.privateurl || currentChat?.urlSlug || "").trim();
  const groupLinkUrl = groupLinkSlug
    ? `${APP_BASE_URL}/${groupLinkSlug.replace(/^\/+/, "")}`
    : "";
  const canDeleteOthersMessages =
    String(currentChat?.createdBy || "") === currentUserId ||
    Boolean(myAdminRecord?.permissions?.includes("delete_others_messages"));
  const isGroupOwnerLeaving =
    isGroupChat &&
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
  const drawerUser = isGroupChat ? infoDrawerUser : otherMember;
  const drawerAvatarUri = drawerUser?.avatar || chatAvatarUri || null;
  const drawerTitle = drawerUser
    ? "Foydalanuvchi ma'lumotlari"
    : currentChat?.isSavedMessages
      ? "Saved Messages"
      : "Guruh ma'lumotlari";

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

    void saveCachedChats(currentUserId, chatsQuery.data || []).catch((error) => {
      console.warn("Failed to persist chats cache", error);
    });
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
  const hasMessagesSnapshot = Boolean(messagesQuery.data);

  const messagesPages = messagesQuery.data?.pages || [];
  const flatMessages = useMemo(
    () => [...messagesPages].reverse().flatMap((page) => page.data || []),
    [messagesPages],
  );
  const messageItems = useMemo(() => {
    return buildMessageItems(flatMessages);
  }, [flatMessages]);
  useEffect(() => {
    messageItemsRef.current = messageItems;
  }, [messageItems]);
  useEffect(() => {
    hasNextPageRef.current = Boolean(messagesQuery.hasNextPage);
  }, [messagesQuery.hasNextPage]);
  useEffect(() => {
    return () => {
      if (messageHighlightTimeoutRef.current) {
        clearTimeout(messageHighlightTimeoutRef.current);
        messageHighlightTimeoutRef.current = null;
      }
    };
  }, []);
  const stickyDateHeaderIndices = useMemo(() => {
    return messageItems.reduce<number[]>((indices, item, index) => {
      if (item.type === "date") {
        indices.push(index);
      }
      return indices;
    }, []);
  }, [messageItems]);
  const initialMessageIndex =
    !initialScrollDoneRef.current &&
    savedScrollOffset === null &&
    messageItems.length > 0
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

  const chatPushNotificationsMutation = useMutation({
    mutationFn: ({ chatId, enabled }: { chatId: string; enabled: boolean }) =>
      chatsApi.updatePushNotifications(chatId, enabled),
    onMutate: async ({ chatId, enabled }) => {
      const previousChats = queryClient.getQueryData<ChatSummary[]>(["chats"]);
      queryClient.setQueryData<ChatSummary[]>(
        ["chats"],
        updateChatPushNotificationsInList(previousChats, chatId, enabled),
      );
      return { previousChats };
    },
    onError: (error, _variables, context) => {
      if (context?.previousChats) {
        queryClient.setQueryData(["chats"], context.previousChats);
      }
      Alert.alert(
        "Bildirishnoma sozlanmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    },
  });

  const isSending = sendMutation.isPending || editMutation.isPending;
  const isComposerDisabled = messagesQuery.isLoading;
  const dismissKeyboard = (options?: { preserveStickerPicker?: boolean }) => {
    composerFocusedRef.current = false;
    composerInputRef.current?.blur();
    Keyboard.dismiss();
    if (!options?.preserveStickerPicker && stickerPickerVisible) {
      hideStickerPicker(false);
    }
  };
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
  const handleMessagesScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextOffset = Math.max(0, event.nativeEvent.contentOffset?.y || 0);
    scrollOffsetRef.current = nextOffset;

    const contentHeight = Math.max(0, event.nativeEvent.contentSize?.height || 0);
    const viewportHeight = Math.max(0, event.nativeEvent.layoutMeasurement?.height || 0);
    const distanceToBottom = Math.max(0, contentHeight - viewportHeight - nextOffset);
    shouldStickToBottomRef.current = distanceToBottom <= NEW_MESSAGES_BOTTOM_THRESHOLD;

    if (shouldStickToBottomRef.current) {
      setPendingNewMessageIds([]);
    }
  };
  const scrollToLatestMessage = (animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  };
  const handleJumpToLatestMessages = () => {
    shouldStickToBottomRef.current = true;
    setPendingNewMessageIds([]);
    scrollToLatestMessage(true);
  };
  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken<MessageListItem>> }) => {
      const nextVisibleIds = viewableItems
        .map((token) => token.item)
        .filter((item): item is Extract<MessageListItem, { type: "message" }> => item?.type === "message")
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
  const animateAccessoryHeight = useCallback(
    (toValue: number, duration = 220) => {
      accessoryHeightAnim.stopAnimation();
      Animated.timing(accessoryHeightAnim, {
        toValue,
        duration,
        useNativeDriver: false,
      }).start();
    },
    [accessoryHeightAnim],
  );
  const getStickerPickerHeight = useCallback(() => {
    const rememberedKeyboardHeight = Math.max(0, lastKeyboardInsetRef.current || 0);
    if (rememberedKeyboardHeight > 0) {
      return rememberedKeyboardHeight;
    }

    const estimatedKeyboardHeight = Math.round(
      screenHeight * (Platform.OS === "ios" ? 0.42 : 0.38),
    );
    return Math.max(DEFAULT_STICKER_PICKER_HEIGHT, estimatedKeyboardHeight);
  }, [screenHeight]);
  const beginClosedToKeyboardTransition = useCallback(() => {
    if (
      Platform.OS !== "android" ||
      isWeb ||
      keyboardInset > 0 ||
      stickerPickerVisible ||
      stickerToKeyboardTransition
    ) {
      return;
    }

    setClosedToKeyboardTransition(true);
    animateAccessoryHeight(getStickerPickerHeight(), 140);
  }, [
    animateAccessoryHeight,
    getStickerPickerHeight,
    isWeb,
    keyboardInset,
    stickerPickerVisible,
    stickerToKeyboardTransition,
  ]);
  const hideStickerPicker = useCallback(
    (focusInput = false) => {
      setStickerPickerVisible(false);
      setComposerSoftInputEnabled(true);

      if (isWeb) {
        setStickerToKeyboardTransition(false);
        setClosedToKeyboardTransition(false);
        animateAccessoryHeight(0, 120);
        if (focusInput) {
          requestAnimationFrame(() => {
            composerInputRef.current?.focus();
          });
        }
        return;
      }

      if (Platform.OS === "android" && focusInput) {
        setStickerToKeyboardTransition(false);
        setClosedToKeyboardTransition(false);
        animateAccessoryHeight(0, 120);
        requestAnimationFrame(() => {
          composerInputRef.current?.blur();
          composerInputRef.current?.focus();
        });
        return;
      }

      if (focusInput) {
        setStickerToKeyboardTransition(true);
        requestAnimationFrame(() => {
          composerInputRef.current?.blur();
          composerInputRef.current?.focus();
        });
        return;
      }

      setStickerToKeyboardTransition(false);
      setClosedToKeyboardTransition(false);
      if (keyboardInset <= 0) {
        animateAccessoryHeight(0);
      }
    },
    [animateAccessoryHeight, isWeb, keyboardInset],
  );
  const openStickerPicker = useCallback(() => {
    const nextHeight = getStickerPickerHeight();
    setStickerToKeyboardTransition(false);
    setClosedToKeyboardTransition(false);
    setStickerPickerVisible(true);
    setComposerSoftInputEnabled(false);
    composerFocusedRef.current = false;
    composerInputRef.current?.blur();
    animateAccessoryHeight(nextHeight);
    Keyboard.dismiss();
    scrollToLatestMessage(false);
  }, [animateAccessoryHeight, getStickerPickerHeight, scrollToLatestMessage]);
  const toggleStickerPicker = useCallback(() => {
    if (stickerPickerVisible) {
      hideStickerPicker(true);
      return;
    }

    openStickerPicker();
  }, [hideStickerPicker, openStickerPicker, stickerPickerVisible]);

  const handleSendContent = async (content: string) => {
    const trimmedContent = content.trim();
    if (!trimmedContent || isSending || isComposerDisabled) {
      return;
    }

    await Haptics.selectionAsync();

    if (editingMessageId) {
      editMutation.mutate(
        { messageId: editingMessageId, content: trimmedContent },
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
      content: trimmedContent,
      replyToMessage,
      currentUser: user,
    });

    setDraft("");
    setReplyingToId(null);
    sendMutation.mutate({
      content: trimmedContent,
      replayToId: replyingToId,
      optimisticMessage,
    });
    scrollToLatestMessage(true);
  };

  const handleSend = async () => {
    await handleSendContent(draft);
  };
  const handleAttachmentPress = async () => {
    await Haptics.selectionAsync();
    Alert.alert("Rasm yuborish", "Bu funksiya tez orada qo'shiladi.");
  };
  const handleVoiceMessagePress = async () => {
    await Haptics.selectionAsync();
    Alert.alert("Ovozli xabar", "Ovozli xabar yuborish yaqinda qo'shiladi.");
  };
  const handleStickerPress = async (sticker: string) => {
    await handleSendContent(sticker);
  };
  const hasComposerText = Boolean(draft.trim());
  const isComposerInputEditable = !isComposerDisabled && composerSoftInputEnabled;
  const isStickerPanelActive = stickerPickerVisible;

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

        queryClient.setQueryData<ChatSummary[]>(["chats"], (current) =>
          upsertChatSummary(Array.isArray(current) ? current : [], privateChat),
        );
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
          error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
        );
      }
    },
    [currentUserId, navigation, queryClient, user],
  );

  const handleBackToGroupInfo = () => {
    dismissKeyboard();
    setInfoDrawerUserId(null);
  };

  useEffect(() => {
    outgoingCallRef.current = outgoingCall;
  }, [outgoingCall]);

  useEffect(() => {
    if (!outgoingCall) {
      return;
    }

    const subscriptions = [
      realtime.onPresenceEvent("call:accepted", (payload) => {
        if (String(payload?.roomId || "") !== outgoingCall.roomId) {
          return;
        }

        const remoteUser = outgoingCall.remoteUser;
        outgoingCallRef.current = null;
        setOutgoingCall(null);
        navigation.navigate("PrivateMeet", {
          chatId: outgoingCall.chatId,
          roomId: outgoingCall.roomId,
          title: getDirectChatUserLabel(remoteUser),
          isCaller: true,
          remoteUser,
          requestAlreadySent: true,
        });
      }),
      realtime.onPresenceEvent("call:rejected", (payload) => {
        if (String(payload?.roomId || "") !== outgoingCall.roomId) {
          return;
        }

        outgoingCallRef.current = null;
        setOutgoingCall(null);
        Alert.alert("Private meet", "Qo'ng'iroq rad etildi");
      }),
      realtime.onPresenceEvent("call:cancelled", (payload) => {
        if (String(payload?.roomId || "") !== outgoingCall.roomId) {
          return;
        }

        outgoingCallRef.current = null;
        setOutgoingCall(null);
      }),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [navigation, outgoingCall]);

  useEffect(() => {
    return () => {
      const activeOutgoingCall = outgoingCallRef.current;
      if (!activeOutgoingCall) {
        return;
      }

      const remoteUserId = getEntityId(activeOutgoingCall.remoteUser);
      if (remoteUserId) {
        realtime.emitCallCancel(remoteUserId, activeOutgoingCall.roomId);
      }
    };
  }, []);

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

    if (!isOtherMemberOnline) {
      Alert.alert("Private meet", "Qo'ng'iroq qilish uchun foydalanuvchi online bo'lishini kuting.");
      return;
    }

    try {
      const chatId = getEntityId(currentChat);
      const activeCall = await chatsApi.getCallStatus(chatId);
      const canReuseOwnActiveCall =
        Boolean(activeCall.active && activeCall.roomId) &&
        String(activeCall.creatorId || "") === currentUserId;
      const result = canReuseOwnActiveCall
        ? { roomId: String(activeCall.roomId || "") }
        : await chatsApi.startVideoCall(chatId);

      realtime.emitCallRequest(getEntityId(otherMember), result.roomId, "video");
      const nextOutgoingCall = {
        roomId: result.roomId,
        remoteUser: otherMember,
        chatId,
      };
      outgoingCallRef.current = nextOutgoingCall;
      setOutgoingCall(nextOutgoingCall);
    } catch (error) {
      Alert.alert(
        "Private meet ochilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    }
  };

  const handleCancelOutgoingCall = useCallback(async () => {
    if (!outgoingCall) {
      return;
    }

    const remoteUserId = getEntityId(outgoingCall.remoteUser);
    if (remoteUserId) {
      realtime.emitCallCancel(remoteUserId, outgoingCall.roomId);
    }
    try {
      await chatsApi.endVideoCall(outgoingCall.chatId);
    } catch {
      // noop
    }
    outgoingCallRef.current = null;
    setOutgoingCall(null);
  }, [outgoingCall]);

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

  const handleScrollToRepliedMessage = useCallback(
    async (targetMessageId: string) => {
      if (!targetMessageId) {
        return;
      }

      const findTargetIndex = () =>
        messageItemsRef.current.findIndex(
          (item) => item.type === "message" && item.message.id === targetMessageId,
        );

      let targetIndex = findTargetIndex();
      let attempts = 0;

      while (targetIndex === -1 && hasNextPageRef.current && attempts < 8) {
        await messagesQuery.fetchNextPage();
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
    [messagesQuery],
  );

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

  const handleCopyGroupLink = async () => {
    if (!groupLinkUrl) {
      return;
    }

    await Clipboard.setStringAsync(groupLinkUrl);
    void Haptics.selectionAsync();
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
    void openJammProfileMention(username).catch(() => {
      Alert.alert("Profil ochilmadi", `@${username}`);
    });
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
  const messageMenuActionCount = [
    canReplySelectedMessage,
    canCopySelectedMessage,
    canEditSelectedMessage,
    canDeleteSelectedMessage,
  ].filter(Boolean).length;
  const messageMenuPosition = useMemo(() => {
    if (!selectedMessageLayout || messageMenuActionCount === 0) {
      return null;
    }

    const overlayHeight = screenHeight - insets.top - insets.bottom;
    const menuHeight =
      MESSAGE_MENU_ACTIONS_PADDING * 2 +
      messageMenuActionCount * MESSAGE_MENU_ITEM_HEIGHT +
      Math.max(0, messageMenuActionCount - 1) * MESSAGE_MENU_ACTION_GAP;
    const maxPreviewTop =
      overlayHeight -
      MESSAGE_MENU_SCREEN_PADDING -
      menuHeight -
      MESSAGE_MENU_GAP -
      selectedMessageLayout.height;
    const previewTop = Math.max(
      MESSAGE_MENU_SCREEN_PADDING,
      Math.min(selectedMessageLayout.y, maxPreviewTop),
    );
    const idealLeft = selectedMessageIsMine
      ? selectedMessageLayout.x + selectedMessageLayout.width - MESSAGE_MENU_WIDTH
      : selectedMessageLayout.x;
    const actionsLeft = Math.max(
      MESSAGE_MENU_SCREEN_PADDING,
      Math.min(screenWidth - MESSAGE_MENU_WIDTH - MESSAGE_MENU_SCREEN_PADDING, idealLeft),
    );

    return {
      previewTop,
      actionsTop: previewTop + selectedMessageLayout.height + MESSAGE_MENU_GAP,
      actionsLeft,
    };
  }, [
    insets.bottom,
    insets.top,
    messageMenuActionCount,
    screenHeight,
    screenWidth,
    selectedMessageIsMine,
    selectedMessageLayout,
  ]);
  const messageMenuPreviewTranslateTo =
    selectedMessageLayout && messageMenuPosition
      ? messageMenuPosition.previewTop - selectedMessageLayout.y
      : 0;
  const messageMenuBubbleLift = messageMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, messageMenuPreviewTranslateTo],
    extrapolate: "clamp",
  });
  const messageMenuBubbleScale = messageMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
    extrapolate: "clamp",
  });
  const messageMenuActionsTranslateY = messageMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
    extrapolate: "clamp",
  });
  const messageMenuActionsScale = messageMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
    extrapolate: "clamp",
  });
  const messageMenuOverlayOpacity = messageMenuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
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

    return Date.now() - lastSeenDate.getTime() <= ONLINE_PRESENCE_WINDOW_MS;
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
        return memberId && memberId !== currentUserId && isUserCurrentlyOnline(member);
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
    currentChat?.isGroup,
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
  }, [
    currentChat?.isSavedMessages,
    currentChat?.members?.length,
    drawerUser,
    isDrawerUserOnline,
  ]);
  const drawerProfileMeta = useMemo(() => {
    if (drawerUser && !currentChat?.isGroup) {
      return drawerUser.bio?.trim() || drawerStatusLabel;
    }

    return drawerStatusLabel;
  }, [currentChat?.isGroup, drawerStatusLabel, drawerUser]);
  const chatPushNotificationsEnabled = currentChat?.pushNotificationsEnabled !== false;
  const showChatPushNotificationsToggle = Boolean(
    currentChat &&
      !currentChat.isSavedMessages &&
      (!drawerUser || !currentChat.isGroup),
  );
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
    if (isWeb) {
      return;
    }

    if (Platform.OS === "ios") {
      const frameChangeSubscription = Keyboard.addListener(
        "keyboardWillChangeFrame",
        (event) => {
          const overlap = Math.max(0, screenHeight - event.endCoordinates.screenY);
          const nextInset = Math.max(0, overlap);
          const duration = typeof event.duration === "number" ? event.duration : 220;
          Keyboard.scheduleLayoutAnimation(event);
          setKeyboardInset(nextInset);
          setKeyboardLayoutOffset(nextInset);
          if (nextInset > 0) {
            lastKeyboardInsetRef.current = nextInset;
            setClosedToKeyboardTransition(false);
          }
          if (stickerToKeyboardTransition) {
            animateAccessoryHeight(0, duration);
            return;
          }
          if (stickerPickerVisible && nextInset <= 0) {
            animateAccessoryHeight(getStickerPickerHeight(), duration);
          } else {
            animateAccessoryHeight(0, duration);
          }
        },
      );
      const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
        const nextInset = Math.max(0, event.endCoordinates?.height || 0);
        setKeyboardInset(nextInset);
        setKeyboardLayoutOffset(nextInset);
        if (nextInset > 0) {
          lastKeyboardInsetRef.current = nextInset;
        }
        setStickerToKeyboardTransition(false);
        setClosedToKeyboardTransition(false);
        animateAccessoryHeight(0, 120);
      });
      const hideSubscription = Keyboard.addListener("keyboardWillHide", () => {
        setKeyboardInset(0);
        setKeyboardLayoutOffset(0);
        if (!stickerPickerVisible && !stickerToKeyboardTransition) {
          setStickerToKeyboardTransition(false);
        }
        if (!composerFocusedRef.current) {
          setClosedToKeyboardTransition(false);
        }
        animateAccessoryHeight(
          stickerPickerVisible || stickerToKeyboardTransition
            ? getStickerPickerHeight()
            : 0,
        );
      });

      return () => {
        frameChangeSubscription.remove();
        showSubscription.remove();
        hideSubscription.remove();
      };
    }

    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      const nextInset = Math.max(0, event.endCoordinates?.height || 0);
      setKeyboardInset(nextInset);
      setKeyboardLayoutOffset(0);
      if (nextInset > 0) {
        lastKeyboardInsetRef.current = nextInset;
      }
      setStickerToKeyboardTransition(false);
      setClosedToKeyboardTransition(false);
      animateAccessoryHeight(0, 0);
      if (composerFocusedRef.current) {
        requestAnimationFrame(() => {
          scrollToLatestMessage(false);
        });
      }
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardInset(0);
      setKeyboardLayoutOffset(0);
      if (!stickerPickerVisible && !stickerToKeyboardTransition) {
        setStickerToKeyboardTransition(false);
      }
      if (!composerFocusedRef.current) {
        setClosedToKeyboardTransition(false);
      }
      animateAccessoryHeight(
        stickerPickerVisible || stickerToKeyboardTransition
          ? getStickerPickerHeight()
          : 0,
        180,
      );
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [
    animateAccessoryHeight,
    getStickerPickerHeight,
    insets.bottom,
    isWeb,
    screenHeight,
    scrollToLatestMessage,
    stickerToKeyboardTransition,
    stickerPickerVisible,
  ]);

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
    if (!currentChatMemberIds.length) {
      return;
    }

    let cancelled = false;

    const syncPresenceSnapshot = async () => {
      try {
        const nextOnlineUserIds = await realtime.syncOnlineUsers(currentChatMemberIds);
        if (!cancelled) {
          setOnlineUserIds(nextOnlineUserIds);
        }
      } catch (error) {
        console.warn("Failed to sync presence statuses", error);
      }
    };

    void syncPresenceSnapshot();
    const interval = setInterval(() => {
      void syncPresenceSnapshot();
    }, PRESENCE_RESYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentChatMemberIds]);

  useEffect(() => {
    if (navigation.isFocused()) {
      setActiveNotificationChatId(route.params.chatId);
    }

    const unsubscribeFocus = navigation.addListener("focus", () => {
      setActiveNotificationChatId(route.params.chatId);
    });
    const unsubscribeBlur = navigation.addListener("blur", () => {
      setActiveNotificationChatId(null);
    });

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
      setActiveNotificationChatId(null);
    };
  }, [navigation, route.params.chatId]);

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

        if (!cancelled && cachedMessages && !queryClient.getQueryData(["messages", route.params.chatId])) {
          queryClient.setQueryData(["messages", route.params.chatId], cachedMessages);
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

    void saveCachedMessages(currentUserId, route.params.chatId, messagesSnapshot).catch(
      (error) => {
        console.warn("Failed to persist messages cache", error);
      },
    );
  }, [currentUserId, hasMessagesSnapshot, messagesQuery.data, route.params.chatId]);

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

        const typingUserId = String(payload?.userId || "");
        if (payload?.isTyping && typingUserId) {
          setOnlineUserIds((previous) =>
            previous.includes(typingUserId) ? previous : [...previous, typingUserId],
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

    queryClient.setQueryData<MessagesInfiniteData>(["messages", route.params.chatId], (previous) =>
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
                getMessageDeliveryStatus(message) === "failed" ? "failed" : "read",
            };
          }),
        })),
      ),
    );
    realtime.emitReadMessages(route.params.chatId, visibleIncomingMessageIds);
  }, [currentUserId, flatMessages, queryClient, route.params.chatId, visibleMessageIds]);

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
      const appendedMessages = flatMessages.slice(previousMessageCount).filter((message) => {
        const senderId = String(getNormalizedSenderId(message.senderId) || "");

        return (
          senderId &&
          senderId !== currentUserId &&
          getMessageDeliveryStatus(message) !== "failed"
        );
      });

      if (appendedMessages.length > 0) {
        if (shouldStickToBottomRef.current) {
          setPendingNewMessageIds([]);
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
  }, [currentUserId, flatMessages]);

  useEffect(() => {
    if (!pendingNewMessageIds.length) {
      return;
    }

    const unreadMessageIds = new Set(
      flatMessages
        .filter((message) => {
          const senderId = String(getNormalizedSenderId(message.senderId) || "");
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
              isGroup={isGroupChat}
              shape="circle"
            />
            <View style={styles.headerTextWrap}>
              {otherMember && !isGroupChat ? (
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
            {!isGroupChat && !currentChat?.isSavedMessages ? (
              <Pressable style={styles.headerButton} onPress={handleStartVideoCall}>
                <Phone size={18} color={Colors.mutedText} />
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

        <Animated.View
          style={[
            styles.chatBody,
          ]}
        >
        <Animated.View
          style={[
            styles.messagesViewport,
            useAnimatedKeyboardOffset
              ? {
                  marginBottom:
                    keyboardLayoutOffset > 0 ? keyboardLayoutOffset : accessoryHeightAnim,
                }
              : null,
          ]}
        >
          {messagesQuery.isFetchingNextPage ? (
            <View style={styles.historyLoader}>
              <ActivityIndicator size="small" color={Colors.mutedText} />
              <Text style={styles.historyLoaderText}>Oldingi xabarlar yuklanmoqda...</Text>
            </View>
          ) : null}
          {!chatCacheHydrated || !messagesCacheHydrated || (messagesQuery.isLoading && !hasMessagesSnapshot) ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.helperText}>Xabarlar yuklanmoqda...</Text>
            </View>
          ) : messagesQuery.isError && !hasMessagesSnapshot ? (
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
              stickyHeaderIndices={stickyDateHeaderIndices}
              contentContainerStyle={[
                styles.messagesContent,
                { paddingBottom: composerHeight + 20 },
              ]}
              style={!messageListVisible ? styles.messagesListHidden : undefined}
              onLoad={() => {
                if (initialScrollDoneRef.current) {
                  return;
                }

                initialScrollDoneRef.current = true;
                requestAnimationFrame(() => {
                  const nextScrollOffset = scrollRestorePendingRef.current;
                  if (nextScrollOffset !== null) {
                    scrollOffsetRef.current = nextScrollOffset;
                    shouldStickToBottomRef.current = nextScrollOffset <= NEW_MESSAGES_BOTTOM_THRESHOLD;
                    listRef.current?.scrollToOffset({
                      offset: nextScrollOffset,
                      animated: false,
                    });
                  } else {
                    shouldStickToBottomRef.current = true;
                    listRef.current?.scrollToEnd({ animated: false });
                  }
                  scrollRestorePendingRef.current = null;

                  requestAnimationFrame(() => {
                    setMessageListVisible(true);
                  });
                });
              }}
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              keyboardShouldPersistTaps="handled"
              onScroll={handleMessagesScroll}
              onScrollEndDrag={scheduleScrollOffsetPersist}
              onMomentumScrollEnd={scheduleScrollOffsetPersist}
              onViewableItemsChanged={handleViewableItemsChanged}
              viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
              scrollEventThrottle={16}
              onStartReached={() => {
                if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
                  void messagesQuery.fetchNextPage();
                }
              }}
              onStartReachedThreshold={0.15}
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
                    onPressReplyPreview={handleScrollToRepliedMessage}
                    onSwipeReply={handleSwipeReply}
                    highlightPulseKey={
                      highlightedMessageId === item.message.id ? highlightPulseKey : 0
                    }
                    hidden={messageMenuMounted && messageMenuOpen && selectedMessageId === item.message.id}
                  />
                );
              }}
            />
          )}

          {pendingNewMessageIds.length > 0 ? (
            <Pressable style={styles.newMessagesButton} onPress={handleJumpToLatestMessages}>
              <ChevronDown size={18} color="#fff" />
              <View style={styles.newMessagesChip}>
                <Text style={styles.newMessagesChipText}>
                  {pendingNewMessageIds.length > 99 ? "99+" : pendingNewMessageIds.length}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </Animated.View>

        <Animated.View
          onLayout={(event) => {
            const nextHeight = Math.ceil(event.nativeEvent.layout.height || 0);
            if (nextHeight > 0 && nextHeight !== composerHeight) {
              setComposerHeight(nextHeight);
            }
          }}
          style={[
            styles.composerShell,
            {
              position: useKeyboardAvoidingBody ? "relative" : "absolute",
              left: useKeyboardAvoidingBody ? undefined : 0,
              right: useKeyboardAvoidingBody ? undefined : 0,
              bottom:
                useAnimatedKeyboardOffset
                  ? keyboardLayoutOffset > 0
                    ? keyboardLayoutOffset
                    : accessoryHeightAnim
                  : accessoryHeightAnim,
              paddingBottom:
                keyboardInset > 0 ||
                stickerPickerVisible ||
                stickerToKeyboardTransition
                  ? 12
                  : Math.max(insets.bottom, 12),
            },
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

            <View style={styles.composerRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.composerActionButton,
                  pressed && styles.composerActionButtonPressed,
                  isComposerDisabled && styles.composerActionButtonDisabled,
                ]}
                disabled={isComposerDisabled}
                onPress={handleAttachmentPress}
              >
                <Ionicons name="image-outline" size={20} color={Colors.mutedText} />
              </Pressable>

              <View style={styles.composerField}>
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
                  editable={isComposerInputEditable}
                  showSoftInputOnFocus={composerSoftInputEnabled}
                  caretHidden={!composerSoftInputEnabled}
                  onFocus={() => {
                    if (!composerSoftInputEnabled) {
                      composerInputRef.current?.blur();
                      return;
                    }
                    composerFocusedRef.current = true;
                    shouldStickToBottomRef.current = true;
                    if (stickerPickerVisible) {
                      if (isWeb) {
                        setStickerPickerVisible(false);
                        setStickerToKeyboardTransition(false);
                        setClosedToKeyboardTransition(false);
                        animateAccessoryHeight(0, 120);
                      } else if (Platform.OS === "android") {
                        setStickerPickerVisible(false);
                        setStickerToKeyboardTransition(false);
                        setClosedToKeyboardTransition(false);
                        animateAccessoryHeight(0, 120);
                      } else {
                        setStickerPickerVisible(false);
                        setStickerToKeyboardTransition(true);
                      }
                    } else {
                      beginClosedToKeyboardTransition();
                    }
                  }}
                  onBlur={() => {
                    composerFocusedRef.current = false;
                    if (!stickerPickerVisible && keyboardInset <= 0) {
                      setClosedToKeyboardTransition(false);
                      animateAccessoryHeight(0, 160);
                    }
                  }}
                />

                <View style={styles.composerSideRight}>
                  <Pressable
                    style={styles.iconButton}
                    disabled={isComposerDisabled}
                    onPress={toggleStickerPicker}
                  >
                    <Ionicons
                      name={isStickerPanelActive ? "keypad-outline" : "happy-outline"}
                      size={20}
                      color={Colors.mutedText}
                    />
                  </Pressable>

                  {hasComposerText || editingMessageId ? (
                    <Pressable
                      onPress={handleSend}
                      style={({ pressed }) => [
                        styles.composerInlineSendButton,
                        pressed && styles.composerInlineSendButtonPressed,
                        ((!hasComposerText && Boolean(editingMessageId)) ||
                          isSending ||
                          isComposerDisabled) &&
                          styles.composerInlineSendButtonDisabled,
                      ]}
                      disabled={((!hasComposerText && Boolean(editingMessageId)) ||
                        isSending ||
                        isComposerDisabled)}
                    >
                      {isSending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons
                          name={editingMessageId ? "checkmark" : "send"}
                          size={15}
                          color="#fff"
                        />
                      )}
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {!hasComposerText && !editingMessageId ? (
                <Pressable
                  onPress={handleVoiceMessagePress}
                  style={({ pressed }) => [
                    styles.sendButton,
                    pressed && styles.sendButtonPressed,
                    (isSending || isComposerDisabled) && styles.sendButtonDisabled,
                  ]}
                  disabled={isSending || isComposerDisabled}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="mic" size={18} color="#fff" />
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>
        </Animated.View>
        <Animated.View style={[styles.stickerPickerShell, { height: accessoryHeightAnim }]}>
          {stickerPickerVisible ? (
            <ScrollView
              contentContainerStyle={[
                styles.stickerPickerContent,
                { paddingBottom: Math.max(insets.bottom, 16) },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {CHAT_EMOJI_SECTIONS.map((section) => (
                <View key={section.label} style={styles.emojiSection}>
                  <Text style={styles.emojiSectionLabel}>{section.label}</Text>
                  <View style={styles.emojiGrid}>
                    {section.emojis.map((emoji, index) => (
                      <Pressable
                        key={`${section.label}-${emoji}-${index}`}
                        style={({ pressed }) => [
                          styles.emojiButton,
                          pressed && styles.emojiButtonPressed,
                        ]}
                        onPress={() => void handleStickerPress(emoji)}
                      >
                        <Text style={styles.emojiButtonText}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </Animated.View>
        </Animated.View>
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

            {messageMenuPosition ? (
              <Animated.View
                style={[
                  styles.messageMenuActionBar,
                  {
                    top: messageMenuPosition.actionsTop,
                    left: messageMenuPosition.actionsLeft,
                    opacity: messageMenuOverlayOpacity,
                    transform: [
                      { translateY: messageMenuActionsTranslateY },
                      { scale: messageMenuActionsScale },
                    ],
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
                      {showChatPushNotificationsToggle ? (
                        <>
                          <View style={styles.infoSwitchRow}>
                            <View style={styles.infoSwitchCopy}>
                              <Text style={styles.infoLabel}>BILDIRISHNOMALAR</Text>
                              <Text style={styles.infoValue}>
                                Bildirishnoma yuborilsin
                              </Text>
                            </View>
                            <Switch
                              value={chatPushNotificationsEnabled}
                              onValueChange={(value) => {
                                void handleToggleChatPushNotifications(value);
                              }}
                              disabled={chatPushNotificationsMutation.isPending}
                              trackColor={{
                                false: Colors.border,
                                true: Colors.primary,
                              }}
                              thumbColor={Colors.background}
                            />
                          </View>
                          <View style={styles.infoDivider} />
                        </>
                      ) : null}

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
                        {showChatPushNotificationsToggle ? (
                          <>
                            <View style={styles.infoSwitchRow}>
                              <View style={styles.infoSwitchCopy}>
                                <Text style={styles.infoLabel}>PUSH BILDIRISHNOMALARI</Text>
                                <Text style={styles.infoValue}>
                                  Shu guruhga yangi xabar kelsa bildirishnoma yuborilsin
                                </Text>
                              </View>
                              <Switch
                                value={chatPushNotificationsEnabled}
                                onValueChange={(value) => {
                                  void handleToggleChatPushNotifications(value);
                                }}
                                disabled={chatPushNotificationsMutation.isPending}
                                trackColor={{
                                  false: Colors.border,
                                  true: Colors.primary,
                                }}
                                thumbColor={Colors.background}
                              />
                            </View>
                            {(groupLinkUrl || currentChat?.description) ? (
                              <View style={styles.infoDivider} />
                            ) : null}
                          </>
                        ) : null}

                        {groupLinkUrl ? (
                          <>
                            <View style={styles.infoItem}>
                              <Text style={styles.infoLabel}>HAVOLANI ULASHISH</Text>
                              <View style={styles.infoLinkRow}>
                                <Text style={styles.infoLinkValue}>{groupLinkUrl}</Text>
                                <Pressable
                                  onPress={() => void handleCopyGroupLink()}
                                  style={styles.infoCopyButton}
                                  hitSlop={8}
                                >
                                  <Ionicons name="copy-outline" size={18} color={Colors.text} />
                                </Pressable>
                              </View>
                            </View>
                          </>
                        ) : null}

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
                                onPress={() => void handleOpenPrivateChatWithMember(member)}
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
        visible={Boolean(outgoingCall)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          void handleCancelOutgoingCall();
        }}
      >
        <View style={styles.callingOverlay}>
          <View style={styles.callingCard}>
            <Avatar
              label={getDirectChatUserLabel(outgoingCall?.remoteUser) || "User"}
              uri={outgoingCall?.remoteUser?.avatar}
              size={72}
              shape="circle"
            />
            <Text style={styles.callingTitle}>
              {getDirectChatUserLabel(outgoingCall?.remoteUser) || "User"}
            </Text>
            <Text style={styles.callingSubtitle}>Calling...</Text>
            <View style={styles.callingDotsRow}>
              <View style={styles.callingDot} />
              <View style={styles.callingDot} />
              <View style={styles.callingDot} />
            </View>
            <Pressable
              style={styles.callingCancelButton}
              onPress={() => {
                void handleCancelOutgoingCall();
              }}
            >
              <Text style={styles.callingCancelButtonText}>Bekor qilish</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  messagesViewport: {
    flex: 1,
    position: "relative",
  },
  chatBody: {
    flex: 1,
    position: "relative",
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
    paddingVertical: 12,
    backgroundColor: "transparent",
    zIndex: 2,
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
    backgroundColor: "rgba(0,0,0,0.48)",
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
  composerShell: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 4,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "transparent",
    borderTopWidth: 0,
  },
  composerStack: {
    gap: 8,
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
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
    opacity: 1,
  },
  iconButton: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  composerActionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  composerSideRight: {
    minWidth: 20,
    marginLeft: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
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
    alignSelf: "center",
  },
  stickerPickerShell: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stickerPickerContent: {
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
  },
  emojiSection: {
    gap: 8,
  },
  emojiSectionLabel: {
    color: Colors.mutedText,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 4,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -3,
  },
  emojiButton: {
    width: "14.2857%",
    minWidth: 40,
    minHeight: 40,
    padding: 3,
  },
  emojiButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  emojiButtonText: {
    flex: 1,
    textAlign: "center",
    textAlignVertical: "center",
    fontSize: 22,
    lineHeight: 40,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
