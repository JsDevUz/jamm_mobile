import { Animated, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Reply, Edit2, Trash2 } from "lucide-react-native";
import { Colors } from "../../../theme/colors";
import { MessageBubbleBody } from "./ChatMessageRow";

export function MessageContextMenuOverlay({
  styles,
  mounted,
  selectedMessage,
  selectedMessageLayout,
  selectedMessageIsMine,
  currentChatIsGroup,
  messageMenuPosition,
  overlayOpacity,
  bubbleLift,
  bubbleScale,
  actionsTranslateY,
  actionsScale,
  canReply,
  canCopy,
  canEdit,
  canDelete,
  onClose,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onPressMention,
  onOpenLink,
}: {
  styles: Record<string, any>;
  mounted: boolean;
  selectedMessage: any;
  selectedMessageLayout: any;
  selectedMessageIsMine: boolean;
  currentChatIsGroup: boolean;
  messageMenuPosition: any;
  overlayOpacity: Animated.AnimatedInterpolation<number>;
  bubbleLift: Animated.AnimatedInterpolation<number>;
  bubbleScale: Animated.AnimatedInterpolation<number>;
  actionsTranslateY: Animated.AnimatedInterpolation<number>;
  actionsScale: Animated.AnimatedInterpolation<number>;
  canReply: boolean;
  canCopy: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPressMention: (username: string) => void;
  onOpenLink: (url: string) => void;
}) {
  if (!mounted || selectedMessage?.type !== "message" || !selectedMessageLayout) {
    return null;
  }

  return (
    <View style={styles.messageMenuLayer} pointerEvents="box-none">
      <Pressable style={styles.messageMenuBackdropPressable} onPress={onClose}>
        <Animated.View
          style={[
            styles.messageMenuBackdrop,
            { opacity: overlayOpacity },
          ]}
        />
      </Pressable>

      <Animated.View
        pointerEvents="auto"
        style={[
          styles.messageMenuPreview,
          {
            top: selectedMessageLayout.y,
            left: selectedMessageLayout.x,
            width: selectedMessageLayout.width,
            transform: [{ translateY: bubbleLift }, { scale: bubbleScale }],
          },
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            selectedMessageIsMine ? styles.messageBubbleMine : styles.messageBubbleTheirs,
            styles.messageMenuBubbleFixed,
            styles.messageMenuBubbleShadow,
          ]}
        >
          <MessageBubbleBody
            message={selectedMessage.message}
            isMine={Boolean(selectedMessageIsMine)}
            isGroup={currentChatIsGroup}
            onPressMention={onPressMention}
            onOpenLink={onOpenLink}
            selectable
            styles={styles}
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
              opacity: overlayOpacity,
              transform: [{ translateY: actionsTranslateY }, { scale: actionsScale }],
            },
          ]}
        >
          {canReply ? (
            <Pressable style={styles.messageMenuAction} onPress={onReply}>
              <Reply size={17} color={Colors.text} />
              <Text style={styles.messageMenuActionText}>Javob</Text>
            </Pressable>
          ) : null}
          {canCopy ? (
            <Pressable style={styles.messageMenuAction} onPress={onCopy}>
              <Ionicons name="copy-outline" size={17} color={Colors.text} />
              <Text style={styles.messageMenuActionText}>Copy</Text>
            </Pressable>
          ) : null}
          {canEdit ? (
            <Pressable style={styles.messageMenuAction} onPress={onEdit}>
              <Edit2 size={17} color={Colors.text} />
              <Text style={styles.messageMenuActionText}>Edit</Text>
            </Pressable>
          ) : null}
          {canDelete ? (
            <Pressable style={styles.messageMenuAction} onPress={onDelete}>
              <Trash2 size={17} color={Colors.danger} />
              <Text style={[styles.messageMenuActionText, styles.messageMenuActionTextDanger]}>
                Delete
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}
