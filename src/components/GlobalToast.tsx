import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../theme/colors";
import { useToastStore } from "../store/toast-store";

export function GlobalToast() {
  const insets = useSafeAreaInsets();
  const toast = useToastStore((state) => state.toast);
  const clearToast = useToastStore((state) => state.clearToast);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    if (!toast) {
      return;
    }

    opacity.stopAnimation();
    translateY.stopAnimation();
    opacity.setValue(0);
    translateY.setValue(18);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
        Animated.timing(translateY, {
          toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 12,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          clearToast(toast.id);
        }
      });
    }, toast.duration);

    return () => {
      clearTimeout(timeout);
    };
  }, [clearToast, opacity, toast, translateY]);

  if (!toast) {
    return null;
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.wrap,
          {
            bottom: insets.bottom + 24,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.toast}>
          <Text style={styles.message}>{toast.message}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 2000,
    elevation: 2000,
  },
  toast: {
    maxWidth: "92%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(20, 22, 24, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },
  },
  message: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
