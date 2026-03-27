import { useCallback, useMemo, useRef, type MutableRefObject } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../theme/colors";

const WAVE_BARS = [18, 28, 22, 38, 26, 46, 30, 24, 40, 20, 34, 26];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function VoiceDockSheet({
  visible,
  heightAnim,
  heightRef,
  initialHeight,
  maxHeight,
  onHeightImmediate,
  onSnapHeight,
}: {
  visible: boolean;
  heightAnim: Animated.Value;
  heightRef: MutableRefObject<number>;
  initialHeight: number;
  maxHeight: number;
  onHeightImmediate: (nextHeight: number) => void;
  onSnapHeight: (nextHeight: number) => void;
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
        <Text style={styles.title}>Voice Panel</Text>
        <Text style={styles.subtitle}>
          Tepaga tortib kengaytiring
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="mic" size={18} color="#fff" />
          </View>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>Voice draft tayyor</Text>
            <Text style={styles.heroSubtitle}>
              Composer va chat shu panel balandligiga birga ko‘tariladi.
            </Text>
          </View>
        </View>

        <View style={styles.waveCard}>
          <Text style={styles.sectionLabel}>Live space</Text>
          <View style={styles.waveRow}>
            {WAVE_BARS.map((height, index) => (
              <View
                key={`wave-${index}`}
                style={[
                  styles.waveBar,
                  {
                    height,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.hintRow}>
          <View style={styles.hintChip}>
            <Ionicons name="expand" size={14} color={Colors.primary} />
            <Text style={styles.hintChipText}>Headerni torting</Text>
          </View>
          <View style={styles.hintChip}>
            <Ionicons name="swap-vertical" size={14} color={Colors.primary} />
            <Text style={styles.hintChipText}>Full height</Text>
          </View>
        </View>
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
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 14,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(47, 49, 54, 0.98)",
  },
  grabber: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 12,
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    color: Colors.mutedText,
    fontSize: 12,
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 14,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(88, 101, 242, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(88, 101, 242, 0.28)",
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  heroSubtitle: {
    marginTop: 3,
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
  waveCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  sectionLabel: {
    color: Colors.subtleText,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  waveRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
  },
  waveBar: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "rgba(88, 101, 242, 0.72)",
  },
  hintRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  hintChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  hintChipText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
});
