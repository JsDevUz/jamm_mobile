import { Animated } from "react-native";
import { useMemo } from "react";
import type { NormalizedMessage } from "../../../utils/chat";

type SelectedMessageItem =
  | {
      type: "message";
      message: NormalizedMessage;
    }
  | null;

type MessageMenuLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function useMessageMenuState({
  selectedMessage,
  currentUserId,
  canDeleteOthersMessages,
  selectedMessageLayout,
  screenHeight,
  screenWidth,
  insetTop,
  insetBottom,
  messageMenuAnim,
  screenPadding,
  gap,
  width,
  itemHeight,
  actionGap,
  actionsPadding,
}: {
  selectedMessage: SelectedMessageItem;
  currentUserId: string;
  canDeleteOthersMessages: boolean;
  selectedMessageLayout: MessageMenuLayout | null;
  screenHeight: number;
  screenWidth: number;
  insetTop: number;
  insetBottom: number;
  messageMenuAnim: Animated.Value;
  screenPadding: number;
  gap: number;
  width: number;
  itemHeight: number;
  actionGap: number;
  actionsPadding: number;
}) {
  const selectedMessageIsMine =
    selectedMessage?.type === "message" &&
    selectedMessage.message.senderId === currentUserId;

  const canEditSelectedMessage = Boolean(
    selectedMessage?.type === "message" &&
      selectedMessage.message.senderId === currentUserId &&
      !selectedMessage.message.isDeleted,
  );
  const canDeleteSelectedMessage = Boolean(
    selectedMessage?.type === "message" &&
      !selectedMessage.message.isDeleted &&
      (selectedMessage.message.senderId === currentUserId ||
        canDeleteOthersMessages),
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

    const overlayHeight = screenHeight - insetTop - insetBottom;
    const menuHeight =
      actionsPadding * 2 +
      messageMenuActionCount * itemHeight +
      Math.max(0, messageMenuActionCount - 1) * actionGap;
    const maxPreviewTop =
      overlayHeight -
      screenPadding -
      menuHeight -
      gap -
      selectedMessageLayout.height;
    const previewTop = Math.max(
      screenPadding,
      Math.min(selectedMessageLayout.y, maxPreviewTop),
    );
    const idealLeft = selectedMessageIsMine
      ? selectedMessageLayout.x + selectedMessageLayout.width - width
      : selectedMessageLayout.x;
    const actionsLeft = Math.max(
      screenPadding,
      Math.min(screenWidth - width - screenPadding, idealLeft),
    );

    return {
      previewTop,
      actionsTop: previewTop + selectedMessageLayout.height + gap,
      actionsLeft,
    };
  }, [
    actionGap,
    actionsPadding,
    gap,
    insetBottom,
    insetTop,
    itemHeight,
    messageMenuActionCount,
    screenHeight,
    screenPadding,
    screenWidth,
    selectedMessageIsMine,
    selectedMessageLayout,
    width,
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

  return {
    selectedMessageIsMine,
    canEditSelectedMessage,
    canDeleteSelectedMessage,
    canCopySelectedMessage,
    canReplySelectedMessage,
    messageMenuPosition,
    messageMenuBubbleLift:
      messageMenuBubbleLift as Animated.AnimatedInterpolation<number>,
    messageMenuBubbleScale:
      messageMenuBubbleScale as Animated.AnimatedInterpolation<number>,
    messageMenuActionsTranslateY:
      messageMenuActionsTranslateY as Animated.AnimatedInterpolation<number>,
    messageMenuActionsScale:
      messageMenuActionsScale as Animated.AnimatedInterpolation<number>,
    messageMenuOverlayOpacity:
      messageMenuOverlayOpacity as Animated.AnimatedInterpolation<number>,
  };
}
