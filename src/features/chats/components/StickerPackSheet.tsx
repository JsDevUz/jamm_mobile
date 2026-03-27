import { useCallback, useMemo, useRef, type MutableRefObject } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EmojiKeyboard } from "rn-emoji-keyboard";
import { Colors } from "../../../theme/colors";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function StickerPackSheet({
  visible,
  heightAnim,
  heightRef,
  initialHeight,
  maxHeight,
  onHeightImmediate,
  onSnapHeight,
  onEmojiSelected,
  onDeleteLastEmoji,
}: {
  visible: boolean;
  heightAnim: Animated.Value;
  heightRef: MutableRefObject<number>;
  initialHeight: number;
  maxHeight: number;
  onHeightImmediate: (nextHeight: number) => void;
  onSnapHeight: (nextHeight: number) => void;
  onEmojiSelected: (selection: { emoji?: string }) => void;
  onDeleteLastEmoji: () => void;
}) {
  const dragStartHeightRef = useRef(initialHeight);
  const expansionMidpoint = initialHeight + (maxHeight - initialHeight) * 0.52;

  const snapToNearestState = useCallback(
    (nextHeight: number, velocityY = 0) => {
      const shouldExpand =
        velocityY < -0.45 || nextHeight >= expansionMidpoint;

      onSnapHeight(shouldExpand ? maxHeight : initialHeight);
    },
    [expansionMidpoint, initialHeight, maxHeight, onSnapHeight],
  );

  const headerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dy) > 4 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          heightAnim.stopAnimation((value) => {
            dragStartHeightRef.current =
              typeof value === "number" && Number.isFinite(value)
                ? value
                : heightRef.current || initialHeight;
          });
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextHeight = clamp(
            dragStartHeightRef.current - gestureState.dy,
            initialHeight,
            maxHeight,
          );
          onHeightImmediate(nextHeight);
        },
        onPanResponderRelease: (_event, gestureState) => {
          const nextHeight = clamp(
            dragStartHeightRef.current - gestureState.dy,
            initialHeight,
            maxHeight,
          );
          snapToNearestState(nextHeight, gestureState.vy);
        },
        onPanResponderTerminate: () => {
          snapToNearestState(heightRef.current || initialHeight);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [
      heightAnim,
      heightRef,
      initialHeight,
      maxHeight,
      onHeightImmediate,
      snapToNearestState,
    ],
  );

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="auto"
      style={[
        styles.sheet,
        {
          height: heightAnim,
        },
      ]}
    >
      <View style={styles.header} {...headerPanResponder.panHandlers}>
        <View style={styles.grabber} />
      </View>

      <View style={styles.keyboardWrap}>
        <Pressable
          onPress={onDeleteLastEmoji}
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && styles.deleteButtonPressed,
          ]}
        >
          <Ionicons
            name="backspace-outline"
            size={18}
            color={Colors.mutedText}
          />
        </Pressable>

        <EmojiKeyboard
          onEmojiSelected={onEmojiSelected}
          expandable={false}
          categoryPosition="top"
          disableSafeArea
          defaultHeight="100%"
          theme={{
            container: Colors.surfaceMuted,
            header: Colors.text,
            knob: "rgba(255,255,255,0.2)",
            backdrop: "transparent",
            category: {
              icon: Colors.mutedText,
              iconActive: "#fff",
              container: "rgba(255,255,255,0.04)",
              containerActive: Colors.primary,
            },
            search: {
              background: "rgba(255,255,255,0.05)",
              text: Colors.text,
              placeholder: Colors.mutedText,
              icon: Colors.mutedText,
            },
            customButton: {
              icon: Colors.mutedText,
              iconPressed: "#fff",
              background: "rgba(255,255,255,0.04)",
              backgroundPressed: "rgba(255,255,255,0.08)",
            },
            emoji: {
              selected: "rgba(88, 101, 242, 0.18)",
            },
            skinTonesContainer: Colors.surface,
          }}
          styles={{
            container: styles.emojiKeyboardContainer,
            searchBar: {
              container: {},
              text: {},
            },
            category: {
              container: styles.emojiCategoryContainer,
              icon: styles.emojiCategoryIcon,
            },
            knob: styles.emojiKnob,
            header: styles.emojiHeader,
            emoji: {
              selected: styles.emojiSelected,
            },
          }}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    elevation: 5,
    overflow: "hidden",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: Colors.surfaceMuted,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: -4,
    },
  },
  header: {
    paddingTop: 6,
    paddingHorizontal: 18,
    paddingBottom: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(47, 49, 54, 0.98)",
  },
  grabber: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 0,
  },
  keyboardWrap: {
    flex: 1,
    paddingTop: 0,
    backgroundColor: Colors.surfaceMuted,
  },
  deleteButton: {
    position: "absolute",
    bottom: 14,
    right: 10,
    zIndex: 3,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(32,34,37,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  deleteButtonPressed: {
    opacity: 0.82,
  },
  emojiKeyboardContainer: {
    flex: 1,
    borderRadius: 0,
    backgroundColor: Colors.surfaceMuted,
  },
  emojiCategoryContainer: {
    borderRadius: 14,
    marginTop: 6,
    marginBottom: 6,
    marginHorizontal: 4,
  },
  emojiCategoryIcon: {
    fontSize: 17,
  },
  emojiKnob: {
    display: "none",
  },
  emojiHeader: {
    display: "none",
  },
  emojiSelected: {
    borderRadius: 12,
  },
});
