import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  const collapsedTranslateY = Math.max(0, maxHeight - collapsedHeight);
  const closedTranslateY = maxHeight + insets.bottom + 40;
  const sheetTranslateY = useRef(new Animated.Value(closedTranslateY)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const currentTranslateYRef = useRef(closedTranslateY);
  const panStartYRef = useRef(closedTranslateY);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const animateSheetTo = useCallback(
    (toValue: number, opacity = 1, onDone?: () => void) => {
      Animated.parallel([
        Animated.spring(sheetTranslateY, {
          toValue,
          useNativeDriver: true,
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
    [backdropOpacity, sheetTranslateY],
  );

  useEffect(() => {
    currentTranslateYRef.current = closedTranslateY;
    panStartYRef.current = closedTranslateY;
  }, [closedTranslateY]);

  useEffect(() => {
    const listenerId = sheetTranslateY.addListener(({ value }) => {
      currentTranslateYRef.current = value;
    });

    return () => {
      sheetTranslateY.removeListener(listenerId);
    };
  }, [sheetTranslateY]);

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
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    setKeyboardInset(0);
    requestAnimationFrame(() => {
      onClose();
    });
  }, [onClose]);

  const updateDraggedPosition = useCallback(
    (translationY: number) => {
      const nextValue = Math.max(
        0,
        Math.min(closedTranslateY, panStartYRef.current + translationY),
      );
      sheetTranslateY.setValue(nextValue);
      backdropOpacity.setValue(1 - Math.min(nextValue / Math.max(maxHeight, 1), 1));
    },
    [backdropOpacity, closedTranslateY, maxHeight, sheetTranslateY],
  );

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      sheetTranslateY.setValue(closedTranslateY);
      backdropOpacity.setValue(0);
      currentTranslateYRef.current = closedTranslateY;
      panStartYRef.current = closedTranslateY;
      animateSheetTo(collapsedTranslateY, 1);
      return;
    }

    if (!isMounted) {
      return;
    }

    Animated.parallel([
      Animated.timing(sheetTranslateY, {
        toValue: closedTranslateY,
        duration: 220,
        useNativeDriver: true,
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
    closedTranslateY,
    collapsedTranslateY,
    isMounted,
    sheetTranslateY,
    visible,
  ]);

  const handleGestureEvent = useCallback(
    (event: { nativeEvent: { translationY: number } }) => {
      updateDraggedPosition(event.nativeEvent.translationY);
    },
    [updateDraggedPosition],
  );

  const handleGestureStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, oldState, translationY, velocityY } = event.nativeEvent;

      if (state === State.BEGAN) {
        sheetTranslateY.stopAnimation((value) => {
          currentTranslateYRef.current = value;
          panStartYRef.current = value;
        });
        return;
      }

      if (oldState !== State.ACTIVE) {
        if (state === State.CANCELLED || state === State.FAILED) {
          animateSheetTo(collapsedTranslateY, 1);
        }
        return;
      }

      const releaseValue = panStartYRef.current + translationY;
      const shouldClose =
        releaseValue > collapsedTranslateY + maxHeight * 0.12 || velocityY > 700;

      if (shouldClose) {
        handleClose();
        return;
      }

      const shouldExpand = releaseValue < collapsedTranslateY * 0.62 || velocityY < -350;
      animateSheetTo(shouldExpand ? 0 : collapsedTranslateY, 1);
    },
    [animateSheetTo, collapsedTranslateY, handleClose, maxHeight, sheetTranslateY],
  );

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
                height: maxHeight,
                paddingBottom:
                  Math.max(insets.bottom, 12) +
                  (Platform.OS === "android" ? keyboardInset : 0),
                transform: [{ translateY: sheetTranslateY }],
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

            <View style={styles.body}>{children}</View>
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
