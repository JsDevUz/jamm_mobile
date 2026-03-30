import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { EditGroupDialog } from "./GroupDialogs";
import { chatsApi } from "../../lib/api";
import type { RootStackParamList } from "../../navigation/types";
import { Colors } from "../../theme/colors";
import type { ChatSummary } from "../../types/entities";
import { getEntityId } from "../../utils/chat";

type Props = NativeStackScreenProps<RootStackParamList, "EditGroup">;

export function EditGroupScreen({ navigation, route }: Props) {
  const queryClient = useQueryClient();
  const chatId = route.params.chatId;

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

  const knownUsers = useMemo(() => {
    const map = new Map<string, NonNullable<ChatSummary["members"]>[number]>();

    (chatsQuery.data || []).forEach((chat) => {
      chat.members?.forEach((member) => {
        const memberId = getEntityId(member);
        if (!memberId) {
          return;
        }
        map.set(memberId, member);
      });
    });

    return Array.from(map.values());
  }, [chatsQuery.data]);

  const currentChat = currentChatQuery.data || null;

  const handleEditGroup = async (draftData: {
    name: string;
    description: string;
    avatarUri?: string | null;
    memberIds: string[];
    admins?: any[];
  }) => {
    if (!currentChat) {
      return;
    }

    let nextAvatar = draftData.avatarUri || currentChat.avatar || "";
    if (nextAvatar && !nextAvatar.startsWith("http")) {
      nextAvatar = await chatsApi.updateGroupAvatar(chatId, nextAvatar);
    }

    await chatsApi.editChat(chatId, {
      name: draftData.name,
      description: draftData.description,
      avatar: nextAvatar,
      members: draftData.memberIds,
      admins: draftData.admins,
    });

    await queryClient.invalidateQueries({ queryKey: ["chats"] });
    await queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
    navigation.goBack();
  };

  if (!currentChat) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <EditGroupDialog
      visible
      asScreen
      group={currentChat}
      users={knownUsers}
      onClose={() => navigation.goBack()}
      onSave={handleEditGroup}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
