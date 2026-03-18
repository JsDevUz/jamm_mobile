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
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { io, type Socket } from "socket.io-client";
import { Image } from "expo-image";
import {
  CameraOff,
  Camera as CameraIcon,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCcw,
  Shield,
  Timer,
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
import { chatsApi } from "../../lib/api";
import {
  buildSocketNamespaceUrl,
  TURN_CREDENTIAL,
  TURN_URLS,
  TURN_USERNAME,
} from "../../config/env";
import { realtime } from "../../lib/realtime";
import { getAuthToken } from "../../lib/session";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import { getEntityId } from "../../utils/chat";

registerGlobals();

type Props = NativeStackScreenProps<RootStackParamList, "PrivateMeet">;

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
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [callStatus, setCallStatus] = useState(
    isCaller ? "Private qo'ng'iroq yuborilmoqda..." : "Private qo'ng'iroqqa ulanmoqda...",
  );
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [roomTitle, setRoomTitle] = useState(title || "Private meet");
  const [roomIsPrivate, setRoomIsPrivate] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const pendingKnockPeerIdRef = useRef<string | null>(null);
  const remoteAcceptedRef = useRef(!isCaller);
  const hangupStartedRef = useRef(false);
  const callRequestSentRef = useRef(Boolean(requestAlreadySent));
  const callConnectedAtRef = useRef<number | null>(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

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

  const cleanupPeerConnection = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    remotePeerIdRef.current = null;
    pendingIceCandidatesRef.current = [];
    pendingKnockPeerIdRef.current = null;
    setRemoteStream(null);
  }, []);

  const flushPendingIceCandidates = useCallback(async () => {
    const connection = peerConnectionRef.current;
    if (!connection?.remoteDescription || !pendingIceCandidatesRef.current.length) {
      return;
    }

    const queuedCandidates = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];

    for (const candidate of queuedCandidates) {
      try {
        await connection.addIceCandidate(candidate);
      } catch {
        continue;
      }
    }
  }, []);

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
      cleanupPeerConnection();

      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setRemoteStream(null);
      setElapsedSeconds(0);
      callConnectedAtRef.current = null;

      if (isCaller && chatId) {
        void chatsApi.endVideoCall(chatId).catch(() => undefined);
      }
    },
    [chatId, cleanupPeerConnection, isCaller, remoteUserId, roomId],
  );

  useEffect(() => {
    return () => {
      void cleanupCall(false);
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
      } catch (error) {
        setLoadingMedia(false);
        Alert.alert(
          "Kamera ochilmadi",
          error instanceof Error ? error.message : "Mikrofon yoki kamera ruxsatida xatolik.",
          [
            {
              text: "Orqaga",
              onPress: () => navigation.goBack(),
            },
          ],
        );
      }
    };

    void prepareMedia();

    return () => {
      cancelled = true;
    };
  }, [navigation]);

  const createPeerConnection = useCallback(
    (targetPeerId: string) => {
      if (peerConnectionRef.current) {
        return peerConnectionRef.current;
      }

      remotePeerIdRef.current = targetPeerId;
      const connection = new RTCPeerConnection(ICE_CONFIG) as RTCPeerConnection & {
        onicecandidate?: ((event: any) => void) | null;
        ontrack?: ((event: any) => void) | null;
        onconnectionstatechange?: (() => void) | null;
      };

      localStreamRef.current?.getTracks().forEach((track) => {
        connection.addTrack(track, localStreamRef.current as MediaStream);
      });

      connection.onicecandidate = (event: any) => {
        if (!event.candidate || !remotePeerIdRef.current) {
          return;
        }

        socketRef.current?.emit("ice-candidate", {
          targetId: remotePeerIdRef.current,
          candidate: event.candidate,
        });
      };

      connection.ontrack = (event: any) => {
        const [stream] = event.streams;
        if (stream) {
          setRemoteStream(stream);
          setCallStatus("Ulandi");
        }
      };

      connection.onconnectionstatechange = () => {
        const state = connection.connectionState;
        if (state === "connected") {
          setCallStatus("Ulandi");
        } else if (state === "connecting") {
          setCallStatus("Ulanmoqda...");
        } else if (state === "failed") {
          setCallStatus("Ulanishda xatolik");
        } else if (state === "disconnected") {
          setCallStatus("Aloqa uzildi");
        }
      };

      peerConnectionRef.current = connection;
      return connection;
    },
    [],
  );

  const createOfferForPeer = useCallback(
    async (targetPeerId: string) => {
      try {
        const connection = createPeerConnection(targetPeerId);
        const offer = await connection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await connection.setLocalDescription(offer);
        socketRef.current?.emit("offer", {
          targetId: targetPeerId,
          sdp: offer,
        });
      } catch (error) {
        Alert.alert(
          "Call xatosi",
          error instanceof Error ? error.message : "Offer yaratib bo'lmadi.",
        );
      }
    },
    [createPeerConnection],
  );

  useEffect(() => {
    if (!localStream) {
      return;
    }

    let cancelled = false;

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

      socket.on("connect", () => {
        if (isCaller) {
          socket.emit("create-room", {
            roomId,
            displayName,
            isPrivate: true,
            title: title || "Private meet",
          });
        } else {
          socket.emit("join-room", {
            roomId,
            displayName,
          });
        }
      });

      socket.on("room-created", () => {
        if (!isCaller || callRequestSentRef.current || !remoteUserId) {
          return;
        }

        callRequestSentRef.current = true;
        realtime.emitCallRequest(remoteUserId, roomId, "video");
        setCallStatus("Javob kutilmoqda...");
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
        setCallStatus("Qabul tasdiqlanmoqda...");
      });

      socket.on("knock-approved", () => {
        setCallStatus("Ulanmoqda...");
      });

      socket.on("existing-peers", ({ peers }) => {
        const nextPeer = Array.isArray(peers)
          ? peers.find((peer) => String(peer?.peerId || "") && String(peer.peerId) !== socket.id)
          : null;

        if (!nextPeer?.peerId) {
          return;
        }

        remotePeerIdRef.current = String(nextPeer.peerId);
        setCallStatus("Ulanmoqda...");
        if (isCaller && remoteAcceptedRef.current) {
          void createOfferForPeer(String(nextPeer.peerId));
        }
      });

      socket.on("peer-joined", ({ peerId }) => {
        if (peerId) {
          remotePeerIdRef.current = String(peerId);
          setCallStatus("Ulanmoqda...");
          if (isCaller && remoteAcceptedRef.current) {
            void createOfferForPeer(String(peerId));
          }
        }
      });

      socket.on("offer", async ({ senderId, sdp }) => {
        try {
          const connection = createPeerConnection(String(senderId));
          const nextDescription = new RTCSessionDescription(sdp);
          const currentRemoteDescription = connection.remoteDescription;

          if (
            currentRemoteDescription?.type === "offer" &&
            currentRemoteDescription.sdp === nextDescription.sdp
          ) {
            return;
          }

          await connection.setRemoteDescription(nextDescription);
          await flushPendingIceCandidates();
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          socket.emit("answer", { targetId: senderId, sdp: answer });
        } catch (error) {
          Alert.alert(
            "Call xatosi",
            error instanceof Error ? error.message : "Offer qabul qilinmadi.",
          );
        }
      });

      socket.on("answer", async ({ senderId, sdp }) => {
        try {
          remotePeerIdRef.current = String(senderId || remotePeerIdRef.current || "");
          const connection = peerConnectionRef.current;
          if (!connection) {
            return;
          }

          const nextDescription = new RTCSessionDescription(sdp);
          const currentRemoteDescription = connection.remoteDescription;
          const signalingState = connection.signalingState;

          if (
            currentRemoteDescription?.type === "answer" &&
            currentRemoteDescription.sdp === nextDescription.sdp
          ) {
            return;
          }

          if (signalingState !== "have-local-offer") {
            return;
          }

          await connection.setRemoteDescription(nextDescription);
          await flushPendingIceCandidates();
          setCallStatus("Ulandi");
        } catch (error) {
          Alert.alert(
            "Call xatosi",
            error instanceof Error ? error.message : "Answer qabul qilinmadi.",
          );
        }
      });

      socket.on("ice-candidate", async ({ senderId, candidate }) => {
        try {
          if (!candidate) {
            return;
          }
          remotePeerIdRef.current = String(senderId || remotePeerIdRef.current || "");
          if (!peerConnectionRef.current) {
            createPeerConnection(String(senderId));
          }

          const normalizedCandidate = new RTCIceCandidate(candidate);
          if (!peerConnectionRef.current?.remoteDescription) {
            pendingIceCandidatesRef.current = [
              ...pendingIceCandidatesRef.current,
              normalizedCandidate,
            ];
            return;
          }

          await peerConnectionRef.current?.addIceCandidate(normalizedCandidate);
        } catch {
          return;
        }
      });

      socket.on("peer-left", () => {
        setCallStatus("Qo'ng'iroq tugadi");
        setRemoteStream(null);
        cleanupPeerConnection();
        if (!hangupStartedRef.current) {
          setTimeout(() => {
            navigation.goBack();
          }, 400);
        }
      });

      socket.on("error", ({ message }) => {
        Alert.alert("Private meet xatosi", String(message || "Noma'lum xatolik"));
      });
    };

    void connectVideoSocket();

    return () => {
      cancelled = true;
    };
  }, [
    cleanupPeerConnection,
    createOfferForPeer,
    createPeerConnection,
    displayName,
    flushPendingIceCandidates,
    isCaller,
    localStream,
    navigation,
    remoteUserId,
    roomId,
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
            void createOfferForPeer(pendingKnockPeerId);
          }
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
  }, [currentUserId, navigation, roomId]);

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

  const handleHangup = async () => {
    await cleanupCall(true);
    navigation.goBack();
  };

  const remoteInitial = useMemo(() => {
    return remoteDisplayName.slice(0, 1).toUpperCase();
  }, [remoteDisplayName]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
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
          {/* <Pressable style={styles.endButton} onPress={() => void handleHangup()}>
            <PhoneOff size={18} color="#fff" />
          </Pressable> */}
        </View>

        <View style={styles.stage}>
          {remoteStream ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={styles.remoteVideo}
              objectFit="cover"
            />
          ) : (
            <View style={styles.remotePlaceholder}>
              {loadingMedia ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <>
                  {remoteUser.avatar ? (
                    <Image
                      source={{ uri: remoteUser.avatar }}
                      style={styles.remoteAvatarImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.remoteAvatar}>
                      <Text style={styles.remoteAvatarText}>{remoteInitial}</Text>
                    </View>
                  )}
                  <Text style={styles.remoteName} numberOfLines={1}>
                    {remoteDisplayName}
                  </Text>
                  <Text style={styles.remotePlaceholderText}>{callStatus}</Text>
                </>
              )}
            </View>
          )}

          {localStream ? (
            <View style={styles.localTile}>
              <RTCView
                streamURL={localStream.toURL()}
                style={styles.localVideo}
                objectFit="cover"
                mirror
              />
            </View>
          ) : null}
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
          {Platform.OS !== "web" ? (
            <Pressable style={styles.controlButton} onPress={handleSwitchCamera}>
              <RefreshCcw size={20} color="#fff" />
            </Pressable>
          ) : null}
          <Pressable style={[styles.controlButton, styles.controlButtonDanger]} onPress={() => void handleHangup()}>
            <PhoneOff size={20} color="#fff" />
          </Pressable>
        </ScrollView>
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
    paddingVertical: 12,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  subtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginTop: 4,
  },
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
  durationText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(122,162,255,0.16)",
  },
  privateBadgeText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  endButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.danger,
  },
  stage: {
    flex: 1,
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#161a22",
  },
  remoteVideo: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },
  remotePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  remoteAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  remoteAvatarText: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
  },
  remoteAvatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  remoteName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  remotePlaceholderText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
  },
  localTile: {
    position: "absolute",
    right: 14,
    bottom: 14,
    width: 132,
    height: 188,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#0d0f14",
  },
  localVideo: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },
  controlsScroll: {
    flexGrow: 0,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 18,
    minWidth: "100%",
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
});
