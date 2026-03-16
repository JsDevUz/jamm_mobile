import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../theme/colors";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
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
  const panStartYRef = useRef(closedTranslateY);

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
    if (visible) {
      setIsMounted(true);
      sheetTranslateY.setValue(closedTranslateY);
      backdropOpacity.setValue(0);
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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          Math.abs(gestureState.dy) > 6 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 0.9,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dy) > 6 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 0.9,
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation((value) => {
            panStartYRef.current = value;
          });
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextValue = Math.max(
            0,
            Math.min(closedTranslateY, panStartYRef.current + gestureState.dy),
          );
          sheetTranslateY.setValue(nextValue);
          backdropOpacity.setValue(1 - Math.min(nextValue / maxHeight, 1));
        },
        onPanResponderRelease: (_event, gestureState) => {
          const releaseValue = panStartYRef.current + gestureState.dy;
          const shouldClose =
            releaseValue > collapsedTranslateY + maxHeight * 0.16 || gestureState.vy > 0.95;

          if (shouldClose) {
            onClose();
            return;
          }

          const shouldExpand =
            releaseValue < collapsedTranslateY * 0.62 || gestureState.vy < -0.35;

          animateSheetTo(shouldExpand ? 0 : collapsedTranslateY, 1);
        },
        onPanResponderTerminate: () => {
          animateSheetTo(collapsedTranslateY, 1);
        },
      }),
    [animateSheetTo, backdropOpacity, closedTranslateY, collapsedTranslateY, maxHeight, onClose, sheetTranslateY],
  );

  if (!isMounted) {
    return null;
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
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
                paddingBottom: Math.max(insets.bottom, 12),
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
            <View {...panResponder.panHandlers}>
              <View style={styles.handleWrap}>
                <View style={styles.handle} />
              </View>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <Pressable onPress={onClose} style={styles.closeButton}>
                  <X size={18} color={Colors.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.body}>{children}</View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
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
});
