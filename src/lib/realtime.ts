import { io, type Socket } from "socket.io-client";
import { buildSocketNamespaceUrl } from "../config/env";
import { presenceApi } from "./api";

type ChatEventMap = {
  message_new: (payload: any) => void;
  message_updated: (payload: any) => void;
  message_deleted: (payload: any) => void;
  messages_read: (payload: any) => void;
  chat_updated: (payload: any) => void;
  chat_deleted: (payload: any) => void;
  user_typing: (payload: any) => void;
};

type PresenceEventMap = {
  user_online: (payload: any) => void;
  user_offline: (payload: any) => void;
  "call:incoming": (payload: any) => void;
  "call:accepted": (payload: any) => void;
  "call:rejected": (payload: any) => void;
  "call:cancelled": (payload: any) => void;
};

class RealtimeManager {
  private chatsSocket: Socket | null = null;
  private presenceSocket: Socket | null = null;
  private token: string | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly joinedChats = new Set<string>();
  private readonly onlineUserIds = new Set<string>();
  private readonly chatListeners = new Map<string, Set<(...args: any[]) => void>>();
  private readonly presenceListeners = new Map<string, Set<(...args: any[]) => void>>();

  private bindStoredListeners() {
    this.chatListeners.forEach((handlers, event) => {
      handlers.forEach((handler) => {
        this.chatsSocket?.on(event, handler);
      });
    });

    this.presenceListeners.forEach((handlers, event) => {
      handlers.forEach((handler) => {
        this.presenceSocket?.on(event, handler);
      });
    });
  }

  private startPresenceHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.emitPresencePing();
    this.heartbeatInterval = setInterval(() => {
      this.emitPresencePing();
    }, 20_000);
  }

  private stopPresenceHeartbeat() {
    if (!this.heartbeatInterval) {
      return;
    }

    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  connect(token: string) {
    if (!token) {
      return;
    }

    const shouldReconnect = this.token !== token;
    this.token = token;

    if (shouldReconnect) {
      this.disconnect();
    }

    let didCreateChatsSocket = false;
    let didCreatePresenceSocket = false;

    if (!this.chatsSocket) {
      didCreateChatsSocket = true;
      this.chatsSocket = io(buildSocketNamespaceUrl("/chats"), {
        auth: { token },
        transports: ["websocket", "polling"],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1500,
      });

      this.chatsSocket.on("connect", () => {
        this.joinedChats.forEach((chatId) => {
          this.chatsSocket?.emit("join_chat", { chatId });
        });
      });
    }

    if (!this.presenceSocket) {
      didCreatePresenceSocket = true;
      this.presenceSocket = io(buildSocketNamespaceUrl("/presence"), {
        auth: { token },
        transports: ["websocket", "polling"],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1500,
      });

      this.presenceSocket.on("connect", () => {
        this.startPresenceHeartbeat();
      });

      this.presenceSocket.on("disconnect", () => {
        this.stopPresenceHeartbeat();
      });

      this.presenceSocket.on("user_online", (payload) => {
        const userId = String(payload?.userId || "");
        if (!userId) {
          return;
        }
        this.onlineUserIds.add(userId);
      });

      this.presenceSocket.on("user_offline", (payload) => {
        const userId = String(payload?.userId || "");
        if (!userId) {
          return;
        }
        this.onlineUserIds.delete(userId);
      });
    }

    if (didCreateChatsSocket || didCreatePresenceSocket) {
      this.bindStoredListeners();
    }
  }

  disconnect() {
    this.stopPresenceHeartbeat();
    this.chatsSocket?.disconnect();
    this.presenceSocket?.disconnect();
    this.chatsSocket = null;
    this.presenceSocket = null;
    this.onlineUserIds.clear();
  }

  getOnlineUserIds() {
    return Array.from(this.onlineUserIds);
  }

  async syncOnlineUsers(userIds: string[]) {
    const normalizedUserIds = Array.from(
      new Set(userIds.map((userId) => String(userId || "").trim()).filter(Boolean)),
    );

    if (!normalizedUserIds.length) {
      return this.getOnlineUserIds();
    }

    const response = await presenceApi.getBulkStatus(normalizedUserIds);

    normalizedUserIds.forEach((userId) => {
      this.onlineUserIds.delete(userId);
    });

    Object.entries(response.statuses || {}).forEach(([userId, isOnline]) => {
      if (isOnline) {
        this.onlineUserIds.add(String(userId));
      }
    });

    return this.getOnlineUserIds();
  }

  onChatEvent<EventName extends keyof ChatEventMap>(
    event: EventName,
    handler: ChatEventMap[EventName],
  ) {
    const normalizedEvent = String(event);
    const normalizedHandler = handler as (...args: any[]) => void;
    const handlers = this.chatListeners.get(normalizedEvent) || new Set();
    handlers.add(normalizedHandler);
    this.chatListeners.set(normalizedEvent, handlers);
    this.chatsSocket?.on(normalizedEvent, normalizedHandler);
    return () => {
      handlers.delete(normalizedHandler);
      if (!handlers.size) {
        this.chatListeners.delete(normalizedEvent);
      }
      this.chatsSocket?.off(normalizedEvent, normalizedHandler);
    };
  }

  onPresenceEvent<EventName extends keyof PresenceEventMap>(
    event: EventName,
    handler: PresenceEventMap[EventName],
  ) {
    const normalizedEvent = String(event);
    const normalizedHandler = handler as (...args: any[]) => void;
    const handlers = this.presenceListeners.get(normalizedEvent) || new Set();
    handlers.add(normalizedHandler);
    this.presenceListeners.set(normalizedEvent, handlers);
    this.presenceSocket?.on(normalizedEvent, normalizedHandler);
    return () => {
      handlers.delete(normalizedHandler);
      if (!handlers.size) {
        this.presenceListeners.delete(normalizedEvent);
      }
      this.presenceSocket?.off(normalizedEvent, normalizedHandler);
    };
  }

  emitJoinChat(chatId: string) {
    if (!chatId) return;
    this.joinedChats.add(chatId);
    this.chatsSocket?.emit("join_chat", { chatId });
  }

  emitLeaveChat(chatId: string) {
    if (!chatId) return;
    this.joinedChats.delete(chatId);
    this.chatsSocket?.emit("leave_chat", { chatId });
  }

  emitTyping(chatId: string, isTyping: boolean) {
    if (!chatId) return;
    this.chatsSocket?.emit(isTyping ? "typing_start" : "typing_stop", { chatId });
  }

  emitReadMessages(chatId: string, messageIds: string[]) {
    if (!chatId || !messageIds.length) return;
    this.chatsSocket?.emit("read_messages", { chatId, messageIds });
  }

  emitPresencePing() {
    this.presenceSocket?.emit("presence:ping");
  }

  emitCallRequest(toUserId: string, roomId: string, callType = "video") {
    if (!toUserId || !roomId) return;
    this.presenceSocket?.emit("call:request", { toUserId, roomId, callType });
  }

  emitCallAccept(toUserId: string, roomId: string) {
    if (!toUserId || !roomId) return;
    this.presenceSocket?.emit("call:accept", { toUserId, roomId });
  }

  emitCallReject(toUserId: string, roomId: string, reason?: string) {
    if (!toUserId || !roomId) return;
    this.presenceSocket?.emit("call:reject", { toUserId, roomId, reason });
  }

  emitCallCancel(toUserId: string, roomId: string) {
    if (!toUserId || !roomId) return;
    this.presenceSocket?.emit("call:cancel", { toUserId, roomId });
  }
}

export const realtime = new RealtimeManager();
