import * as Haptics from "expo-haptics";

const SpeechModule = (() => {
  try {
    return require("expo-speech") as {
      speak?: (text: string, options?: Record<string, unknown>) => void;
      stop?: () => void;
    };
  } catch {
    return null;
  }
})();

const lastPlayedAtByKey = new Map<string, number>();

const canPlayCue = (key: string, minIntervalMs: number) => {
  const now = Date.now();
  const previousPlayedAt = lastPlayedAtByKey.get(key) || 0;
  if (now - previousPlayedAt < minIntervalMs) {
    return false;
  }

  lastPlayedAtByKey.set(key, now);
  return true;
};

const speakCue = async (
  key: string,
  text: string,
  minIntervalMs = 1500,
) => {
  if (!canPlayCue(key, minIntervalMs)) {
    return;
  }

  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Ignore haptics failures and keep audio cue best-effort.
  }

  try {
    SpeechModule?.stop?.();
    SpeechModule?.speak?.(text, {
      language: "uz-UZ",
      pitch: 1.05,
      rate: 1.03,
    });
  } catch {
    // Ignore speech failures so meet flow keeps working.
  }
};

export const playMeetStartedCue = () => speakCue("meet-started", "Meet boshlandi");

export const playMeetJoinRequestCue = () =>
  speakCue("meet-join-request", "Yangi kirish so'rovi", 1200);
