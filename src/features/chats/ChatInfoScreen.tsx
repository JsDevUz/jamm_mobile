import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Edit2 } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { UserDisplayName } from "../../components/UserDisplayName";
import { AvatarPreviewModal } from "./components/AvatarPreviewModal";
import { ChatGroupInfoPanel, ChatUserInfoPanel } from "./components/ChatInfoDrawer";
import { useChatConversationMeta } from "./hooks/useChatConversationMeta";
import { useChatPresenceLifecycle } from "./hooks/useChatPresenceLifecycle";
import { useChatStatusMeta } from "./hooks/useChatStatusMeta";
import { bootstrapPushNotifications } from "../../lib/notifications";
import { chatsApi } from "../../lib/api";
import { realtime } from "../../lib/realtime";
import { openJammAwareLink, openJammProfileMention } from "../../navigation/internalLinks";
import type { RootStackParamList } from "../../navigation/types";
import { Colors } from "../../theme/colors";
import type { ChatSummary, User } from "../../types/entities";
import useAuthStore from "../../store/auth-store";
import { getChatTitle, getDirectChatUserLabel, getEntityId } from "../../utils/chat";

type Props = NativeStackScreenProps<RootStackParamList, "ChatInfo">;

const PRESENCE_RESYNC_INTERVAL_MS = 15_000;

const updateChatPushNotificationsInList = (
  current: ChatSummary[] | undefined,
  chatId: string,
  enabled: boolean,
) =>
  current
    ? current.map((chat) =>
        getEntityId(chat) === chatId
          ? {
              ...chat,
              pushNotificationsEnabled: enabled,
            }
          : chat,
      )
    : current;

const updateChatPushNotificationsInSingleChat = (
  current: ChatSummary | undefined,
  chatId: string,
  enabled: boolean,
) =>
  current && getEntityId(current) === chatId
    ? {
        ...current,
        pushNotificationsEnabled: enabled,
      }
    : current;

export function ChatInfoScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const currentUserId = getEntityId(user);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>(() =>
    realtime.getOnlineUserIds(),
  );
  const [lastSeenByUserId, setLastSeenByUserId] = useState<
    Record<string, string | null>
  >(() => realtime.getLastSeenMap());
  const chatId = route.params.chatId;
  const targetUserId = route.params.userId ?? null;

  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: chatsApi.fetchChats,
    initialData: () => queryClient.getQueryData<ChatSummary[]>(["chats"]),
  });

  const currentChatQuery = useQuery({
    queryKey: ["chat", chatId],
    queryFn: () => chatsApi.getChat(chatId),
    initialData: () =>
      queryClient
        .getQueryData<ChatSummary[]>(["chats"])
        ?.find((chat) => getEntityId(chat) === chatId),
  });

  const currentChat = currentChatQuery.data || null;
  const isGroupChat = Boolean(currentChat?.isGroup ?? route.params.isGroup);
  const {
    chatTitle,
    currentChatMemberIds,
    canEditGroup,
    groupLinkUrl,
    otherMember,
    drawerUser,
    drawerAvatarUri,
    drawerTitle,
  } = useChatConversationMeta({
    chats: chatsQuery.data,
    currentChat,
    currentUserId,
    user,
    isGroupChat,
    infoDrawerUserId: targetUserId,
    fallbackTitle: route.params.title,
  });

  useChatPresenceLifecycle({
    navigation,
    chatId,
    currentChatMemberIds,
    presenceResyncIntervalMs: PRESENCE_RESYNC_INTERVAL_MS,
    setOnlineUserIds,
    setLastSeenByUserId,
  });

  const {
    drawerStatusLabel,
    drawerProfileMeta,
    chatPushNotificationsEnabled,
    showChatPushNotificationsToggle,
  } = useChatStatusMeta({
    currentChat,
    currentUserId,
    isGroupChat,
    otherMember,
    drawerUser,
    onlineUserIds,
    lastSeenByUserId,
    typingUserIds: [],
  });

  const chatPushNotificationsMutation = useMutation({
    mutationFn: ({ enabled }: { enabled: boolean }) =>
      chatsApi.updatePushNotifications(chatId, enabled),
    onMutate: async ({ enabled }) => {
      const previousChats = queryClient.getQueryData<ChatSummary[]>(["chats"]);
      const previousChat = queryClient.getQueryData<ChatSummary>(["chat", chatId]);
      if (previousChats) {
        queryClient.setQueryData<ChatSummary[]>(
          ["chats"],
          updateChatPushNotificationsInList(previousChats, chatId, enabled),
        );
      }
      if (previousChat) {
        queryClient.setQueryData<ChatSummary | undefined>(
          ["chat", chatId],
          updateChatPushNotificationsInSingleChat(previousChat, chatId, enabled),
        );
      }
      return { previousChats, previousChat };
    },
    onError: (error, _variables, context) => {
      if (context?.previousChats) {
        queryClient.setQueryData(["chats"], context.previousChats);
      }
      if (context?.previousChat) {
        queryClient.setQueryData(["chat", chatId], context.previousChat);
      }
      Alert.alert(
        "Bildirishnoma sozlanmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    },
    onSuccess: (result, variables) => {
      const nextEnabled = result.enabled ?? variables.enabled;
      queryClient.setQueryData<ChatSummary[] | undefined>(["chats"], (current) =>
        updateChatPushNotificationsInList(current, chatId, nextEnabled),
      );
      queryClient.setQueryData<ChatSummary | undefined>(["chat", chatId], (current) =>
        updateChatPushNotificationsInSingleChat(current, chatId, nextEnabled),
      );
    },
  });

  const handleToggleChatPushNotifications = useCallback(
    async (nextEnabled: boolean) => {
      if (chatPushNotificationsMutation.isPending || !currentChat) {
        return;
      }

      if (nextEnabled) {
        const permission = await Notifications.getPermissionsAsync();
        if (permission.status !== "granted") {
          await bootstrapPushNotifications().catch(() => null);
          const refreshedPermission = await Notifications.getPermissionsAsync();
          if (refreshedPermission.status !== "granted") {
            Alert.alert(
              "Push ruxsati kerak",
              "Bu chat uchun bildirishnomalarni yoqishdan oldin push notification ruxsatini bering.",
            );
            return;
          }
        }
      }

      chatPushNotificationsMutation.mutate({ enabled: nextEnabled });
    },
    [chatPushNotificationsMutation, currentChat],
  );

  const handleCopyGroupLink = useCallback(async () => {
    if (!groupLinkUrl) {
      return;
    }

    await Clipboard.setStringAsync(groupLinkUrl);
    void Haptics.selectionAsync();
  }, [groupLinkUrl]);

  const handleMentionPress = useCallback(
    (username: string) => {
      const normalizedUsername = String(username || "").trim().replace(/^@+/, "").toLowerCase();
      const currentUsername = String(user?.username || "").trim().toLowerCase();

      if (normalizedUsername && currentUsername && normalizedUsername === currentUsername) {
        const savedMessagesChat =
          queryClient
            .getQueryData<ChatSummary[]>(["chats"])
            ?.find((chat) => chat.isSavedMessages) || null;

        if (savedMessagesChat) {
          const savedChatId = getEntityId(savedMessagesChat);
          if (savedChatId) {
            navigation.push("ChatRoom", {
              chatId: savedChatId,
              title: getChatTitle(savedMessagesChat, currentUserId, user),
              isGroup: false,
            });
            return;
          }
        }
      }

      void openJammProfileMention(username).catch(() => {
        Alert.alert("Profil ochilmadi", `@${username}`);
      });
    },
    [currentUserId, navigation, queryClient, user],
  );

  const handleOpenLink = useCallback((url: string) => {
    void openJammAwareLink(url).catch(() => {
      Alert.alert("Link ochilmadi", url);
    });
  }, []);

  const handleOpenPrivateChatWithMember = useCallback(
    async (member: User) => {
      const memberId = getEntityId(member);
      if (!memberId) {
        return;
      }

      if (memberId === currentUserId) {
        return;
      }

      try {
        await Haptics.selectionAsync();
        const privateChat = await chatsApi.createChat({
          isGroup: false,
          memberIds: [memberId],
        });

        queryClient.setQueryData<ChatSummary[]>(["chats"], (current) => {
          const currentList = Array.isArray(current) ? current : [];
          const nextChatId = getEntityId(privateChat);
          if (!nextChatId) {
            return currentList;
          }

          const existingIndex = currentList.findIndex(
            (chat) => getEntityId(chat) === nextChatId,
          );
          if (existingIndex === -1) {
            return [privateChat, ...currentList];
          }

          const nextChats = [...currentList];
          nextChats.splice(existingIndex, 1);
          nextChats.unshift({
            ...currentList[existingIndex],
            ...privateChat,
          });
          return nextChats;
        });

        await queryClient.invalidateQueries({ queryKey: ["chats"] });
        navigation.push("ChatRoom", {
          chatId: getEntityId(privateChat),
          title: getChatTitle(privateChat, currentUserId, user),
          isGroup: false,
        });
      } catch (error) {
        Alert.alert(
          "Private chat ochilmadi",
          error instanceof Error
            ? error.message
            : "Noma'lum xatolik yuz berdi.",
        );
      }
    },
    [chatId, currentUserId, navigation, queryClient, route.params.isGroup, route.params.title, user],
  );

  const isLoading = currentChatQuery.isLoading && !currentChat;
  const errorMessage = useMemo(() => {
    if (!currentChatQuery.isError) {
      return null;
    }

    return currentChatQuery.error instanceof Error
      ? currentChatQuery.error.message
      : "Chat ma'lumotlarini yuklab bo'lmadi.";
  }, [currentChatQuery.error, currentChatQuery.isError]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={Colors.mutedText} />
          </Pressable>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {drawerTitle}
          </Text>

          {!drawerUser && canEditGroup ? (
            <Pressable
              style={styles.headerButton}
              onPress={() => navigation.push("EditGroup", { chatId })}
            >
              <Edit2 size={18} color={Colors.mutedText} />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.helperText}>Ma'lumotlar yuklanmoqda...</Text>
          </View>
        ) : errorMessage || !currentChat ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>Ma'lumot topilmadi</Text>
            <Text style={styles.helperText}>{errorMessage || "Chat topilmadi."}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(insets.bottom, 12) + 16 },
            ]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            <View style={styles.infoProfileBlock}>
              <Pressable
                style={styles.infoAvatarButton}
                disabled={!drawerAvatarUri}
                onPress={() => {
                  if (drawerAvatarUri) {
                    setAvatarPreviewOpen(true);
                  }
                }}
              >
                <Avatar
                  label={getDirectChatUserLabel(drawerUser) || chatTitle}
                  uri={drawerAvatarUri}
                  size={96}
                  isSavedMessages={Boolean(
                    currentChat?.isSavedMessages && !drawerUser,
                  )}
                  isGroup={Boolean(currentChat?.isGroup && !drawerUser)}
                  shape="circle"
                />
              </Pressable>
              {drawerUser ? (
                <View style={styles.infoProfileNameWrap}>
                  <UserDisplayName
                    user={drawerUser}
                    fallback={getDirectChatUserLabel(drawerUser)}
                    size="lg"
                    numberOfLines={2}
                    textStyle={styles.infoProfileName}
                    containerStyle={styles.infoProfileNameContainer}
                  />
                </View>
              ) : (
                <Text style={styles.infoProfileName}>{chatTitle}</Text>
              )}
              <Text style={styles.infoProfileMeta}>{drawerProfileMeta}</Text>
            </View>

            {drawerUser ? (
              <ChatUserInfoPanel
                styles={styles}
                drawerUser={drawerUser}
                drawerStatusLabel={drawerStatusLabel}
                currentChatIsGroup={Boolean(currentChat?.isGroup)}
                showChatPushNotificationsToggle={showChatPushNotificationsToggle}
                chatPushNotificationsEnabled={chatPushNotificationsEnabled}
                chatPushNotificationsPending={chatPushNotificationsMutation.isPending}
                onToggleChatPushNotifications={handleToggleChatPushNotifications}
                onPressMention={handleMentionPress}
                onOpenLink={handleOpenLink}
              />
            ) : (
              <ChatGroupInfoPanel
                styles={styles}
                currentChat={currentChat}
                groupLinkUrl={groupLinkUrl}
                showChatPushNotificationsToggle={showChatPushNotificationsToggle}
                chatPushNotificationsEnabled={chatPushNotificationsEnabled}
                chatPushNotificationsPending={chatPushNotificationsMutation.isPending}
                onToggleChatPushNotifications={handleToggleChatPushNotifications}
                onCopyGroupLink={handleCopyGroupLink}
                onPressMention={handleMentionPress}
                onOpenLink={handleOpenLink}
                onOpenPrivateChatWithMember={(member) => {
                  void handleOpenPrivateChatWithMember(member);
                }}
              />
            )}
          </ScrollView>
        )}
      </View>

      <AvatarPreviewModal
        styles={styles}
        visible={avatarPreviewOpen}
        avatarUri={drawerAvatarUri}
        onClose={() => setAvatarPreviewOpen(false)}
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
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: Colors.text,
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 12,
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  helperText: {
    color: Colors.mutedText,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  errorTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  infoProfileBlock: {
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
  },
  infoAvatarButton: {
    borderRadius: 999,
  },
  infoProfileNameWrap: {
    justifyContent: "center",
    alignItems: "center",
    maxWidth: "100%",
  },
  infoProfileNameContainer: {
    justifyContent: "center",
    alignItems: "center",
    maxWidth: "100%",
  },
  infoProfileName: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  infoProfileMeta: {
    color: Colors.mutedText,
    fontSize: 14,
    textAlign: "center",
  },
  infoCard: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  infoItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  infoSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoSwitchCopy: {
    flex: 1,
    gap: 4,
  },
  infoLabel: {
    color: Colors.mutedText,
    fontSize: 12,
    textTransform: "uppercase",
  },
  infoValue: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  infoLinkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  infoLinkValue: {
    flex: 1,
    color: Colors.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  infoCopyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -4,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  infoSection: {
    gap: 10,
  },
  infoSectionTitle: {
    color: Colors.subtleText,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  infoMembersList: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  memberRowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
  memberMetaText: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  memberRoleBadge: {
    color: Colors.primary,
    backgroundColor: Colors.primarySoft,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  messageText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  messageSelectableInput: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    minHeight: 0,
    textAlignVertical: "top",
    backgroundColor: "transparent",
  },
  messageLink: {
    color: "#7DB6FF",
    textDecorationLine: "underline",
  },
  messageMention: {
    color: Colors.primary,
    fontWeight: "700",
  },
  avatarPreviewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  avatarPreviewImage: {
    width: "100%",
    height: "100%",
    maxWidth: 520,
    maxHeight: "78%",
  },
});
