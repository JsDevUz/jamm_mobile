import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { User } from "../types/entities";
import type {
  ArenaFlashcardDeck,
  ArenaFlashcardPromptSide,
  ArenaFlashcardStudyMode,
  ArenaSentenceBuilderDeck,
  ArenaTestPayload,
} from "../types/arena";

export type MainTabsParamList = {
  Feed: undefined;
  Chats: undefined;
  Articles:
    | {
        articleId?: string | null;
      }
    | undefined;
  Courses:
    | {
        courseId?: string | null;
        lessonId?: string | null;
        viewMode?: "courses" | "arena" | null;
      }
    | undefined;
  Profile:
    | {
        userId?: string | null;
        jammId?: string | number | null;
      }
    | undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  MainTabs: NavigatorScreenParams<MainTabsParamList>;
  ArticleDetail: {
    articleId: string;
  };
  CourseDetail: {
    courseId: string;
    lessonId?: string | null;
  };
  ArenaQuizList: undefined;
  ArenaFlashcardList:
    | {
        deckId?: string;
      }
    | undefined;
  ArenaSentenceBuilderList:
    | {
        deckId?: string;
        deck?: ArenaSentenceBuilderDeck | null;
        shareShortCode?: string | null;
      }
    | undefined;
  ArenaMnemonics: undefined;
  ArenaFlashcardStudy: {
    deckId?: string;
    deck?: ArenaFlashcardDeck | null;
    mode: ArenaFlashcardStudyMode;
    promptSide: ArenaFlashcardPromptSide;
  };
  ArenaTestPlayer: {
    testId?: string;
    test?: ArenaTestPayload | null;
    shareShortCode?: string | null;
  };
  ChatRoom: {
    chatId: string;
    title: string;
    isGroup: boolean;
  };
  PrivateMeet: {
    chatId?: string;
    roomId: string;
    title: string;
    isCaller: boolean;
    remoteUser: User;
    requestAlreadySent?: boolean;
  };
  GroupMeet: {
    roomId: string;
    title: string;
    isCreator: boolean;
    isPrivate: boolean;
  };
};

export type MainTabScreenProps<RouteName extends keyof MainTabsParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabsParamList, RouteName>,
    NativeStackScreenProps<RootStackParamList>
  >;
