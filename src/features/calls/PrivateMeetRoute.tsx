import { Platform } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
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
        description="Bu funksiya WebRTC native moduliga tayangan. Expo Go'da o'chiriladi, production yoki development build'da esa normal ishlaydi."
        onBack={() => props.navigation.goBack()}
      />
    );
  }

  const { PrivateMeetScreen } = require("./PrivateMeetScreen") as typeof import("./PrivateMeetScreen");
  return <PrivateMeetScreen {...props} />;
}

