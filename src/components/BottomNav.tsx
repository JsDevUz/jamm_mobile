import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import type { ParamListBase } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { chatsApi } from "../lib/api";
import type { MainTabsParamList } from "../navigation/types";
import useAuthStore from "../store/auth-store";
import { Colors } from "../theme/colors";
import {
  ChatsSolidIcon,
  FeedSolidIcon,
} from "./NavSolidIcons";

type BottomNavProps = {
  activeRoute: keyof MainTabsParamList;
  navigation: {
    navigate: (routeName: keyof MainTabsParamList | keyof ParamListBase) => void;
  };
};

const items: Array<{
  route: keyof MainTabsParamList;
  icon: ComponentType<any>;
  iconName?: string;
  label: string;
}> = [
  { route: "Feed", icon: FeedSolidIcon, label: "Feed" },
  { route: "Chats", icon: ChatsSolidIcon, label: "Chats" },
  { route: "Articles", icon: MaterialIcons, iconName: "article", label: "Articles" },
  { route: "Courses", icon: MaterialIcons, iconName: "school", label: "Courses" },
];

export function BottomNav({ activeRoute, navigation }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: chatsApi.fetchChats,
  });

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardOpen(true),
    );
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardOpen(false),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (keyboardOpen) {
    return null;
  }

  const unreadCount = (chatsQuery.data || []).reduce(
    (total, chat) => total + Math.max(0, Number(chat.unread) || 0),
    0,
  );
  const profileLabel = user?.nickname || user?.username || "U";

  const handleNavigate = async (route: keyof MainTabsParamList) => {
    if (route === activeRoute) {
      return;
    }

    await Haptics.selectionAsync();
    navigation.navigate(route);
  };

  return (
    <View
      style={[
        styles.wrapper,
        { paddingBottom: Math.max(2, insets.bottom - 22) },
      ]}
    >
      <View style={styles.container}>
        {items.map((item) => {
          const isActive = item.route === activeRoute;
          const Icon = item.icon;
          return (
            <Pressable
              key={item.route}
              onPress={() => handleNavigate(item.route)}
              style={styles.navItem}
            >
              <View style={styles.iconSlot}>
                <Icon
                  {...(item.iconName ? { name: item.iconName } : null)}
                  size={21}
                  color={isActive ? Colors.primary : Colors.mutedText}
                />
                {item.route === "Chats" && unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.navLabel,
                  isActive && styles.navLabelActive,
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => handleNavigate("Profile")}
          style={styles.navItem}
        >
          <View style={styles.iconSlot}>
            <View style={styles.profileAvatarWrap}>
              {user?.avatar ? (
                <Image
                  source={{ uri: user.avatar }}
                  style={styles.profileImage}
                  contentFit="cover"
                  transition={140}
                />
              ) : (
                <View style={styles.profileFallback}>
                  <Text style={styles.profileFallbackText}>
                    {profileLabel.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.profileStatusDot} />
            </View>
          </View>
          <Text
            style={[
              styles.navLabel,
              activeRoute === "Profile" && styles.navLabelActive,
            ]}
            numberOfLines={1}
          >
            You
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 10,
    paddingTop: 2,
    backgroundColor: Colors.background,
  },
  container: {
    minHeight: 64,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 3,
    paddingHorizontal: 4,
  },
  iconSlot: {
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  navLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: Colors.mutedText,
    textAlign: "center",
  },
  navLabelActive: {
    color: Colors.primary,
    fontWeight: "700",
  },
  profileAvatarWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "visible",
    alignItems: "center",
    justifyContent: "center",
  },
  profileImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  profileFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  profileFallbackText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  profileStatusDot: {
    position: "absolute",
    right: -2,
    bottom: -1,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: "#46c46b",
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
});
