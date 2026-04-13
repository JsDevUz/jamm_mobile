import { Platform } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LIVEKIT_URL } from "../../config/env";
import type { RootStackParamList } from "../../navigation/types";
import { isExpoGo } from "../../lib/runtime";
import { UnsupportedNativeFeatureScreen } from "./UnsupportedNativeFeatureScreen";

type Props = NativeStackScreenProps<RootStackParamList, "PrivateMeet">;

export function PrivateMeetRoute(props: Props) {
  if (Platform.OS === "web") {
    const { PrivateMeetScreen } = require("./PrivateMeetScreen.web") as typeof import("./PrivateMeetScreen.web");
    return <PrivateMeetScreen {...props} />;
  }

  if (isExpoGo) {
    return (
      <UnsupportedNativeFeatureScreen
        title="Private meet Expo Go'da ishlamaydi"
        description="Bu funksiya native media moduliga tayangan. Expo Go'da o'chiriladi, development build yoki production build'da esa normal ishlaydi."
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

  const { PrivateMeetScreen } = require("./PrivateMeetScreen.livekit") as typeof import("./PrivateMeetScreen.livekit");
  return <PrivateMeetScreen {...props} />;
}
