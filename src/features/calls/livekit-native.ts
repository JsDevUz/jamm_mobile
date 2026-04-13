import { AudioSession } from "@livekit/react-native";
import type { MediaStream, MediaStreamTrack } from "@livekit/react-native-webrtc";
import { Room, Track, type Participant, type TrackPublication } from "livekit-client";
import { LIVEKIT_URL } from "../../config/env";
import { livekitApi } from "../../lib/api";

let audioSessionStartPromise: Promise<void> | null = null;

export const isLiveKitNativeEnabled = Boolean(LIVEKIT_URL);

export const ensureLivekitAudioSession = async () => {
  if (audioSessionStartPromise) {
    return audioSessionStartPromise;
  }

  audioSessionStartPromise = AudioSession.startAudioSession().catch((error) => {
    audioSessionStartPromise = null;
    throw error;
  });

  return audioSessionStartPromise;
};

export const stopLivekitAudioSession = async () => {
  try {
    await AudioSession.stopAudioSession();
  } finally {
    audioSessionStartPromise = null;
  }
};

export const createLivekitNativeRoom = () =>
  new Room({
    dynacast: true,
    publishDefaults: {
      simulcast: true,
      videoCodec: "vp8",
      screenShareEncoding: {
        maxBitrate: 3000000,
        maxFramerate: 30,
      },
    },
  });

export const fetchLivekitConnection = async (roomId: string, participantName?: string) => {
  const payload = await livekitApi.createToken({
    roomId,
    participantName,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });

  return {
    roomId: payload.roomId,
    token: payload.token,
    url: payload.url || LIVEKIT_URL,
    participantIdentity: payload.participantIdentity,
    participantName: payload.participantName,
  };
};

export const getParticipantDisplayName = (
  participant?: Participant | null,
  fallback = "User",
) => {
  const candidate = String(participant?.name || participant?.identity || fallback).trim();
  return candidate || fallback;
};

export const getPublicationStream = (
  publication?: TrackPublication | null,
): MediaStream | null => {
  const track = publication?.track as { mediaStream?: MediaStream } | undefined;
  return track?.mediaStream ?? null;
};

export const getParticipantStream = (
  participant: Participant | null | undefined,
  source: Track.Source,
) => {
  if (!participant) {
    return null;
  }

  return getPublicationStream(participant.getTrackPublication(source));
};

export const hasLiveVideoTrack = (stream?: MediaStream | null) =>
  stream?.getVideoTracks?.().some((track) => track.readyState === "live") === true;

export const switchLivekitCamera = (room: Room | null) => {
  const publication = room?.localParticipant.getTrackPublication(Track.Source.Camera);
  const localTrack = publication?.track as
    | ({
        mediaStreamTrack?: MediaStreamTrack & { _switchCamera?: () => void };
      } & Record<string, unknown>)
    | undefined;

  localTrack?.mediaStreamTrack?._switchCamera?.();
};
