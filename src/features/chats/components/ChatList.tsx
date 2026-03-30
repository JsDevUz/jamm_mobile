import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { FlashList, type FlashListRef, type ViewToken } from "@shopify/flash-list";
import { ChevronDown } from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Colors } from "../../../theme/colors";
import type { MessageListItem, NormalizedMessage } from "../../../utils/chat";
import { ChatMessageRow } from "./ChatMessageRow";

export function ChatList({
  styles,
  containerInsetStyle,
  containerTransformStyle,
  listRef,
  messageItems,
  initialMessageIndex,
  shouldKeepMessagesAnchoredToBottom,
  stickyDateHeaderIndices,
  composerHeight,
  dockBottomSpacerHeight,
  bottomCoveredHeight,
  dockLiftVisible,
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
  currentChatIsGroup,
  highlightedMessageId,
  highlightPulseKey,
  messageMenuMounted,
  selectedMessageId,
  pendingNewMessageIds,
  onMessagesTouchStart,
  onMessagesScroll,
  onMessagesScrollBeginDrag,
  onMessagesScrollEndDrag,
  onMessagesMomentumScrollEnd,
  onViewableItemsChanged,
  onFetchOlder,
  onOpenMenu,
  onPressMention,
  onOpenLink,
  onPressReplyPreview,
  onSwipeReply,
  onJumpToLatestMessages,
  onLoadComplete,
}: {
  styles: Record<string, any>;
  containerInsetStyle?: any;
  containerTransformStyle?: any;
  listRef: RefObject<FlashListRef<MessageListItem>>;
  messageItems: MessageListItem[];
  initialMessageIndex?: number;
  shouldKeepMessagesAnchoredToBottom: boolean;
  stickyDateHeaderIndices: number[];
  composerHeight: number;
  dockBottomSpacerHeight: number;
  bottomCoveredHeight: number;
  dockLiftVisible: boolean;
  messageListVisible: boolean;
  initialScrollDoneRef: MutableRefObject<boolean>;
  scrollRestorePendingRef: MutableRefObject<number | null>;
  scrollOffsetRef: MutableRefObject<number>;
  shouldStickToBottomRef: MutableRefObject<boolean>;
  messagesQuery: any;
  hasMessagesSnapshot: boolean;
  chatCacheHydrated: boolean;
  messagesCacheHydrated: boolean;
  currentUserId: string;
  currentChatIsGroup: boolean;
  highlightedMessageId: string | null;
  highlightPulseKey: number;
  messageMenuMounted: boolean;
  selectedMessageId: string | null;
  pendingNewMessageIds: string[];
  onMessagesTouchStart: () => void;
  onMessagesScroll: (event: any) => void;
  onMessagesScrollBeginDrag?: () => void;
  onMessagesScrollEndDrag: () => void;
  onMessagesMomentumScrollEnd: () => void;
  onViewableItemsChanged: (info: { viewableItems: Array<ViewToken<MessageListItem>> }) => void;
  onFetchOlder: () => void;
  onOpenMenu: (messageId: string, target: View | null) => void;
  onPressMention: (username: string) => void;
  onOpenLink: (url: string) => void;
  onPressReplyPreview: (messageId: string) => void;
  onSwipeReply: (message: NormalizedMessage) => void;
  onJumpToLatestMessages: () => void;
  onLoadComplete: () => void;
}) {
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentBodyHeight, setContentBodyHeight] = useState(0);

  const finalizeInitialListLayout = useCallback(() => {
    if (initialScrollDoneRef.current) {
      requestAnimationFrame(onLoadComplete);
      return;
    }

    initialScrollDoneRef.current = true;
    requestAnimationFrame(() => {
      const nextScrollOffset = scrollRestorePendingRef.current;
      if (nextScrollOffset !== null) {
        scrollOffsetRef.current = nextScrollOffset;
        shouldStickToBottomRef.current = nextScrollOffset <= 96;
        listRef.current?.scrollToOffset({
          offset: nextScrollOffset,
          animated: false,
        });
      } else {
        shouldStickToBottomRef.current = true;
        listRef.current?.scrollToEnd({ animated: false });
      }

      scrollRestorePendingRef.current = null;
      requestAnimationFrame(onLoadComplete);
    });
  }, [
    initialScrollDoneRef,
    listRef,
    onLoadComplete,
    scrollOffsetRef,
    scrollRestorePendingRef,
    shouldStickToBottomRef,
  ]);

  const effectiveBottomPadding =
    composerHeight + dockBottomSpacerHeight + (dockLiftVisible ? 8 : 20);
  const visualViewportHeight = dockLiftVisible
    ? viewportHeight
    : Math.max(0, viewportHeight - bottomCoveredHeight);
  const shouldEnableScroll = useMemo(() => {
    if (!visualViewportHeight || !contentBodyHeight) {
      return true;
    }

    return contentBodyHeight > visualViewportHeight + 2;
  }, [contentBodyHeight, visualViewportHeight]);
  const shouldUseStickyDates = shouldEnableScroll;
  const shouldMaintainVisibleContent =
    shouldKeepMessagesAnchoredToBottom && shouldEnableScroll && false;
  const topFillHeight = !shouldEnableScroll
    ? Math.max(0, visualViewportHeight - contentBodyHeight)
    : 0;
  const hasPendingScrollRestore = scrollRestorePendingRef.current !== null;
  const shouldAutofillInitialViewport =
    !initialScrollDoneRef.current &&
    !messageListVisible &&
    !hasPendingScrollRestore &&
    messageItems.length > 0 &&
    viewportHeight > 0 &&
    !messagesQuery.isLoading &&
    !messagesQuery.isFetchingNextPage &&
    !shouldEnableScroll &&
    Boolean(messagesQuery.hasNextPage);

  const maybeFinalizeInitialListLayout = useCallback(() => {
    if (shouldAutofillInitialViewport) {
      return;
    }

    finalizeInitialListLayout();
  }, [finalizeInitialListLayout, shouldAutofillInitialViewport]);

  useEffect(() => {
    if (
      messageListVisible ||
      messageItems.length === 0 ||
      messagesQuery.isLoading ||
      messagesQuery.isFetchingNextPage ||
      shouldAutofillInitialViewport
    ) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      maybeFinalizeInitialListLayout();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    messageItems.length,
    messageListVisible,
    maybeFinalizeInitialListLayout,
    messagesQuery.isFetchingNextPage,
    messagesQuery.isLoading,
    shouldAutofillInitialViewport,
  ]);

  const messagesTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDistance(8)
        .onEnd((_event, success) => {
          if (!success) {
            return;
          }

          onMessagesTouchStart();
        }),
    [onMessagesTouchStart],
  );

  useEffect(() => {
    if (!shouldAutofillInitialViewport) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      onFetchOlder();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [onFetchOlder, shouldAutofillInitialViewport]);

  return (
    <GestureDetector gesture={messagesTapGesture}>
      <Animated.View
        style={[styles.messagesViewport, containerInsetStyle, containerTransformStyle]}
        onLayout={(event) => {
          setViewportHeight(Math.ceil(event.nativeEvent.layout.height || 0));
        }}
      >
      {messagesQuery.isFetchingNextPage ? (
        <View style={styles.historyLoader}>
          <ActivityIndicator size="small" color={Colors.mutedText} />
          <Text style={styles.historyLoaderText}>Oldingi xabarlar yuklanmoqda...</Text>
        </View>
      ) : null}

      {!chatCacheHydrated ||
      !messagesCacheHydrated ||
      (messagesQuery.isLoading && !hasMessagesSnapshot) ? (
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
          extraData={{
            topFillHeight,
            effectiveBottomPadding,
            dockLiftVisible,
            bottomCoveredHeight,
            shouldEnableScroll,
          }}
          keyExtractor={(item) => item.id}
          initialScrollIndex={initialMessageIndex}
          drawDistance={280}
          ListHeaderComponent={
            topFillHeight > 0 ? <View style={{ height: topFillHeight }} /> : null
          }
          maintainVisibleContentPosition={
            shouldMaintainVisibleContent
              ? {
                  autoscrollToBottomThreshold: 0.2,
                  animateAutoScrollToBottom: false,
                  startRenderingFromBottom: true,
                }
              : undefined
          }
          stickyHeaderIndices={shouldUseStickyDates ? stickyDateHeaderIndices : []}
          contentContainerStyle={[
            styles.messagesContent,
            {
              paddingBottom: effectiveBottomPadding,
            },
          ]}
          onLoad={maybeFinalizeInitialListLayout}
          scrollEnabled
          bounces
          alwaysBounceVertical
          overScrollMode="always"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={(_width, height) => {
            const measuredHeight = Math.ceil(height || 0);
            const nextContentBodyHeight = Math.max(
              0,
              measuredHeight - topFillHeight,
            );
            setContentBodyHeight((previous) =>
              previous === nextContentBodyHeight
                ? previous
                : nextContentBodyHeight,
            );
          }}
          onScroll={onMessagesScroll}
          onScrollBeginDrag={onMessagesScrollBeginDrag}
          onScrollEndDrag={onMessagesScrollEndDrag}
          onMomentumScrollEnd={onMessagesMomentumScrollEnd}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
          scrollEventThrottle={16}
          onStartReached={() => {
            if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
              onFetchOlder();
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
                isGroup={currentChatIsGroup}
                onOpenMenu={onOpenMenu}
                onPressMention={onPressMention}
                onOpenLink={onOpenLink}
                onPressReplyPreview={onPressReplyPreview}
                onSwipeReply={onSwipeReply}
                highlightPulseKey={highlightedMessageId === item.message.id ? highlightPulseKey : 0}
                hidden={messageMenuMounted && selectedMessageId === item.message.id}
                styles={styles}
              />
            );
          }}
        />
      )}

      {pendingNewMessageIds.length > 0 ? (
        <Pressable style={styles.newMessagesButton} onPress={onJumpToLatestMessages}>
          <ChevronDown size={18} color="#fff" />
          <View style={styles.newMessagesChip}>
            <Text style={styles.newMessagesChipText}>
              {pendingNewMessageIds.length > 99 ? "99+" : pendingNewMessageIds.length}
            </Text>
          </View>
        </Pressable>
      ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
