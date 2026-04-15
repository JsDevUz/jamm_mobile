import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { io, type Socket } from "socket.io-client";
import {
  CameraOff,
  Camera as CameraIcon,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MonitorOff,
  PhoneOff,
  RefreshCcw,
  Shield,
  Timer,
} from "lucide-react-native";
import { RTCView, type MediaStream } from "@livekit/react-native-webrtc";
import { Room, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { PersistentCachedImage } from "../../components/PersistentCachedImage";
import { chatsApi } from "../../lib/api";
import { buildSocketNamespaceUrl } from "../../config/env";
import {
  createLivekitNativeRoom,
  ensureLivekitAudioSession,
  fetchLivekitConnection,
  getParticipantDisplayName,
  getParticipantStream,
  hasLiveVideoTrack,
  stopLivekitAudioSession,
  switchLivekitCamera,
} from "./livekit-native";
import { realtime } from "../../lib/realtime";
import { getAuthToken } from "../../lib/session";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import { getEntityId } from "../../utils/chat";
import { enterMeetPip, iosRtcPipProps, setMeetPipEnabled } from "./meet-pip";

type Props = NativeStackScreenProps<RootStackParamList, "PrivateMeet">;

const MAX_ROOM_JOIN_RETRIES = 6;
const PEER_LEFT_GRACE_MS = 6500;

const formatDuration = (elapsedSeconds: number) => {
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }

  return [minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
};

export function PrivateMeetScreen({ navigation, route }: Props) {
  const { roomId, remoteUser, isCaller, title, chatId, requestAlreadySent } = route.params;
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = getEntityId(currentUser);
  const remoteUserId = getEntityId(remoteUser);
  const displayName =
    currentUser?.nickname || currentUser?.username || currentUser?.email || "User";
  const remoteDisplayName =
    remoteUser.nickname || remoteUser.username || remoteUser.email || title || "User";

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callStatus, setCallStatus] = useState("Ulanmoqda...");
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [roomTitle, setRoomTitle] = useState(title || "Private meet");
  const [roomIsPrivate, setRoomIsPrivate] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isLocalPrimary, setIsLocalPrimary] = useState(false);
  const [isSystemPipMode, setIsSystemPipMode] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);
  const livekitConnectPromiseRef = useRef<Promise<Room | null> | null>(null);
  const pendingKnockPeerIdRef = useRef<string | null>(null);
  const remoteAcceptedRef = useRef(!isCaller || Boolean(requestAlreadySent));
  const hangupStartedRef = useRef(false);
  const callRequestSentRef = useRef(Boolean(requestAlreadySent));
  const callConnectedAtRef = useRef<number | null>(null);
  const peerLeftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMicOnRef = useRef(true);
  const isCamOnRef = useRef(true);

  useEffect(() => {
    isMicOnRef.current = isMicOn;
  }, [isMicOn]);

  useEffect(() => {
    isCamOnRef.current = isCamOn;
  }, [isCamOn]);

  useEffect(() => {
    if (callStatus !== "Ulandi") {
      callConnectedAtRef.current = null;
      setElapsedSeconds(0);
      return;
    }

    if (!callConnectedAtRef.current) {
      callConnectedAtRef.current = Date.now();
    }

    const interval = setInterval(() => {
      if (!callConnectedAtRef.current) {
        return;
      }

      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - callConnectedAtRef.current) / 1000)),
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [callStatus]);

  const clearPeerLeftTimeout = useCallback(() => {
    if (peerLeftTimeoutRef.current) {
      clearTimeout(peerLeftTimeoutRef.current);
      peerLeftTimeoutRef.current = null;
    }
  }, []);

  const schedulePeerLeftFallback = useCallback(() => {
    clearPeerLeftTimeout();
    setCallStatus("Qayta ulanmoqda...");
    peerLeftTimeoutRef.current = setTimeout(() => {
      setCallStatus("Qo'ng'iroq tugadi");
      setRemoteStream(null);
      setRemoteScreenStream(null);
      if (!hangupStartedRef.current) {
        navigation.goBack();
      }
    }, PEER_LEFT_GRACE_MS);
  }, [clearPeerLeftTimeout, navigation]);

  const syncLivekitState = useCallback(
    (room: Room | null) => {
      if (!room) {
        setLocalStream(null);
        setScreenStream(null);
        setRemoteStream(null);
        setRemoteScreenStream(null);
        setLoadingMedia(false);
        return;
      }

      const localCameraStream = getParticipantStream(room.localParticipant, Track.Source.Camera);
      const localScreenStream = getParticipantStream(room.localParticipant, Track.Source.ScreenShare);
      const localMicPublication = room.localParticipant.getTrackPublication(Track.Source.Microphone);

      setLocalStream(localCameraStream);
      setScreenStream(localScreenStream);
      setIsCamOn(Boolean(localCameraStream && hasLiveVideoTrack(localCameraStream)));
      setIsMicOn(Boolean(localMicPublication && !localMicPublication.isMuted));
      setIsScreenSharing(Boolean(localScreenStream && hasLiveVideoTrack(localScreenStream)));

      const remoteParticipant =
        Array.from(room.remoteParticipants.values())[0] as RemoteParticipant | undefined;
      const nextRemoteStream = getParticipantStream(remoteParticipant, Track.Source.Camera);
      const nextRemoteScreenStream = getParticipantStream(
        remoteParticipant,
        Track.Source.ScreenShare,
      );

      setRemoteStream(nextRemoteStream);
      setRemoteScreenStream(nextRemoteScreenStream);
      setLoadingMedia(false);

      if (remoteParticipant) {
        clearPeerLeftTimeout();
        setCallStatus("Ulandi");
        return;
      }

      if (room.state === "connected") {
        setCallStatus(remoteAcceptedRef.current || isCaller ? "Ulanmoqda..." : "Qabul tasdiqlanmoqda...");
      }
    },
    [clearPeerLeftTimeout, isCaller],
  );

  const disconnectLivekitRoom = useCallback(async () => {
    const room = livekitRoomRef.current;
    livekitRoomRef.current = null;
    livekitConnectPromiseRef.current = null;

    if (room) {
      room.removeAllListeners();
      room.disconnect();
    }
  }, []);

  const connectLivekitRoom = useCallback(async () => {
    if (livekitRoomRef.current) {
      return livekitRoomRef.current;
    }

    if (livekitConnectPromiseRef.current) {
      return livekitConnectPromiseRef.current;
    }

    livekitConnectPromiseRef.current = (async () => {
      try {
        await ensureLivekitAudioSession();
        const tokenPayload = await fetchLivekitConnection(roomId, displayName);
        const room = createLivekitNativeRoom();

        const sync = () => syncLivekitState(room);
        room
          .on(RoomEvent.Connected, sync)
          .on(RoomEvent.ConnectionStateChanged, sync)
          .on(RoomEvent.ParticipantConnected, sync)
          .on(RoomEvent.ParticipantDisconnected, () => {
            sync();
            if (room.remoteParticipants.size === 0) {
              schedulePeerLeftFallback();
            }
          })
          .on(RoomEvent.TrackSubscribed, sync)
          .on(RoomEvent.TrackUnsubscribed, sync)
          .on(RoomEvent.TrackMuted, sync)
          .on(RoomEvent.TrackUnmuted, sync)
          .on(RoomEvent.LocalTrackPublished, sync)
          .on(RoomEvent.LocalTrackUnpublished, sync)
          .on(RoomEvent.MediaDevicesError, (error) => {
            Alert.alert(
              "Media xatosi",
              error instanceof Error ? error.message : "Kamera yoki mikrofon ulanmayapti.",
            );
          });

        await room.connect(tokenPayload.url, tokenPayload.token);
        await room.localParticipant.setMicrophoneEnabled(isMicOnRef.current);
        await room.localParticipant.setCameraEnabled(isCamOnRef.current);
        livekitRoomRef.current = room;
        sync();
        return room;
      } catch (error) {
        setLoadingMedia(false);
        Alert.alert(
          "Private meet xatosi",
          error instanceof Error ? error.message : "LiveKit ga ulanib bo'lmadi.",
        );
        return null;
      } finally {
        livekitConnectPromiseRef.current = null;
      }
    })();

    return livekitConnectPromiseRef.current;
  }, [displayName, roomId, schedulePeerLeftFallback, syncLivekitState]);

  const cleanupCall = useCallback(
    async (shouldNotifyRemote: boolean) => {
      if (hangupStartedRef.current) {
        return;
      }
      hangupStartedRef.current = true;

      if (shouldNotifyRemote && remoteUserId) {
        realtime.emitCallCancel(remoteUserId, roomId);
      }

      socketRef.current?.emit("leave-room", { roomId });
      socketRef.current?.disconnect();
      socketRef.current = null;

      clearPeerLeftTimeout();
      await disconnectLivekitRoom();
      await stopLivekitAudioSession().catch(() => undefined);
      setLocalStream(null);
      setScreenStream(null);
      setRemoteStream(null);
      setRemoteScreenStream(null);
      setElapsedSeconds(0);
      callConnectedAtRef.current = null;

      if (isCaller && chatId) {
        void chatsApi.endVideoCall(chatId).catch(() => undefined);
      }
    },
    [chatId, clearPeerLeftTimeout, disconnectLivekitRoom, isCaller, remoteUserId, roomId],
  );

  useEffect(() => {
    return () => {
      void cleanupCall(false);
    };
  }, [cleanupCall]);

  useEffect(() => {
    let cancelled = false;
    let joinRetryCount = 0;
    let joinRetryTimeout: ReturnType<typeof setTimeout> | null = null;

    const connectVideoSocket = async () => {
      const authToken = await getAuthToken();
      if (!authToken || cancelled) {
        return;
      }

      const socket = io(buildSocketNamespaceUrl("/video"), {
        auth: { token: authToken },
        transports: ["websocket"],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1200,
      });

      socketRef.current = socket;

      const clearJoinRetryTimeout = () => {
        if (joinRetryTimeout) {
          clearTimeout(joinRetryTimeout);
          joinRetryTimeout = null;
        }
      };

      const joinRoom = () => {
        if (!cancelled) {
          socket.emit("join-room", { roomId, displayName });
        }
      };

      const retryJoinRoom = () => {
        if (cancelled) {
          return;
        }

        if (joinRetryCount >= MAX_ROOM_JOIN_RETRIES) {
          Alert.alert("Private meet xatosi", "Xona topilmadi yoki hali tayyor bo'lmadi.");
          return;
        }

        joinRetryCount += 1;
        clearJoinRetryTimeout();
        joinRetryTimeout = setTimeout(() => {
          joinRoom();
        }, 1500);
      };

      socket.on("connect", () => {
        if (isCaller) {
          socket.emit("create-room", {
            roomId,
            displayName,
            isPrivate: true,
            title: title || "Private meet",
          });
        } else {
          joinRoom();
        }
      });

      socket.on("room-created", () => {
        if (!isCaller || callRequestSentRef.current || !remoteUserId) {
          return;
        }

        callRequestSentRef.current = true;
        realtime.emitCallRequest(remoteUserId, roomId, "video");
        void connectLivekitRoom();
      });

      socket.on("room-info", ({ title: nextTitle, isPrivate: nextIsPrivate }) => {
        if (typeof nextTitle === "string" && nextTitle.trim()) {
          setRoomTitle(nextTitle.trim());
        }
        if (typeof nextIsPrivate === "boolean") {
          setRoomIsPrivate(nextIsPrivate);
        }
      });

      socket.on("knock-request", ({ peerId }) => {
        if (!isCaller || !peerId) {
          return;
        }

        const normalizedPeerId = String(peerId);
        if (!remoteAcceptedRef.current) {
          pendingKnockPeerIdRef.current = normalizedPeerId;
          return;
        }

        socket.emit("approve-knock", {
          roomId,
          peerId: normalizedPeerId,
        });
      });

      socket.on("waiting-for-approval", () => {
        clearJoinRetryTimeout();
        setCallStatus("Qabul tasdiqlanmoqda...");
      });

      socket.on("knock-approved", () => {
        clearJoinRetryTimeout();
        remoteAcceptedRef.current = true;
        setCallStatus("Ulanmoqda...");
        void connectLivekitRoom();
      });

      socket.on("existing-peers", ({ peers }) => {
        clearJoinRetryTimeout();
        const hasPeers = Array.isArray(peers)
          ? peers.some((peer) => String(peer?.peerId || "") && String(peer.peerId) !== socket.id)
          : false;

        if (!hasPeers) {
          return;
        }

        clearPeerLeftTimeout();
        setCallStatus("Ulanmoqda...");
        void connectLivekitRoom();
      });

      socket.on("peer-joined", ({ peerId }) => {
        clearJoinRetryTimeout();
        if (!peerId) {
          return;
        }

        clearPeerLeftTimeout();
        setCallStatus("Ulanmoqda...");
        void connectLivekitRoom();
      });

      socket.on("peer-left", () => {
        schedulePeerLeftFallback();
      });

      socket.on("error", ({ message }) => {
        const nextMessage = String(message || "Noma'lum xatolik");
        if (!isCaller && nextMessage === "Room not found") {
          retryJoinRoom();
          return;
        }

        Alert.alert("Private meet xatosi", nextMessage);
      });
    };

    void connectVideoSocket();

    return () => {
      cancelled = true;
      if (joinRetryTimeout) {
        clearTimeout(joinRetryTimeout);
      }
    };
  }, [
    clearPeerLeftTimeout,
    connectLivekitRoom,
    displayName,
    isCaller,
    remoteUserId,
    roomId,
    schedulePeerLeftFallback,
    title,
  ]);

  useEffect(() => {
    const subscriptions = [
      realtime.onPresenceEvent("call:accepted", (payload) => {
        if (String(payload?.roomId || "") === roomId) {
          remoteAcceptedRef.current = true;
          setCallStatus("Ulanmoqda...");
          const pendingKnockPeerId = pendingKnockPeerIdRef.current;
          if (isCaller && pendingKnockPeerId && socketRef.current) {
            socketRef.current.emit("approve-knock", {
              roomId,
              peerId: pendingKnockPeerId,
            });
            pendingKnockPeerIdRef.current = null;
          }
          void connectLivekitRoom();
        }
      }),
      realtime.onPresenceEvent("call:rejected", (payload) => {
        if (String(payload?.roomId || "") !== roomId) {
          return;
        }

        Alert.alert("Private meet", "Qo'ng'iroq rad etildi", [
          { text: "Yopish", onPress: () => navigation.goBack() },
        ]);
      }),
      realtime.onPresenceEvent("call:cancelled", (payload) => {
        if (
          String(payload?.roomId || "") !== roomId ||
          String(payload?.fromUserId || "") === currentUserId
        ) {
          return;
        }

        Alert.alert("Private meet", "Qo'ng'iroq yakunlandi", [
          { text: "Yopish", onPress: () => navigation.goBack() },
        ]);
      }),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [connectLivekitRoom, currentUserId, isCaller, navigation, roomId]);

  const handleToggleMic = useCallback(async () => {
    const nextEnabled = !isMicOnRef.current;
    const room = livekitRoomRef.current || (await connectLivekitRoom());
    if (!room) {
      return;
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(nextEnabled);
      isMicOnRef.current = nextEnabled;
      setIsMicOn(nextEnabled);
      setTimeout(() => syncLivekitState(room), 300);
    } catch (err) {
      Alert.alert("Mikrofon xatosi", err instanceof Error ? err.message : "Mikrofon yoqilmadi");
      syncLivekitState(room);
    }
  }, [connectLivekitRoom, syncLivekitState]);

  const handleToggleCam = useCallback(async () => {
    const nextEnabled = !isCamOnRef.current;
    const room = livekitRoomRef.current || (await connectLivekitRoom());
    if (!room) {
      return;
    }
    try {
      await room.localParticipant.setCameraEnabled(nextEnabled);
      isCamOnRef.current = nextEnabled;
      setIsCamOn(nextEnabled);
      setTimeout(() => syncLivekitState(room), 300);
    } catch (err) {
      Alert.alert("Kamera xatosi", err instanceof Error ? err.message : "Kamera yoqilmadi");
      syncLivekitState(room);
    }
  }, [connectLivekitRoom, syncLivekitState]);

  const handleSwitchCamera = useCallback(async () => {
    const room = livekitRoomRef.current || (await connectLivekitRoom());
    if (!room) {
      return;
    }

    const switched = switchLivekitCamera(room);
    if (!switched) {
      Alert.alert("Kamera", "Kamerani almashtirib bo'lmadi.");
      return;
    }

    setTimeout(() => syncLivekitState(room), 120);
    setTimeout(() => syncLivekitState(room), 420);
  }, [connectLivekitRoom, syncLivekitState]);

  const handleToggleScreenShare = useCallback(async () => {
    if (Platform.OS === "ios") {
      Alert.alert(
        "Screen share hozircha tayyor emas",
        "iPhone uchun Broadcast Extension ulanishi kerak. Hozircha mobile iOS build'da screen share ishlamaydi.",
      );
      return;
    }

    const room = livekitRoomRef.current || (await connectLivekitRoom());
    if (!room) {
      return;
    }

    try {
      await room.localParticipant.setScreenShareEnabled(!isScreenSharing);
      syncLivekitState(room);
    } catch (error) {
      Alert.alert(
        "Screen share yoqilmadi",
        error instanceof Error
          ? error.message
          : "Ekran ulashishni boshlashda xatolik yuz berdi.",
      );
    }
  }, [connectLivekitRoom, isScreenSharing, syncLivekitState]);

  const handleHangup = async () => {
    await cleanupCall(true);
    navigation.goBack();
  };

  const remoteInitial = useMemo(() => remoteDisplayName.slice(0, 1).toUpperCase(), [remoteDisplayName]);
  const localCameraVisible = Boolean(localStream && isCamOn && hasLiveVideoTrack(localStream));
  const remoteCameraVisible = Boolean(remoteStream && hasLiveVideoTrack(remoteStream));
  const remoteHasAnyVideo = Boolean(remoteCameraVisible || remoteScreenStream);
  const canAutoEnterPip = callStatus === "Ulandi";
  const swapAvailable = Boolean(localCameraVisible && remoteHasAnyVideo);
  const mainShowsLocal = isLocalPrimary && localCameraVisible;
  const miniShowsRemote = mainShowsLocal;
  const stageStream = mainShowsLocal
    ? localStream
    : remoteScreenStream || remoteStream || (isScreenSharing ? screenStream : null);
  const stageUsesContain = Boolean((!mainShowsLocal && remoteScreenStream) || (mainShowsLocal && isScreenSharing));
  const stageMirror = mainShowsLocal;
  const pipStream = miniShowsRemote
    ? remoteScreenStream || remoteStream
    : localStream;
  const pipUsesContain = Boolean(miniShowsRemote && remoteScreenStream);
  const pipMirror = miniShowsRemote ? false : true;
  const canScreenShare = Platform.OS === "android" || Platform.OS === "ios";
  const stagePipProps = iosRtcPipProps(
    Boolean(
      Platform.OS === "ios" &&
        stageStream &&
        ((!mainShowsLocal && remoteHasAnyVideo) || (mainShowsLocal && isScreenSharing)),
    ),
  );
  const miniPipProps = iosRtcPipProps(Boolean(Platform.OS === "ios" && pipStream && miniShowsRemote));

  const handleSwapFeeds = useCallback(() => {
    if (!swapAvailable) {
      return;
    }

    setIsLocalPrimary((previous) => !previous);
  }, [swapAvailable]);

  const handleEnterPip = useCallback(() => {
    if (!canAutoEnterPip) {
      return;
    }

    void enterMeetPip(remoteScreenStream ? 16 : 9, remoteScreenStream ? 9 : 16);
  }, [canAutoEnterPip, remoteScreenStream]);

  useEffect(() => {
    void setMeetPipEnabled(canAutoEnterPip);

    return () => {
      void setMeetPipEnabled(false);
    };
  }, [canAutoEnterPip]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const isBackgrounded = state === "inactive" || state === "background";
      setIsSystemPipMode(isBackgrounded);

      if (isBackgrounded && canAutoEnterPip) {
        void enterMeetPip(remoteScreenStream ? 16 : 9, remoteScreenStream ? 9 : 16);
      }
    });

    return () => subscription.remove();
  }, [canAutoEnterPip, remoteScreenStream]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
        {!isSystemPipMode ? (
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title} numberOfLines={1}>
                {roomTitle || "Private meet"}
              </Text>
              <View style={styles.statusRow}>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {callStatus}
                </Text>
                {callStatus === "Ulandi" ? (
                  <View style={styles.durationBadge}>
                    <Timer size={12} color={Colors.text} />
                    <Text style={styles.durationText}>{formatDuration(elapsedSeconds)}</Text>
                  </View>
                ) : null}
                {roomIsPrivate ? (
                  <View style={styles.privateBadge}>
                    <Shield size={12} color={Colors.text} />
                    <Text style={styles.privateBadgeText}>Private</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                style={[styles.headerButton, styles.headerButtonSecondary]}
                onPress={handleEnterPip}
                disabled={!canAutoEnterPip}
              >
                <Minimize2
                  size={18}
                  color={canAutoEnterPip ? "#fff" : "rgba(255,255,255,0.42)"}
                />
              </Pressable>
              <Pressable
                style={[styles.headerButton, styles.headerButtonSecondary]}
                onPress={handleSwitchCamera}
              >
                <RefreshCcw size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.stage}>
          {stageStream ? (
            <RTCView
              streamURL={stageStream.toURL()}
              style={styles.remoteVideo}
              objectFit={stageUsesContain ? "contain" : "cover"}
              mirror={stageMirror}
              zOrder={0}
              {...stagePipProps}
            />
          ) : (
            <View style={styles.remotePlaceholder}>
              {loadingMedia ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <>
                  {!mainShowsLocal && remoteUser.avatar ? (
                    <PersistentCachedImage
                      remoteUri={remoteUser.avatar}
                      style={styles.remoteAvatarImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.remoteAvatar}>
                      <Text style={styles.remoteAvatarText}>
                        {mainShowsLocal
                          ? displayName.slice(0, 1).toUpperCase()
                          : remoteInitial}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.remoteName} numberOfLines={1}>
                    {mainShowsLocal ? `${displayName} (Sen)` : remoteDisplayName}
                  </Text>
                  {!mainShowsLocal && remoteScreenStream ? (
                    <Text style={styles.remotePlaceholderText}>Ekran ulashmoqda</Text>
                  ) : null}
                  {mainShowsLocal && !isCamOn ? (
                    <Text style={styles.remotePlaceholderText}>Kamera o‘chiq</Text>
                  ) : null}
                  <Text style={styles.remotePlaceholderText}>{callStatus}</Text>
                </>
              )}
            </View>
          )}

          {!isSystemPipMode ? (
            <Pressable
              style={styles.localTile}
              onPress={handleSwapFeeds}
              disabled={!swapAvailable}
            >
              <View style={styles.localTileClip} renderToHardwareTextureAndroid needsOffscreenAlphaCompositing>
                {pipStream ? (
                  <View style={styles.localVideoFrame}>
                    <RTCView
                      streamURL={pipStream.toURL()}
                      style={styles.localVideo}
                      objectFit={pipUsesContain ? "contain" : "cover"}
                      mirror={pipMirror}
                      zOrder={1}
                      {...miniPipProps}
                    />
                  </View>
                ) : (
                  <View style={styles.localPlaceholder}>
                    <View style={styles.localPlaceholderAvatar}>
                      <Text style={styles.localPlaceholderAvatarText}>
                        {miniShowsRemote
                          ? remoteInitial
                          : displayName.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.localPlaceholderText} numberOfLines={1}>
                      {miniShowsRemote ? remoteDisplayName : `${displayName} (Sen)`}
                    </Text>
                    <Text style={styles.localPlaceholderHint} numberOfLines={1}>
                      {miniShowsRemote
                        ? remoteScreenStream
                          ? "Ekran"
                          : remoteCameraVisible
                            ? "Video"
                            : "Kamera o‘chiq"
                        : isCamOn
                          ? "Video"
                          : "Kamera o‘chiq"}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          ) : null}
        </View>

        {!isSystemPipMode ? (
          <View style={styles.controlsWrap}>
          <View style={styles.controls}>
          <Pressable
            style={[styles.controlButton, !isMicOn && styles.controlButtonMuted]}
            onPress={() => void handleToggleMic()}
          >
            {isMicOn ? <Mic size={20} color="#fff" /> : <MicOff size={20} color="#fff" />}
          </Pressable>
          <Pressable
            style={[styles.controlButton, !isCamOn && styles.controlButtonMuted]}
            onPress={() => void handleToggleCam()}
          >
            {isCamOn ? <CameraIcon size={20} color="#fff" /> : <CameraOff size={20} color="#fff" />}
          </Pressable>
          {canScreenShare ? (
            <Pressable
              style={[styles.controlButton, isScreenSharing && styles.controlButtonActive]}
              onPress={() => void handleToggleScreenShare()}
            >
              {isScreenSharing ? (
                <Monitor size={20} color="#fff" />
              ) : (
                <MonitorOff size={20} color="#fff" />
              )}
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.controlButton, styles.controlButtonDanger]}
            onPress={() => void handleHangup()}
          >
            <PhoneOff size={20} color="#fff" />
          </Pressable>
          </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0d0f14" },
  container: { flex: 1, backgroundColor: "#0d0f14" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  subtitle: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  durationText: { color: Colors.text, fontSize: 12, fontWeight: "600" },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(122,162,255,0.16)",
  },
  privateBadgeText: { color: Colors.text, fontSize: 12, fontWeight: "700" },
  stage: {
    flex: 1,
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#161a22",
  },
  remoteVideo: { flex: 1, width: "100%", height: "100%" },
  remotePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  remoteAvatarImage: { width: 86, height: 86, borderRadius: 43 },
  remoteAvatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  remoteAvatarText: { color: "#fff", fontSize: 34, fontWeight: "800" },
  remoteName: { color: "#fff", fontSize: 20, fontWeight: "700" },
  remotePlaceholderText: { color: "rgba(255,255,255,0.7)", fontSize: 14, textAlign: "center" },
  localTile: {
    position: "absolute",
    right: 14,
    bottom: 14,
    width: 122,
    height: 164,
    borderRadius: 24,
    backgroundColor: "#0d0f14",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
    overflow: "hidden",
  },
  localTileClip: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#0d0f14",
  },
  localVideoFrame: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#0d0f14",
  },
  localVideo: {
    flex: 1,
    width: "100%",
    height: "100%",
    borderRadius: 24,
  },
  localPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: "#12161d",
  },
  localPlaceholderAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  localPlaceholderAvatarText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  localPlaceholderText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  localPlaceholderHint: { color: "rgba(255,255,255,0.65)", fontSize: 11 },
  controlsWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  controls: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  controlButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#262a33",
  },
  controlButtonMuted: { backgroundColor: "rgba(194, 73, 73, 0.9)" },
  controlButtonActive: { backgroundColor: "rgba(227, 176, 71, 0.95)" },
  controlButtonDanger: { backgroundColor: Colors.danger },
});
