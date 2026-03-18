import { Platform } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
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
        description="Group meet native WebRTC bilan qurilgan. Expo Go'da fallback ko'rsatiladi, production yoki development build'da esa to'liq ishlaydi."
        onBack={() => props.navigation.goBack()}
      />
    );
  }

  const { GroupMeetScreen } = require("./GroupMeetScreen") as typeof import("./GroupMeetScreen");
  return <GroupMeetScreen {...props} />;
}

