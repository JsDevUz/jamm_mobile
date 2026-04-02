import { useMemo } from "react";
import { Alert } from "react-native";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { chatsApi } from "../../../lib/api";
import type { ChatSummary, Message, User } from "../../../types/entities";
import {
  buildMessageItems,
  getEntityId,
  normalizeReadByIds,
  type MessageListItem,
} from "../../../utils/chat";

export type MessagesInfiniteData = InfiniteData<
  {
    data?: Message[];
    nextCursor?: string | null;
    hasMore?: boolean;
  },
  string | null
>;

export const getNormalizedSenderId = (senderId?: string | User | null) =>
  typeof senderId === "string" ? senderId : getEntityId(senderId);

export const getMessageIdentity = (
  message?: { _id?: string; id?: string } | null,
) => getEntityId(message);

export const getMessageDeliveryStatus = (message: Message) => {
  const explicitStatus = String(message.deliveryStatus || "").trim();
  if (explicitStatus) {
    return explicitStatus;
  }

  return normalizeReadByIds(message.readBy || []).length > 0 ? "read" : "sent";
};

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

const isMatchingOptimisticMessage = (
  message: Message,
  nextMessage: Message,
  currentUserId: string,
) => {
  if (getMessageDeliveryStatus(message) !== "pending") {
    return false;
  }

  const messageSenderId = String(getNormalizedSenderId(message.senderId) || "");
  const nextSenderId = String(
    getNormalizedSenderId(nextMessage.senderId) || "",
  );

  if (
    !currentUserId ||
    messageSenderId !== currentUserId ||
    nextSenderId !== currentUserId
  ) {
    return false;
  }

  if (
    String(message.content || "").trim() !==
    String(nextMessage.content || "").trim()
  ) {
    return false;
  }

  if (
    String(getMessageIdentity(message.replayTo) || "") !==
    String(getMessageIdentity(nextMessage.replayTo) || "")
  ) {
    return false;
  }

  const optimisticTime = new Date(message.createdAt || 0).getTime();
  const nextTime = new Date(nextMessage.createdAt || Date.now()).getTime();
  return Math.abs(nextTime - optimisticTime) < 120000;
};

export const patchMessagesPages = (
  previous: MessagesInfiniteData | undefined,
  updater: (
    pages: Array<{
      data?: Message[];
      nextCursor?: string | null;
      hasMore?: boolean;
    }>,
  ) => Array<{
    data?: Message[];
    nextCursor?: string | null;
    hasMore?: boolean;
  }>,
): MessagesInfiniteData => {
  const base =
    previous ||
    ({
      pages: [{ data: [], nextCursor: null, hasMore: false }],
      pageParams: [null],
    } satisfies MessagesInfiniteData);

  return {
    ...base,
    pages: updater(base.pages),
  };
};

export const upsertMessageInPages = (
  previous: MessagesInfiniteData | undefined,
  nextMessage: Message,
  currentUserId: string,
) =>
  patchMessagesPages(previous, (pages) => {
    let hasExactMessage = false;
    let optimisticReplaced = false;

    const nextPages = pages.map((page) => {
      const pageData = page.data || [];

      const exactIndex = pageData.findIndex(
        (message) =>
          getMessageIdentity(message) === getMessageIdentity(nextMessage),
      );

      if (exactIndex !== -1) {
        hasExactMessage = true;
        const updatedData = [...pageData];
        updatedData[exactIndex] = {
          ...updatedData[exactIndex],
          ...nextMessage,
          deliveryStatus: getMessageDeliveryStatus(nextMessage),
        };
        return {
          ...page,
          data: updatedData,
        };
      }

      const optimisticIndex = pageData.findIndex((message) =>
        isMatchingOptimisticMessage(message, nextMessage, currentUserId),
      );

      if (optimisticIndex !== -1) {
        optimisticReplaced = true;
        const updatedData = [...pageData];
        updatedData[optimisticIndex] = {
          ...nextMessage,
          deliveryStatus: getMessageDeliveryStatus(nextMessage),
          isLocalOnly: false,
        };
        return {
          ...page,
          data: updatedData,
        };
      }

      return page;
    });

    if (hasExactMessage || optimisticReplaced) {
      return nextPages;
    }

    const [latestPage, ...restPages] = nextPages;
    return [
      {
        ...latestPage,
        data: [...(latestPage?.data || []), nextMessage],
      },
      ...restPages,
    ];
  });

export const updateMessageByIdInPages = (
  previous: MessagesInfiniteData | undefined,
  messageId: string,
  updater: (message: Message) => Message | null,
) =>
  patchMessagesPages(previous, (pages) =>
    pages.map((page) => ({
      ...page,
      data: (page.data || []).flatMap((message) => {
        if (getMessageIdentity(message) !== messageId) {
          return [message];
        }

        const nextMessage = updater(message);
        return nextMessage ? [nextMessage] : [];
      }),
    })),
  );

export function useChatMessagesData({
  chatId,
  routeIsGroup,
  currentUserId,
  savedScrollOffset,
  initialScrollDone,
}: {
  chatId: string;
  routeIsGroup: boolean;
  currentUserId: string;
  savedScrollOffset: number | null;
  initialScrollDone: boolean;
}) {
  const queryClient = useQueryClient();

  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: chatsApi.fetchChats,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const currentChat = useMemo(
    () =>
      (chatsQuery.data || []).find(
        (chat) =>
          Boolean(chat.isGroup) === Boolean(routeIsGroup) &&
          (getEntityId(chat) === chatId ||
            chat.privateurl === chatId ||
            chat.urlSlug === chatId),
      ) || null,
    [chatId, chatsQuery.data, routeIsGroup],
  );

  const hasChatsSnapshot = Array.isArray(chatsQuery.data);

  const messagesQuery = useInfiniteQuery({
    queryKey: ["messages", chatId],
    queryFn: ({ pageParam }) => chatsApi.fetchMessages(chatId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });

  const hasMessagesSnapshot = Boolean(messagesQuery.data);
  const messagesPages = messagesQuery.data?.pages || [];
  const flatMessages = useMemo(
    () => [...messagesPages].reverse().flatMap((page) => page.data || []),
    [messagesPages],
  );
  const messageItems = useMemo(
    () => buildMessageItems(flatMessages),
    [flatMessages],
  );
  const stickyDateHeaderIndices = useMemo(
    () =>
      messageItems.reduce<number[]>((indices, item, index) => {
        if (item.type === "date") {
          indices.push(index);
        }
        return indices;
      }, []),
    [messageItems],
  );
  const initialMessageIndex =
    !initialScrollDone && savedScrollOffset === null && messageItems.length > 0
      ? messageItems.length - 1
      : undefined;

  const sendMutation = useMutation({
    mutationFn: ({
      content,
      replayToId,
      optimisticMessage,
    }: {
      content: string;
      replayToId?: string | null;
      optimisticMessage: Message;
    }) =>
      chatsApi.sendMessage({
        chatId,
        content,
        replayToId,
      }),
    onMutate: async ({ optimisticMessage }) => {
      await queryClient.cancelQueries({
        queryKey: ["messages", chatId],
      });
      queryClient.setQueryData<MessagesInfiniteData>(
        ["messages", chatId],
        (previous) =>
          patchMessagesPages(previous, (pages) => {
            const [latestPage, ...restPages] = pages;
            return [
              {
                ...latestPage,
                data: [...(latestPage?.data || []), optimisticMessage],
              },
              ...restPages,
            ];
          }),
      );
      return { optimisticMessageId: getMessageIdentity(optimisticMessage) };
    },
    onSuccess: (nextMessage) => {
      queryClient.setQueryData<MessagesInfiniteData>(
        ["messages", chatId],
        (previous) =>
          upsertMessageInPages(previous, nextMessage, currentUserId),
      );
    },
    onError: (error, _variables, context) => {
      if (context?.optimisticMessageId) {
        queryClient.setQueryData<MessagesInfiniteData>(
          ["messages", chatId],
          (previous) =>
            updateMessageByIdInPages(
              previous,
              context.optimisticMessageId,
              (message) => ({
                ...message,
                deliveryStatus: "failed",
                isLocalOnly: true,
              }),
            ),
        );
      }
      Alert.alert(
        "Xabar yuborilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    },
  });

  const editMutation = useMutation({
    mutationFn: ({
      messageId,
      content,
    }: {
      messageId: string;
      content: string;
    }) => chatsApi.editMessage(messageId, content),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["messages", chatId],
      });
    },
    onError: (error) => {
      Alert.alert(
        "Xabar tahrirlanmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => chatsApi.deleteMessage(messageId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["messages", chatId],
      });
    },
    onError: (error) => {
      Alert.alert(
        "Xabar o'chirilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    },
  });

  const chatPushNotificationsMutation = useMutation({
    mutationFn: ({ chatId: nextChatId, enabled }: { chatId: string; enabled: boolean }) =>
      chatsApi.updatePushNotifications(nextChatId, enabled),
    onMutate: async ({ chatId: nextChatId, enabled }) => {
      const previousChats = queryClient.getQueryData<ChatSummary[]>(["chats"]);
      const previousChat = queryClient.getQueryData<ChatSummary>(["chat", nextChatId]);
      if (previousChats) {
        queryClient.setQueryData<ChatSummary[]>(
          ["chats"],
          updateChatPushNotificationsInList(previousChats, nextChatId, enabled),
        );
      }
      if (previousChat) {
        queryClient.setQueryData<ChatSummary | undefined>(
          ["chat", nextChatId],
          updateChatPushNotificationsInSingleChat(previousChat, nextChatId, enabled),
        );
      }
      return { previousChats, previousChat };
    },
    onSuccess: (result, variables) => {
      const nextEnabled = result.enabled ?? variables.enabled;
      queryClient.setQueryData<ChatSummary[] | undefined>(["chats"], (current) =>
        updateChatPushNotificationsInList(current, variables.chatId, nextEnabled),
      );
      queryClient.setQueryData<ChatSummary | undefined>(["chat", variables.chatId], (current) =>
        updateChatPushNotificationsInSingleChat(current, variables.chatId, nextEnabled),
      );
    },
    onError: (error, _variables, context) => {
      if (context?.previousChats) {
        queryClient.setQueryData(["chats"], context.previousChats);
      }
      if (context?.previousChat) {
        queryClient.setQueryData(["chat", _variables.chatId], context.previousChat);
      }
      Alert.alert(
        "Bildirishnoma sozlanmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    },
  });

  return {
    chatsQuery,
    currentChat,
    hasChatsSnapshot,
    messagesQuery,
    hasMessagesSnapshot,
    flatMessages,
    messageItems,
    stickyDateHeaderIndices,
    initialMessageIndex,
    sendMutation,
    editMutation,
    deleteMutation,
    chatPushNotificationsMutation,
  };
}
