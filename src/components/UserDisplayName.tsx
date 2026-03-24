import { memo, useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { usersApi } from "../lib/api";
import { Colors } from "../theme/colors";
import type { ProfileDecoration, User } from "../types/entities";

type BadgeSize = "sm" | "md" | "lg";

type Props = {
  user?: User | null;
  fallback?: string;
  size?: BadgeSize;
  textStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  numberOfLines?: number;
  showPremiumBadge?: boolean;
};

const decorationSizes = {
  sm: 18,
  md: 20,
  lg: 22,
} as const;

const premiumIconSizes = {
  sm: 14,
  md: 16,
  lg: 18,
} as const;

const fallbackDecorations: ProfileDecoration[] = [
  {
    key: "official-badge",
    label: "Official Badge",
    emoji: "✔️",
    animation: "sparkle",
  },
  {
    key: "premium-badge",
    label: "Premium Badge",
    emoji: "💗",
    animation: "sparkle",
  },
  {
    key: "sparkle-gold",
    label: "Golden Spark",
    emoji: "✨",
    animation: "sparkle",
  },
  {
    key: "fire-pop",
    label: "Fire Pop",
    emoji: "🔥",
    animation: "pulse",
  },
  {
    key: "rocket-wave",
    label: "Rocket Wave",
    emoji: "🚀",
    animation: "float",
  },
  {
    key: "diamond-spin",
    label: "Diamond Spin",
    emoji: "💎",
    animation: "spin",
  },
  {
    key: "star-wiggle",
    label: "Star Wiggle",
    emoji: "🌟",
    animation: "wiggle",
  },
  {
    key: "heart-float",
    label: "Heart Float",
    emoji: "💖",
    animation: "float",
  },
];

const isOfficialBadgeSelected = (decorationId?: string | null) =>
  decorationId === "official-badge";

const isPremiumBadgeSelected = (decorationId?: string | null) =>
  decorationId === "premium-badge";

export function OfficialBadgeIcon({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91-1.01-1.01-2.52-1.27-3.91-.81-.67-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81-1.01 1.01-1.27 2.52-.81 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91 1.01 1.01 2.52 1.27 3.91.81.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81 1.01-1.01 1.27-2.52.81-3.91 1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"
      />
    </Svg>
  );
}

export const UserDisplayName = memo(function UserDisplayName({
  user,
  fallback = "User",
  size = "md",
  textStyle,
  containerStyle,
  numberOfLines = 1,
  showPremiumBadge = true,
}: Props) {
  const { data: decorations = [] } = useQuery({
    queryKey: ["profile-decorations"],
    queryFn: usersApi.getProfileDecorations,
    staleTime: 5 * 60 * 1000,
  });

  const decorationOptions = decorations.length ? decorations : fallbackDecorations;
  const displayName = user?.nickname || user?.username || fallback;

  const decoration = useMemo(() => {
    if (
      !user?.selectedProfileDecorationId ||
      user.selectedProfileDecorationId === "custom-upload" ||
      isOfficialBadgeSelected(user.selectedProfileDecorationId) ||
      isPremiumBadgeSelected(user.selectedProfileDecorationId)
    ) {
      return null;
    }

    return (
      decorationOptions.find(
        (item: ProfileDecoration) =>
          item.key === user.selectedProfileDecorationId ||
          item._id === user.selectedProfileDecorationId,
      ) || null
    );
  }, [decorationOptions, user?.selectedProfileDecorationId]);

  const badgeSize = decorationSizes[size];
  const premiumSize = premiumIconSizes[size];
  const showCustomImage =
    user?.selectedProfileDecorationId === "custom-upload" &&
    Boolean(user?.customProfileDecorationImage);
  const showOfficialBadge =
    showPremiumBadge &&
    user?.premiumStatus === "active" &&
    isOfficialBadgeSelected(user?.selectedProfileDecorationId);
  const showPremiumBadgeVariant =
    showPremiumBadge &&
    user?.premiumStatus === "active" &&
    isPremiumBadgeSelected(user?.selectedProfileDecorationId);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text numberOfLines={numberOfLines} style={[styles.text, textStyle]}>
        {displayName}
      </Text>

      {showCustomImage ? (
        <Image
          source={{ uri: user?.customProfileDecorationImage || "" }}
          style={{
            width: badgeSize,
            height: badgeSize,
            borderRadius: 999,
          }}
          contentFit="cover"
        />
      ) : null}

      {decoration ? (
        <View style={[styles.emojiBadge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }]}>
          <Text style={[styles.emojiText, { fontSize: Math.max(12, badgeSize - 6) }]}>
            {decoration.emoji}
          </Text>
        </View>
      ) : null}

      {showOfficialBadge ? <OfficialBadgeIcon size={premiumSize} color={Colors.primary} /> : null}
      {showPremiumBadgeVariant ? <OfficialBadgeIcon size={premiumSize} color="#ff4fb3" /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    flexShrink: 1,
  },
  text: {
    color: Colors.text,
    flexShrink: 1,
  },
  emojiBadge: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: {
    lineHeight: 16,
  },
});
