import { NativeModules, Platform } from "react-native";

type MeetPipModuleShape = {
  isAvailable?: () => Promise<boolean>;
  setEnabled?: (enabled: boolean) => void;
  enter?: (width: number, height: number) => Promise<boolean>;
};

const MeetPipModule = NativeModules.MeetPip as MeetPipModuleShape | undefined;

export const iosRtcPipProps = (enabled: boolean) =>
  Platform.OS === "ios" && enabled
    ? {
        iosPIP: {
          enabled: true,
          preferredSize: { width: 540, height: 960 },
          startAutomatically: true,
          stopAutomatically: true,
        },
      }
    : {};

export const setMeetPipEnabled = async (enabled: boolean) => {
  if (Platform.OS !== "android") {
    return;
  }

  MeetPipModule?.setEnabled?.(enabled);
};

export const enterMeetPip = async (width = 9, height = 16) => {
  if (Platform.OS !== "android") {
    return false;
  }

  try {
    return Boolean(await MeetPipModule?.enter?.(width, height));
  } catch {
    return false;
  }
};
