import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import type { ParamListBase } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import {
  Flame,
  GraduationCap,
  MessagesSquare,
  Newspaper,
} from "lucide-react-native";
import { chatsApi } from "../lib/api";
import type { MainTabsParamList } from "../navigation/types";
import useAuthStore from "../store/auth-store";
import { Colors } from "../theme/colors";

type BottomNavProps = {
  activeRoute: keyof MainTabsParamList;
  navigation: {
    navigate: (routeName: keyof MainTabsParamList | keyof ParamListBase) => void;
  };
};

const items: Array<{
  route: keyof MainTabsParamList;
  icon: ComponentType<{ size?: number; color?: string }>;
}> = [
  { route: "Feed", icon: Flame },
  { route: "Chats", icon: MessagesSquare },
  { route: "Articles", icon: Newspaper },
  { route: "Courses", icon: GraduationCap },
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
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: 12 + insets.bottom }]}
    >
      <View style={styles.shell}>
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.container}>
        {items.map((item) => {
          const isActive = item.route === activeRoute;
          const Icon = item.icon;
          return (
            <Pressable
              key={item.route}
              onPress={() => handleNavigate(item.route)}
              style={[styles.navButton, isActive && styles.navButtonActive]}
            >
              <Icon size={20} color={isActive ? "#fff" : Colors.mutedText} />
              {item.route === "Chats" && unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => handleNavigate("Profile")}
          style={[
            styles.profileButton,
            activeRoute === "Profile" && styles.profileButtonActive,
          ]}
        >
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
        </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 20,
  },
  shell: {
    minHeight: 64,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(32, 34, 37, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 12,
  },
  container: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  navButtonActive: {
    backgroundColor: Colors.primary,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: Colors.surfaceMuted,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  profileButtonActive: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 0,
    },
  },
  profileImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  profileFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  profileFallbackText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
});
