import "react-native-gesture-handler";

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  NavigationContainer,
  DarkTheme,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaView,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { BottomNav } from "./src/components/BottomNav";
import { Colors } from "./src/theme/colors";
import useAuthStore from "./src/store/auth-store";
import { AuthScreen } from "./src/features/auth/AuthScreen";
import { ChatsScreen } from "./src/features/chats/ChatsScreen";
import { ChatScreen } from "./src/features/chats/ChatScreen";
import { PrivateMeetScreen } from "./src/features/calls/PrivateMeetScreen";
import { FeedScreen } from "./src/features/feed/FeedScreen";
import { ProfileScreen } from "./src/features/profile/ProfileScreen";
import { ArticlesScreen } from "./src/features/articles/ArticlesScreen";
import { CoursesScreen } from "./src/features/courses/CoursesScreen";
import type { MainTabsParamList, RootStackParamList } from "./src/navigation/types";
import { bootstrapPushNotifications } from "./src/lib/notifications";
import { realtime } from "./src/lib/realtime";
import { getAuthToken } from "./src/lib/session";
import type { ChatSummary } from "./src/types/entities";
import { getEntityId } from "./src/utils/chat";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.border,
    primary: Colors.primary,
  },
};

function LaunchScreen() {
  return (
    <SafeAreaView style={styles.launchScreen} edges={["top", "left", "right"]}>
      <View style={styles.brandOrb} />
      <Text style={styles.brandTitle}>Jamm</Text>
      <Text style={styles.brandSubtitle}>Native mobile workspace</Text>
      <ActivityIndicator color={Colors.primary} style={styles.loader} />
    </SafeAreaView>
  );
}

function MainTabsNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        animation: "none",
      }}
      tabBar={({ navigation, state }) => (
        <BottomNav
          activeRoute={state.routeNames[state.index] as keyof MainTabsParamList}
          navigation={navigation}
        />
      )}
    >
      <Tabs.Screen name="Feed" component={FeedScreen} />
      <Tabs.Screen name="Chats" component={ChatsScreen} />
      <Tabs.Screen name="Articles" component={ArticlesScreen} />
      <Tabs.Screen name="Courses" component={CoursesScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function RootNavigator() {
  const initialized = useAuthStore((state) => state.initialized);
  const bootstrapping = useAuthStore((state) => state.bootstrapping);
  const user = useAuthStore((state) => state.user);
  const bootstrapAuth = useAuthStore((state) => state.bootstrapAuth);

  useEffect(() => {
    void bootstrapAuth();
  }, [bootstrapAuth]);

  if (!initialized || bootstrapping) {
    return <LaunchScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        animationMatchesGesture: true,
        contentStyle: {
          backgroundColor: Colors.background,
        },
      }}
    >
      {user ? (
        <>
          <Stack.Screen
            name="MainTabs"
            component={MainTabsNavigator}
            options={{ animation: "none" }}
          />
          <Stack.Screen
            name="ChatRoom"
            component={ChatScreen}
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="PrivateMeet"
            component={PrivateMeetScreen}
            options={{ animation: "fade_from_bottom" }}
          />
        </>
      ) : (
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}

function GlobalScrollBehavior() {
  useEffect(() => {
    const applyDefaults = (component: unknown) => {
      const target = component as { defaultProps?: Record<string, unknown> };
      target.defaultProps = {
        ...(target.defaultProps || {}),
        bounces: false,
        alwaysBounceVertical: false,
        alwaysBounceHorizontal: false,
        overScrollMode: "never",
      };
    };

    applyDefaults(ScrollView);
    applyDefaults(FlatList);
    applyDefaults(SectionList);

    if (Platform.OS !== "web" || typeof document === "undefined") {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    const previous = {
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      rootOverscroll: root?.style.overscrollBehavior || "",
      rootHeight: root?.style.height || "",
    };

    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.height = "100%";
    if (root) {
      root.style.overscrollBehavior = "none";
      root.style.height = "100%";
    }

    return () => {
      html.style.overscrollBehavior = previous.htmlOverscroll;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      body.style.overflow = previous.bodyOverflow;
      body.style.height = previous.bodyHeight;
      if (root) {
        root.style.overscrollBehavior = previous.rootOverscroll;
        root.style.height = previous.rootHeight;
      }
    };
  }, []);

  return null;
}

function IncomingCallOverlay() {
  const user = useAuthStore((state) => state.user);
  const [incomingCall, setIncomingCall] = useState<{
    fromUser: {
      _id?: string;
      id?: string;
      name?: string;
      nickname?: string;
      username?: string;
      avatar?: string | null;
    };
    roomId: string;
    callType?: string;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      setIncomingCall(null);
      return;
    }

    const subscriptions = [
      realtime.onPresenceEvent("call:incoming", (payload) => {
        const nextCall = {
          fromUser: payload?.fromUser || {},
          roomId: String(payload?.roomId || ""),
          callType: String(payload?.callType || "video"),
        };

        if (!nextCall.roomId || !getEntityId(nextCall.fromUser)) {
          return;
        }

        setIncomingCall(nextCall);
      }),
      realtime.onPresenceEvent("call:cancelled", (payload) => {
        setIncomingCall((current) =>
          current && current.roomId === String(payload?.roomId || "") ? null : current,
        );
      }),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [user]);

  if (!incomingCall) {
    return null;
  }

  const remoteUserId = getEntityId(incomingCall.fromUser);
  const remoteName =
    incomingCall.fromUser.nickname ||
    incomingCall.fromUser.username ||
    incomingCall.fromUser.name ||
    "User";

  return (
    <View pointerEvents="box-none" style={styles.callOverlayRoot}>
      <View style={styles.callCard}>
        <Text style={styles.callBadge}>Private meet</Text>
        <Text style={styles.callTitle} numberOfLines={1}>
          {remoteName}
        </Text>
        <Text style={styles.callSubtitle}>Video qo'ng'iroq kiryapti</Text>
        <View style={styles.callActions}>
          <Pressable
            style={styles.callActionGhost}
            onPress={() => {
              if (remoteUserId) {
                realtime.emitCallReject(remoteUserId, incomingCall.roomId);
              }
              setIncomingCall(null);
            }}
          >
            <Text style={styles.callRejectText}>Rad etish</Text>
          </Pressable>
          <Pressable
            style={styles.callActionPrimary}
            onPress={() => {
              if (remoteUserId) {
                realtime.emitCallAccept(remoteUserId, incomingCall.roomId);
              }

              if (navigationRef.isReady()) {
                navigationRef.navigate("PrivateMeet", {
                  chatId: "",
                  roomId: incomingCall.roomId,
                  title: remoteName,
                  isCaller: false,
                  remoteUser: incomingCall.fromUser,
                });
              }
              setIncomingCall(null);
            }}
          >
            <Text style={styles.callAcceptText}>Qabul qilish</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function AppServices() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [realtimeReadyKey, setRealtimeReadyKey] = useState(0);
  const currentUserId = getEntityId(user);

  const patchChatsCache = (
    updater: (current: ChatSummary[]) => ChatSummary[],
  ) => {
    queryClient.setQueryData<ChatSummary[]>(["chats"], (current) =>
      updater(Array.isArray(current) ? current : []),
    );
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!user) {
        realtime.disconnect();
        return;
      }

      const authToken = await getAuthToken();
      if (!authToken || cancelled) {
        return;
      }

      realtime.connect(authToken);
      if (!cancelled) {
        setRealtimeReadyKey((value) => value + 1);
      }
      await bootstrapPushNotifications().catch((error) => {
        console.warn("Failed to bootstrap notifications", error);
      });
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || realtimeReadyKey === 0) {
      return;
    }

    const subscriptions = [
      realtime.onChatEvent("message_new", (payload) => {
        patchChatsCache((current) => {
          const chatId = String(payload?.chatId || "");
          if (!chatId) {
            return current;
          }

          const currentIndex = current.findIndex(
            (chat) => getEntityId(chat) === chatId || chat.urlSlug === chatId,
          );

          if (currentIndex === -1) {
            return current;
          }

          const nextChats = [...current];
          const existing = nextChats[currentIndex];
          const senderId =
            typeof payload?.senderId === "string"
              ? payload.senderId
              : getEntityId(payload?.senderId);

          const updatedChat: ChatSummary = {
            ...existing,
            lastMessage: payload?.isDeleted ? "Xabar o'chirildi" : payload?.content || existing.lastMessage,
            lastMessageAt: payload?.createdAt || existing.lastMessageAt,
            updatedAt: payload?.createdAt || existing.updatedAt,
            hasMessages: true,
            unread:
              senderId && senderId !== currentUserId
                ? Math.max(0, Number(existing.unread || 0)) + 1
                : existing.unread,
          };

          nextChats.splice(currentIndex, 1);
          nextChats.unshift(updatedChat);
          return nextChats;
        });
        if (payload?.chatId) {
          void queryClient.invalidateQueries({
            queryKey: ["messages", String(payload.chatId)],
          });
        }
      }),
      realtime.onChatEvent("message_updated", (payload) => {
        patchChatsCache((current) =>
          current.map((chat) =>
            getEntityId(chat) === String(payload?.chatId || "")
              ? {
                  ...chat,
                  lastMessage: payload?.content || chat.lastMessage,
                }
              : chat,
          ),
        );
        if (payload?.chatId) {
          void queryClient.invalidateQueries({
            queryKey: ["messages", String(payload.chatId)],
          });
        }
      }),
      realtime.onChatEvent("message_deleted", (payload) => {
        patchChatsCache((current) =>
          current.map((chat) =>
            getEntityId(chat) === String(payload?.chatId || "")
              ? {
                  ...chat,
                  lastMessage: "Xabar o'chirildi",
                }
              : chat,
          ),
        );
        if (payload?.chatId) {
          void queryClient.invalidateQueries({
            queryKey: ["messages", String(payload.chatId)],
          });
        }
      }),
      realtime.onChatEvent("messages_read", (payload) => {
        patchChatsCache((current) =>
          current.map((chat) => {
            if (getEntityId(chat) !== String(payload?.chatId || "")) {
              return chat;
            }

            if (String(payload?.readByUserId || "") !== currentUserId) {
              return chat;
            }

            return {
              ...chat,
              unread: Math.max(
                0,
                Number(chat.unread || 0) - Number(payload?.messageIds?.length || 0),
              ),
            };
          }),
        );
        if (payload?.chatId) {
          void queryClient.invalidateQueries({
            queryKey: ["messages", String(payload.chatId)],
          });
        }
      }),
      realtime.onChatEvent("chat_updated", (payload) => {
        patchChatsCache((current) => {
          const chatId = String(payload?.chatId || payload?._id || payload?.id || "");
          if (!chatId) {
            return current;
          }

          const currentIndex = current.findIndex((chat) => getEntityId(chat) === chatId);
          if (currentIndex === -1) {
            return current;
          }

          const nextChats = [...current];
          nextChats[currentIndex] = {
            ...nextChats[currentIndex],
            ...payload,
            _id: nextChats[currentIndex]._id || payload?._id || payload?.chatId,
            id: nextChats[currentIndex].id || payload?.id || payload?.chatId,
          };
          return nextChats;
        });
      }),
      realtime.onChatEvent("chat_deleted", (payload) => {
        patchChatsCache((current) =>
          current.filter((chat) => getEntityId(chat) !== String(payload?.chatId || "")),
        );
      }),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [currentUserId, queryClient, realtimeReadyKey, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void getAuthToken().then((token) => {
          if (token) {
            realtime.connect(token);
            realtime.emitPresencePing();
          }
        });
      }
    });

    return () => subscription.remove();
  }, [user]);

  return null;
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <GlobalScrollBehavior />
          <AppServices />
          <NavigationContainer ref={navigationRef} theme={navTheme}>
            <StatusBar style="light" backgroundColor={Colors.background} />
            <RootNavigator />
            <IncomingCallOverlay />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  callOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-start",
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  callCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 18,
  },
  callBadge: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },
  callTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  callSubtitle: {
    color: Colors.mutedText,
    fontSize: 14,
    marginTop: 4,
  },
  callActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  callActionGhost: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  callActionPrimary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  callRejectText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  callAcceptText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  launchScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
  },
  brandOrb: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    opacity: 0.18,
    marginBottom: 24,
  },
  brandTitle: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  brandSubtitle: {
    color: Colors.mutedText,
    fontSize: 15,
    marginTop: 8,
  },
  loader: {
    marginTop: 20,
  },
});
