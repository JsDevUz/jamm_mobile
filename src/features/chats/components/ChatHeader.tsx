import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MoreVertical, Phone } from "lucide-react-native";
import { Avatar } from "../../../components/Avatar";
import { UserDisplayName } from "../../../components/UserDisplayName";
import { Colors } from "../../../theme/colors";
import type { User } from "../../../types/entities";
import { getDirectChatUserLabel } from "../../../utils/chat";

export function ChatHeader({
  styles,
  chatTitle,
  chatAvatarUri,
  currentChat,
  isGroupChat,
  otherMember,
  showHeaderStatusDot,
  isOtherMemberOnline,
  headerStatusLabel,
  onBack,
  onOpenInfo,
  onOpenCall,
  onOpenMenu,
}: {
  styles: Record<string, any>;
  chatTitle: string;
  chatAvatarUri: string | null;
  currentChat: { isSavedMessages?: boolean | null } | null;
  isGroupChat: boolean;
  otherMember: User | null;
  showHeaderStatusDot: boolean;
  isOtherMemberOnline: boolean;
  headerStatusLabel: string;
  onBack: () => void;
  onOpenInfo: () => void;
  onOpenCall: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.headerButton} onPress={onBack}>
        <Ionicons name="arrow-back" size={20} color={Colors.mutedText} />
      </Pressable>

      <Pressable style={styles.headerInfo} onPress={onOpenInfo}>
        <Avatar
          label={chatTitle}
          uri={chatAvatarUri}
          size={40}
          isSavedMessages={Boolean(currentChat?.isSavedMessages)}
          isGroup={isGroupChat}
          shape="circle"
        />
        <View style={styles.headerTextWrap}>
          {otherMember && !isGroupChat ? (
            <UserDisplayName
              user={otherMember}
              fallback={getDirectChatUserLabel(otherMember)}
              size="md"
              numberOfLines={1}
              textStyle={styles.headerTitle}
            />
          ) : (
            <Text style={styles.headerTitle} numberOfLines={1}>
              {chatTitle}
            </Text>
          )}
          <View style={styles.headerStatusRow}>
            {showHeaderStatusDot ? (
              <View
                style={[
                  styles.headerStatusDot,
                  isOtherMemberOnline
                    ? styles.headerStatusDotOnline
                    : styles.headerStatusDotOffline,
                ]}
              />
            ) : null}
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {headerStatusLabel}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.headerActions}>
        {!isGroupChat && !currentChat?.isSavedMessages ? (
          <Pressable style={styles.headerButton} onPress={onOpenCall}>
            <Phone size={18} color={Colors.mutedText} />
          </Pressable>
        ) : null}

        <Pressable style={styles.headerButton} onPress={onOpenMenu}>
          <MoreVertical size={18} color={Colors.mutedText} />
        </Pressable>
      </View>
    </View>
  );
}
