import { useEffect, type Dispatch, type SetStateAction } from "react";
import { setActiveNotificationChatId } from "../../../lib/notifications";
import { realtime } from "../../../lib/realtime";

type FocusNavigation = {
  isFocused: () => boolean;
  addListener: (event: "focus" | "blur", callback: () => void) => () => void;
};

export function useChatPresenceLifecycle({
  navigation,
  chatId,
  currentChatMemberIds,
  presenceResyncIntervalMs,
  setOnlineUserIds,
  setLastSeenByUserId,
}: {
  navigation: FocusNavigation;
  chatId: string;
  currentChatMemberIds: string[];
  presenceResyncIntervalMs: number;
  setOnlineUserIds: Dispatch<SetStateAction<string[]>>;
  setLastSeenByUserId: Dispatch<SetStateAction<Record<string, string | null>>>;
}) {
  useEffect(() => {
    const subscriptions = [
      realtime.onPresenceEvent("user_online", (payload) => {
        const onlineUserId = String(payload?.userId || "");
        if (!onlineUserId) {
          return;
        }

        setOnlineUserIds((previous) =>
          previous.includes(onlineUserId)
            ? previous
            : [...previous, onlineUserId],
        );
        setLastSeenByUserId((previous) => ({
          ...previous,
          [onlineUserId]: null,
        }));
      }),
      realtime.onPresenceEvent("user_offline", (payload) => {
        const offlineUserId = String(payload?.userId || "");
        if (!offlineUserId) {
          return;
        }

        setOnlineUserIds((previous) =>
          previous.filter((userId) => userId !== offlineUserId),
        );
        setLastSeenByUserId((previous) => ({
          ...previous,
          [offlineUserId]:
            typeof payload?.lastSeen === "string" && payload.lastSeen.trim()
              ? payload.lastSeen
              : null,
        }));
      }),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [setLastSeenByUserId, setOnlineUserIds]);

  useEffect(() => {
    if (!currentChatMemberIds.length) {
      return;
    }

    let cancelled = false;

    const syncPresenceSnapshot = async () => {
      try {
        const nextStatuses = await realtime.syncPresence(currentChatMemberIds);
        if (!cancelled) {
          setOnlineUserIds(
            Object.entries(nextStatuses)
              .filter(([, snapshot]) => Boolean(snapshot?.online))
              .map(([userId]) => userId),
          );
          setLastSeenByUserId((previous) => {
            const next = { ...previous };
            currentChatMemberIds.forEach((userId) => {
              next[userId] = nextStatuses[userId]?.lastSeen ?? null;
            });
            return next;
          });
        }
      } catch (error) {
        console.warn("Failed to sync presence statuses", error);
      }
    };

    void syncPresenceSnapshot();
    const interval = setInterval(() => {
      void syncPresenceSnapshot();
    }, presenceResyncIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    currentChatMemberIds,
    presenceResyncIntervalMs,
    setLastSeenByUserId,
    setOnlineUserIds,
  ]);

  useEffect(() => {
    if (navigation.isFocused()) {
      setActiveNotificationChatId(chatId);
    }

    const unsubscribeFocus = navigation.addListener("focus", () => {
      setActiveNotificationChatId(chatId);
    });
    const unsubscribeBlur = navigation.addListener("blur", () => {
      setActiveNotificationChatId(null);
    });

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
      setActiveNotificationChatId(null);
    };
  }, [chatId, navigation]);
}
