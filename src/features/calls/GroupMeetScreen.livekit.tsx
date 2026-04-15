import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { io, type Socket } from "socket.io-client";
import * as Clipboard from "expo-clipboard";
import {
  AlertCircle,
  CameraOff,
  Camera as CameraIcon,
  Check,
  CheckCircle,
  Copy,
  Lock,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  MoreVertical,
  PenSquare,
  PhoneOff,
  RefreshCcw,
  Shield,
  Smartphone,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Video,
  Volume2,
  X,
} from "lucide-react-native";
import { RTCView, type MediaStream } from "@livekit/react-native-webrtc";
import { Room, RoomEvent, Track } from "livekit-client";
import { meetsApi } from "../../lib/api";
import { playMeetJoinRequestCue, playMeetStartedCue } from "../../lib/audio-cues";
import { buildJoinUrl, buildSocketNamespaceUrl } from "../../config/env";
import { getAuthToken } from "../../lib/session";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
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
import { enterMeetPip, iosRtcPipProps, setMeetPipEnabled } from "./meet-pip";
import WhiteboardPreview, {
  getWhiteboardActiveTabTitle,
  normalizeWhiteboardWorkspace,
  type WhiteboardWorkspace,
} from "./WhiteboardPreview";

type Props = NativeStackScreenProps<RootStackParamList, "GroupMeet">;
type JoinStatus = "connecting" | "waiting" | "rejected" | "joined";
type RemotePeer = {
  peerId: string;
  socketPeerId: string | null;
  displayName: string;
  stream: MediaStream | null;
  hasVideo?: boolean;
  hasAudio?: boolean;
  videoMuted?: boolean;
  audioMuted?: boolean;
  connectionState?: string;
};
type RemoteScreenShare = {
  peerId: string;
  displayName: string;
  stream: MediaStream | null;
  hasVideo?: boolean;
};
type KnockRequest = {
  peerId: string;
  displayName: string;
};
type CallTile = {
  tileId: string;
  peerId: string;
  label: string;
  stream: MediaStream | null;
  isLocal: boolean;
  isScreenShare: boolean;
  isWhiteboard?: boolean;
  hasVideo: boolean;
  audioMuted: boolean;
  videoMuted: boolean;
};

const PEER_LEFT_GRACE_MS = 6500;

const parseParticipantUserId = (metadata?: string) => {
  const normalizedMetadata = String(metadata || "").trim();
  if (!normalizedMetadata) {
    return "";
  }

  try {
    const parsed = JSON.parse(normalizedMetadata) as { userId?: unknown };
    return String(parsed?.userId || "").trim();
  } catch {
    return "";
  }
};

const getParticipantDedupKey = (participant: {
  identity?: string;
  name?: string;
  metadata?: string;
}) => {
  const userId = parseParticipantUserId(participant.metadata);
  if (userId) {
    return `user:${userId}`;
  }

  const normalizedName = String(participant.name || "").trim().toLowerCase();
  if (normalizedName) {
    return `name:${normalizedName}`;
  }

  return `identity:${String(participant.identity || "").trim()}`;
};

const scoreRemotePeer = (peer: RemotePeer) =>
  (peer.stream ? 4 : 0) +
  (peer.hasVideo ? 2 : 0) +
  (peer.hasAudio ? 1 : 0) +
  (peer.connectionState === "connected" ? 1 : 0);

const pickPreferredRemotePeer = (current: RemotePeer | undefined, candidate: RemotePeer) => {
  if (!current) {
    return candidate;
  }

  return scoreRemotePeer(candidate) >= scoreRemotePeer(current) ? candidate : current;
};

const pickPreferredScreenShare = (
  current: RemoteScreenShare | undefined,
  candidate: RemoteScreenShare,
) => {
  if (!current) {
    return candidate;
  }

  const currentScore = (current.stream ? 2 : 0) + (current.hasVideo ? 1 : 0);
  const candidateScore = (candidate.stream ? 2 : 0) + (candidate.hasVideo ? 1 : 0);
  return candidateScore >= currentScore ? candidate : current;
};

const getParticipantFallbackColor = (label = "") => {
  const seed = String(label || "guest");
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return `hsl(${hash} 52% 34%)`;
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
  return 2;
};

const getQualityLabel = (peerCount: number) => {
  if (peerCount >= 6) return "Audio priority";
  if (peerCount >= 4) return "Balanced";
  return "HD";
};

export function GroupMeetScreen({ navigation, route }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { roomId, title, isCreator, isPrivate } = route.params;
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = String(currentUser?._id || currentUser?.id || "").trim();
  const displayName =
    currentUser?.nickname || currentUser?.username || currentUser?.email || "User";

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [remoteScreenShares, setRemoteScreenShares] = useState<RemoteScreenShare[]>([]);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>("connecting");
  const [error, setError] = useState("");
  const [roomTitle, setRoomTitle] = useState(title || "Meet");
  const [roomIsPrivate, setRoomIsPrivate] = useState(Boolean(isPrivate));
  const [knockRequests, setKnockRequests] = useState<KnockRequest[]>([]);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [micLocked, setMicLocked] = useState(false);
  const [camLocked, setCamLocked] = useState(false);
  const [privacyUpdating, setPrivacyUpdating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [fullscreenTileId, setFullscreenTileId] = useState<string | null>(null);
  const [lastSpeakerPeerId, setLastSpeakerPeerId] = useState<string | null>(null);
  const [isUIHidden, setIsUIHidden] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [showMenuDialog, setShowMenuDialog] = useState(false);
  const [isSystemPipMode, setIsSystemPipMode] = useState(false);
  const [whiteboard, setWhiteboard] = useState<WhiteboardWorkspace | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);
  const livekitConnectPromiseRef = useRef<Promise<Room | null> | null>(null);
  const peerLeftTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const hangupStartedRef = useRef(false);
  const connectedAtRef = useRef<number | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chromeAnim = useRef(new Animated.Value(1)).current;
  const roomTitleRef = useRef(roomTitle);
  const roomPrivacyRef = useRef(roomIsPrivate);
  const startCuePlayedRef = useRef<string | null>(null);
  const socketPeerIdByNameRef = useRef<Record<string, string>>({});
  const socketNameByPeerIdRef = useRef<Record<string, string>>({});
  const isMicOnRef = useRef(true);
  const isCamOnRef = useRef(true);

  const joinUrl = useMemo(() => buildJoinUrl(roomId), [roomId]);

  useEffect(() => {
    if (!roomId || startCuePlayedRef.current === roomId) {
      return;
    }

    startCuePlayedRef.current = roomId;
    void playMeetStartedCue();
  }, [roomId]);

  useEffect(() => {
    roomTitleRef.current = roomTitle;
  }, [roomTitle]);

  useEffect(() => {
    roomPrivacyRef.current = roomIsPrivate;
  }, [roomIsPrivate]);

  useEffect(() => {
    isMicOnRef.current = isMicOn;
  }, [isMicOn]);

  useEffect(() => {
    isCamOnRef.current = isCamOn;
  }, [isCamOn]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(chromeAnim, {
        toValue: isUIHidden ? 0 : 1,
        duration: 320,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: false,
      }),
    ]).start();
  }, [chromeAnim, isUIHidden]);

  useEffect(() => {
    if (joinStatus !== "joined") {
      connectedAtRef.current = null;
      setElapsedSeconds(0);
      return;
    }

    if (!connectedAtRef.current) {
      connectedAtRef.current = Date.now();
    }

    const intervalId = setInterval(() => {
      if (!connectedAtRef.current) {
        return;
      }

      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - connectedAtRef.current) / 1000)),
      );
    }, 1000);

    return () => clearInterval(intervalId);
  }, [joinStatus]);

  const clearPeerTimeout = useCallback((socketPeerId: string) => {
    const timeout = peerLeftTimeoutsRef.current[socketPeerId];
    if (timeout) {
      clearTimeout(timeout);
      delete peerLeftTimeoutsRef.current[socketPeerId];
    }
  }, []);

  const syncLivekitState = useCallback((room: Room | null) => {
    if (!room) {
      setLocalStream(null);
      setScreenStream(null);
      setRemotePeers([]);
      setRemoteScreenShares([]);
      setWhiteboard(null);
      setLoadingMedia(false);
      return;
    }

    const localCameraStream = getParticipantStream(room.localParticipant, Track.Source.Camera);
    const localScreenStream = getParticipantStream(room.localParticipant, Track.Source.ScreenShare);
    const localMicPublication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const localScreenPublication = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);

    setLocalStream(localCameraStream);
    setScreenStream(localScreenStream);
    setIsCamOn(Boolean(localCameraStream && hasLiveVideoTrack(localCameraStream)));
    setIsMicOn(Boolean(localMicPublication && !localMicPublication.isMuted));
    setIsScreenSharing(
      Boolean(
        (localScreenStream && hasLiveVideoTrack(localScreenStream)) ||
          (localScreenPublication && !localScreenPublication.isMuted),
      ),
    );

    const nextRemotePeersByKey = new Map<string, RemotePeer>();
    const nextRemoteScreenSharesByKey = new Map<string, RemoteScreenShare>();

    Array.from(room.remoteParticipants.values()).forEach((participant) => {
      const participantName = getParticipantDisplayName(participant);
      const participantUserId = parseParticipantUserId(participant.metadata);
      const isCurrentUserSession = Boolean(
        currentUserId && participantUserId && participantUserId === currentUserId,
      );

      if (isCurrentUserSession) {
        return;
      }

      const participantKey = getParticipantDedupKey(participant);
      const socketPeerId = socketPeerIdByNameRef.current[participantName] || null;
      if (socketPeerId) {
        clearPeerTimeout(socketPeerId);
      }

      const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
      const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);
      const screenPublication = participant.getTrackPublication(Track.Source.ScreenShare);
      const cameraStream = getParticipantStream(participant, Track.Source.Camera);
      const screenShareStream = getParticipantStream(participant, Track.Source.ScreenShare);

      const nextPeer: RemotePeer = {
        peerId: participant.identity,
        socketPeerId,
        displayName: participantName,
        stream: cameraStream,
        hasAudio: Boolean(microphonePublication),
        hasVideo: Boolean(cameraPublication),
        audioMuted: !microphonePublication || microphonePublication.isMuted,
        videoMuted:
          !cameraPublication ||
          cameraPublication.isMuted ||
          !cameraStream ||
          !hasLiveVideoTrack(cameraStream),
        connectionState: room.state === "connected" ? "connected" : room.state,
      };

      nextRemotePeersByKey.set(
        participantKey,
        pickPreferredRemotePeer(nextRemotePeersByKey.get(participantKey), nextPeer),
      );

      if (screenShareStream) {
        const nextScreenShare: RemoteScreenShare = {
          peerId: participant.identity,
          displayName: participantName,
          stream: screenShareStream,
          hasVideo:
            Boolean(screenPublication && !screenPublication.isMuted) &&
            (!screenShareStream || hasLiveVideoTrack(screenShareStream)),
        };

        nextRemoteScreenSharesByKey.set(
          participantKey,
          pickPreferredScreenShare(
            nextRemoteScreenSharesByKey.get(participantKey),
            nextScreenShare,
          ),
        );
      } else if (screenPublication && !screenPublication.isMuted) {
        const nextScreenShare: RemoteScreenShare = {
          peerId: participant.identity,
          displayName: participantName,
          stream: null,
          hasVideo: true,
        };

        nextRemoteScreenSharesByKey.set(
          participantKey,
          pickPreferredScreenShare(
            nextRemoteScreenSharesByKey.get(participantKey),
            nextScreenShare,
          ),
        );
      }
    });

    setRemotePeers(Array.from(nextRemotePeersByKey.values()));
    setRemoteScreenShares(Array.from(nextRemoteScreenSharesByKey.values()));
    setLoadingMedia(false);

    if (room.state === "connected") {
      setJoinStatus("joined");
    }
  }, [clearPeerTimeout, currentUserId, displayName]);

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
          .on(RoomEvent.ParticipantDisconnected, sync)
          .on(RoomEvent.TrackSubscribed, sync)
          .on(RoomEvent.TrackUnsubscribed, sync)
          .on(RoomEvent.TrackMuted, sync)
          .on(RoomEvent.TrackUnmuted, sync)
          .on(RoomEvent.LocalTrackPublished, sync)
          .on(RoomEvent.LocalTrackUnpublished, sync)
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            setLastSpeakerPeerId(speakers[0]?.identity || null);
          })
          .on(RoomEvent.MediaDevicesError, (nextError) => {
            Alert.alert(
              "Media xatosi",
              nextError instanceof Error ? nextError.message : "Kamera yoki mikrofon ulanmayapti.",
            );
          });

        await room.connect(tokenPayload.url, tokenPayload.token);
        await room.localParticipant.setMicrophoneEnabled(isMicOnRef.current);
        await room.localParticipant.setCameraEnabled(isCamOnRef.current);
        livekitRoomRef.current = room;
        sync();
        return room;
      } catch (nextError) {
        setLoadingMedia(false);
        setError(nextError instanceof Error ? nextError.message : "LiveKit ga ulanib bo'lmadi");
        return null;
      } finally {
        livekitConnectPromiseRef.current = null;
      }
    })();

    return livekitConnectPromiseRef.current;
  }, [displayName, roomId, syncLivekitState]);

  const cleanupCall = useCallback(async () => {
    if (hangupStartedRef.current) {
      return;
    }

    hangupStartedRef.current = true;
    socketRef.current?.emit("leave-room", { roomId });
    socketRef.current?.disconnect();
    socketRef.current = null;
    Object.values(peerLeftTimeoutsRef.current).forEach((timeout) => clearTimeout(timeout));
    peerLeftTimeoutsRef.current = {};
    await disconnectLivekitRoom();
    await stopLivekitAudioSession().catch(() => undefined);
    setLocalStream(null);
    setScreenStream(null);
    setRemotePeers([]);
    setRemoteScreenShares([]);
    setWhiteboard(null);
    setJoinStatus("connecting");
    setElapsedSeconds(0);
    connectedAtRef.current = null;
  }, [disconnectLivekitRoom, roomId]);

  useEffect(() => {
    return () => {
      void cleanupCall();
    };
  }, [cleanupCall]);

  useEffect(() => {
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
        void connectLivekitRoom();
      });

      socket.on("room-info", ({ title: nextTitle, isPrivate: nextIsPrivate, whiteboard: nextWhiteboard }) => {
        if (typeof nextTitle === "string" && nextTitle.trim()) {
          setRoomTitle(nextTitle.trim());
        }
        if (typeof nextIsPrivate === "boolean") {
          setRoomIsPrivate(nextIsPrivate);
        }
        setWhiteboard(normalizeWhiteboardWorkspace(nextWhiteboard));
      });

      socket.on("existing-peers", ({ peers }) => {
        (Array.isArray(peers) ? peers : []).forEach((peer) => {
          const peerId = String(peer?.peerId || "");
          const peerName = String(peer?.displayName || peerId);
          if (!peerId || !peerName) {
            return;
          }

          socketPeerIdByNameRef.current[peerName] = peerId;
          socketNameByPeerIdRef.current[peerId] = peerName;
        });

        setJoinStatus("joined");
        void connectLivekitRoom();
      });

      socket.on("peer-joined", ({ peerId, displayName: peerDisplayName }) => {
        const normalizedPeerId = String(peerId || "");
        const normalizedName = String(peerDisplayName || normalizedPeerId);
        if (!normalizedPeerId || !normalizedName) {
          return;
        }

        socketPeerIdByNameRef.current[normalizedName] = normalizedPeerId;
        socketNameByPeerIdRef.current[normalizedPeerId] = normalizedName;
        clearPeerTimeout(normalizedPeerId);
        void connectLivekitRoom();
      });

      socket.on("peer-left", ({ peerId }) => {
        const normalizedPeerId = String(peerId || "");
        if (!normalizedPeerId) return;

        const knownName = socketNameByPeerIdRef.current[normalizedPeerId];
        if (knownName) {
          delete socketPeerIdByNameRef.current[knownName];
        }
        delete socketNameByPeerIdRef.current[normalizedPeerId];

        clearPeerTimeout(normalizedPeerId);
        peerLeftTimeoutsRef.current[normalizedPeerId] = setTimeout(() => {
          delete peerLeftTimeoutsRef.current[normalizedPeerId];
          setRemotePeers((previous) =>
            previous.filter((peer) => peer.socketPeerId !== normalizedPeerId),
          );
          setRemoteScreenShares((previous) =>
            previous.filter((peer) => socketPeerIdByNameRef.current[peer.displayName] !== normalizedPeerId),
          );
        }, PEER_LEFT_GRACE_MS);
      });

      socket.on("kicked", () => {
        setError("Siz yaratuvchi tomonidan chiqarib yuborildingiz");
        setJoinStatus("rejected");
        void cleanupCall();
      });

      socket.on("force-mute-mic", async () => {
        const room = livekitRoomRef.current || (await connectLivekitRoom());
        await room?.localParticipant.setMicrophoneEnabled(false);
        setMicLocked(true);
        syncLivekitState(room);
      });

      socket.on("force-mute-cam", async () => {
        const room = livekitRoomRef.current || (await connectLivekitRoom());
        await room?.localParticipant.setCameraEnabled(false);
        setCamLocked(true);
        syncLivekitState(room);
      });

      socket.on("allow-mic", () => {
        setMicLocked(false);
      });

      socket.on("allow-cam", () => {
        setCamLocked(false);
      });

      socket.on("knock-request", ({ peerId, displayName: guestName }) => {
        if (!isCreator) return;

        const normalizedPeerId = String(peerId || "");
        if (!normalizedPeerId) return;
        let didAddNewRequest = false;

        setKnockRequests((previous) => {
          const existingIndex = previous.findIndex((entry) => entry.peerId === normalizedPeerId);
          if (existingIndex === -1) {
            didAddNewRequest = true;
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
              ? { ...entry, displayName: String(guestName || entry.displayName) }
              : entry,
          );
        });

        if (didAddNewRequest) {
          void playMeetJoinRequestCue();
        }
      });

      socket.on("waiting-for-approval", () => {
        setJoinStatus("waiting");
      });

      socket.on("knock-approved", () => {
        setJoinStatus("joined");
        void connectLivekitRoom();
      });

      socket.on("knock-rejected", ({ reason }) => {
        setJoinStatus("rejected");
        setError(String(reason || "Rad etildi"));
      });

      socket.on("whiteboard-state", (payload) => {
        const parsedWhiteboard = normalizeWhiteboardWorkspace(payload);
        if (!parsedWhiteboard) {
          setWhiteboard(null);
          return;
        }
        setWhiteboard(parsedWhiteboard);
      });

      socket.on("whiteboard-started", (payload) => {
        setWhiteboard((current) =>
          normalizeWhiteboardWorkspace({
            isActive: true,
            ownerPeerId: current?.ownerPeerId || "",
            ownerDisplayName: payload?.ownerDisplayName || current?.ownerDisplayName,
            activeTabTitle: getWhiteboardActiveTabTitle(current) || payload?.activeTabId,
            activeTabId: payload?.activeTabId,
            tabs: current?.tabs,
            pdfLibrary: current?.pdfLibrary,
          }),
        );
      });

      socket.on("whiteboard-stopped", () => {
        setWhiteboard(null);
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
    };
  }, [clearPeerTimeout, cleanupCall, connectLivekitRoom, displayName, isCreator, roomId, syncLivekitState]);

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

  const handleToggleMic = useCallback(async () => {
    if (micLocked) {
      return;
    }
    const nextEnabled = !isMicOnRef.current;
    const room = livekitRoomRef.current || (await connectLivekitRoom());
    if (!room) {
      return;
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(nextEnabled);
      isMicOnRef.current = nextEnabled;
      setIsMicOn(nextEnabled);
      // Wait for track to be published then sync
      setTimeout(() => syncLivekitState(room), 300);
    } catch (err) {
      Alert.alert("Mikrofon xatosi", err instanceof Error ? err.message : "Mikrofon yoqilmadi");
      syncLivekitState(room);
    }
  }, [connectLivekitRoom, micLocked, syncLivekitState]);

  const handleToggleCam = useCallback(async () => {
    if (camLocked) {
      return;
    }
    const nextEnabled = !isCamOnRef.current;
    const room = livekitRoomRef.current || (await connectLivekitRoom());
    if (!room) {
      return;
    }
    try {
      await room.localParticipant.setCameraEnabled(nextEnabled);
      isCamOnRef.current = nextEnabled;
      setIsCamOn(nextEnabled);
      // Wait for track to be published then sync
      setTimeout(() => syncLivekitState(room), 300);
    } catch (err) {
      Alert.alert("Kamera xatosi", err instanceof Error ? err.message : "Kamera yoqilmadi");
      syncLivekitState(room);
    }
  }, [camLocked, connectLivekitRoom, syncLivekitState]);

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
      const nextEnabled = !isScreenSharing;
      await room.localParticipant.setScreenShareEnabled(nextEnabled);
      // Re-enable camera and mic after screen share to ensure they stay published
      if (nextEnabled && isCamOnRef.current) {
        await room.localParticipant.setCameraEnabled(true);
      }
      if (nextEnabled && isMicOnRef.current) {
        await room.localParticipant.setMicrophoneEnabled(true);
      }
      // Wait for track to be published then sync
      setTimeout(() => syncLivekitState(room), 500);
    } catch (nextError) {
      Alert.alert(
        "Screen share yoqilmadi",
        nextError instanceof Error
          ? nextError.message
          : "Ekran ulashishni boshlashda xatolik yuz berdi.",
      );
      syncLivekitState(room);
    }
  }, [connectLivekitRoom, isScreenSharing, syncLivekitState]);

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

  const handleToggleSpeaker = useCallback(() => {
    setIsSpeakerOn((current) => !current);
  }, []);

  const handleToggleChrome = useCallback(() => {
    setIsUIHidden((current) => !current);
  }, []);

  const handleLeave = async () => {
    await cleanupCall();
    navigation.goBack();
  };

  const handleForceMuteMic = (socketPeerId: string | null, isPeerMicOn: boolean) => {
    if (!isCreator || !socketPeerId) {
      return;
    }

    socketRef.current?.emit(isPeerMicOn ? "force-mute-mic" : "allow-mic", {
      roomId,
      peerId: socketPeerId,
    });
  };

  const handleForceMuteCam = (socketPeerId: string | null, isPeerCamOn: boolean) => {
    if (!isCreator || !socketPeerId) {
      return;
    }

    socketRef.current?.emit(isPeerCamOn ? "force-mute-cam" : "allow-cam", {
      roomId,
      peerId: socketPeerId,
    });
  };

  const handleKickPeer = (socketPeerId: string | null) => {
    if (!isCreator || !socketPeerId) {
      return;
    }

    socketRef.current?.emit("kick-peer", { roomId, peerId: socketPeerId });
  };

  const participantsCount = remotePeers.length + 1;
  const isLandscape = screenWidth > screenHeight;
  const qualityLabel = getQualityLabel(remotePeers.length + 1 + (isScreenSharing ? 1 : 0));
  const qualityIcon = qualityLabel === "Audio priority" ? AlertCircle : qualityLabel === "Balanced" ? Users : CheckCircle;
  const qualityColor = qualityLabel === "Audio priority" ? Colors.warning : qualityLabel === "Balanced" ? Colors.primary : Colors.accent;
  const gridColumns = useMemo(() => {
    const tileCount = Math.max(
      1,
      remotePeers.length + 1 + remoteScreenShares.length + (screenStream ? 1 : 0),
    );
    if (tileCount === 2 && !isLandscape) {
      return 1;
    }
    return getTileColumns(tileCount);
  }, [isLandscape, remotePeers.length, remoteScreenShares.length, screenStream]);
  const tileWidth = useMemo(() => {
    const horizontalPadding = 28;
    const gap = 10;
    const contentWidth = screenWidth - horizontalPadding - gap * (gridColumns - 1);
    return Math.max(120, Math.floor(contentWidth / gridColumns));
  }, [gridColumns, screenWidth]);
  const compactTileWidth = useMemo(() => {
    if (isLandscape) {
      return 132;
    }

    return Math.max(112, Math.floor((screenWidth - 40) / 2));
  }, [isLandscape, screenWidth]);
  const floatingTileWidth = useMemo(
    () => Math.max(88, Math.min(126, Math.floor(screenWidth * 0.28))),
    [screenWidth],
  );
  const controlIconSize = screenWidth < 390 ? 16 : 18;
  const controlLockSize = screenWidth < 390 ? 8 : 9;

  const participantRows = useMemo(
    () => [
      {
        id: "local",
        socketPeerId: null,
        name: `${displayName} (Sen)`,
        isLocal: true,
        audioMuted: !isMicOn,
        videoMuted: !isCamOn,
        connectionState: undefined as string | undefined,
      },
      ...remotePeers.map((peer) => ({
        id: peer.peerId,
        socketPeerId: peer.socketPeerId,
        name: peer.displayName,
        isLocal: false,
        audioMuted: peer.audioMuted,
        videoMuted: peer.videoMuted,
        connectionState: peer.connectionState,
      })),
    ],
    [displayName, isCamOn, isMicOn, remotePeers],
  );

  const callTiles = useMemo<CallTile[]>(() => {
    const tiles: CallTile[] = [
      {
        tileId: "local",
        peerId: "local",
        label: `${displayName} (Sen)`,
        stream: localStream,
        isLocal: true,
        isScreenShare: false,
        hasVideo: Boolean(localStream) && isCamOn,
        audioMuted: !isMicOn,
        videoMuted: !isCamOn,
      },
    ];

    if (whiteboard?.isActive) {
      tiles.unshift({
        tileId: "whiteboard",
        peerId: "whiteboard",
        label: whiteboard.ownerDisplayName
          ? `${whiteboard.ownerDisplayName} · Whiteboard`
          : "Whiteboard",
        stream: null,
        isLocal: false,
        isScreenShare: true,
        isWhiteboard: true,
        hasVideo: false,
        audioMuted: true,
        videoMuted: false,
      });
    }

    if (screenStream) {
      const hasLocalScreenVideo = hasLiveVideoTrack(screenStream);
      tiles.unshift({
        tileId: "local:screen",
        peerId: "local",
        label: `${displayName} · Ekran`,
        stream: screenStream,
        isLocal: true,
        isScreenShare: true,
        hasVideo: hasLocalScreenVideo,
        audioMuted: true,
        videoMuted: !hasLocalScreenVideo,
      });
    } else if (isScreenSharing) {
      tiles.unshift({
        tileId: "local:screen",
        peerId: "local",
        label: `${displayName} · Ekran`,
        stream: null,
        isLocal: true,
        isScreenShare: true,
        hasVideo: true,
        audioMuted: true,
        videoMuted: false,
      });
    }

    remotePeers.forEach((peer) => {
      const hasRemoteVideo = peer.hasVideo !== false && peer.videoMuted !== true;
      tiles.push({
        tileId: peer.peerId,
        peerId: peer.peerId,
        label: peer.displayName,
        stream: peer.stream,
        isLocal: false,
        isScreenShare: false,
        hasVideo: Boolean(peer.stream) && hasRemoteVideo,
        audioMuted: peer.audioMuted === true,
        videoMuted: !hasRemoteVideo,
      });
    });

    remoteScreenShares.forEach((peer) => {
      const hasRemoteScreenVideo = peer.hasVideo !== false;
      tiles.unshift({
        tileId: `${peer.peerId}:screen`,
        peerId: peer.peerId,
        label: `${peer.displayName} · Ekran`,
        stream: peer.stream,
        isLocal: false,
        isScreenShare: true,
        hasVideo: hasRemoteScreenVideo,
        audioMuted: true,
        videoMuted: !hasRemoteScreenVideo && !peer.stream,
      });
    });

    return tiles;
  }, [displayName, isCamOn, isMicOn, localStream, remotePeers, remoteScreenShares, screenStream, whiteboard]);
  const isPortraitStackLayout = !isLandscape && callTiles.length === 2;
  const gridRowCount = useMemo(() => {
    if (callTiles.length <= 1) {
      return 1;
    }
    if (isPortraitStackLayout) {
      return 2;
    }
    return Math.max(1, Math.ceil(callTiles.length / 2));
  }, [callTiles.length, isPortraitStackLayout]);
  const gridTileHeight = useMemo(() => {
    const reservedHeight = 220;
    const availableHeight = Math.max(260, screenHeight - reservedHeight);
    const rowGap = 10 * Math.max(0, gridRowCount - 1);
    return Math.max(130, Math.floor((availableHeight - rowGap) / gridRowCount));
  }, [gridRowCount, screenHeight]);

  useEffect(() => {
    setSelectedTileId((current) =>
      current && callTiles.some((tile) => tile.tileId === current) ? current : null,
    );
  }, [callTiles]);

  useEffect(() => {
    setFullscreenTileId((current) => {
      if (!current) return null;
      const tile = callTiles.find((entry) => entry.tileId === current);
      return tile?.hasVideo ? current : null;
    });
  }, [callTiles]);

  const activeStageTileId = fullscreenTileId || null;
  const activeStageTile = callTiles.find((tile) => tile.tileId === activeStageTileId) || null;
  const sideTiles = activeStageTileId ? callTiles.filter((tile) => tile.tileId !== activeStageTileId) : [];
  const hasSpotlight = Boolean(activeStageTile);
  const isPresenterMode = Boolean(activeStageTile?.isScreenShare);
  const pipTargetTileId = useMemo(() => {
    const screenShareTile = callTiles.find((tile) => tile.isScreenShare && tile.hasVideo);
    if (fullscreenTileId) {
      return fullscreenTileId;
    }
    if (selectedTileId) {
      return selectedTileId;
    }
    if (screenShareTile) {
      return screenShareTile.tileId;
    }
    return callTiles.find((tile) => !tile.isLocal && tile.hasVideo)?.tileId || null;
  }, [callTiles, fullscreenTileId, selectedTileId]);
  const canAutoEnterPip = joinStatus === "joined";
  const mobileCompactTiles = useMemo(() => {
    if (!hasSpotlight) {
      return [];
    }

    const activePeerId = activeStageTile?.peerId || null;
    const compactTiles: CallTile[] = [];
    const pushUnique = (tile?: CallTile | null) => {
      if (!tile || compactTiles.some((entry) => entry.tileId === tile.tileId)) {
        return;
      }
      compactTiles.push(tile);
    };

    pushUnique(
      sideTiles.find(
        (tile) =>
          !tile.isScreenShare && !tile.isLocal && tile.peerId !== activePeerId && tile.peerId === lastSpeakerPeerId,
      ),
    );
    sideTiles.forEach((tile) => {
      if (!tile.isScreenShare && tile.peerId !== activePeerId) {
        pushUnique(tile);
      }
    });

    return compactTiles.slice(0, 2);
  }, [activeStageTile?.peerId, hasSpotlight, lastSpeakerPeerId, sideTiles]);
  const floatingParticipantTiles = useMemo(() => {
    if (!hasSpotlight || !isPresenterMode) {
      return [];
    }

    return sideTiles.filter((tile) => !tile.isScreenShare).slice(0, 2);
  }, [hasSpotlight, isPresenterMode, sideTiles]);

  const gridRows = useMemo(() => {
    const rows: CallTile[][] = [];
    for (let index = 0; index < callTiles.length; index += gridColumns) {
      rows.push(callTiles.slice(index, index + gridColumns));
    }
    return rows;
  }, [callTiles, gridColumns]);

  const handleSelectTile = useCallback((tileId: string) => {
    setSelectedTileId((current) => (current === tileId ? null : tileId));
    setFullscreenTileId((current) => (current === tileId ? null : current));
  }, []);

  const handleToggleTileFullscreen = useCallback((tile: CallTile) => {
    if (!tile.hasVideo) {
      return;
    }

    setSelectedTileId(tile.tileId);
    setFullscreenTileId((current) => {
      const enteringFullscreen = current !== tile.tileId;
      // Hide UI when entering fullscreen, show when exiting
      setIsUIHidden(enteringFullscreen);
      return enteringFullscreen ? tile.tileId : null;
    });
  }, []);

  useEffect(() => {
    void setMeetPipEnabled(canAutoEnterPip);

    return () => {
      void setMeetPipEnabled(false);
    };
  }, [canAutoEnterPip]);

  useEffect(() => {
    const pipTargetTile =
      callTiles.find((tile) => tile.tileId === pipTargetTileId) ||
      callTiles.find((tile) => !tile.isLocal && tile.hasVideo) ||
      null;

    const subscription = AppState.addEventListener("change", (state) => {
      const isBackgrounded = state === "inactive" || state === "background";
      setIsSystemPipMode(isBackgrounded);

      if (isBackgrounded && canAutoEnterPip) {
        const useLandscapePip = Boolean(pipTargetTile?.isScreenShare);
        void enterMeetPip(useLandscapePip ? 16 : 9, useLandscapePip ? 9 : 16);
      }
    });

    return () => subscription.remove();
  }, [callTiles, canAutoEnterPip, pipTargetTileId]);

  const renderTile = (
    tile: CallTile,
    options?: { compact?: boolean; isStage?: boolean; floatingCompact?: boolean; immersive?: boolean },
  ) => {
    const compact = Boolean(options?.compact);
    const isStage = Boolean(options?.isStage);
    const floatingCompact = Boolean(options?.floatingCompact);
    const immersive = Boolean(options?.immersive);
    const initial = tile.label.slice(0, 1).toUpperCase();
    const streamUrl = tile.stream?.toURL() || null;
    const canRenderStream = tile.hasVideo && Boolean(streamUrl);
    const fallbackColor = getParticipantFallbackColor(tile.label);
    const shouldUseIosPip = Boolean(
      Platform.OS === "ios" &&
        canRenderStream &&
        tile.tileId === pipTargetTileId &&
        (!tile.isLocal || tile.isScreenShare),
    );

    const isSpeaking = tile.peerId === lastSpeakerPeerId && !fullscreenTileId;

    return (
      <View
        key={tile.tileId}
        style={[
          styles.tile,
          compact && styles.tileCompact,
          floatingCompact && styles.tileFloatingCompact,
          isStage && styles.tileStage,
          immersive && styles.tileImmersive,
          isSpeaking && styles.tileSpeaking,
          !isStage && {
            width: floatingCompact ? floatingTileWidth : compact ? compactTileWidth : tileWidth,
          },
          !isStage &&
            !compact &&
            !floatingCompact && {
              height: gridTileHeight,
              aspectRatio: undefined,
            },
        ]}
      >
        {canRenderStream && streamUrl ? (
          <RTCView
            streamURL={streamUrl}
            style={styles.tileVideo}
            objectFit="contain"
            mirror={tile.isScreenShare ? false : tile.isLocal}
            {...iosRtcPipProps(shouldUseIosPip)}
          />
        ) : (
          tile.isWhiteboard ? (
            whiteboard ? (
              <WhiteboardPreview workspace={whiteboard} />
            ) : (
              <View style={styles.whiteboardFallback}>
                <View style={[styles.whiteboardBadge, compact && styles.whiteboardBadgeCompact]}>
                  <PenSquare size={compact ? 16 : 22} color="#d9f99d" />
                </View>
                <Text style={[styles.whiteboardTitle, compact && styles.whiteboardTitleCompact]}>
                  Whiteboard
                </Text>
                <Text
                  style={[styles.whiteboardSubtitle, compact && styles.whiteboardSubtitleCompact]}
                  numberOfLines={2}
                >
                  {getWhiteboardActiveTabTitle(whiteboard)}
                </Text>
              </View>
            )
          ) : (
            <View style={[styles.tileFallback, { backgroundColor: fallbackColor }]}>
              <View style={[styles.tileAvatar, compact && styles.tileAvatarCompact]}>
                <Text style={[styles.tileAvatarText, compact && styles.tileAvatarTextCompact]}>{initial}</Text>
              </View>
            </View>
          )
        )}

        {!isStage && tile.hasVideo ? (
          <Pressable
            style={styles.tileExpandButton}
            onPress={(event) => {
              event.stopPropagation?.();
              handleToggleTileFullscreen(tile);
            }}
          >
            <Maximize2 size={14} color="#fff" />
          </Pressable>
        ) : null}

        {/* Mute badges - top right */}
        <View style={[styles.tileStatusStack, compact && styles.tileStatusStackCompact]}>
          {tile.audioMuted ? (
            <View style={styles.tileMuteBadge}>
              <MicOff size={compact ? 14 : 16} color="#d6f0a0" />
            </View>
          ) : null}
          {tile.videoMuted && !tile.isScreenShare ? (
            <View style={styles.tileMuteBadge}>
              <CameraOff size={compact ? 14 : 16} color="#d6f0a0" />
            </View>
          ) : null}
          {tile.isLocal && (micLocked || camLocked) ? (
            <View style={styles.tileMuteBadge}>
              <Lock size={compact ? 14 : 16} color="#d6f0a0" />
            </View>
          ) : null}
        </View>

        {/* Tile label - bottom left */}
        <View
          style={[
            styles.tileLabelContainer,
            compact && styles.tileLabelContainerCompact,
            immersive && styles.tileLabelContainerImmersive,
          ]}
        >
          <Text style={[styles.tileLabel, compact && styles.tileLabelCompact]} numberOfLines={1}>
            {tile.label}
          </Text>
        </View>
      </View>
    );
  };

  const canScreenShare = true;
  const headerOpacity = chromeAnim;
  const headerTranslateY = chromeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-18, 0],
  });
  const controlsOpacity = chromeAnim;
  const controlsTranslateY = chromeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [56, 0],
  });
  const animatedBodyPaddingTop = chromeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 60],
  });
  const animatedBodyPaddingBottom = chromeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 104],
  });

  return (
    <SafeAreaView
      style={[styles.safeArea, fullscreenTileId && styles.safeAreaFullscreen]}
      edges={fullscreenTileId ? ["top"] : ["top", "left", "right", "bottom"]}
    >
      <View style={[styles.container, fullscreenTileId && styles.containerFullscreen]}>
        <Animated.View
          pointerEvents={isUIHidden || isSystemPipMode ? "none" : "auto"}
          style={[
            styles.headerFloating,
            fullscreenTileId && styles.headerFloatingHidden,
            {
              opacity: fullscreenTileId || isSystemPipMode ? 0 : headerOpacity,
              transform: [{ translateY: fullscreenTileId || isSystemPipMode ? -100 : headerTranslateY }],
            },
          ]}
        >
          <View style={styles.headerContent}>
            {/* Left: Call Info */}
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {roomTitle || "Meet"}
              </Text>
              {roomIsPrivate && (
                <View style={styles.headerPrivateBadge}>
                  <Lock size={10} color={Colors.text} />
                  <Text style={styles.headerPrivateText}>Private</Text>
                </View>
              )}
            </View>

            {/* Right: Actions */}
            <View style={styles.headerActions}>
              {/* Quality Badge */}
              <View style={[styles.qualityBadge, { borderColor: qualityColor }]}>
                {React.createElement(qualityIcon, { size: 14, color: qualityColor })}
                <Text style={[styles.qualityBadgeText, { color: qualityColor }]}>
                  {qualityLabel}
                </Text>
              </View>
              <Pressable style={styles.headerButton} onPress={handleToggleSpeaker}>
                {isSpeakerOn ? <Volume2 size={18} color={Colors.text} /> : <Smartphone size={18} color={Colors.text} />}
              </Pressable>
              <Pressable style={styles.headerButton} onPress={handleSwitchCamera}>
                <RefreshCcw size={18} color={Colors.text} />
              </Pressable>
              <Pressable style={styles.headerButton} onPress={() => setShowDrawer((value) => !value)}>
                <Users size={18} color={Colors.text} />
                {isCreator && knockRequests.length > 0 ? (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifText}>{knockRequests.length}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {error && joinStatus !== "rejected" ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <Animated.View
          style={[
            styles.body,
            fullscreenTileId && styles.bodyFullscreen,
            {
              paddingTop: fullscreenTileId ? 0 : animatedBodyPaddingTop,
              paddingBottom: fullscreenTileId ? 0 : animatedBodyPaddingBottom,
            },
          ]}
        >
          <TouchableWithoutFeedback onPress={handleToggleChrome}>
            <View style={styles.bodyTouchArea}>
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
                <>
                  {hasSpotlight ? (
                    <View style={[styles.spotlightWrap, fullscreenTileId ? styles.spotlightWrapFullscreen : null]}>
                      <View style={styles.spotlightStageWrap}>
                        {activeStageTile
                          ? renderTile(activeStageTile, {
                              isStage: true,
                              immersive: Boolean(fullscreenTileId && !activeStageTile.isScreenShare),
                            })
                          : null}
                        <View style={styles.stageActionRow}>
                          {activeStageTile?.hasVideo ? (
                            <Pressable
                              style={styles.stageActionButton}
                              onPress={() => handleToggleTileFullscreen(activeStageTile)}
                            >
                              {fullscreenTileId ? (
                                <Minimize2 size={16} color="#fff" />
                              ) : (
                                <Maximize2 size={16} color="#fff" />
                              )}
                            </Pressable>
                          ) : null}
                        </View>
                        {fullscreenTileId && !isPresenterMode && mobileCompactTiles.length > 0 ? (
                          <ScrollView
                            style={styles.mobileImmersiveRail}
                            contentContainerStyle={styles.mobileImmersiveRailContent}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            bounces={false}
                          >
                            {mobileCompactTiles.map((tile) => (
                              <View key={`floating-${tile.tileId}`}>
                                {renderTile(tile, { compact: true, floatingCompact: true })}
                              </View>
                            ))}
                          </ScrollView>
                        ) : null}
                        {fullscreenTileId && isPresenterMode && floatingParticipantTiles.length > 0 ? (
                          <View style={[styles.floatingParticipantsContainer, isUIHidden && styles.floatingParticipantsHidden]}>
                            {floatingParticipantTiles.map((tile) => (
                              <Pressable
                                key={`presenter-${tile.tileId}`}
                                style={styles.floatingParticipantTile}
                                onPress={() => handleSelectTile(tile.tileId)}
                              >
                                {renderTile(tile, { compact: true, floatingCompact: true })}
                              </Pressable>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ) : (
                    <ScrollView contentContainerStyle={styles.gridContent} showsVerticalScrollIndicator={false} bounces={false}>
                      {gridRows.map((row, rowIndex) => {
                        const isCenteredLastRow =
                          (callTiles.length === 3 || callTiles.length === 5) &&
                          row.length === 1 &&
                          rowIndex === gridRows.length - 1;

                        return (
                          <View
                            key={`grid-row-${rowIndex}`}
                            style={[
                              styles.gridRow,
                              isPortraitStackLayout ? styles.gridRowStacked : null,
                              isCenteredLastRow ? styles.gridRowCentered : null,
                            ]}
                          >
                            {row.map((tile) => (
                              <Pressable key={tile.tileId} onPress={() => handleSelectTile(tile.tileId)}>
                                {renderTile(tile)}
                              </Pressable>
                            ))}
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </Animated.View>

        <Animated.View
          pointerEvents={isUIHidden || isSystemPipMode ? "none" : "auto"}
          style={[
            styles.controlsWrap,
            fullscreenTileId && styles.controlsWrapHidden,
            {
              opacity: fullscreenTileId || isSystemPipMode ? 0 : controlsOpacity,
              transform: [{ translateY: fullscreenTileId || isSystemPipMode ? 100 : controlsTranslateY }],
            },
          ]}
        >
          <BlurView intensity={28} tint="dark" style={styles.controlsChrome}>
            <View style={styles.controls}>
              {/* Mic Button */}
              <Pressable
                style={[
                  styles.controlButton,
                  styles.controlButtonStandard,
                  !isMicOn ? styles.controlButtonOff : null,
                  micLocked && styles.controlButtonDisabled,
                ]}
                onPress={() => void handleToggleMic()}
                disabled={micLocked}
              >
                {isMicOn ? (
                  <Mic size={controlIconSize} color="#f5f5f5" />
                ) : (
                  <MicOff size={controlIconSize} color="#7b241f" />
                )}
                {micLocked ? (
                  <Lock
                    size={controlLockSize}
                    color={isMicOn ? "#fff" : "#7b241f"}
                    style={styles.controlLock}
                  />
                ) : null}
              </Pressable>

              {/* Cam Button */}
              <Pressable
                style={[
                  styles.controlButton,
                  styles.controlButtonStandard,
                  !isCamOn ? styles.controlButtonOff : null,
                  camLocked && styles.controlButtonDisabled,
                ]}
                onPress={() => void handleToggleCam()}
                disabled={camLocked}
              >
                {isCamOn ? (
                  <CameraIcon size={controlIconSize} color="#f5f5f5" />
                ) : (
                  <CameraOff size={controlIconSize} color="#7b241f" />
                )}
                {camLocked ? (
                  <Lock
                    size={controlLockSize}
                    color={isCamOn ? "#fff" : "#7b241f"}
                    style={styles.controlLock}
                  />
                ) : null}
              </Pressable>

              {/* Screen Share Button */}
              {canScreenShare ? (
                <Pressable
                  style={[
                    styles.controlButton,
                    styles.controlButtonStandard,
                    isScreenSharing ? styles.controlButtonAccent : null,
                  ]}
                  onPress={() => void handleToggleScreenShare()}
                >
                  {isScreenSharing ? (
                    <Monitor size={controlIconSize} color={Colors.warning} />
                  ) : (
                    <MonitorOff size={controlIconSize} color="#f5f5f5" />
                  )}
                </Pressable>
              ) : null}

              {/* More Button */}
              <Pressable
                style={[styles.controlButton, styles.controlButtonStandard]}
                onPress={() => setShowMenuDialog((p) => !p)}
              >
                <MoreVertical size={controlIconSize} color="#f5f5f5" />
              </Pressable>

              <View style={styles.controlDivider} />

              {/* Hangup Button - wider like frontend */}
              <Pressable
                style={[styles.controlButton, styles.controlButtonDanger, styles.controlButtonWide]}
                onPress={() => void handleLeave()}
              >
                <PhoneOff size={controlIconSize} color="#fff" />
              </Pressable>
            </View>
          </BlurView>
        </Animated.View>

        {/* Menu Dialog - rendered outside controls to appear on top */}
        {showMenuDialog && !isSystemPipMode ? (
          <View style={styles.menuOverlay} pointerEvents="box-none">
            <Pressable style={styles.menuBackdrop} onPress={() => setShowMenuDialog(false)} />
            <View style={styles.menuDialog}>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  void handleCopy();
                  setShowMenuDialog(false);
                }}
              >
                {copied ? <Check size={18} color="#fff" /> : <Copy size={18} color="#fff" />}
                <Text style={styles.menuItemText}>
                  {copied ? "Copied!" : "Copy link"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showDrawer && !isSystemPipMode ? (
          <View style={styles.drawerOverlay} pointerEvents="box-none">
            <Pressable style={styles.drawerBackdrop} onPress={() => setShowDrawer(false)} />
            <View style={styles.drawerPanel}>
              <View style={styles.sheetHandle} />
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>A'zolar ({participantsCount})</Text>
                <Pressable style={styles.drawerClose} onPress={() => setShowDrawer(false)}>
                  <X size={16} color={Colors.text} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.drawerBody} showsVerticalScrollIndicator={false} bounces={false}>
                <View style={styles.linkCard}>
                  <View style={styles.linkTextWrap}>
                    <Text style={styles.linkTitle}>Meet link</Text>
                    <Text style={styles.linkValue} numberOfLines={2}>
                      {joinUrl}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.linkCopyButton, copied ? styles.linkCopyButtonActive : null]}
                    onPress={() => void handleCopy()}
                  >
                    {copied ? <Check size={14} color="#fff" /> : <Copy size={14} color="#fff" />}
                    <Text style={styles.linkCopyButtonText}>{copied ? "Copied" : "Copy"}</Text>
                  </Pressable>
                </View>

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
                    <Text style={styles.sectionTitle}>Kutayotganlar ({knockRequests.length})</Text>
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
                            : `${participant.audioMuted ? "Mikrofon off" : "Mikrofon on"} · ${
                                participant.videoMuted ? "Kamera off" : "Kamera on"
                              }${participant.connectionState ? ` · ${participant.connectionState}` : ""}`}
                        </Text>
                      </View>
                      <View style={styles.memberIcons}>
                        {participant.isLocal ? (
                          <>
                            {isMicOn ? (
                              <Mic size={13} color={Colors.accent} />
                            ) : (
                              <MicOff size={13} color={Colors.danger} />
                            )}
                            {isCamOn ? (
                              <Video size={13} color={Colors.accent} />
                            ) : (
                              <CameraOff size={13} color={Colors.danger} />
                            )}
                          </>
                        ) : isCreator && participant.socketPeerId ? (
                          <>
                            <Pressable
                              style={[
                                styles.memberActionButton,
                                participant.audioMuted
                                  ? styles.memberActionButtonDanger
                                  : styles.memberActionButtonSuccess,
                              ]}
                              onPress={() =>
                                handleForceMuteMic(participant.socketPeerId, !Boolean(participant.audioMuted))
                              }
                            >
                              {participant.audioMuted ? (
                                <Mic size={14} color="#fff" />
                              ) : (
                                <MicOff size={14} color="#fff" />
                              )}
                            </Pressable>
                            <Pressable
                              style={[
                                styles.memberActionButton,
                                participant.videoMuted
                                  ? styles.memberActionButtonDanger
                                  : styles.memberActionButtonSuccess,
                              ]}
                              onPress={() =>
                                handleForceMuteCam(participant.socketPeerId, !Boolean(participant.videoMuted))
                              }
                            >
                              {participant.videoMuted ? (
                                <Video size={14} color="#fff" />
                              ) : (
                                <CameraOff size={14} color="#fff" />
                              )}
                            </Pressable>
                            <Pressable
                              style={[styles.memberActionButton, styles.memberActionButtonDanger]}
                              onPress={() => handleKickPeer(participant.socketPeerId)}
                            >
                              <UserMinus size={14} color="#fff" />
                            </Pressable>
                          </>
                        ) : (
                          <>
                            {participant.audioMuted ? (
                              <MicOff size={13} color={Colors.danger} />
                            ) : (
                              <Mic size={13} color={Colors.accent} />
                            )}
                            {participant.videoMuted ? (
                              <CameraOff size={13} color={Colors.danger} />
                            ) : (
                              <Video size={13} color={Colors.accent} />
                            )}
                          </>
                        )}
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
  safeArea: { flex: 1, backgroundColor: "#0d0f14" },
  safeAreaFullscreen: {
    backgroundColor: "#000",
  },
  container: { flex: 1, backgroundColor: "#0d0f14" },
  containerFullscreen: {
    backgroundColor: "#000",
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
  headerTextWrap: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  subtitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  subtitle: { color: "rgba(255,255,255,0.64)", fontSize: 12 },
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  qualityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: "rgba(32,32,36,0.88)",
  },
  qualityBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(32,32,36,0.88)",
  },
  notifBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.danger,
  },
  notifText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  errorBanner: {
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(194, 73, 73, 0.16)",
  },
  errorBannerText: { color: "#ffd7d7", fontSize: 12 },
  body: {
    flex: 1,
    paddingHorizontal: 0,
  },
  bodyFullscreen: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  bodyTouchArea: { flex: 1 },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  stateTitle: { color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center" },
  stateText: { color: "rgba(255,255,255,0.7)", fontSize: 14, textAlign: "center" },
  secondaryAction: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  secondaryActionText: { color: Colors.text, fontWeight: "700" },
  spotlightWrap: { flex: 1 },
  spotlightWrapFullscreen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  spotlightStageWrap: {
    flex: 1,
    position: "relative",
    margin: 0,
    padding: 0,
    width: "100%",
    height: "100%",
  },
  stageActionRow: {
    position: "absolute",
    bottom: 20,
    right: 20,
    zIndex: 20,
    flexDirection: "row",
  },
  stageActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 20,
  },
  floatingRail: { position: "absolute", left: 0, right: 0, bottom: 12 },
  mobileImmersiveRail: {
    position: "absolute",
    top: 18,
    left: 16,
    right: 16,
    zIndex: 7,
    maxHeight: 180,
  },
  mobileImmersiveRailContent: {
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  floatingParticipantsContainer: {
    position: "absolute",
    top: 72,
    right: 12,
    zIndex: 9,
    gap: 6,
  },
  floatingParticipantsHidden: {
    opacity: 0,
  },
  floatingParticipantTile: {
    width: 100,
    height: 100,
  },
  gridContent: { paddingBottom: 32, gap: 10 },
  gridRow: { flexDirection: "row", gap: 10, justifyContent: "center" },
  gridRowStacked: { flexDirection: "column", alignItems: "center" },
  gridRowCentered: { justifyContent: "center" },
  tile: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1e2127",
    aspectRatio: 0.78,
    position: "relative",
  },
  tileCompact: { aspectRatio: 0.76 },
  tileFloatingCompact: { aspectRatio: 0.72 },
  tileStage: {
    width: "100%",
    height: "100%",
    aspectRatio: undefined,
    borderRadius: 0,
  },
  tileImmersive: {
    borderRadius: 0,
    margin: 0,
    padding: 0,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tileVideo: { width: "100%", height: "100%" },
  tileFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  whiteboardFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
    backgroundColor: "#101722",
  },
  whiteboardBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(163, 230, 53, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(163, 230, 53, 0.28)",
  },
  whiteboardBadgeCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  whiteboardTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  whiteboardTitleCompact: {
    fontSize: 14,
  },
  whiteboardSubtitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    textAlign: "center",
  },
  whiteboardSubtitleCompact: {
    fontSize: 11,
  },
  tileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  tileAvatarCompact: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  tileAvatarText: { color: "#fff", fontSize: 26, fontWeight: "700" },
  tileAvatarTextCompact: { fontSize: 20 },
  tileExpandButton: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 20,
  },
  tileSpeaking: {
    borderWidth: 3,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  tileStatusStack: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tileStatusStackCompact: {
    top: 8,
    right: 8,
    gap: 6,
  },
  tileMuteBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(32, 72, 10, 0.76)",
  },
  tileLabelContainer: {
    position: "absolute",
    bottom: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    maxWidth: "78%",
  },
  tileLabelContainerCompact: {
    bottom: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tileLabelContainerImmersive: {
    bottom: 18,
    left: 12,
  },
  tileLabel: { color: "#fff", fontSize: 13, fontWeight: "600" },
  tileLabelCompact: { fontSize: 11 },
  controlsWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10060,
    alignItems: "center",
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  controlsWrapHidden: {
    opacity: 0,
    pointerEvents: "none",
  },
  controlsChrome: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(24,24,27,0.65)",
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  controlButton: {
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  controlButtonStandard: {
    width: 52,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(54,54,56,0.98)",
  },
  controlButtonOff: {
    backgroundColor: "rgba(247,200,204,0.96)",
    borderColor: "rgba(244,114,182,0.16)",
  },
  controlButtonAccent: {
    backgroundColor: "rgba(54,54,56,0.98)",
    borderColor: "rgba(250,166,26,0.18)",
  },
  controlButtonDisabled: { opacity: 0.65 },
  controlButtonDanger: {
    width: 52,
    borderRadius: 16,
    backgroundColor: "#d64a3a",
    borderColor: "rgba(255,255,255,0.06)",
  },
  controlButtonWide: {
    width: 52,
  },
  controlDivider: {
    width: 1,
    height: 34,
    marginHorizontal: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
  },
  controlLock: { position: "absolute", right: 9, bottom: 9 },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 10070,
  },
  drawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.34)" },
  drawerPanel: {
    width: "100%",
    maxHeight: "78%",
    backgroundColor: "#11151d",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 8,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  drawerTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  drawerClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  drawerBody: { padding: 16, gap: 16, paddingBottom: 32 },
  linkCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#161a22",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  linkTextWrap: { flex: 1, minWidth: 0, gap: 4 },
  linkTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  linkValue: { color: "rgba(255,255,255,0.68)", fontSize: 12, lineHeight: 18 },
  linkCopyButton: {
    minWidth: 82,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  linkCopyButtonActive: { backgroundColor: Colors.accent },
  linkCopyButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  privacyCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#161a22",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  privacyTextWrap: { flex: 1, gap: 4 },
  privacyTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  privacySubtitle: { color: "rgba(255,255,255,0.68)", fontSize: 12, lineHeight: 18 },
  privacyToggle: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  privacyToggleActive: { backgroundColor: "rgba(122,162,255,0.2)" },
  privacyToggleDisabled: { opacity: 0.6 },
  privacyToggleText: { color: Colors.text, fontSize: 12, fontWeight: "700" },
  section: { gap: 10 },
  sectionTitle: { color: "#fff", fontSize: 13, fontWeight: "800" },
  emptyText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  knockCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#161a22",
    gap: 12,
  },
  knockName: { color: "#fff", fontSize: 14, fontWeight: "700" },
  knockMeta: { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 4 },
  knockActions: { flexDirection: "row", gap: 10 },
  knockButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  knockButtonApprove: { backgroundColor: Colors.primary },
  knockButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  knockButtonGhostText: { color: Colors.text, fontSize: 12, fontWeight: "700" },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  memberAvatarText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  memberMeta: { flex: 1, minWidth: 0 },
  memberName: { color: "#fff", fontSize: 13, fontWeight: "700" },
  memberStatus: { color: "rgba(255,255,255,0.64)", fontSize: 11, marginTop: 2 },
  memberIcons: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberActionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  memberActionButtonSuccess: { backgroundColor: Colors.accent },
  memberActionButtonDanger: { backgroundColor: Colors.danger },
  // Floating Header - matches frontend TopBar
  headerFloating: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10050,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: "transparent",
  },
  headerFloatingHidden: {
    opacity: 0,
    pointerEvents: "none",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerInfo: {
    flexDirection: "column",
    minWidth: 0,
    flex: 1,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  headerSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.64)",
    fontSize: 11,
    fontFamily: "monospace",
  },
  headerPrivateBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(122,162,255,0.16)",
  },
  headerPrivateText: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: "700",
  },
  headerChrome: {
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(17,21,29,0.72)",
  },

  // Menu Dialog
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10080,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 100,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  menuDialog: {
    position: "absolute",
    bottom: 100,
    backgroundColor: "rgba(32, 32, 36, 0.95)",
    borderRadius: 16,
    padding: 12,
    minWidth: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  menuItemText: {
    color: "#fff",
    fontSize: 14,
  },
});
