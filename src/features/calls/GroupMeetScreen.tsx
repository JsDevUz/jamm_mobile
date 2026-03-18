import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { io, type Socket } from "socket.io-client";
import * as Clipboard from "expo-clipboard";
import {
  CameraOff,
  Camera as CameraIcon,
  Check,
  Copy,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCcw,
  Shield,
  UserCheck,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react-native";
import {
  mediaDevices,
  registerGlobals,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  type MediaStream,
} from "react-native-webrtc";
import { meetsApi } from "../../lib/api";
import {
  buildJoinUrl,
  buildSocketNamespaceUrl,
  TURN_CREDENTIAL,
  TURN_URLS,
  TURN_USERNAME,
} from "../../config/env";
import { getAuthToken } from "../../lib/session";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";

registerGlobals();

type Props = NativeStackScreenProps<RootStackParamList, "GroupMeet">;
type JoinStatus = "connecting" | "waiting" | "rejected" | "joined";
type RemotePeer = {
  peerId: string;
  displayName: string;
  stream: MediaStream | null;
  connectionState?: string;
};
type KnockRequest = {
  peerId: string;
  displayName: string;
};

const ICE_CONFIG = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    ...(TURN_URLS.length > 0
      ? [
          {
            urls: TURN_URLS,
            username: TURN_USERNAME,
            credential: TURN_CREDENTIAL,
          },
        ]
      : []),
  ],
};

const formatDuration = (elapsedSeconds: number) => {
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }

  return [minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
};

const getTileColumns = (count: number) => {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  return 3;
};

export function GroupMeetScreen({ navigation, route }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const { roomId, title, isCreator, isPrivate } = route.params;
  const currentUser = useAuthStore((state) => state.user);
  const displayName =
    currentUser?.nickname || currentUser?.username || currentUser?.email || "User";

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>("connecting");
  const [error, setError] = useState("");
  const [roomTitle, setRoomTitle] = useState(title || "Meet");
  const [roomIsPrivate, setRoomIsPrivate] = useState(Boolean(isPrivate));
  const [knockRequests, setKnockRequests] = useState<KnockRequest[]>([]);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [privacyUpdating, setPrivacyUpdating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const socketIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const candidateQueuesRef = useRef<Record<string, RTCIceCandidate[]>>({});
  const knownPeerNamesRef = useRef<Record<string, string>>({});
  const hangupStartedRef = useRef(false);
  const connectedAtRef = useRef<number | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomTitleRef = useRef(roomTitle);
  const roomPrivacyRef = useRef(roomIsPrivate);

  const joinUrl = useMemo(() => buildJoinUrl(roomId), [roomId]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    roomTitleRef.current = roomTitle;
  }, [roomTitle]);

  useEffect(() => {
    roomPrivacyRef.current = roomIsPrivate;
  }, [roomIsPrivate]);

  useEffect(() => {
    if (joinStatus !== "joined") {
      connectedAtRef.current = null;
      setElapsedSeconds(0);
      return;
    }

    if (!connectedAtRef.current) {
      connectedAtRef.current = Date.now();
    }

    const interval = setInterval(() => {
      if (!connectedAtRef.current) return;
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - connectedAtRef.current) / 1000)),
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [joinStatus]);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const upsertRemotePeer = useCallback(
    (peerId: string, patch: Partial<RemotePeer>) => {
      setRemotePeers((previous) => {
        const existingIndex = previous.findIndex((peer) => peer.peerId === peerId);
        if (existingIndex === -1) {
          return [
            ...previous,
            {
              peerId,
              displayName: patch.displayName || knownPeerNamesRef.current[peerId] || peerId,
              stream: patch.stream ?? null,
              connectionState: patch.connectionState,
            },
          ];
        }

        return previous.map((peer, index) =>
          index === existingIndex
            ? {
                ...peer,
                ...patch,
                displayName:
                  patch.displayName ||
                  peer.displayName ||
                  knownPeerNamesRef.current[peerId] ||
                  peerId,
              }
            : peer,
        );
      });
    },
    [],
  );

  const removeRemotePeer = useCallback((peerId: string) => {
    setRemotePeers((previous) => previous.filter((peer) => peer.peerId !== peerId));
    delete knownPeerNamesRef.current[peerId];
    delete candidateQueuesRef.current[peerId];
    peerConnectionsRef.current[peerId]?.close();
    delete peerConnectionsRef.current[peerId];
  }, []);

  const cleanupAllPeerConnections = useCallback(() => {
    Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
    peerConnectionsRef.current = {};
    candidateQueuesRef.current = {};
    knownPeerNamesRef.current = {};
    setRemotePeers([]);
  }, []);

  const flushQueuedCandidates = useCallback(async (peerId: string) => {
    const connection = peerConnectionsRef.current[peerId];
    const queuedCandidates = candidateQueuesRef.current[peerId];

    if (!connection || !queuedCandidates?.length) {
      return;
    }

    for (const candidate of queuedCandidates) {
      try {
        await connection.addIceCandidate(candidate);
      } catch {
        continue;
      }
    }

    delete candidateQueuesRef.current[peerId];
  }, []);

  const createPeerConnection = useCallback(
    (peerId: string, peerDisplayName?: string) => {
      const existingConnection = peerConnectionsRef.current[peerId];
      if (existingConnection) {
        return existingConnection;
      }

      if (peerDisplayName) {
        knownPeerNamesRef.current[peerId] = peerDisplayName;
      }

      const connection = new RTCPeerConnection(ICE_CONFIG) as RTCPeerConnection & {
        onicecandidate?: ((event: any) => void) | null;
        ontrack?: ((event: any) => void) | null;
        onconnectionstatechange?: (() => void) | null;
      };

      localStreamRef.current?.getTracks().forEach((track) => {
        connection.addTrack(track, localStreamRef.current as MediaStream);
      });

      connection.onicecandidate = (event: any) => {
        const currentSocket = socketRef.current;
        if (!event.candidate || !currentSocket || peerId === currentSocket.id) return;

        currentSocket.emit("ice-candidate", {
          targetId: peerId,
          candidate: event.candidate,
        });
      };

      connection.ontrack = (event: any) => {
        const [stream] = event.streams;
        if (!stream) return;

        upsertRemotePeer(peerId, {
          stream,
          displayName: knownPeerNamesRef.current[peerId] || peerDisplayName || peerId,
        });
      };

      connection.onconnectionstatechange = () => {
        upsertRemotePeer(peerId, {
          connectionState: connection.connectionState,
          displayName: knownPeerNamesRef.current[peerId] || peerDisplayName || peerId,
        });
      };

      peerConnectionsRef.current[peerId] = connection;
      return connection;
    },
    [upsertRemotePeer],
  );

  const createOfferForPeer = useCallback(
    async (peerId: string, peerDisplayName?: string) => {
      try {
        if (!peerId || peerId === socketRef.current?.id) {
          return;
        }

        const connection = createPeerConnection(peerId, peerDisplayName);
        if (
          connection.localDescription?.type === "offer" &&
          !connection.remoteDescription
        ) {
          return;
        }
        const offer = await connection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });

        await connection.setLocalDescription(offer);
        socketRef.current?.emit("offer", {
          targetId: peerId,
          sdp: offer,
        });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Offer yaratilmadi");
      }
    },
    [createPeerConnection],
  );

  const cleanupCall = useCallback(async () => {
    if (hangupStartedRef.current) {
      return;
    }

    hangupStartedRef.current = true;
    socketRef.current?.emit("leave-room", { roomId });
    socketRef.current?.disconnect();
    socketRef.current = null;
    socketIdRef.current = null;

    cleanupAllPeerConnections();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setKnockRequests([]);
    setElapsedSeconds(0);
    connectedAtRef.current = null;
  }, [cleanupAllPeerConnections, roomId]);

  useEffect(() => {
    return () => {
      void cleanupCall();
    };
  }, [cleanupCall]);

  useEffect(() => {
    let cancelled = false;

    const prepareMedia = async () => {
      try {
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: {
            facingMode: "user",
            width: 1280,
            height: 720,
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        setLocalStream(stream);
        setLoadingMedia(false);
      } catch (nextError) {
        setLoadingMedia(false);
        setError(nextError instanceof Error ? nextError.message : "Kamera ochilmadi");
      }
    };

    void prepareMedia();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!localStream) {
      return;
    }

    let cancelled = false;
    let activeSocket: Socket | null = null;

    const connectSocket = async () => {
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

      activeSocket = socket;
      socketRef.current = socket;

      socket.on("connect", () => {
        const currentSocketId = typeof socket.id === "string" ? socket.id : null;
        if (socketIdRef.current && socketIdRef.current !== currentSocketId) {
          cleanupAllPeerConnections();
        }
        socketIdRef.current = currentSocketId;
        setError("");
        setJoinStatus("connecting");
        if (isCreator) {
          socket.emit("create-room", {
            roomId,
            displayName,
            isPrivate: roomPrivacyRef.current,
            title: roomTitleRef.current || roomId,
          });
          return;
        }

        socket.emit("join-room", {
          roomId,
          displayName,
        });
      });

      socket.on("room-created", ({ title: nextTitle, isPrivate: nextIsPrivate }) => {
        if (typeof nextTitle === "string" && nextTitle.trim()) {
          setRoomTitle(nextTitle.trim());
        }
        if (typeof nextIsPrivate === "boolean") {
          setRoomIsPrivate(nextIsPrivate);
        }
        setJoinStatus("joined");
      });

      socket.on("room-info", ({ title: nextTitle, isPrivate: nextIsPrivate }) => {
        if (typeof nextTitle === "string" && nextTitle.trim()) {
          setRoomTitle(nextTitle.trim());
        }
        if (typeof nextIsPrivate === "boolean") {
          setRoomIsPrivate(nextIsPrivate);
        }
      });

      socket.on("existing-peers", ({ peers }) => {
        const nextPeers = (Array.isArray(peers) ? peers : []).filter((peer) => {
          const peerId = String(peer?.peerId || "");
          return Boolean(peerId) && peerId !== socket.id;
        });

        setJoinStatus("joined");

        nextPeers.forEach((peer) => {
          const peerId = String(peer?.peerId || "");
          const peerDisplayName = String(peer?.displayName || peerId);
          if (!peerId) return;
          knownPeerNamesRef.current[peerId] = peerDisplayName;
          upsertRemotePeer(peerId, {
            displayName: peerDisplayName,
          });
        });
      });

      socket.on("peer-joined", ({ peerId, displayName: peerDisplayName }) => {
        const normalizedPeerId = String(peerId || "");
        if (!normalizedPeerId || normalizedPeerId === socket.id) return;
        const normalizedName = String(peerDisplayName || normalizedPeerId);
        knownPeerNamesRef.current[normalizedPeerId] = normalizedName;
        upsertRemotePeer(normalizedPeerId, {
          displayName: normalizedName,
          connectionState: "connecting",
        });
        void createOfferForPeer(normalizedPeerId, normalizedName);
      });

      socket.on("offer", async ({ senderId, sdp }) => {
        const normalizedPeerId = String(senderId || "");
        if (!normalizedPeerId || normalizedPeerId === socket.id) return;

        try {
          const connection = createPeerConnection(
            normalizedPeerId,
            knownPeerNamesRef.current[normalizedPeerId],
          );
          await connection.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushQueuedCandidates(normalizedPeerId);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          socket.emit("answer", {
            targetId: normalizedPeerId,
            sdp: answer,
          });
          setJoinStatus("joined");
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : "Offer qabul qilinmadi");
        }
      });

      socket.on("answer", async ({ senderId, sdp }) => {
        const normalizedPeerId = String(senderId || "");
        if (!normalizedPeerId || normalizedPeerId === socket.id) return;

        try {
          const connection = peerConnectionsRef.current[normalizedPeerId];
          if (!connection) return;

          await connection.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushQueuedCandidates(normalizedPeerId);
          setJoinStatus("joined");
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : "Answer qabul qilinmadi");
        }
      });

      socket.on("ice-candidate", async ({ senderId, candidate }) => {
        const normalizedPeerId = String(senderId || "");
        if (!normalizedPeerId || normalizedPeerId === socket.id || !candidate) return;

        const normalizedCandidate = new RTCIceCandidate(candidate);
        const connection = peerConnectionsRef.current[normalizedPeerId];

        if (!connection || !connection.remoteDescription) {
          candidateQueuesRef.current[normalizedPeerId] = [
            ...(candidateQueuesRef.current[normalizedPeerId] || []),
            normalizedCandidate,
          ];
          return;
        }

        try {
          await connection.addIceCandidate(normalizedCandidate);
        } catch {
          return;
        }
      });

      socket.on("peer-left", ({ peerId }) => {
        const normalizedPeerId = String(peerId || "");
        if (!normalizedPeerId || normalizedPeerId === socket.id) return;
        removeRemotePeer(normalizedPeerId);
      });

      socket.on("knock-request", ({ peerId, displayName: guestName }) => {
        if (!isCreator) return;

        const normalizedPeerId = String(peerId || "");
        if (!normalizedPeerId) return;

        setKnockRequests((previous) => {
          const existingIndex = previous.findIndex((entry) => entry.peerId === normalizedPeerId);
          if (existingIndex === -1) {
            return [
              ...previous,
              {
                peerId: normalizedPeerId,
                displayName: String(guestName || normalizedPeerId),
              },
            ];
          }

          return previous.map((entry, index) =>
            index === existingIndex
              ? {
                  ...entry,
                  displayName: String(guestName || entry.displayName),
                }
              : entry,
          );
        });
      });

      socket.on("waiting-for-approval", () => {
        setJoinStatus("waiting");
      });

      socket.on("knock-approved", () => {
        setJoinStatus("joined");
      });

      socket.on("knock-rejected", ({ reason }) => {
        setJoinStatus("rejected");
        setError(String(reason || "Rad etildi"));
      });

      socket.on("error", ({ message }) => {
        const nextMessage = String(message || "Meet xatosi");
        if (
          nextMessage === "Signal yuborish uchun room ruxsati yo‘q" ||
          nextMessage === "ICE yuborish uchun room ruxsati yo‘q"
        ) {
          return;
        }
        setError(nextMessage);
      });
    };

    void connectSocket();

    return () => {
      cancelled = true;
      if (activeSocket) {
        activeSocket.removeAllListeners();
        activeSocket.disconnect();
      }
      if (socketRef.current === activeSocket) {
        socketRef.current = null;
      }
      if (socketIdRef.current === activeSocket?.id) {
        socketIdRef.current = null;
      }
    };
  }, [
    createOfferForPeer,
    createPeerConnection,
    cleanupAllPeerConnections,
    displayName,
    flushQueuedCandidates,
    isCreator,
    localStream,
    removeRemotePeer,
    roomId,
    upsertRemotePeer,
  ]);

  const handleApproveKnock = (peerId: string) => {
    socketRef.current?.emit("approve-knock", { roomId, peerId });
    setKnockRequests((previous) => previous.filter((entry) => entry.peerId !== peerId));
  };

  const handleRejectKnock = (peerId: string) => {
    socketRef.current?.emit("reject-knock", { roomId, peerId });
    setKnockRequests((previous) => previous.filter((entry) => entry.peerId !== peerId));
  };

  const handleToggleRoomPrivacy = async () => {
    if (!isCreator || privacyUpdating) {
      return;
    }

    const previousValue = roomIsPrivate;
    const nextValue = !previousValue;
    setPrivacyUpdating(true);
    setRoomIsPrivate(nextValue);
    socketRef.current?.emit("set-room-privacy", { roomId, isPrivate: nextValue });

    try {
      await meetsApi.updateMeetPrivacy(roomId, nextValue);
    } catch (nextError) {
      setRoomIsPrivate(previousValue);
      socketRef.current?.emit("set-room-privacy", { roomId, isPrivate: previousValue });
      Alert.alert(
        "Sozlama saqlanmadi",
        nextError instanceof Error ? nextError.message : "Maxfiylik holati saqlanmadi.",
      );
    } finally {
      setPrivacyUpdating(false);
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(joinUrl);
    setCopied(true);
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1800);
  };

  const handleToggleMic = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks?.()[0];
    if (!audioTrack) {
      return;
    }

    const nextEnabled = !audioTrack.enabled;
    audioTrack.enabled = nextEnabled;
    setIsMicOn(nextEnabled);
  };

  const handleToggleCam = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks?.()[0];
    if (!videoTrack) {
      return;
    }

    const nextEnabled = !videoTrack.enabled;
    videoTrack.enabled = nextEnabled;
    setIsCamOn(nextEnabled);
  };

  const handleSwitchCamera = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks?.()[0] as
      | ({ _switchCamera?: () => void } & MediaStreamTrack)
      | undefined;
    videoTrack?._switchCamera?.();
  };

  const handleLeave = async () => {
    await cleanupCall();
    navigation.goBack();
  };

  const participantsCount = remotePeers.length + 1;
  const columns = getTileColumns(participantsCount);
  const tileWidth = useMemo(() => {
    const horizontalPadding = 28;
    const gap = 10;
    const contentWidth = screenWidth - horizontalPadding - gap * (columns - 1);
    return Math.max(120, Math.floor(contentWidth / columns));
  }, [columns, screenWidth]);

  const participantRows = useMemo(
    () => [
      {
        id: "local",
        name: `${displayName} (Sen)`,
        isLocal: true,
        connectionState: undefined as string | undefined,
      },
      ...remotePeers.map((peer) => ({
        id: peer.peerId,
        name: peer.displayName,
        isLocal: false,
        connectionState: peer.connectionState,
      })),
    ],
    [displayName, remotePeers],
  );

  const renderTile = (
    key: string,
    label: string,
    stream: MediaStream | null,
    isLocalTile = false,
  ) => {
    const initial = label.slice(0, 1).toUpperCase();

    return (
      <View key={key} style={[styles.tile, { width: tileWidth }]}>
        {stream && (!isLocalTile || isCamOn) ? (
          <RTCView
            streamURL={stream.toURL()}
            style={styles.tileVideo}
            objectFit="cover"
            mirror={isLocalTile}
          />
        ) : (
          <View style={styles.tileFallback}>
            <View style={styles.tileAvatar}>
              <Text style={styles.tileAvatarText}>{initial}</Text>
            </View>
          </View>
        )}
        <View style={styles.tileFooter}>
          <Text style={styles.tileLabel} numberOfLines={1}>
            {label}
          </Text>
          {isLocalTile ? (
            <View style={styles.tileBadges}>
              {isMicOn ? (
                <Mic size={12} color={Colors.accent} />
              ) : (
                <MicOff size={12} color={Colors.danger} />
              )}
              {isCamOn ? (
                <Video size={12} color={Colors.accent} />
              ) : (
                <CameraOff size={12} color={Colors.danger} />
              )}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {roomTitle || "Meet"}
              </Text>
              {roomIsPrivate ? (
                <View style={styles.privateBadge}>
                  <Shield size={12} color={Colors.text} />
                  <Text style={styles.privateBadgeText}>Private</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitle} numberOfLines={1}>
                {roomId}
              </Text>
              {joinStatus === "joined" ? (
                <Text style={styles.subtitle}>{formatDuration(elapsedSeconds)}</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.headerButton} onPress={handleCopy}>
              {copied ? (
                <Check size={16} color={Colors.text} />
              ) : (
                <Copy size={16} color={Colors.text} />
              )}
            </Pressable>
            <Pressable style={styles.headerButton} onPress={() => setShowDrawer((value) => !value)}>
              <Users size={16} color={Colors.text} />
              {isCreator && knockRequests.length > 0 ? (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifText}>{knockRequests.length}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable style={[styles.headerButton, styles.headerButtonDanger]} onPress={() => void handleLeave()}>
              <PhoneOff size={16} color="#fff" />
            </Pressable>
          </View>
        </View>

        {error && joinStatus !== "rejected" ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.body}>
          {loadingMedia || joinStatus === "connecting" ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.stateTitle}>Meetga ulanmoqda...</Text>
            </View>
          ) : joinStatus === "waiting" ? (
            <View style={styles.centerState}>
              <UserPlus size={40} color={Colors.warning} />
              <Text style={styles.stateTitle}>Tasdiq kutilmoqda</Text>
              <Text style={styles.stateText}>Creator sizni meetga qo'shishini kuting.</Text>
              <Pressable style={styles.secondaryAction} onPress={() => void handleLeave()}>
                <Text style={styles.secondaryActionText}>Bekor qilish</Text>
              </Pressable>
            </View>
          ) : joinStatus === "rejected" ? (
            <View style={styles.centerState}>
              <X size={40} color={Colors.danger} />
              <Text style={styles.stateTitle}>Meetga kiritilmadingiz</Text>
              <Text style={styles.stateText}>{error || "Creator sorovni rad etdi."}</Text>
              <Pressable style={styles.secondaryAction} onPress={() => navigation.goBack()}>
                <Text style={styles.secondaryActionText}>Yopish</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.gridContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {renderTile("local", displayName, localStream, true)}
              {remotePeers.map((peer) =>
                renderTile(peer.peerId, peer.displayName, peer.stream, false),
              )}
            </ScrollView>
          )}
        </View>

        <ScrollView
          horizontal
          style={styles.controlsScroll}
          contentContainerStyle={styles.controls}
          showsHorizontalScrollIndicator={false}
          bounces={false}
        >
          <Pressable
            style={[styles.controlButton, !isMicOn && styles.controlButtonMuted]}
            onPress={handleToggleMic}
          >
            {isMicOn ? (
              <Mic size={20} color="#fff" />
            ) : (
              <MicOff size={20} color="#fff" />
            )}
          </Pressable>
          <Pressable
            style={[styles.controlButton, !isCamOn && styles.controlButtonMuted]}
            onPress={handleToggleCam}
          >
            {isCamOn ? (
              <CameraIcon size={20} color="#fff" />
            ) : (
              <CameraOff size={20} color="#fff" />
            )}
          </Pressable>
          <Pressable style={styles.controlButton} onPress={handleSwitchCamera}>
            <RefreshCcw size={20} color="#fff" />
          </Pressable>
          <Pressable style={[styles.controlButton, styles.controlButtonDanger]} onPress={() => void handleLeave()}>
            <PhoneOff size={20} color="#fff" />
          </Pressable>
        </ScrollView>

        {showDrawer ? (
          <View style={styles.drawerOverlay} pointerEvents="box-none">
            <Pressable style={styles.drawerBackdrop} onPress={() => setShowDrawer(false)} />
            <View style={styles.drawerPanel}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>A'zolar ({participantsCount})</Text>
                <Pressable style={styles.drawerClose} onPress={() => setShowDrawer(false)}>
                  <X size={16} color={Colors.text} />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={styles.drawerBody}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {isCreator ? (
                  <View style={styles.privacyCard}>
                    <View style={styles.privacyTextWrap}>
                      <Text style={styles.privacyTitle}>Meetga kirishni tasdiqlash</Text>
                      <Text style={styles.privacySubtitle}>
                        {roomIsPrivate
                          ? "Yangi kiruvchilar avval kutadi."
                          : "Link bilan kirganlar darrov qo'shiladi."}
                      </Text>
                    </View>
                    <Pressable
                      style={[
                        styles.privacyToggle,
                        roomIsPrivate && styles.privacyToggleActive,
                        privacyUpdating && styles.privacyToggleDisabled,
                      ]}
                      disabled={privacyUpdating}
                      onPress={() => void handleToggleRoomPrivacy()}
                    >
                      <Text style={styles.privacyToggleText}>
                        {roomIsPrivate ? "Yoqilgan" : "O'chiq"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {isCreator && roomIsPrivate ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      Kutayotganlar ({knockRequests.length})
                    </Text>
                    {knockRequests.length === 0 ? (
                      <Text style={styles.emptyText}>Hech kim kutmayapti</Text>
                    ) : (
                      knockRequests.map((entry) => (
                        <View key={entry.peerId} style={styles.knockCard}>
                          <View>
                            <Text style={styles.knockName}>{entry.displayName}</Text>
                            <Text style={styles.knockMeta}>Meetga qo'shilmoqchi</Text>
                          </View>
                          <View style={styles.knockActions}>
                            <Pressable
                              style={[styles.knockButton, styles.knockButtonApprove]}
                              onPress={() => handleApproveKnock(entry.peerId)}
                            >
                              <UserCheck size={12} color="#fff" />
                              <Text style={styles.knockButtonText}>Qabul</Text>
                            </Pressable>
                            <Pressable
                              style={styles.knockButton}
                              onPress={() => handleRejectKnock(entry.peerId)}
                            >
                              <X size={12} color={Colors.text} />
                              <Text style={styles.knockButtonGhostText}>Rad</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                ) : null}

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Qo'shilganlar ({participantsCount})</Text>
                  {participantRows.map((participant) => (
                    <View key={participant.id} style={styles.memberRow}>
                      <View style={styles.memberAvatar}>
                        <Text style={styles.memberAvatarText}>
                          {participant.name.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.memberMeta}>
                        <Text style={styles.memberName}>{participant.name}</Text>
                        <Text style={styles.memberStatus}>
                          {participant.isLocal
                            ? `${isMicOn ? "Mikrofon on" : "Mikrofon off"} · ${
                                isCamOn ? "Kamera on" : "Kamera off"
                              }`
                            : participant.connectionState || "Ulangan"}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0d0f14",
  },
  container: {
    flex: 1,
    backgroundColor: "#0d0f14",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  subtitle: {
    color: "rgba(255,255,255,0.64)",
    fontSize: 12,
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(250,166,26,0.18)",
  },
  privateBadgeText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    position: "relative",
  },
  headerButtonDanger: {
    backgroundColor: Colors.danger,
  },
  notifBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  notifText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  errorBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(240,71,71,0.12)",
  },
  errorBannerText: {
    color: "#f9b1b1",
    fontSize: 13,
  },
  body: {
    flex: 1,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 28,
  },
  stateTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  stateText: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  secondaryAction: {
    marginTop: 4,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  secondaryActionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  gridContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  tile: {
    height: 220,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#161a22",
  },
  tileVideo: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },
  tileFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#161a22",
  },
  tileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tileAvatarText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },
  tileFooter: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.44)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tileLabel: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  tileBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  controlsScroll: {
    flexGrow: 0,
  },
  controls: {
    minWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 18,
  },
  controlButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  controlButtonMuted: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  controlButtonDanger: {
    backgroundColor: Colors.danger,
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  drawerPanel: {
    maxHeight: "72%",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: "#161a22",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  drawerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  drawerClose: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  drawerBody: {
    padding: 18,
    gap: 18,
  },
  privacyCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  privacyTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  privacyTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  privacySubtitle: {
    marginTop: 4,
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    lineHeight: 17,
  },
  privacyToggle: {
    minWidth: 84,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  privacyToggleActive: {
    backgroundColor: Colors.primary,
  },
  privacyToggleDisabled: {
    opacity: 0.55,
  },
  privacyToggleText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  emptyText: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 13,
  },
  knockCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 12,
  },
  knockName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  knockMeta: {
    marginTop: 4,
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  knockActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  knockButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  knockButtonApprove: {
    backgroundColor: Colors.accent,
  },
  knockButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  knockButtonGhostText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  memberAvatarText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  memberMeta: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  memberStatus: {
    marginTop: 3,
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
  },
});
