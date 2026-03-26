import { Fragment, useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { Reply, Timer, Check, CheckCheck, X } from "lucide-react-native";
import { UserDisplayName } from "../../../components/UserDisplayName";
import { TextInput } from "../../../components/TextInput";
import { Colors } from "../../../theme/colors";
import type { User } from "../../../types/entities";
import type { NormalizedMessage } from "../../../utils/chat";
import { getEntityId } from "../../../utils/chat";

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

function getMessageDeliveryStatus(message: NormalizedMessage) {
  if (message.isDeleted) {
    return "";
  }

  if (message.deliveryStatus === "failed" || message.deliveryStatus === "cancelled") {
    return "failed";
  }

  if (message.deliveryStatus === "pending") {
    return "pending";
  }

  if (message.deliveryStatus === "read" || message.readBy.length > 0) {
    return "read";
  }

  return "sent";
}

function MessageReceiptIcon({
  message,
}: {
  message: NormalizedMessage;
}) {
  const status = getMessageDeliveryStatus(message);

  if (!status) {
    return null;
  }

  if (status === "failed") {
    return <X size={13} color={Colors.danger} />;
  }

  if (status === "pending") {
    return <Timer size={13} color={Colors.mutedText} />;
  }

  if (status === "read") {
    return <CheckCheck size={13} color={Colors.primary} />;
  }

  return <Check size={13} color={Colors.mutedText} />;
}

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

export function MessageRichText({
  content,
  onPressMention,
  onOpenLink,
  onLongPress,
  selectable = false,
  styles,
}: {
  content: string;
  onPressMention: (username: string) => void;
  onOpenLink: (url: string) => void;
  onLongPress?: () => void;
  selectable?: boolean;
  styles: Record<string, any>;
}) {
  if (selectable) {
    return (
      <TextInput
        style={[styles.messageText, styles.messageSelectableInput]}
        value={content}
        editable
        readOnly
        multiline
        scrollEnabled={false}
        selectTextOnFocus={false}
        showSoftInputOnFocus={false}
        contextMenuHidden={false}
        disableFullscreenUI
        rejectResponderTermination={false}
        caretHidden={false}
      />
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
              onPress={() => onOpenLink(part.url)}
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

export function MessageBubbleBody({
  message,
  isMine,
  isGroup,
  onPressMention,
  onOpenLink,
  onPressReplyPreview,
  onLongPress,
  selectable = false,
  styles,
}: {
  message: NormalizedMessage;
  isMine: boolean;
  isGroup: boolean;
  onPressMention: (username: string) => void;
  onOpenLink: (url: string) => void;
  onPressReplyPreview?: (messageId: string) => void;
  onLongPress?: () => void;
  selectable?: boolean;
  styles: Record<string, any>;
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
          disabled={!getEntityId(message.replayTo)}
          onPress={() => {
            const targetMessageId = getEntityId(message.replayTo);
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
            user={message.replayTo.senderUser as User | undefined}
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
        onOpenLink={onOpenLink}
        onLongPress={onLongPress}
        selectable={selectable}
        styles={styles}
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

export function ChatMessageRow({
  message,
  isMine,
  isGroup,
  onOpenMenu,
  onPressMention,
  onOpenLink,
  onPressReplyPreview,
  onSwipeReply,
  highlightPulseKey = 0,
  hidden = false,
  styles,
}: {
  message: NormalizedMessage;
  isMine: boolean;
  isGroup: boolean;
  onOpenMenu: (messageId: string, target: View | null) => void;
  onPressMention: (username: string) => void;
  onOpenLink: (url: string) => void;
  onPressReplyPreview: (messageId: string) => void;
  onSwipeReply: (message: NormalizedMessage) => void;
  highlightPulseKey?: number;
  hidden?: boolean;
  styles: Record<string, any>;
}) {
  const swipeReplyDisabled = Boolean(message.isDeleted);
  const gestureTranslateX = useRef(new Animated.Value(0)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const bubbleRef = useRef<View | null>(null);
  const shouldTriggerReplySwipe = (dx: number, vx: number) => dx < -28 || vx < -0.2;
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
                  onOpenLink={onOpenLink}
                  onPressReplyPreview={onPressReplyPreview}
                  onLongPress={() => onOpenMenu(message.id, bubbleRef.current)}
                  styles={styles}
                />
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}
