import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
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
  Lock,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  RefreshCcw,
  Shield,
  UserCheck,
  UserMinus,
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
import { playMeetJoinRequestCue, playMeetStartedCue } from "../../lib/audio-cues";
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
  hasVideo: boolean;
  audioMuted: boolean;
  videoMuted: boolean;
};

const PEER_LEFT_GRACE_MS = 6500;
const SCREEN_SHARE_MEDIA_CONSTRAINTS = {
  video: {
    frameRate: 10,
    width: 960,
    height: 540,
  },
  audio: false,
} as const;

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
  return 2;
};

const CALL_QUALITY_PROFILES = {
  balanced: {
    key: "balanced",
    label: "balanced",
    videoBitrate: 380_000,
    audioBitrate: 32_000,
    scaleResolutionDownBy: 1,
  },
  crowded: {
    key: "crowded",
    label: "crowded",
    videoBitrate: 220_000,
    audioBitrate: 32_000,
    scaleResolutionDownBy: 1.2,
  },
  poor: {
    key: "poor",
    label: "audio-priority",
    videoBitrate: 110_000,
    audioBitrate: 40_000,
    scaleResolutionDownBy: 1.6,
  },
} as const;

type QualityProfile = (typeof CALL_QUALITY_PROFILES)[keyof typeof CALL_QUALITY_PROFILES];
type StatsReport = Record<string, unknown>;

const SPEAKER_POLL_INTERVAL_MS = 900;
const SPEAKER_LEVEL_THRESHOLD = 0.03;

const getStatsNumber = (report: StatsReport, key: string) => {
  const value = report[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const readAudioLevel = (report: StatsReport) => {
  const mediaKind = report.kind || report.mediaType;
  if (mediaKind !== "audio") {
    return null;
  }

  const audioLevel = getStatsNumber(report, "audioLevel");
  if (audioLevel !== null) {
    return audioLevel;
  }

  if (report.voiceActivityFlag === true) {
    return 1;
  }

  return null;
};

export function GroupMeetScreen({ navigation, route }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { roomId, title, isCreator, isPrivate } = route.params;
  const currentUser = useAuthStore((state) => state.user);
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
  const [qualityProfile, setQualityProfile] = useState<QualityProfile>(
    CALL_QUALITY_PROFILES.balanced,
  );
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [fullscreenTileId, setFullscreenTileId] = useState<string | null>(null);
  const [lastSpeakerPeerId, setLastSpeakerPeerId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const socketIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const screenPeerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const candidateQueuesRef = useRef<Record<string, RTCIceCandidate[]>>({});
  const screenCandidateQueuesRef = useRef<Record<string, RTCIceCandidate[]>>({});
  const knownPeerNamesRef = useRef<Record<string, string>>({});
  const knownStreamsRef = useRef<Record<string, string>>({});
  const stalePeerTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const peerLeftTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const hangupStartedRef = useRef(false);
  const connectedAtRef = useRef<number | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomTitleRef = useRef(roomTitle);
  const roomPrivacyRef = useRef(roomIsPrivate);
  const startCuePlayedRef = useRef<string | null>(null);

  const joinUrl = useMemo(() => buildJoinUrl(roomId), [roomId]);

  useEffect(() => {
    if (!roomId || startCuePlayedRef.current === roomId) {
      return;
    }

    startCuePlayedRef.current = roomId;
    void playMeetStartedCue();
  }, [roomId]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

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
      const existingTimeout = stalePeerTimeoutsRef.current[peerId];
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        delete stalePeerTimeoutsRef.current[peerId];
      }
      const peerLeftTimeout = peerLeftTimeoutsRef.current[peerId];
      if (peerLeftTimeout) {
        clearTimeout(peerLeftTimeout);
        delete peerLeftTimeoutsRef.current[peerId];
      }

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
    const existingTimeout = stalePeerTimeoutsRef.current[peerId];
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      delete stalePeerTimeoutsRef.current[peerId];
    }
    const peerLeftTimeout = peerLeftTimeoutsRef.current[peerId];
    if (peerLeftTimeout) {
      clearTimeout(peerLeftTimeout);
      delete peerLeftTimeoutsRef.current[peerId];
    }
    setRemotePeers((previous) => previous.filter((peer) => peer.peerId !== peerId));
    setRemoteScreenShares((previous) => previous.filter((peer) => peer.peerId !== peerId));
    setSelectedTileId((current) =>
      current === peerId || current === `${peerId}:screen` ? null : current,
    );
    delete knownPeerNamesRef.current[peerId];
    delete knownStreamsRef.current[peerId];
    delete candidateQueuesRef.current[peerId];
    delete screenCandidateQueuesRef.current[peerId];
    peerConnectionsRef.current[peerId]?.close();
    screenPeerConnectionsRef.current[peerId]?.close();
    delete peerConnectionsRef.current[peerId];
    delete screenPeerConnectionsRef.current[peerId];
  }, []);

  const cleanupAllPeerConnections = useCallback(() => {
    Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
    Object.values(screenPeerConnectionsRef.current).forEach((connection) => connection.close());
    peerConnectionsRef.current = {};
    screenPeerConnectionsRef.current = {};
    candidateQueuesRef.current = {};
    screenCandidateQueuesRef.current = {};
    knownPeerNamesRef.current = {};
    knownStreamsRef.current = {};
    Object.values(stalePeerTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
    stalePeerTimeoutsRef.current = {};
    Object.values(peerLeftTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
    peerLeftTimeoutsRef.current = {};
    setRemotePeers([]);
    setRemoteScreenShares([]);
    setSelectedTileId(null);
  }, []);

  const upsertRemoteScreenShare = useCallback(
    (peerId: string, stream: MediaStream | null, displayName?: string) => {
      setRemoteScreenShares((previous) => {
        const existingIndex = previous.findIndex((peer) => peer.peerId === peerId);
        if (existingIndex === -1) {
          return [
            ...previous,
            {
              peerId,
              displayName: displayName || knownPeerNamesRef.current[peerId] || peerId,
              stream,
            },
          ];
        }

        return previous.map((peer, index) =>
          index === existingIndex
            ? {
                ...peer,
                stream,
                displayName:
                  displayName ||
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

  const removeRemoteScreenShare = useCallback((peerId: string) => {
    setRemoteScreenShares((previous) => previous.filter((peer) => peer.peerId !== peerId));
    setSelectedTileId((current) => (current === `${peerId}:screen` ? null : current));
    delete screenCandidateQueuesRef.current[peerId];
    screenPeerConnectionsRef.current[peerId]?.close();
    delete screenPeerConnectionsRef.current[peerId];
  }, []);

  const ensureScreenTracksAttached = useCallback((connection: RTCPeerConnection) => {
    const activeScreenStream = screenStreamRef.current;
    if (!activeScreenStream) {
      return;
    }

    const existingTrackIds = new Set(
      (connection.getSenders?.() || [])
        .map((sender) => sender.track?.id)
        .filter((trackId): trackId is string => Boolean(trackId)),
    );

    activeScreenStream.getTracks().forEach((track) => {
      if (!existingTrackIds.has(track.id)) {
        connection.addTrack(track, activeScreenStream);
      }
    });
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

  const flushQueuedScreenCandidates = useCallback(async (peerId: string) => {
    const connection = screenPeerConnectionsRef.current[peerId];
    const queuedCandidates = screenCandidateQueuesRef.current[peerId];

    if (!connection || !queuedCandidates?.length || !connection.remoteDescription) {
      return;
    }

    for (const candidate of queuedCandidates) {
      try {
        await connection.addIceCandidate(candidate);
      } catch {
        continue;
      }
    }

    delete screenCandidateQueuesRef.current[peerId];
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

        const syncCameraTrackState = () => {
          const videoTracks = stream.getVideoTracks?.() || [];
          const audioTracks = stream.getAudioTracks?.() || [];
          upsertRemotePeer(peerId, {
            stream,
            displayName: knownPeerNamesRef.current[peerId] || peerDisplayName || peerId,
            hasVideo: videoTracks.some((track: MediaStreamTrack) => track.readyState === "live"),
            hasAudio: audioTracks.some((track: MediaStreamTrack) => track.readyState === "live"),
            videoMuted:
              videoTracks.length > 0
                ? videoTracks.every(
                    (track: MediaStreamTrack) =>
                      track.readyState !== "live" || track.muted === true,
                  )
                : true,
            audioMuted:
              audioTracks.length > 0
                ? audioTracks.every(
                    (track: MediaStreamTrack) =>
                      track.readyState !== "live" || track.muted === true,
                  )
                : true,
          });
        };

        const knownStreamId = knownStreamsRef.current[peerId];
        if (!knownStreamId) {
          knownStreamsRef.current[peerId] = stream.id;
          stream.getTracks().forEach((track: MediaStreamTrack) => {
            track.onmute = syncCameraTrackState;
            track.onunmute = syncCameraTrackState;
            track.onended = syncCameraTrackState;
          });
          syncCameraTrackState();
          return;
        }

        if (knownStreamId === stream.id) {
          stream.getTracks().forEach((track: MediaStreamTrack) => {
            track.onmute = syncCameraTrackState;
            track.onunmute = syncCameraTrackState;
            track.onended = syncCameraTrackState;
          });
          syncCameraTrackState();
          return;
        }

        stream.getTracks().forEach((track: MediaStreamTrack) => {
          track.onended = () => removeRemoteScreenShare(peerId);
        });
        upsertRemoteScreenShare(
          peerId,
          stream,
          knownPeerNamesRef.current[peerId] || peerDisplayName || peerId,
        );
      };

      connection.onconnectionstatechange = () => {
        const nextState = connection.connectionState;
        upsertRemotePeer(peerId, {
          connectionState: nextState,
          displayName: knownPeerNamesRef.current[peerId] || peerDisplayName || peerId,
        });

        if (nextState === "failed" || nextState === "closed") {
          removeRemotePeer(peerId);
          return;
        }

        if (nextState === "disconnected") {
          const existingTimeout = stalePeerTimeoutsRef.current[peerId];
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }
          stalePeerTimeoutsRef.current[peerId] = setTimeout(() => {
            const currentState =
              peerConnectionsRef.current[peerId]?.connectionState || nextState;
            if (
              currentState === "disconnected" ||
              currentState === "failed" ||
              currentState === "closed"
            ) {
              removeRemotePeer(peerId);
            }
          }, 3000);
        }
      };

      peerConnectionsRef.current[peerId] = connection;
      return connection;
    },
    [removeRemotePeer, removeRemoteScreenShare, upsertRemotePeer, upsertRemoteScreenShare],
  );

  const createScreenPeerConnection = useCallback(
    (peerId: string, peerDisplayName?: string, initiator = false) => {
      const existingConnection = screenPeerConnectionsRef.current[peerId];
      if (existingConnection) {
        if (initiator) {
          ensureScreenTracksAttached(existingConnection);
        }
        return existingConnection;
      }

      const connection = new RTCPeerConnection(ICE_CONFIG) as RTCPeerConnection & {
        onicecandidate?: ((event: any) => void) | null;
        ontrack?: ((event: any) => void) | null;
        onconnectionstatechange?: (() => void) | null;
      };

      if (initiator) {
        ensureScreenTracksAttached(connection);
      }

      connection.onicecandidate = (event: any) => {
        const currentSocket = socketRef.current;
        if (!event.candidate || !currentSocket || peerId === currentSocket.id) return;

        currentSocket.emit("screen-ice-candidate", {
          targetId: peerId,
          candidate: event.candidate,
        });
      };

      connection.ontrack = (event: any) => {
        const [stream] = event.streams;
        if (!stream) return;

        stream.getTracks().forEach((track: MediaStreamTrack) => {
          track.onended = () => removeRemoteScreenShare(peerId);
        });

        upsertRemoteScreenShare(
          peerId,
          stream,
          knownPeerNamesRef.current[peerId] || peerDisplayName || peerId,
        );
      };

      connection.onconnectionstatechange = () => {
        const nextState = connection.connectionState;
        if (nextState === "failed" || nextState === "closed") {
          removeRemoteScreenShare(peerId);
          return;
        }

        if (nextState === "disconnected") {
          setTimeout(() => {
            const currentState =
              screenPeerConnectionsRef.current[peerId]?.connectionState || nextState;
            if (
              currentState === "disconnected" ||
              currentState === "failed" ||
              currentState === "closed"
            ) {
              removeRemoteScreenShare(peerId);
            }
          }, 3000);
        }
      };

      screenPeerConnectionsRef.current[peerId] = connection;
      return connection;
    },
    [ensureScreenTracksAttached, removeRemoteScreenShare, upsertRemoteScreenShare],
  );

  const applyMediaOptimization = useCallback(
    async (profile: QualityProfile) => {
      const localVideoTrack = localStreamRef.current?.getVideoTracks?.()[0];
      const localAudioTrack = localStreamRef.current?.getAudioTracks?.()[0];

      await Promise.all(
        Object.values(peerConnectionsRef.current).map(async (connection) => {
          const senders = connection.getSenders?.() || [];
          await Promise.all(
            senders.map(async (sender) => {
              try {
                const params = sender.getParameters?.() || {};
                const encodings = params.encodings?.length
                  ? [...params.encodings]
                  : ([{}] as any[]);

                if (sender.track && localVideoTrack && sender.track.id === localVideoTrack.id) {
                  encodings[0] = {
                    ...encodings[0],
                    maxBitrate: profile.videoBitrate,
                    scaleResolutionDownBy: profile.scaleResolutionDownBy,
                  };
                  await sender.setParameters?.({
                    ...params,
                    encodings,
                  } as any);
                  return;
                }

                if (sender.track && localAudioTrack && sender.track.id === localAudioTrack.id) {
                  encodings[0] = {
                    ...encodings[0],
                    maxBitrate: profile.audioBitrate,
                  };
                  await sender.setParameters?.({
                    ...params,
                    encodings,
                  } as any);
                }
              } catch {
                return;
              }
            }),
          );
        }),
      );
    },
    [],
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

  const createScreenOfferForPeer = useCallback(
    async (peerId: string, peerDisplayName?: string) => {
      try {
        if (!peerId || peerId === socketRef.current?.id || !screenStreamRef.current) {
          return;
        }

        const connection = createScreenPeerConnection(peerId, peerDisplayName, true);
        const offer = await connection.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: true,
        });
        await connection.setLocalDescription(offer);
        socketRef.current?.emit("screen-offer", {
          targetId: peerId,
          sdp: offer,
        });
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : "Screen share offer yuborilmadi",
        );
      }
    },
    [createScreenPeerConnection],
  );

  const stopScreenShare = useCallback(
    (shouldNotifyRemote = true) => {
      const activeScreenStream = screenStreamRef.current;
      if (!activeScreenStream && !isScreenSharing) {
        return;
      }

      screenStreamRef.current = null;
      setScreenStream(null);
      setIsScreenSharing(false);
      activeScreenStream?.getTracks().forEach((track) => {
        ((track as unknown) as { onended?: (() => void) | null }).onended = null;
        track.stop();
      });

      Object.values(screenPeerConnectionsRef.current).forEach((connection) => connection.close());
      screenPeerConnectionsRef.current = {};
      screenCandidateQueuesRef.current = {};

      if (shouldNotifyRemote) {
        socketRef.current?.emit("screen-share-stopped", { roomId });
      }
    },
    [isScreenSharing, roomId],
  );

  const canScreenShare =
    Platform.OS === "android" && typeof mediaDevices.getDisplayMedia === "function";

  const handleToggleScreenShare = useCallback(async () => {
    if (!canScreenShare) {
      Alert.alert("Screen share", "Hozircha screen share faqat Android real device'da yoqilgan.");
      return;
    }

    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    try {
      const stream = await mediaDevices.getDisplayMedia();
      const videoTrack = stream.getVideoTracks?.()[0];
      if (!videoTrack) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Screen stream topilmadi");
      }
      try {
        await videoTrack.applyConstraints?.(SCREEN_SHARE_MEDIA_CONSTRAINTS.video);
      } catch {
        // Some devices ignore display track constraints; keep the stream alive anyway.
      }

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);
      socketRef.current?.emit("screen-share-started", { roomId });
      ((videoTrack as unknown) as { onended?: (() => void) | null }).onended = () => {
        stopScreenShare();
      };

      await Promise.all(
        Object.keys(peerConnectionsRef.current).map((peerId) =>
          createScreenOfferForPeer(peerId, knownPeerNamesRef.current[peerId]),
        ),
      );
    } catch (nextError) {
      stopScreenShare(false);
      Alert.alert(
        "Screen share yoqilmadi",
        nextError instanceof Error
          ? nextError.message
          : "Ekran ulashishni boshlashda xatolik yuz berdi.",
      );
    }
  }, [canScreenShare, createScreenOfferForPeer, isScreenSharing, stopScreenShare]);

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
    stopScreenShare(false);
    setKnockRequests([]);
    setElapsedSeconds(0);
    connectedAtRef.current = null;
  }, [cleanupAllPeerConnections, roomId, stopScreenShare]);

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
    const peerCount = remotePeers.length + 1 + (isScreenSharing ? 2 : 0);
    const nextProfile =
      peerCount >= 6
        ? CALL_QUALITY_PROFILES.poor
        : peerCount >= 4
          ? CALL_QUALITY_PROFILES.crowded
          : CALL_QUALITY_PROFILES.balanced;

    setQualityProfile((current) => {
      if (current.key === nextProfile.key) {
        return current;
      }
      return nextProfile;
    });
  }, [isScreenSharing, remotePeers.length]);

  useEffect(() => {
    void applyMediaOptimization(qualityProfile);
  }, [applyMediaOptimization, qualityProfile]);

  useEffect(() => {
    if (joinStatus !== "joined" || remotePeers.length === 0) {
      setLastSpeakerPeerId(null);
      return;
    }

    let disposed = false;

    const detectActiveSpeaker = async () => {
      const candidates = await Promise.all(
        remotePeers.map(async (peer) => {
          if (peer.audioMuted) {
            return null;
          }

          const connection = peerConnectionsRef.current[peer.peerId];
          if (!connection) {
            return null;
          }

          try {
            const stats = await connection.getStats();
            const reports =
              stats instanceof Map ? Array.from(stats.values()) : Array.isArray(stats) ? stats : [];

            let strongestLevel = 0;
            reports.forEach((entry) => {
              const level = readAudioLevel(entry as StatsReport);
              if (level !== null) {
                strongestLevel = Math.max(strongestLevel, level);
              }
            });

            return {
              peerId: peer.peerId,
              level: strongestLevel,
            };
          } catch {
            return null;
          }
        }),
      );

      if (disposed) {
        return;
      }

      const strongestPeer = candidates
        .filter((candidate): candidate is { peerId: string; level: number } => Boolean(candidate))
        .sort((left, right) => right.level - left.level)[0];

      if (strongestPeer && strongestPeer.level >= SPEAKER_LEVEL_THRESHOLD) {
        setLastSpeakerPeerId((current) =>
          current === strongestPeer.peerId ? current : strongestPeer.peerId,
        );
      }
    };

    void detectActiveSpeaker();
    const intervalId = setInterval(() => {
      void detectActiveSpeaker();
    }, SPEAKER_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(intervalId);
    };
  }, [joinStatus, remotePeers]);

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
          const replacedPeerId = Object.entries(knownPeerNamesRef.current).find(
            ([knownPeerId, knownName]) => knownPeerId !== peerId && knownName === peerDisplayName,
          )?.[0];
          if (replacedPeerId) {
            removeRemotePeer(replacedPeerId);
          }
          knownPeerNamesRef.current[peerId] = peerDisplayName;
          upsertRemotePeer(peerId, {
            displayName: peerDisplayName,
            hasAudio: true,
            hasVideo: true,
            audioMuted: false,
            videoMuted: false,
            connectionState: "connecting",
          });
        });
      });

      socket.on("peer-joined", ({ peerId, displayName: peerDisplayName }) => {
        const normalizedPeerId = String(peerId || "");
        if (!normalizedPeerId || normalizedPeerId === socket.id) return;
        const normalizedName = String(peerDisplayName || normalizedPeerId);
        const replacedPeerId = Object.entries(knownPeerNamesRef.current).find(
          ([knownPeerId, knownName]) => knownPeerId !== normalizedPeerId && knownName === normalizedName,
        )?.[0];
        if (replacedPeerId) {
          removeRemotePeer(replacedPeerId);
        }
        const pendingLeaveTimeout = peerLeftTimeoutsRef.current[normalizedPeerId];
        if (pendingLeaveTimeout) {
          clearTimeout(pendingLeaveTimeout);
          delete peerLeftTimeoutsRef.current[normalizedPeerId];
        }
        knownPeerNamesRef.current[normalizedPeerId] = normalizedName;
        upsertRemotePeer(normalizedPeerId, {
          displayName: normalizedName,
          hasAudio: true,
          hasVideo: true,
          audioMuted: false,
          videoMuted: false,
          connectionState: "connecting",
        });
        void createOfferForPeer(normalizedPeerId, normalizedName);
        if (screenStreamRef.current) {
          void createScreenOfferForPeer(normalizedPeerId, normalizedName);
        }
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

      socket.on("screen-offer", async ({ senderId, sdp }) => {
        const normalizedPeerId = String(senderId || "");
        if (!normalizedPeerId || normalizedPeerId === socket.id) return;

        try {
          const connection = createScreenPeerConnection(
            normalizedPeerId,
            knownPeerNamesRef.current[normalizedPeerId],
          );
          await connection.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushQueuedScreenCandidates(normalizedPeerId);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          socket.emit("screen-answer", {
            targetId: normalizedPeerId,
            sdp: answer,
          });
        } catch (nextError) {
          setError(
            nextError instanceof Error ? nextError.message : "Screen share offer qabul qilinmadi",
          );
        }
      });

      socket.on("screen-answer", async ({ senderId, sdp }) => {
        const normalizedPeerId = String(senderId || "");
        if (!normalizedPeerId || normalizedPeerId === socket.id) return;

        try {
          const connection = screenPeerConnectionsRef.current[normalizedPeerId];
          if (!connection) return;

          await connection.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushQueuedScreenCandidates(normalizedPeerId);
        } catch (nextError) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Screen share answer qabul qilinmadi",
          );
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

      socket.on("screen-ice-candidate", async ({ senderId, candidate }) => {
        const normalizedPeerId = String(senderId || "");
        if (!normalizedPeerId || normalizedPeerId === socket.id || !candidate) return;

        const normalizedCandidate = new RTCIceCandidate(candidate);
        const connection = screenPeerConnectionsRef.current[normalizedPeerId];

        if (!connection || !connection.remoteDescription) {
          screenCandidateQueuesRef.current[normalizedPeerId] = [
            ...(screenCandidateQueuesRef.current[normalizedPeerId] || []),
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
        const existingTimeout = peerLeftTimeoutsRef.current[normalizedPeerId];
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        peerLeftTimeoutsRef.current[normalizedPeerId] = setTimeout(() => {
          delete peerLeftTimeoutsRef.current[normalizedPeerId];
          removeRemotePeer(normalizedPeerId);
        }, PEER_LEFT_GRACE_MS);
      });

      socket.on("screen-share-stopped", ({ peerId }) => {
        const normalizedPeerId = String(peerId || "");
        if (!normalizedPeerId || normalizedPeerId === socket.id) return;
        removeRemoteScreenShare(normalizedPeerId);
      });

      socket.on("kicked", () => {
        setError("Siz yaratuvchi tomonidan chiqarib yuborildingiz");
        setJoinStatus("rejected");
        void cleanupCall();
      });

      socket.on("force-mute-mic", () => {
        const track = localStreamRef.current?.getAudioTracks?.()[0];
        if (track) {
          track.enabled = false;
          setIsMicOn(false);
        }
        setMicLocked(true);
      });

      socket.on("force-mute-cam", () => {
        const track = localStreamRef.current?.getVideoTracks?.()[0];
        if (track) {
          track.enabled = false;
          setIsCamOn(false);
        }
        setCamLocked(true);
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
              ? {
                  ...entry,
                  displayName: String(guestName || entry.displayName),
                }
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
    createScreenOfferForPeer,
    cleanupAllPeerConnections,
    cleanupCall,
    displayName,
    flushQueuedCandidates,
    flushQueuedScreenCandidates,
    isCreator,
    localStream,
    removeRemotePeer,
    createScreenPeerConnection,
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
    if (micLocked) {
      return;
    }
    const audioTrack = localStreamRef.current?.getAudioTracks?.()[0];
    if (!audioTrack) {
      return;
    }

    const nextEnabled = !audioTrack.enabled;
    audioTrack.enabled = nextEnabled;
    setIsMicOn(nextEnabled);
  };

  const handleToggleCam = () => {
    if (camLocked) {
      return;
    }
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

  const handleForceMuteMic = (peerId: string, isPeerMicOn: boolean) => {
    if (!isCreator) {
      return;
    }

    socketRef.current?.emit(isPeerMicOn ? "force-mute-mic" : "allow-mic", { roomId, peerId });
    upsertRemotePeer(peerId, {
      hasAudio: true,
      audioMuted: isPeerMicOn,
    });
  };

  const handleForceMuteCam = (peerId: string, isPeerCamOn: boolean) => {
    if (!isCreator) {
      return;
    }

    socketRef.current?.emit(isPeerCamOn ? "force-mute-cam" : "allow-cam", { roomId, peerId });
    upsertRemotePeer(peerId, {
      hasVideo: true,
      videoMuted: isPeerCamOn,
    });
  };

  const handleKickPeer = (peerId: string) => {
    if (!isCreator) {
      return;
    }

    socketRef.current?.emit("kick-peer", { roomId, peerId });
    removeRemotePeer(peerId);
  };

  const participantsCount = remotePeers.length + 1;
  const isLandscape = screenWidth > screenHeight;
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
    const tileCount = Math.max(1, remotePeers.length + 1 + remoteScreenShares.length + (screenStream ? 1 : 0));
    const horizontalPadding = 28;
    const gap = 10;
    const contentWidth = screenWidth - horizontalPadding - gap * (gridColumns - 1);
    return Math.max(120, Math.floor(contentWidth / gridColumns));
  }, [gridColumns, remotePeers.length, remoteScreenShares.length, screenStream, screenWidth]);
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
  const controlIconSize = screenWidth < 390 ? 18 : 20;
  const controlLockSize = screenWidth < 390 ? 9 : 10;

  const participantRows = useMemo(
    () => [
      {
        id: "local",
        name: `${displayName} (Sen)`,
        isLocal: true,
        hasAudio: true,
        hasVideo: true,
        audioMuted: !isMicOn,
        videoMuted: !isCamOn,
        connectionState: undefined as string | undefined,
      },
      ...remotePeers.map((peer) => ({
        id: peer.peerId,
        name: peer.displayName,
        isLocal: false,
        hasAudio: peer.hasAudio,
        hasVideo: peer.hasVideo,
        audioMuted: peer.audioMuted,
        videoMuted: peer.videoMuted,
        connectionState: peer.connectionState,
      })),
    ],
    [displayName, isCamOn, isMicOn, remotePeers],
  );

  const callTiles = useMemo<CallTile[]>(
    () => {
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

      if (screenStream) {
        const hasLocalScreenVideo =
          screenStream
            ?.getVideoTracks?.()
            ?.some((track) => track.readyState === "live") === true;
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
        const hasRemoteScreenVideo =
          peer.stream
            ?.getVideoTracks?.()
            ?.some((track) => track.readyState === "live") === true;
        tiles.unshift({
          tileId: `${peer.peerId}:screen`,
          peerId: peer.peerId,
          label: `${peer.displayName} · Ekran`,
          stream: peer.stream,
          isLocal: false,
          isScreenShare: true,
          hasVideo: hasRemoteScreenVideo,
          audioMuted: true,
          videoMuted: !hasRemoteScreenVideo,
        });
      });

      return tiles;
    },
    [displayName, isCamOn, isMicOn, localStream, remotePeers, remoteScreenShares, screenStream],
  );

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
  const sideTiles = activeStageTileId
    ? callTiles.filter((tile) => tile.tileId !== activeStageTileId)
    : [];
  const hasSpotlight = Boolean(activeStageTile);

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
    setFullscreenTileId((current) => (current === tile.tileId ? null : tile.tileId));
  }, []);

  const handleResetStage = useCallback(() => {
    setSelectedTileId(null);
    setFullscreenTileId(null);
  }, []);

  const renderTile = (
    tile: CallTile,
    options?: {
      compact?: boolean;
      isStage?: boolean;
      floatingCompact?: boolean;
    },
  ) => {
    const compact = Boolean(options?.compact);
    const isStage = Boolean(options?.isStage);
    const floatingCompact = Boolean(options?.floatingCompact);
    const initial = tile.label.slice(0, 1).toUpperCase();
    const streamUrl = tile.stream?.toURL() || null;
    const canRenderStream = tile.hasVideo && Boolean(streamUrl);

    return (
      <View
        key={tile.tileId}
        style={[
          styles.tile,
          compact && styles.tileCompact,
          floatingCompact && styles.tileFloatingCompact,
          isStage && styles.tileStage,
          !isStage && {
            width: floatingCompact ? floatingTileWidth : compact ? compactTileWidth : tileWidth,
          },
        ]}
      >
        {canRenderStream && streamUrl ? (
          <RTCView
            streamURL={streamUrl}
            style={styles.tileVideo}
            objectFit={isStage || compact || tile.isScreenShare ? "contain" : "cover"}
            mirror={tile.isScreenShare ? false : tile.isLocal}
          />
        ) : (
          <View style={styles.tileFallback}>
            <View style={styles.tileAvatar}>
              <Text style={styles.tileAvatarText}>{initial}</Text>
            </View>
          </View>
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

        <View style={[styles.tileFooter, compact && styles.tileFooterCompact]}>
          <Text style={[styles.tileLabel, compact && styles.tileLabelCompact]} numberOfLines={1}>
            {tile.label}
          </Text>
          <View style={styles.tileBadges}>
            {tile.audioMuted ? (
              <MicOff size={compact ? 11 : 12} color={Colors.danger} />
            ) : (
              <Mic size={compact ? 11 : 12} color={Colors.accent} />
            )}
            {tile.videoMuted && !tile.isScreenShare ? (
              <CameraOff size={compact ? 11 : 12} color={Colors.danger} />
            ) : tile.hasVideo ? (
              <Video size={compact ? 11 : 12} color={Colors.accent} />
            ) : null}
            {tile.isLocal && (micLocked || camLocked) ? (
              <Lock size={compact ? 11 : 12} color={Colors.warning} />
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const renderSelectableTile = (
    tile: CallTile,
    options?: {
      compact?: boolean;
      floatingCompact?: boolean;
    },
  ) => (
    <Pressable key={tile.tileId} onPress={() => handleSelectTile(tile.tileId)}>
      {renderTile(tile, {
        compact: options?.compact,
        floatingCompact: options?.floatingCompact,
      })}
    </Pressable>
  );

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
            <View style={styles.qualityBadge}>
              <Text style={styles.qualityBadgeText}>{qualityProfile.label}</Text>
            </View>
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
            <>
              {hasSpotlight ? (
                <View
                  style={[
                    styles.spotlightWrap,
                    fullscreenTileId ? styles.spotlightWrapFullscreen : null,
                  ]}
                >
                  <View style={styles.spotlightStageWrap}>
                    {activeStageTile ? renderTile(activeStageTile, { isStage: true }) : null}

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

                    {fullscreenTileId && sideTiles.length > 0 ? (
                      <ScrollView
                        style={styles.floatingRail}
                        contentContainerStyle={styles.floatingRailContent}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        bounces={false}
                      >
                        {sideTiles.map((tile) => (
                          <View key={`floating-${tile.tileId}`}>
                            {renderTile(tile, {
                              compact: true,
                              floatingCompact: true,
                            })}
                          </View>
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                </View>
              ) : (
                <ScrollView
                  contentContainerStyle={styles.gridContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
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
                          isCenteredLastRow ? styles.gridRowCentered : null,
                        ]}
                      >
                        {row.map((tile) => (
                          <View key={tile.tileId}>{renderTile(tile)}</View>
                        ))}
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </>
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
            style={[
              styles.controlButton,
              !isMicOn ? styles.controlButtonOff : null,
              micLocked && styles.controlButtonDisabled,
            ]}
            onPress={handleToggleMic}
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
          <Pressable
            style={[
              styles.controlButton,
              !isCamOn ? styles.controlButtonOff : null,
              camLocked && styles.controlButtonDisabled,
            ]}
            onPress={handleToggleCam}
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
          {canScreenShare ? (
            <Pressable
              style={[
                styles.controlButton,
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
          <Pressable style={styles.controlButton} onPress={handleSwitchCamera}>
            <RefreshCcw size={controlIconSize} color="#f5f5f5" />
          </Pressable>
          <View style={styles.controlDivider} />
          <Pressable style={[styles.controlButton, styles.controlButtonDanger]} onPress={() => void handleLeave()}>
            <PhoneOff size={controlIconSize} color="#fff" />
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
                        ) : isCreator ? (
                          <>
                            <Pressable
                              style={[
                                styles.memberActionButton,
                                participant.audioMuted
                                  ? styles.memberActionButtonDanger
                                  : styles.memberActionButtonSuccess,
                              ]}
                              onPress={() =>
                                handleForceMuteMic(participant.id, !Boolean(participant.audioMuted))
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
                                handleForceMuteCam(participant.id, !Boolean(participant.videoMuted))
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
                              onPress={() => handleKickPeer(participant.id)}
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
  qualityBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(67,181,129,0.16)",
    borderWidth: 1,
    borderColor: "rgba(67,181,129,0.28)",
  },
  qualityBadgeText: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: "800",
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
  spotlightWrap: {
    flex: 1,
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 8,
  },
  spotlightWrapFullscreen: {
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 0,
  },
  spotlightHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 12,
  },
  spotlightTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  spotlightClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  spotlightStageWrap: {
    flex: 1,
    position: "relative",
  },
  stageActionRow: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stageActionButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  spotlightRail: {
    flexGrow: 0,
    marginTop: 12,
  },
  spotlightRailContent: {
    flexDirection: "row",
    gap: 10,
    paddingRight: 6,
    paddingBottom: 4,
  },
  floatingRail: {
    position: "absolute",
    top: 18,
    right: 62,
    maxWidth: "72%",
    zIndex: 6,
  },
  floatingRailContent: {
    flexDirection: "row",
    gap: 8,
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
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  gridRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "stretch",
    gap: 10,
  },
  gridRowCentered: {
    justifyContent: "center",
  },
  tile: {
    height: 220,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#161a22",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tileCompact: {
    height: 118,
    borderRadius: 18,
  },
  tileFloatingCompact: {
    height: 92,
    borderRadius: 18,
  },
  tileStage: {
    flex: 1,
    width: "100%",
    height: "100%",
    borderRadius: 26,
    borderColor: "rgba(255,255,255,0.1)",
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
  tileFooterCompact: {
    left: 8,
    right: 8,
    bottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  tileLabel: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  tileLabelCompact: {
    fontSize: 12,
  },
  tileBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tileExpandButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    zIndex: 4,
  },
  controlsScroll: {
    flexGrow: 0,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    alignSelf: "center",
    marginHorizontal: 8,
    marginTop: 6,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(24,24,27,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 26,
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 10,
  },
  controlButton: {
    width: 54,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(54,54,56,0.98)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  controlButtonOff: {
    backgroundColor: "rgba(247,200,204,0.96)",
    borderColor: "rgba(244,114,182,0.16)",
  },
  controlButtonAccent: {
    borderColor: "rgba(250,166,26,0.18)",
  },
  controlButtonDanger: {
    width: 74,
    borderRadius: 20,
    backgroundColor: "#d64a3a",
    borderColor: "rgba(255,255,255,0.06)",
  },
  controlButtonDisabled: {
    opacity: 0.72,
  },
  controlDivider: {
    width: 1,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  controlLock: {
    position: "absolute",
    right: 10,
    bottom: 9,
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
  memberIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memberActionButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  memberActionButtonSuccess: {
    backgroundColor: "rgba(67,181,129,0.18)",
  },
  memberActionButtonDanger: {
    backgroundColor: "rgba(240,71,71,0.18)",
  },
});
