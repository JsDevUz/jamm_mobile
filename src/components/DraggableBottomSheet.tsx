import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { X } from "lucide-react-native";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../theme/colors";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
  minHeight?: number;
  initialHeightRatio?: number;
  maxHeightRatio?: number;
};

export function DraggableBottomSheet({
  visible,
  title,
  onClose,
  children,
  footer,
  overlay,
  minHeight = 520,
  initialHeightRatio = 0.8,
  maxHeightRatio = 0.94,
}: Props) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isMounted, setIsMounted] = useState(visible);
  const maxHeight = Math.min(screenHeight * maxHeightRatio, screenHeight - insets.top - 12);
  const collapsedHeight = Math.min(
    maxHeight,
    Math.max(screenHeight * initialHeightRatio, minHeight),
  );
  const sheetHeightAnim = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const currentHeightRef = useRef(0);
  const panStartHeightRef = useRef(0);
  const contentOverscrollPullRef = useRef(0);
  const contentOverscrollActiveRef = useRef(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const contentScrollOffsetRef = useRef(0);
  const [contentCanStartDrag, setContentCanStartDrag] = useState(true);
  const closingRef = useRef(false);
  const locallyDismissedRef = useRef(false);

  const animateSheetTo = useCallback(
    (toValue: number, opacity = 1, onDone?: () => void) => {
      Animated.parallel([
        Animated.spring(sheetHeightAnim, {
          toValue,
          useNativeDriver: false,
          damping: 24,
          stiffness: 240,
          mass: 0.95,
        }),
        Animated.timing(backdropOpacity, {
          toValue: opacity,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          onDone?.();
        }
      });
    },
    [backdropOpacity, sheetHeightAnim],
  );

  useEffect(() => {
    currentHeightRef.current = 0;
    panStartHeightRef.current = 0;
    contentOverscrollPullRef.current = 0;
    contentOverscrollActiveRef.current = false;
  }, [maxHeight]);

  useEffect(() => {
    const listenerId = sheetHeightAnim.addListener(({ value }) => {
      currentHeightRef.current = Math.max(0, value || 0);
    });

    return () => {
      sheetHeightAnim.removeListener(listenerId);
    };
  }, [sheetHeightAnim]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const handleKeyboardShow = (event: { endCoordinates?: { height?: number } }) => {
      if (Platform.OS !== "android") {
        return;
      }

      const nextInset = Math.max(0, Number(event.endCoordinates?.height || 0) - insets.bottom);
      setKeyboardInset(nextInset);
    };

    const handleKeyboardHide = () => {
      setKeyboardInset(0);
    };

    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      contentOverscrollPullRef.current = 0;
      contentOverscrollActiveRef.current = false;
      contentScrollOffsetRef.current = 0;
      setContentCanStartDrag(true);
      closingRef.current = false;
      locallyDismissedRef.current = false;
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    if (closingRef.current) {
      return;
    }

    closingRef.current = true;
    locallyDismissedRef.current = true;
    Keyboard.dismiss();
    setKeyboardInset(0);
    contentOverscrollPullRef.current = 0;
    contentOverscrollActiveRef.current = false;
    contentScrollOffsetRef.current = 0;
    setContentCanStartDrag(true);

    Animated.parallel([
      Animated.timing(sheetHeightAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: false,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsMounted(false);
      onClose();
    });
  }, [onClose]);

  const updateDraggedPosition = useCallback(
    (translationY: number) => {
      const nextValue = Math.max(
        0,
        Math.min(maxHeight, panStartHeightRef.current - translationY),
      );
      sheetHeightAnim.setValue(nextValue);
      backdropOpacity.setValue(
        Math.min(1, nextValue / Math.max(collapsedHeight, 1)),
      );
    },
    [backdropOpacity, collapsedHeight, maxHeight, sheetHeightAnim],
  );

  useEffect(() => {
    if (visible) {
      if (locallyDismissedRef.current) {
        return;
      }
      setIsMounted(true);
      sheetHeightAnim.setValue(0);
      backdropOpacity.setValue(0);
      currentHeightRef.current = 0;
      panStartHeightRef.current = 0;
      closingRef.current = false;
      animateSheetTo(collapsedHeight, 1);
      return;
    }

    if (!isMounted) {
      return;
    }

    Animated.parallel([
      Animated.timing(sheetHeightAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: false,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
      }
    });
  }, [
    animateSheetTo,
    backdropOpacity,
    collapsedHeight,
    isMounted,
    sheetHeightAnim,
    visible,
  ]);

  const handleGestureEvent = useCallback(
    (event: { nativeEvent: { translationY: number } }) => {
      updateDraggedPosition(event.nativeEvent.translationY);
    },
    [updateDraggedPosition],
  );

  const handleContentGestureEvent = useCallback(
    (event: { nativeEvent: { translationY: number } }) => {
      if (contentScrollOffsetRef.current > 0) {
        return;
      }

      const translationY = event.nativeEvent.translationY;
      if (translationY <= 0) {
        return;
      }

      updateDraggedPosition(translationY);
    },
    [updateDraggedPosition],
  );

  const handleGestureStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, oldState, translationY, velocityY } = event.nativeEvent;

      if (state === State.BEGAN) {
        sheetHeightAnim.stopAnimation((value) => {
          currentHeightRef.current = value;
          panStartHeightRef.current = value;
        });
        return;
      }

      if (oldState !== State.ACTIVE) {
        if (state === State.CANCELLED || state === State.FAILED) {
          animateSheetTo(
            currentHeightRef.current > collapsedHeight + maxHeight * 0.12
              ? maxHeight
              : collapsedHeight,
            1,
          );
        }
        return;
      }

      const releaseValue = Math.max(
        0,
        Math.min(maxHeight, panStartHeightRef.current - translationY),
      );
      const shouldClose =
        releaseValue < collapsedHeight - maxHeight * 0.12 || velocityY > 700;

      if (shouldClose) {
        handleClose();
        return;
      }

      const shouldExpand =
        releaseValue > collapsedHeight + maxHeight * 0.12 || velocityY < -350;
      animateSheetTo(shouldExpand ? maxHeight : collapsedHeight, 1);
    },
    [animateSheetTo, collapsedHeight, handleClose, maxHeight, sheetHeightAnim],
  );

  const handleContentGestureStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      if (contentScrollOffsetRef.current > 0) {
        return;
      }

      handleGestureStateChange(event);
    },
    [handleGestureStateChange],
  );

  const handleTrackedScroll = useCallback(
    (event: any, originalHandler?: ((event: any) => void) | null) => {
      const nextOffset = Number(event?.nativeEvent?.contentOffset?.y || 0);
      const normalizedOffset = nextOffset > 0 ? nextOffset : 0;
      const overscrollPull = nextOffset < 0 ? Math.abs(nextOffset) : 0;
      contentScrollOffsetRef.current = normalizedOffset;
      setContentCanStartDrag((previous) => {
        const nextValue = normalizedOffset <= 0;
        return previous === nextValue ? previous : nextValue;
      });

      if (overscrollPull > 0 && normalizedOffset <= 0) {
        contentOverscrollActiveRef.current = true;
        contentOverscrollPullRef.current = overscrollPull;
        if (panStartHeightRef.current <= 0) {
          panStartHeightRef.current = currentHeightRef.current || collapsedHeight;
        }
        updateDraggedPosition(overscrollPull);
      } else if (contentOverscrollActiveRef.current && overscrollPull === 0) {
        contentOverscrollPullRef.current = 0;
      }

      originalHandler?.(event);
    },
    [collapsedHeight, updateDraggedPosition],
  );

  const settleContentOverscroll = useCallback(
    (event: any, originalHandler?: ((event: any) => void) | null) => {
      handleTrackedScroll(event, originalHandler);

      if (!contentOverscrollActiveRef.current) {
        return;
      }

      const releasePull = contentOverscrollPullRef.current;
      contentOverscrollActiveRef.current = false;
      contentOverscrollPullRef.current = 0;

      const velocityY = Number(event?.nativeEvent?.velocity?.y || 0);
      const releaseValue = Math.max(
        0,
        Math.min(maxHeight, panStartHeightRef.current - releasePull),
      );
      const shouldClose =
        releaseValue < collapsedHeight - maxHeight * 0.12 || velocityY < -0.6;

      if (shouldClose) {
        handleClose();
        return;
      }

      const shouldExpand =
        releaseValue > collapsedHeight + maxHeight * 0.12 || velocityY > 0.45;
      animateSheetTo(shouldExpand ? maxHeight : collapsedHeight, 1);
    },
    [
      animateSheetTo,
      collapsedHeight,
      handleClose,
      handleTrackedScroll,
      maxHeight,
    ],
  );

  const renderTrackedChildren = useMemo(() => {
    const childArray = Children.toArray(children);

    if (childArray.length !== 1) {
      return children;
    }

    const onlyChild = childArray[0];
    if (!isValidElement(onlyChild)) {
      return children;
    }

    const childType = onlyChild.type as { displayName?: string; name?: string };
    const childProps = (onlyChild.props || {}) as Record<string, any>;
    const typeName = String(childType?.displayName || childType?.name || "");
    const isScrollable =
      /ScrollView|FlatList|SectionList|FlashList/i.test(typeName) ||
      typeof childProps.onScroll === "function" ||
      childProps.scrollEventThrottle != null;

    if (!isScrollable) {
      return children;
    }

    const originalOnScroll = childProps.onScroll;

    return cloneElement(onlyChild as ReactElement<any>, {
      bounces: childProps.bounces ?? true,
      alwaysBounceVertical: childProps.alwaysBounceVertical ?? true,
      overScrollMode: childProps.overScrollMode ?? "always",
      scrollEventThrottle: childProps.scrollEventThrottle ?? 16,
      onScroll: (event: any) => {
        handleTrackedScroll(event, originalOnScroll);
      },
      onScrollBeginDrag: (event: any) => {
        handleTrackedScroll(event, childProps.onScrollBeginDrag);
      },
      onMomentumScrollEnd: (event: any) => {
        settleContentOverscroll(event, childProps.onMomentumScrollEnd);
      },
      onScrollEndDrag: (event: any) => {
        settleContentOverscroll(event, childProps.onScrollEndDrag);
      },
    });
  }, [children, handleTrackedScroll, settleContentOverscroll]);

  if (!isMounted) {
    return null;
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Animated.View
            style={[
              styles.panel,
              {
                height: sheetHeightAnim,
                paddingBottom:
                  Math.max(insets.bottom, 12) +
                  (Platform.OS === "android" ? keyboardInset : 0),
              },
            ]}
          >
            <PanGestureHandler
              activeOffsetY={[-6, 6]}
              failOffsetX={[-24, 24]}
              shouldCancelWhenOutside={false}
              onGestureEvent={handleGestureEvent}
              onHandlerStateChange={handleGestureStateChange}
            >
              <View style={styles.dragArea}>
                <View style={styles.handleWrap}>
                  <View style={styles.handle} />
                </View>
              </View>
            </PanGestureHandler>

            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={handleClose} hitSlop={10} style={styles.closeButton}>
                <X size={18} color={Colors.text} />
              </Pressable>
            </View>
            <PanGestureHandler
              enabled={contentCanStartDrag}
              activeOffsetY={10}
              failOffsetX={[-24, 24]}
              shouldCancelWhenOutside={false}
              onGestureEvent={handleContentGestureEvent}
              onHandlerStateChange={handleContentGestureStateChange}
            >
              <View style={styles.body}>{renderTrackedChildren}</View>
            </PanGestureHandler>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
            {overlay ? <View style={styles.overlay}>{overlay}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  keyboard: {
    flex: 1,
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  dragArea: {
    backgroundColor: Colors.surface,
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: Colors.border,
  },
  header: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
});
