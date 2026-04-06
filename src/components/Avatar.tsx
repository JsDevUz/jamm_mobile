import { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Colors } from "../theme/colors";
import { getInitials } from "../utils/chat";

type AvatarProps = {
  label: string;
  uri?: string | null;
  size?: number;
  isSavedMessages?: boolean;
  isGroup?: boolean;
  statusColor?: string;
  shape?: "card" | "circle";
};

export const Avatar = memo(function Avatar({
  label,
  uri,
  size = 52,
  isSavedMessages = false,
  isGroup = false,
  statusColor,
  shape = "card",
}: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const borderRadius = shape === "circle" ? Math.round(size / 2) : Math.round(size / 3);
  const fallbackColors: readonly [string, string] = isSavedMessages
    ? [Colors.primary, Colors.primary]
    : isGroup
      ? [Colors.surfaceMuted, Colors.surfaceMuted]
      : [Colors.primary, Colors.primary];

  useEffect(() => {
    setImageFailed(false);
  }, [uri]);

  if (uri && !imageFailed) {
    return (
      <View style={styles.root}>
        <Image
          source={{ uri }}
          style={[styles.image, { width: size, height: size, borderRadius }]}
          contentFit="cover"
          transition={180}
          onError={() => setImageFailed(true)}
        />
        {statusColor ? (
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={fallbackColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.fallback, { width: size, height: size, borderRadius }]}
      >
        <Text style={[styles.initials, { fontSize: Math.max(14, size / 3.1) }]}>
          {getInitials(label)}
        </Text>
      </LinearGradient>
      {statusColor ? (
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: "relative",
  },
  image: {
    backgroundColor: Colors.surfaceMuted,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#fff",
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  statusDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
});
