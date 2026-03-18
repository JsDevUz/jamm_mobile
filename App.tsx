import "react-native-gesture-handler";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  FlatList,
  Linking,
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
import { Delete, Lock } from "lucide-react-native";
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
import { GroupMeetRoute } from "./src/features/calls/GroupMeetRoute";
import { PrivateMeetRoute } from "./src/features/calls/PrivateMeetRoute";
import { FeedScreen } from "./src/features/feed/FeedScreen";
import { ProfileScreen } from "./src/features/profile/ProfileScreen";
import { ArticleDetailScreen, ArticlesScreen } from "./src/features/articles/ArticlesScreen";
import { ArenaFlashcardListScreen } from "./src/features/courses/ArenaFlashcardListScreen";
import { ArenaFlashcardStudyScreen } from "./src/features/courses/ArenaFlashcardStudyScreen";
import { ArenaMnemonicsScreen } from "./src/features/courses/ArenaMnemonicsScreen";
import { ArenaSentenceBuilderListScreen } from "./src/features/courses/ArenaSentenceBuilderListScreen";
import { ArenaQuizListScreen } from "./src/features/courses/ArenaQuizListScreen";
import { ArenaTestPlayerScreen } from "./src/features/courses/ArenaTestPlayerScreen";
import { CourseDetailScreen, CoursesScreen } from "./src/features/courses/CoursesScreen";
import type { MainTabsParamList, RootStackParamList } from "./src/navigation/types";
import { bootstrapPushNotifications } from "./src/lib/notifications";
import { realtime } from "./src/lib/realtime";
import {
  ApiError,
  chatsApi,
  releaseAppLockWaiters,
  setAppLockRequiredHandler,
  usersApi,
} from "./src/lib/api";
import { getAuthToken, setAppUnlockToken } from "./src/lib/session";
import { parseJammDeepLink, type JammDeepLinkTarget } from "./src/navigation/deepLinks";
import type { ChatSummary } from "./src/types/entities";
import { getEntityId } from "./src/utils/chat";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const APP_LOCK_PIN_LENGTH = 4;
const APP_LOCK_TITLE = "Jamm qulflandi";
const APP_LOCK_DESCRIPTION = "Davom etish uchun 4 xonali app parolingizni kiriting.";
const APP_LOCK_INVALID_PIN = "Parol noto'g'ri";
const APP_LOCK_FOOTER = "PIN faqat serverda tekshiriladi.";
const APP_LOCK_FORGOT_HELP =
  "PIN unutdingizmi? Unda dasturdan chiqib ketib qayta kirishingiz mumkin, shunda parol so'ralmaydi.";
const APP_LOCK_LOGOUT_ACTION = "Log out";
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

function findChatByIdentifier(chats: ChatSummary[], identifier: string) {
  const needle = String(identifier || "").trim();
  if (!needle) {
    return null;
  }

  return (
    chats.find((chat) => {
      const candidates = [
        String(chat._id || ""),
        String(chat.id || ""),
        String(chat.jammId || ""),
        String(chat.urlSlug || ""),
        String(chat.privateurl || ""),
      ].filter(Boolean);

      return candidates.includes(needle);
    }) || null
  );
}

function upsertChatSummary(chats: ChatSummary[], chat: ChatSummary) {
  const nextChatId = String(chat._id || chat.id || "");
  if (!nextChatId) {
    return chats;
  }

  const existingIndex = chats.findIndex(
    (item) =>
      String(item._id || item.id || "") === nextChatId ||
      String(item.jammId || "") === String(chat.jammId || "") ||
      String(item.urlSlug || "") === String(chat.urlSlug || ""),
  );

  if (existingIndex === -1) {
    return [chat, ...chats];
  }

  const existingChat = chats[existingIndex];
  const nextChats = [...chats];
  nextChats.splice(existingIndex, 1);
  nextChats.unshift({
    ...existingChat,
    ...chat,
  });
  return nextChats;
}

function LaunchScreen() {
  return (
    <SafeAreaView style={styles.launchScreen} edges={["top", "left", "right"]}>
      <View style={styles.brandOrb} />
      <Text style={styles.brandTitle}>Jamm</Text>
      <Text style={styles.brandSubtitle}>Barchasi bir joyda!</Text>
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
      tabBar={({ navigation, state, descriptors }) => {
        const activeKey = state.routes[state.index]?.key;
        const activeOptions = activeKey ? descriptors[activeKey]?.options : undefined;
        const tabBarDisplay = (activeOptions?.tabBarStyle as { display?: string } | undefined)
          ?.display;

        if (tabBarDisplay === "none") {
          return null;
        }

        return (
          <BottomNav
            activeRoute={state.routeNames[state.index] as keyof MainTabsParamList}
            navigation={navigation}
          />
        );
      }}
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
            name="ArticleDetail"
            component={ArticleDetailScreen}
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="CourseDetail"
            component={CourseDetailScreen}
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="ChatRoom"
            component={ChatScreen}
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="ArenaQuizList"
            component={ArenaQuizListScreen}
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="ArenaFlashcardList"
            component={ArenaFlashcardListScreen}
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="ArenaSentenceBuilderList"
            component={ArenaSentenceBuilderListScreen}
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="ArenaMnemonics"
            component={ArenaMnemonicsScreen}
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="ArenaFlashcardStudy"
            component={ArenaFlashcardStudyScreen}
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="ArenaTestPlayer"
            component={ArenaTestPlayerScreen}
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="PrivateMeet"
            component={PrivateMeetRoute}
            options={{ animation: "fade_from_bottom" }}
          />
          <Stack.Screen
            name="GroupMeet"
            component={GroupMeetRoute}
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
        <Text style={styles.callSubtitle}>Private qo'ng'iroq kiryapti</Text>
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

function AppLockOverlay() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const dotAnimations = useRef(
    Array.from({ length: APP_LOCK_PIN_LENGTH }, () => new Animated.Value(0)),
  ).current;
  const isVisible = Boolean(user && user.appLockSessionUnlocked === false);

  useEffect(() => {
    if (!isVisible) {
      setPin("");
      setError("");
      setVerifying(false);
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || !verifying) {
      dotAnimations.forEach((value) => {
        value.stopAnimation();
        value.setValue(0);
      });
      return;
    }

    const loops = dotAnimations.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 120),
          Animated.timing(value, {
            toValue: 1,
            duration: 450,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 450,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    loops.forEach((animation) => animation.start());

    return () => {
      loops.forEach((animation) => animation.stop());
      dotAnimations.forEach((value) => value.setValue(0));
    };
  }, [dotAnimations, isVisible, verifying]);

  useEffect(() => {
    if (!isVisible || pin.length !== APP_LOCK_PIN_LENGTH || verifying) {
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        setVerifying(true);
        setError("");

        try {
          const result = await usersApi.verifyAppLockPin({ pin });

          if (!result?.valid || !result.unlockToken) {
            setPin("");
            setError(APP_LOCK_INVALID_PIN);
            setVerifying(false);
            return;
          }

          await setAppUnlockToken(result.unlockToken);
          if (user) {
            setUser({
              ...user,
              appLockEnabled: user.appLockEnabled ?? true,
              appLockSessionUnlocked: true,
            });
          }
          releaseAppLockWaiters();
          setPin("");
          setError("");
          setVerifying(false);
          void queryClient.invalidateQueries();
        } catch (verifyError) {
          await setAppUnlockToken(null);
          setPin("");
          setVerifying(false);
          setError(
            verifyError instanceof ApiError && verifyError.status < 500
              ? APP_LOCK_INVALID_PIN
              : "PIN tekshirib bo'lmadi. Internetni tekshiring.",
          );
        }
      })();
    }, 120);

    return () => clearTimeout(timer);
  }, [isVisible, pin, queryClient, setUser, user, verifying]);

  if (!isVisible) {
    return null;
  }

  const handleDigitPress = (digit: string) => {
    if (verifying || pin.length >= APP_LOCK_PIN_LENGTH) {
      return;
    }

    setPin((currentPin) => `${currentPin}${digit}`.slice(0, APP_LOCK_PIN_LENGTH));
    setError("");
  };

  const handleBackspace = () => {
    if (verifying) {
      return;
    }

    setPin((currentPin) => currentPin.slice(0, -1));
    setError("");
  };

  const handleLogout = async () => {
    await setAppUnlockToken(null);
    releaseAppLockWaiters();
    setPin("");
    setError("");
    setVerifying(false);
    await logout();
  };

  const keypadRows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["ghost", "0", "backspace"],
  ] as const;

  return (
    <View style={styles.appLockOverlay}>
      <SafeAreaView style={styles.appLockSafeArea} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.appLockCard}>
          <View style={styles.appLockHeader}>
            <View style={styles.appLockIconWrap}>
              <Lock size={24} color={Colors.primary} />
            </View>
            <Text style={styles.appLockTitle}>{APP_LOCK_TITLE}</Text>
          </View>
          <Text style={styles.appLockSubtitle}>{APP_LOCK_DESCRIPTION}</Text>

          <View style={styles.appLockDotsRow}>
            {Array.from({ length: APP_LOCK_PIN_LENGTH }).map((_, index) => (
              <Animated.View
                key={`lock-dot-${index}`}
                style={[
                  styles.appLockDot,
                  (verifying || pin.length > index) && styles.appLockDotFilled,
                  verifying
                    ? {
                        opacity: dotAnimations[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 1],
                        }),
                        transform: [
                          {
                            scale: dotAnimations[index].interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.82, 1.18],
                            }),
                          },
                        ],
                      }
                    : null,
                ]}
              />
            ))}
          </View>

          <Text
            style={[
              styles.appLockErrorText,
              error ? styles.appLockHintError : null,
            ]}
          >
            {error || " "}
          </Text>

          <View style={styles.appLockPad}>
            {keypadRows.map((row) => (
              <View key={row.join("-")} style={styles.appLockPadRow}>
                {row.map((key) => {
                  if (key === "ghost") {
                    return <View key={key} style={styles.appLockKeyGhost} />;
                  }

                  if (key === "backspace") {
                    return (
                      <Pressable
                        key={key}
                        style={({ pressed }) => [
                          styles.appLockKey,
                          styles.appLockKeyGhostButton,
                          pressed && styles.appLockKeyPressed,
                          (verifying || pin.length === 0) && styles.appLockKeyDisabled,
                        ]}
                        onPress={handleBackspace}
                        disabled={verifying || pin.length === 0}
                      >
                        <Delete size={22} color={Colors.text} />
                      </Pressable>
                    );
                  }

                  return (
                    <Pressable
                      key={key}
                      style={({ pressed }) => [
                        styles.appLockKey,
                        pressed && styles.appLockKeyPressed,
                        verifying && styles.appLockKeyDisabled,
                      ]}
                      onPress={() => handleDigitPress(key)}
                      disabled={verifying}
                    >
                      <Text style={styles.appLockKeyText}>{key}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.appLockFooter}>
            <Text style={styles.appLockFooterText}>{APP_LOCK_FOOTER}</Text>
            <Text style={styles.appLockFooterHelp}>{APP_LOCK_FORGOT_HELP}</Text>
            <Pressable onPress={() => void handleLogout()} disabled={verifying}>
              <Text style={styles.appLockFooterLink}>{APP_LOCK_LOGOUT_ACTION}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function AppServices() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const [realtimeReadyKey, setRealtimeReadyKey] = useState(0);
  const currentUserId = getEntityId(user);
  const lockSession = () => {
    void setAppUnlockToken(null);

    if (!user) {
      return;
    }

    if (user.appLockSessionUnlocked === false) {
      return;
    }

    setUser({
      ...user,
      appLockEnabled: user.appLockEnabled ?? true,
      appLockSessionUnlocked: false,
    });
  };

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
    setAppLockRequiredHandler(() => {
      lockSession();
    });

    return () => {
      setAppLockRequiredHandler(null);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (state) => {
      if (
        user.appLockEnabled &&
        previousState === "active" &&
        (state === "inactive" || state === "background")
      ) {
        lockSession();
        void usersApi.lockAppSession().catch(() => undefined);
      }

      if (state === "active") {
        void getAuthToken().then((token) => {
          if (token) {
            realtime.connect(token);
            realtime.emitPresencePing();
          }
        });
      }

      previousState = state;
    });

    return () => subscription.remove();
  }, [user]);

  return null;
}

function DeepLinkBridge({ navigationReady }: { navigationReady: boolean }) {
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const currentUserId = getEntityId(user);
  const pendingUrlRef = useRef<string | null>(null);
  const handlingRef = useRef(false);

  const syncChatsCache = useCallback(async () => {
    const chats = await chatsApi.fetchChats();
    queryClient.setQueryData<ChatSummary[]>(["chats"], chats);
    return chats;
  }, [queryClient]);

  const saveChatToCache = useCallback(
    (chat: ChatSummary) => {
      queryClient.setQueryData<ChatSummary[]>(["chats"], (current) =>
        upsertChatSummary(Array.isArray(current) ? current : [], chat),
      );
    },
    [queryClient],
  );

  const openChatsTab = useCallback(() => {
    navigationRef.navigate("MainTabs", { screen: "Chats" } as never);
  }, []);

  const openArticlesTab = useCallback((articleId?: string) => {
    if (articleId) {
      navigationRef.navigate("ArticleDetail", { articleId });
      return;
    }

    navigationRef.navigate("MainTabs", { screen: "Articles" } as never);
  }, []);

  const openCoursesTab = useCallback(
    (params?: MainTabsParamList["Courses"]) => {
      if (params?.courseId) {
        navigationRef.navigate("CourseDetail", {
          courseId: params.courseId,
          lessonId: params.lessonId || undefined,
        });
        return;
      }

      navigationRef.navigate(
        "MainTabs",
        {
          screen: "Courses",
          params,
        } as never,
      );
    },
    [],
  );

  const openChatRoom = useCallback((chat: ChatSummary, fallbackTitle: string, isGroup = false) => {
    const chatId = String(chat._id || chat.id || "");
    if (!chatId) {
      throw new Error("Deep link uchun chat identifikatori topilmadi.");
    }

    navigationRef.navigate("ChatRoom", {
      chatId,
      title: String(chat.name || fallbackTitle || "Chat"),
      isGroup: typeof chat.isGroup === "boolean" ? chat.isGroup : isGroup,
    });
  }, []);

  const resolvePrivateChat = useCallback(
    async (identifier: string) => {
      const resolved = await chatsApi.resolveSlug(identifier);
      const expectedId = String(resolved.jammId || "");
      let chats = (queryClient.getQueryData<ChatSummary[]>(["chats"]) || []).slice();
      let match =
        findChatByIdentifier(chats, expectedId) || findChatByIdentifier(chats, identifier);

      if (!match) {
        chats = await syncChatsCache();
        match =
          findChatByIdentifier(chats, expectedId) || findChatByIdentifier(chats, identifier);
      }

      if (!match) {
        throw new Error("Havola uchun chat topilmadi.");
      }

      return match;
    },
    [queryClient, syncChatsCache],
  );

  const resolveGroupChat = useCallback(
    async (identifier: string) => {
      const chat = await chatsApi.joinGroupByLink(identifier);
      saveChatToCache(chat);
      return chat;
    },
    [saveChatToCache],
  );

  const resolveGenericChat = useCallback(
    async (identifier: string) => {
      const cachedChats = queryClient.getQueryData<ChatSummary[]>(["chats"]) || [];
      const cachedMatch = findChatByIdentifier(cachedChats, identifier);
      if (cachedMatch) {
        return cachedMatch;
      }

      if (identifier.startsWith("-")) {
        return resolveGroupChat(identifier);
      }

      return resolvePrivateChat(identifier);
    },
    [queryClient, resolveGroupChat, resolvePrivateChat],
  );

  const openDeepLinkTarget = useCallback(
    async (target: JammDeepLinkTarget) => {
      switch (target.kind) {
        case "home":
        case "chats":
          openChatsTab();
          return;
        case "feed":
          navigationRef.navigate("MainTabs", { screen: "Feed" } as never);
          return;
        case "articlesHome":
          openArticlesTab();
          return;
        case "coursesHome":
          openCoursesTab();
          return;
        case "profile":
          navigationRef.navigate("MainTabs", { screen: "Profile" } as never);
          return;
        case "coursesArena":
          openCoursesTab({ viewMode: "arena" });
          return;
        case "article":
          openArticlesTab(target.articleId);
          return;
        case "course":
          openCoursesTab({
            courseId: target.courseId,
            lessonId: target.lessonId || undefined,
          });
          return;
        case "groupChat": {
          const chat = await resolveGroupChat(target.identifier);
          openChatRoom(chat, target.identifier, true);
          return;
        }
        case "userChat": {
          const chat = await resolvePrivateChat(target.identifier);
          openChatRoom(chat, target.identifier, false);
          return;
        }
        case "chat": {
          const chat = await resolveGenericChat(target.identifier);
          openChatRoom(chat, target.identifier, Boolean(chat.isGroup));
          return;
        }
        case "groupMeet":
          navigationRef.navigate("GroupMeet", {
            roomId: target.roomId,
            title: "Jamm Meet",
            isCreator: false,
            isPrivate: false,
          });
          return;
        case "arenaTestsList":
          navigationRef.navigate("ArenaQuizList");
          return;
        case "arenaTest":
          navigationRef.navigate("ArenaTestPlayer", {
            testId: target.testId,
            shareShortCode: target.shareShortCode || null,
          });
          return;
        case "arenaFlashcards":
          navigationRef.navigate(
            "ArenaFlashcardList",
            target.deckId ? { deckId: target.deckId } : undefined,
          );
          return;
        case "arenaSentenceBuilder":
          navigationRef.navigate(
            "ArenaSentenceBuilderList",
            target.deckId || target.shareShortCode
              ? {
                  deckId: target.deckId,
                  shareShortCode: target.shareShortCode || null,
                }
              : undefined,
          );
          return;
        case "arenaMnemonics":
          navigationRef.navigate("ArenaMnemonics");
      }
    },
    [
      openArticlesTab,
      openChatRoom,
      openChatsTab,
      openCoursesTab,
      resolveGenericChat,
      resolveGroupChat,
      resolvePrivateChat,
    ],
  );

  const processPendingDeepLink = useCallback(async () => {
    const nextUrl = pendingUrlRef.current;
    if (
      !nextUrl ||
      handlingRef.current ||
      !navigationReady ||
      !initialized ||
      !currentUserId
    ) {
      return;
    }

    const target = parseJammDeepLink(nextUrl);
    pendingUrlRef.current = null;

    if (!target) {
      return;
    }

    handlingRef.current = true;

    try {
      await openDeepLinkTarget(target);
    } catch (error) {
      console.warn("Failed to process deep link", error);
    } finally {
      handlingRef.current = false;
      if (pendingUrlRef.current && pendingUrlRef.current !== nextUrl) {
        void processPendingDeepLink();
      }
    }
  }, [currentUserId, initialized, navigationReady, openDeepLinkTarget]);

  const queueDeepLink = useCallback(
    (url?: string | null) => {
      const trimmedUrl = String(url || "").trim();
      if (!trimmedUrl) {
        return;
      }

      pendingUrlRef.current = trimmedUrl;
      void processPendingDeepLink();
    },
    [processPendingDeepLink],
  );

  useEffect(() => {
    void Linking.getInitialURL()
      .then((url) => {
        queueDeepLink(url);
      })
      .catch(() => undefined);
  }, [queueDeepLink]);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      queueDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, [queueDeepLink]);

  useEffect(() => {
    void processPendingDeepLink();
  }, [processPendingDeepLink]);

  return null;
}

export default function App() {
  const [navigationReady, setNavigationReady] = useState(false);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <GlobalScrollBehavior />
          <AppServices />
          <DeepLinkBridge navigationReady={navigationReady} />
          <View style={styles.appShell}>
            <NavigationContainer
              ref={navigationRef}
              theme={navTheme}
              onReady={() => setNavigationReady(true)}
            >
              <StatusBar style="light" backgroundColor={Colors.background} />
              <RootNavigator />
            </NavigationContainer>
            <IncomingCallOverlay />
            <AppLockOverlay />
          </View>
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
  appShell: {
    flex: 1,
    position: "relative",
    backgroundColor: Colors.background,
  },
  appLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 10, 18, 0.78)",
    zIndex: 120,
  },
  appLockSafeArea: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  appLockCard: {
    borderRadius: 28,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.34,
    shadowRadius: 28,
    shadowOffset: {
      width: 0,
      height: 16,
    },
    elevation: 22,
  },
  appLockHeader: {
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 18,
    alignItems: "center",
  },
  appLockIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: "rgba(88, 101, 242, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  appLockTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  appLockSubtitle: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
    paddingHorizontal: 24,
  },
  appLockDotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
  },
  appLockDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: "transparent",
  },
  appLockDotFilled: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  appLockErrorText: {
    minHeight: 22,
    paddingHorizontal: 24,
    paddingBottom: 6,
    textAlign: "center",
    color: Colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  appLockHintError: {
    color: Colors.danger,
  },
  appLockPad: {
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
  },
  appLockPadRow: {
    flexDirection: "row",
    gap: 12,
  },
  appLockKey: {
    flex: 1,
    height: 68,
    borderRadius: 22,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  appLockKeyGhost: {
    flex: 1,
    height: 68,
  },
  appLockKeyGhostButton: {
    backgroundColor: "transparent",
  },
  appLockKeyPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  appLockKeyDisabled: {
    opacity: 0.5,
  },
  appLockKeyText: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "700",
  },
  appLockFooter: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: "center",
  },
  appLockFooterText: {
    color: Colors.mutedText,
    fontSize: 12,
    textAlign: "center",
  },
  appLockFooterHelp: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
  },
  appLockFooterLink: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
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
