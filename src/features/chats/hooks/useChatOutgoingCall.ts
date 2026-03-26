import { Alert } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { chatsApi } from "../../../lib/api";
import { realtime } from "../../../lib/realtime";
import type { RootStackParamList } from "../../../navigation/types";
import type { ChatSummary, User } from "../../../types/entities";
import { getDirectChatUserLabel, getEntityId } from "../../../utils/chat";

type OutgoingCallState = {
  roomId: string;
  remoteUser: User;
  chatId: string;
} | null;

export function useChatOutgoingCall({
  currentChat,
  otherMember,
  isOtherMemberOnline,
  currentUserId,
  navigation,
}: {
  currentChat: ChatSummary | null;
  otherMember: User | null;
  isOtherMemberOnline: boolean;
  currentUserId: string;
  navigation: NativeStackNavigationProp<RootStackParamList, "ChatRoom">;
}) {
  const [outgoingCall, setOutgoingCall] = useState<OutgoingCallState>(null);
  const outgoingCallRef = useRef<OutgoingCallState>(null);

  useEffect(() => {
    outgoingCallRef.current = outgoingCall;
  }, [outgoingCall]);

  useEffect(() => {
    if (!outgoingCall) {
      return;
    }

    const subscriptions = [
      realtime.onPresenceEvent("call:accepted", (payload) => {
        if (String(payload?.roomId || "") !== outgoingCall.roomId) {
          return;
        }

        const remoteUser = outgoingCall.remoteUser;
        outgoingCallRef.current = null;
        setOutgoingCall(null);
        navigation.navigate("PrivateMeet", {
          chatId: outgoingCall.chatId,
          roomId: outgoingCall.roomId,
          title: getDirectChatUserLabel(remoteUser),
          isCaller: true,
          remoteUser,
          requestAlreadySent: true,
        });
      }),
      realtime.onPresenceEvent("call:rejected", (payload) => {
        if (String(payload?.roomId || "") !== outgoingCall.roomId) {
          return;
        }

        outgoingCallRef.current = null;
        setOutgoingCall(null);
        Alert.alert("Private meet", "Qo'ng'iroq rad etildi");
      }),
      realtime.onPresenceEvent("call:cancelled", (payload) => {
        if (String(payload?.roomId || "") !== outgoingCall.roomId) {
          return;
        }

        outgoingCallRef.current = null;
        setOutgoingCall(null);
      }),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [navigation, outgoingCall]);

  useEffect(() => {
    return () => {
      const activeOutgoingCall = outgoingCallRef.current;
      if (!activeOutgoingCall) {
        return;
      }

      const remoteUserId = getEntityId(activeOutgoingCall.remoteUser);
      if (remoteUserId) {
        realtime.emitCallCancel(remoteUserId, activeOutgoingCall.roomId);
      }
    };
  }, []);

  const handleStartVideoCall = useCallback(async () => {
    if ((!currentChat?._id && !currentChat?.id) || !otherMember) {
      return;
    }

    if (!isOtherMemberOnline) {
      Alert.alert(
        "Private meet",
        "Qo'ng'iroq qilish uchun foydalanuvchi online bo'lishini kuting.",
      );
      return;
    }

    try {
      const chatId = getEntityId(currentChat);
      const activeCall = await chatsApi.getCallStatus(chatId);
      const canReuseOwnActiveCall =
        Boolean(activeCall.active && activeCall.roomId) &&
        String(activeCall.creatorId || "") === currentUserId;
      const result = canReuseOwnActiveCall
        ? { roomId: String(activeCall.roomId || "") }
        : await chatsApi.startVideoCall(chatId);

      realtime.emitCallRequest(
        getEntityId(otherMember),
        result.roomId,
        "video",
      );

      const nextOutgoingCall = {
        roomId: result.roomId,
        remoteUser: otherMember,
        chatId,
      };
      outgoingCallRef.current = nextOutgoingCall;
      setOutgoingCall(nextOutgoingCall);
    } catch (error) {
      Alert.alert(
        "Private meet ochilmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    }
  }, [currentChat, currentUserId, isOtherMemberOnline, otherMember]);

  const handleCancelOutgoingCall = useCallback(async () => {
    if (!outgoingCall) {
      return;
    }

    const remoteUserId = getEntityId(outgoingCall.remoteUser);
    if (remoteUserId) {
      realtime.emitCallCancel(remoteUserId, outgoingCall.roomId);
    }

    try {
      await chatsApi.endVideoCall(outgoingCall.chatId);
    } catch {
      // noop
    }

    outgoingCallRef.current = null;
    setOutgoingCall(null);
  }, [outgoingCall]);

  return {
    outgoingCall,
    handleStartVideoCall,
    handleCancelOutgoingCall,
  };
}
