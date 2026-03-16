import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { User } from "../types/entities";

export type MainTabsParamList = {
  Feed: undefined;
  Chats: undefined;
  Articles: undefined;
  Courses: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  MainTabs: NavigatorScreenParams<MainTabsParamList>;
  ChatRoom: {
    chatId: string;
    title: string;
    isGroup: boolean;
  };
  PrivateMeet: {
    chatId: string;
    roomId: string;
    title: string;
    isCaller: boolean;
    remoteUser: User;
  };
};

export type MainTabScreenProps<RouteName extends keyof MainTabsParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabsParamList, RouteName>,
    NativeStackScreenProps<RootStackParamList>
  >;
