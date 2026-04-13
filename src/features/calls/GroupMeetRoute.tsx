import { Platform } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LIVEKIT_URL } from "../../config/env";
import type { RootStackParamList } from "../../navigation/types";
import { isExpoGo } from "../../lib/runtime";
import { UnsupportedNativeFeatureScreen } from "./UnsupportedNativeFeatureScreen";

type Props = NativeStackScreenProps<RootStackParamList, "GroupMeet">;

export function GroupMeetRoute(props: Props) {
  if (Platform.OS === "web") {
    const { GroupMeetScreen } = require("./GroupMeetScreen.web") as typeof import("./GroupMeetScreen.web");
    return <GroupMeetScreen {...props} />;
  }

  if (isExpoGo) {
    return (
      <UnsupportedNativeFeatureScreen
        title="Group meet Expo Go'da ishlamaydi"
        description="Group meet native media moduliga tayangan. Expo Go'da fallback ko'rsatiladi, development build yoki production build'da esa to'liq ishlaydi."
        onBack={() => props.navigation.goBack()}
      />
    );
  }

  if (!LIVEKIT_URL) {
    return (
      <UnsupportedNativeFeatureScreen
        title="LiveKit URL topilmadi"
        description="EXPO_PUBLIC_LIVEKIT_URL sozlanmagani uchun meet ochilmadi. Development yoki production env'ni tekshiring."
        onBack={() => props.navigation.goBack()}
      />
    );
  }

  const { GroupMeetScreen } = require("./GroupMeetScreen.livekit") as typeof import("./GroupMeetScreen.livekit");
  return <GroupMeetScreen {...props} />;
}
