import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Plus, Video } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { TextInput } from "../../components/TextInput";
import { UserDisplayName } from "../../components/UserDisplayName";
import { CreateMeetDialog } from "../calls/CreateMeetDialog";
import { CreateGroupDialog } from "./GroupDialogs";
import { chatsApi, meetsApi } from "../../lib/api";
import { loadCachedChats, saveCachedChats } from "../../lib/chat-cache";
import { buildJoinUrl } from "../../config/env";
import { realtime } from "../../lib/realtime";
import type { MainTabScreenProps, RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type { ChatSummary, MeetSummary, User } from "../../types/entities";
import {
  formatChatTime,
  getChatAvatarUri,
  getChatPreview,
  getChatSecondaryLabel,
  getOtherMember,
  getChatTitle,
  getEntityId,
  getDirectChatUserLabel,
} from "../../utils/chat";

type Props = MainTabScreenProps<"Chats">;
type ChatTab = "private" | "group";
const ONLINE_PRESENCE_WINDOW_MS = 45_000;
const PRESENCE_RESYNC_INTERVAL_MS = 15_000;
const MEET_ROOM_ID_PATTERN = /^[a-z0-9_-]{4,128}$/i;

const randomMeetToken = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

const buildMeetPayload = () => {
  const token = randomMeetToken().toLowerCase();
  const roomId = `meet-${token}`;

  return {
    roomId,
    title: roomId,
    isPrivate: false,
  } satisfies Pick<MeetSummary, "roomId" | "title" | "isPrivate">;
};

export function ChatsScreen({ navigation }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ChatTab>("private");
  const [searchQuery, setSearchQuery] = useState("");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createMeetOpen, setCreateMeetOpen] = useState(false);
  const [meetDialogLoading, setMeetDialogLoading] = useState(false);
  const [meetDialogError, setMeetDialogError] = useState("");
  const [activeMeet, setActiveMeet] = useState<MeetSummary | null>(null);
  const [meetCopied, setMeetCopied] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [chatCacheHydrated, setChatCacheHydrated] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>(() => realtime.getOnlineUserIds());
  const deferredSearchQuery = searchQuery.trim().toLowerCase();
  const pagerRef = useRef<ScrollView>(null);
  const pagerScrollX = useRef(new Animated.Value(0)).current;
  const currentIndexRef = useRef(0);
  const [tabsWidth, setTabsWidth] = useState(0);

  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: chatsApi.fetchChats,
  });

  const currentUserId = getEntityId(user);
  const rootNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  const activeTabRef = useRef<ChatTab>("private");
  const meetCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasChatsSnapshot = Array.isArray(chatsQuery.data);

  activeTabRef.current = activeTab;

  useEffect(() => {
    let cancelled = false;
    setChatCacheHydrated(false);

    if (!currentUserId) {
      setChatCacheHydrated(true);
      return;
    }

    const hydrateCachedChatList = async () => {
      try {
        const cachedChats = await loadCachedChats(currentUserId);
        if (!cancelled && cachedChats && !queryClient.getQueryData(["chats"])) {
          queryClient.setQueryData(["chats"], cachedChats);
        }
      } catch (error) {
        console.warn("Failed to hydrate cached chats", error);
      } finally {
        if (!cancelled) {
          setChatCacheHydrated(true);
        }
      }
    };

    void hydrateCachedChatList();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, queryClient]);

  useEffect(() => {
    if (!currentUserId || !hasChatsSnapshot) {
      return;
    }

    void saveCachedChats(currentUserId, chatsQuery.data || []).catch((error) => {
      console.warn("Failed to persist chats cache", error);
    });
  }, [currentUserId, hasChatsSnapshot, chatsQuery.data]);

  useEffect(() => {
    const nextIndex = activeTab === "group" ? 1 : 0;
    currentIndexRef.current = nextIndex;
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({
        x: nextIndex * screenWidth,
        animated: false,
      });
    });
  }, [activeTab, screenWidth]);

  useEffect(() => {
    return () => {
      if (meetCopyTimeoutRef.current) {
        clearTimeout(meetCopyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: createGroupOpen ? { display: "none" } : undefined,
    });

    return () => {
      navigation.setOptions({
        tabBarStyle: undefined,
      });
    };
  }, [createGroupOpen, navigation]);

  const knownUsers = useMemo(() => {
    const map = new Map<string, NonNullable<ChatSummary["members"]>[number]>();

    (chatsQuery.data || []).forEach((chat) => {
      chat.members?.forEach((member) => {
        const memberId = getEntityId(member);
        if (!memberId || memberId === currentUserId) {
          return;
        }
        map.set(memberId, member);
      });
    });

    return Array.from(map.values());
  }, [chatsQuery.data, currentUserId]);
  const knownUserIds = useMemo(
    () =>
      Array.from(
        new Set(
          knownUsers
            .map((member) => getEntityId(member))
            .filter((memberId) => memberId && memberId !== currentUserId),
        ),
      ),
    [currentUserId, knownUsers],
  );

  const privateUnreadTotal = useMemo(
    () =>
      (chatsQuery.data || []).reduce((total, chat) => {
        if (chat.isGroup) return total;
        return total + Math.max(0, Number(chat.unread) || 0);
      }, 0),
    [chatsQuery.data],
  );

  const groupUnreadTotal = useMemo(
    () =>
      (chatsQuery.data || []).reduce((total, chat) => {
        if (!chat.isGroup) return total;
        return total + Math.max(0, Number(chat.unread) || 0);
      }, 0),
    [chatsQuery.data],
  );
  const onlineUserIdSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);
  const isUserCurrentlyOnline = (targetUser?: User | null) => {
    const targetUserId = getEntityId(targetUser);
    if (!targetUserId) {
      return false;
    }

    if (onlineUserIdSet.has(targetUserId)) {
      return true;
    }

    const lastSeenValue = targetUser?.lastSeen;
    if (!lastSeenValue) {
      return false;
    }

    const lastSeenDate = new Date(lastSeenValue);
    if (Number.isNaN(lastSeenDate.getTime())) {
      return false;
    }

    return Date.now() - lastSeenDate.getTime() <= ONLINE_PRESENCE_WINDOW_MS;
  };

  useEffect(() => {
    const subscriptions = [
      realtime.onPresenceEvent("user_online", (payload) => {
        const onlineUserId = String(payload?.userId || "");
        if (!onlineUserId) {
          return;
        }

        setOnlineUserIds((previous) =>
          previous.includes(onlineUserId) ? previous : [...previous, onlineUserId],
        );
      }),
      realtime.onPresenceEvent("user_offline", (payload) => {
        const offlineUserId = String(payload?.userId || "");
        if (!offlineUserId) {
          return;
        }

        setOnlineUserIds((previous) => previous.filter((userId) => userId !== offlineUserId));
      }),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
    };
  }, []);

  useEffect(() => {
    if (!knownUserIds.length) {
      return;
    }

    let cancelled = false;

    const syncPresenceSnapshot = async () => {
      try {
        const nextOnlineUserIds = await realtime.syncOnlineUsers(knownUserIds);
        if (!cancelled) {
          setOnlineUserIds(nextOnlineUserIds);
        }
      } catch (error) {
        console.warn("Failed to sync presence statuses", error);
      }
    };

    void syncPresenceSnapshot();
    const interval = setInterval(() => {
      void syncPresenceSnapshot();
    }, PRESENCE_RESYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [knownUserIds]);

  const filteredChats = useMemo(() => {
    return (chatsQuery.data || []).filter((chat) => {
      if (!deferredSearchQuery) {
        return true;
      }

      const haystack = [
        getChatTitle(chat, currentUserId),
        getChatPreview(chat),
        getChatSecondaryLabel(chat, currentUserId),
        chat.urlSlug,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(deferredSearchQuery);
    });
  }, [chatsQuery.data, currentUserId, deferredSearchQuery]);

  const privateChats = useMemo(
    () => filteredChats.filter((chat) => !chat.isGroup),
    [filteredChats],
  );
  const groupChats = useMemo(
    () => filteredChats.filter((chat) => Boolean(chat.isGroup)),
    [filteredChats],
  );

  const animateToTab = (nextTab: ChatTab, withHaptics = false) => {
    if (withHaptics) {
      void Haptics.selectionAsync();
    }

    const nextIndex = nextTab === "group" ? 1 : 0;
    currentIndexRef.current = nextIndex;
    setActiveTab(nextTab);
    pagerRef.current?.scrollTo({
      x: nextIndex * screenWidth,
      animated: true,
    });
  };

  const handleOpenChat = async (chat: ChatSummary) => {
    await Haptics.selectionAsync();
    rootNavigation?.navigate("ChatRoom", {
      chatId: getEntityId(chat),
      title: getChatTitle(chat, currentUserId),
      isGroup: Boolean(chat.isGroup),
    });
  };

  const handleRefreshChats = async () => {
    if (isPullRefreshing) {
      return;
    }

    setIsPullRefreshing(true);
    try {
      await chatsQuery.refetch();
    } finally {
      setIsPullRefreshing(false);
    }
  };

  const loadMeetDialog = async () => {
    setMeetDialogLoading(true);
    setMeetDialogError("");
    setActiveMeet(null);

    try {
      const existingMeets = await meetsApi.fetchMyMeets();
      const existingMeet = Array.isArray(existingMeets) ? existingMeets[0] : null;

      if (existingMeet?.roomId && MEET_ROOM_ID_PATTERN.test(existingMeet.roomId)) {
        setActiveMeet(existingMeet);
        return;
      }

      if (existingMeet?.roomId) {
        await meetsApi.deleteMeet(existingMeet.roomId);
      }

      const payload = buildMeetPayload();
      const createdMeet = await meetsApi.createMeet(payload);
      setActiveMeet(createdMeet || payload);
    } catch (error) {
      setMeetDialogError(
        error instanceof Error
          ? error.message
          : "Meet tayyorlab bo'lmadi. Qaytadan urinib ko'ring.",
      );
    } finally {
      setMeetDialogLoading(false);
    }
  };

  const handleOpenMeet = async () => {
    await Haptics.selectionAsync();
    setMeetCopied(false);
    setCreateMeetOpen(true);
    void loadMeetDialog();
  };

  const handleCopyMeet = async () => {
    if (!activeMeet?.roomId) {
      return;
    }

    await Clipboard.setStringAsync(buildJoinUrl(activeMeet.roomId));
    setMeetCopied(true);
    if (meetCopyTimeoutRef.current) {
      clearTimeout(meetCopyTimeoutRef.current);
    }
    meetCopyTimeoutRef.current = setTimeout(() => setMeetCopied(false), 1800);
  };

  const handleStartMeet = () => {
    if (!activeMeet?.roomId) {
      return;
    }

    setCreateMeetOpen(false);
    rootNavigation?.navigate("GroupMeet", {
      roomId: activeMeet.roomId,
      title: activeMeet.title || activeMeet.roomId,
      isCreator: true,
      isPrivate: Boolean(activeMeet.isPrivate),
    });
  };

  const handleCreateGroup = async (draft: {
    name: string;
    description: string;
    avatarUri?: string | null;
    memberIds: string[];
  }) => {
    let avatar = draft.avatarUri || "";

    if (avatar && !avatar.startsWith("http")) {
      avatar = await chatsApi.uploadGroupAvatar(avatar);
    }

    const createdChat = await chatsApi.createChat({
      isGroup: true,
      name: draft.name,
      description: draft.description,
      avatar,
      memberIds: draft.memberIds,
    });

    await queryClient.invalidateQueries({ queryKey: ["chats"] });
    setCreateGroupOpen(false);
    rootNavigation?.navigate("ChatRoom", {
      chatId: getEntityId(createdChat),
      title: getChatTitle(createdChat, currentUserId),
      isGroup: true,
    });
  };

  const indicatorTranslateX =
    tabsWidth > 0
      ? pagerScrollX.interpolate({
          inputRange: [0, screenWidth],
          outputRange: [0, tabsWidth / 2],
          extrapolate: "clamp",
        })
      : 0;

  const renderChatList = (tab: ChatTab, chats: ChatSummary[]) => (
    <>
      {!chatCacheHydrated || (chatsQuery.isLoading && !hasChatsSnapshot) ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.helperText}>Chatlar yuklanmoqda...</Text>
        </View>
      ) : chatsQuery.isError && !hasChatsSnapshot ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={28} color={Colors.warning} />
          <Text style={styles.errorTitle}>Serverga ulanib bo'lmadi</Text>
          <Text style={styles.helperText}>
            {chatsQuery.error instanceof Error
              ? chatsQuery.error.message
              : "Noma'lum xatolik"}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => chatsQuery.refetch()}>
            <Text style={styles.retryText}>Qayta urinish</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={chats}
          keyExtractor={(item) => getEntityId(item)}
          drawDistance={320}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isPullRefreshing}
              onRefresh={() => void handleRefreshChats()}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name={tab === "private" ? "chatbubble-ellipses-outline" : "people-outline"}
                size={32}
                color={Colors.mutedText}
              />
              <Text style={styles.emptyTitle}>
                {tab === "private"
                  ? "Hozircha private chat yo'q"
                  : "Hozircha group yo'q"}
              </Text>
              <Text style={styles.helperText}>Qidiruv yoki yangi suhbatdan boshlang.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const title = getChatTitle(item, currentUserId);
            const avatarUri = getChatAvatarUri(item, currentUserId);
            const secondaryLabel = getChatSecondaryLabel(item, currentUserId);
            const unreadCount = Math.max(0, Number(item.unread) || 0);
            const otherMember = item.isGroup ? null : getOtherMember(item, currentUserId);
            const previewText = getChatPreview(item) || secondaryLabel;
            const isPrivateOnline = Boolean(otherMember && isUserCurrentlyOnline(otherMember));
            const groupOnlineCount = item.isGroup
              ? item.members?.filter((member) => {
                  const memberId = getEntityId(member);
                  return memberId && memberId !== currentUserId && isUserCurrentlyOnline(member);
                }).length || 0
              : 0;

            return (
              <Pressable
                onPress={() => handleOpenChat(item)}
                style={({ pressed }) => [styles.chatRow, pressed && styles.chatRowPressed]}
              >
                <View style={styles.avatarWrap}>
                  <Avatar
                    label={title}
                    uri={avatarUri}
                    size={40}
                    isSavedMessages={Boolean(item.isSavedMessages)}
                    isGroup={Boolean(item.isGroup)}
                    shape="circle"
                  />
                  {!item.isGroup && !item.isSavedMessages ? (
                    <View
                      style={[
                        styles.onlineDot,
                        isPrivateOnline ? styles.onlineDotActive : styles.onlineDotInactive,
                      ]}
                    />
                  ) : null}
                </View>

                <View style={styles.chatBody}>
                  <View style={styles.chatMainRow}>
                    <View style={styles.chatInfo}>
                      {otherMember ? (
                        <UserDisplayName
                          user={otherMember}
                          fallback={getDirectChatUserLabel(otherMember)}
                          size="sm"
                          numberOfLines={1}
                          textStyle={styles.chatTitleText}
                          containerStyle={styles.chatTitleWithDecoration}
                        />
                      ) : (
                        <Text style={styles.chatTitle} numberOfLines={1}>
                          {title}
                        </Text>
                      )}
                      <Text style={styles.previewText} numberOfLines={1}>
                        {item.isGroup && groupOnlineCount > 0
                          ? `${previewText} · ${groupOnlineCount} online`
                          : previewText}
                      </Text>
                    </View>

                    <View style={styles.chatMeta}>
                      <Text style={styles.timeText}>{formatChatTime(item)}</Text>
                      {unreadCount > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadText}>{unreadCount}</Text>
                        </View>
                      ) : (
                        <View style={styles.unreadBadgeSpacer} />
                      )}
                    </View>
                  </View>

                  {item.isGroup && !item.lastMessage ? (
                    <Text style={styles.secondaryMeta} numberOfLines={1}>
                      {secondaryLabel}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <View style={styles.topHeader}>
          <View style={styles.searchShell}>
            <Ionicons name="search-outline" size={16} color={Colors.subtleText} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Qidirish"
              placeholderTextColor={Colors.subtleText}
              style={styles.searchInput}
            />
          </View>

          <View style={styles.headerActions}>
          {activeTab === "group" ? (
            <Pressable style={styles.actionButton} onPress={() => setCreateGroupOpen(true)}>
              <Plus size={18} color={Colors.text} />
            </Pressable>
          ) : (
            <Pressable style={styles.actionButton} onPress={handleOpenMeet}>
              <Video size={18} color={Colors.text} />
            </Pressable>
          )}
        </View>
      </View>

        <View
          style={styles.segmentedControl}
          onLayout={(event) => setTabsWidth(event.nativeEvent.layout.width)}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.segmentIndicator,
              tabsWidth > 0
                ? {
                    width: tabsWidth / 2,
                    transform: [{ translateX: indicatorTranslateX as any }],
                  }
                : null,
            ]}
          />
          <Pressable
            style={styles.segmentButton}
            onPress={() => animateToTab("private", true)}
          >
            <Text style={[styles.segmentText, activeTab === "private" && styles.segmentTextActive]}>
              Chats
            </Text>
            {privateUnreadTotal > 0 ? (
              <View
                style={[
                  styles.segmentBadge,
                  activeTab === "private" && styles.segmentBadgeActive,
                ]}
              >
                <Text style={styles.segmentBadgeText}>
                  {privateUnreadTotal > 99 ? "99+" : privateUnreadTotal}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            style={styles.segmentButton}
            onPress={() => animateToTab("group", true)}
          >
            <Text style={[styles.segmentText, activeTab === "group" && styles.segmentTextActive]}>
              Groups
            </Text>
            {groupUnreadTotal > 0 ? (
              <View
                style={[
                  styles.segmentBadge,
                  activeTab === "group" && styles.segmentBadgeActive,
                ]}
              >
                <Text style={styles.segmentBadgeText}>
                  {groupUnreadTotal > 99 ? "99+" : groupUnreadTotal}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={styles.contentArea}>
          <Animated.ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            bounces={false}
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(
                event.nativeEvent.contentOffset.x / Math.max(screenWidth, 1),
              );
              const nextTab = nextIndex === 1 ? "group" : "private";
              currentIndexRef.current = nextIndex;
              setActiveTab(nextTab);
            }}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: pagerScrollX } } }],
              { useNativeDriver: false },
            )}
            style={styles.pagerTrack}
          >
            <View style={[styles.pagerPage, { width: screenWidth }]}>
              {renderChatList("private", privateChats)}
            </View>
            <View style={[styles.pagerPage, { width: screenWidth }]}>
              {renderChatList("group", groupChats)}
            </View>
          </Animated.ScrollView>
        </View>

      </View>

      <CreateGroupDialog
        visible={createGroupOpen}
        users={knownUsers}
        onClose={() => setCreateGroupOpen(false)}
        onCreate={handleCreateGroup}
      />
      <CreateMeetDialog
        visible={createMeetOpen}
        meet={activeMeet}
        meetUrl={activeMeet?.roomId ? buildJoinUrl(activeMeet.roomId) : ""}
        loading={meetDialogLoading}
        copied={meetCopied}
        error={meetDialogError}
        onClose={() => setCreateMeetOpen(false)}
        onRetry={() => void loadMeetDialog()}
        onCopy={() => void handleCopyMeet()}
        onStart={handleStartMeet}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchShell: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.input,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  segmentedControl: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    position: "relative",
  },
  contentArea: {
    flex: 1,
    overflow: "hidden",
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingVertical: 11,
    zIndex: 1,
  },
  segmentIndicator: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  segmentText: {
    color: Colors.subtleText,
    fontSize: 14,
    fontWeight: "500",
  },
  segmentTextActive: {
    color: Colors.text,
    fontWeight: "700",
  },
  segmentBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primarySoft,
  },
  segmentBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  segmentBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 28,
    backgroundColor: Colors.background,
  },
  helperText: {
    color: Colors.mutedText,
    textAlign: "center",
    lineHeight: 20,
  },
  errorTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 6,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
  },
  listContent: {
    paddingBottom: 110,
  },
  pagerTrack: {
    flex: 1,
    flexDirection: "row",
  },
  pagerPage: {
    flex: 1,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chatRowPressed: {
    backgroundColor: Colors.hover,
  },
  avatarWrap: {
    position: "relative",
  },
  onlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  onlineDotActive: {
    backgroundColor: Colors.primary,
  },
  onlineDotInactive: {
    backgroundColor: Colors.mutedText,
    opacity: 0.8,
  },
  chatBody: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  chatMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  chatInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  chatMeta: {
    width: 44,
    alignItems: "flex-end",
    gap: 6,
  },
  chatTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: "500",
  },
  chatTitleText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "500",
  },
  chatTitleWithDecoration: {
    gap: 3,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  previewText: {
    color: Colors.mutedText,
    fontSize: 13,
  },
  secondaryMeta: {
    color: Colors.mutedText,
    fontSize: 12,
    marginTop: 4,
  },
  timeText: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.badge,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeSpacer: {
    height: 20,
  },
  unreadText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingTop: 72,
    gap: 10,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
});
