import { Animated, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Edit2 } from "lucide-react-native";
import { Avatar } from "../../../components/Avatar";
import { UserDisplayName } from "../../../components/UserDisplayName";
import { MessageRichText } from "./ChatMessageRow";
import { Colors } from "../../../theme/colors";
import { getDirectChatUserLabel, getEntityId } from "../../../utils/chat";

export function ChatUserInfoPanel({
  styles,
  drawerUser,
  drawerStatusLabel,
  currentChatIsGroup,
  showChatPushNotificationsToggle,
  chatPushNotificationsEnabled,
  chatPushNotificationsPending,
  onToggleChatPushNotifications,
  onPressMention,
  onOpenLink,
}: {
  styles: Record<string, any>;
  drawerUser: any;
  drawerStatusLabel: string;
  currentChatIsGroup: boolean;
  showChatPushNotificationsToggle: boolean;
  chatPushNotificationsEnabled: boolean;
  chatPushNotificationsPending: boolean;
  onToggleChatPushNotifications: (value: boolean) => void;
  onPressMention: (username: string) => void;
  onOpenLink: (url: string) => void;
}) {
  return (
    <View style={styles.infoCard}>
      {showChatPushNotificationsToggle ? (
        <>
          <View style={styles.infoSwitchRow}>
            <View style={styles.infoSwitchCopy}>
              <Text style={styles.infoLabel}>BILDIRISHNOMALAR</Text>
              <Text style={styles.infoValue}>Bildirishnoma yuborilsin</Text>
            </View>
            <Switch
              value={chatPushNotificationsEnabled}
              onValueChange={onToggleChatPushNotifications}
              disabled={chatPushNotificationsPending}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.background}
            />
          </View>
          <View style={styles.infoDivider} />
        </>
      ) : null}

      {drawerUser?.username ? (
        <>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>FOYDALANUVCHI NOMI</Text>
            <Text style={styles.infoValue}>@{drawerUser.username}</Text>
          </View>
          <View style={styles.infoDivider} />
        </>
      ) : null}

      {currentChatIsGroup && drawerUser?.bio ? (
        <>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>TARJIMAYI HOL</Text>
            <MessageRichText
              content={drawerUser.bio}
              onPressMention={onPressMention}
              onOpenLink={onOpenLink}
              styles={styles}
            />
          </View>
          <View style={styles.infoDivider} />
        </>
      ) : null}

      {drawerUser?.jammId ? (
        <>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>JAMM ID</Text>
            <Text style={styles.infoValue}>#{drawerUser.jammId}</Text>
          </View>
          <View style={styles.infoDivider} />
        </>
      ) : null}

      {currentChatIsGroup ? (
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>HOLAT</Text>
          <Text style={styles.infoValue}>{drawerStatusLabel}</Text>
        </View>
      ) : !drawerUser?.bio ? (
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>BIO</Text>
          <Text style={styles.infoValue}>Bio yo'q</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ChatGroupInfoPanel({
  styles,
  currentChat,
  groupLinkUrl,
  showChatPushNotificationsToggle,
  chatPushNotificationsEnabled,
  chatPushNotificationsPending,
  onToggleChatPushNotifications,
  onCopyGroupLink,
  onPressMention,
  onOpenLink,
  onOpenPrivateChatWithMember,
}: {
  styles: Record<string, any>;
  currentChat: any;
  groupLinkUrl: string;
  showChatPushNotificationsToggle: boolean;
  chatPushNotificationsEnabled: boolean;
  chatPushNotificationsPending: boolean;
  onToggleChatPushNotifications: (value: boolean) => void;
  onCopyGroupLink: () => void;
  onPressMention: (username: string) => void;
  onOpenLink: (url: string) => void;
  onOpenPrivateChatWithMember: (member: any) => void;
}) {
  return (
    <>
      <View style={styles.infoCard}>
        {showChatPushNotificationsToggle ? (
          <>
            <View style={styles.infoSwitchRow}>
              <View style={styles.infoSwitchCopy}>
                <Text style={styles.infoLabel}>PUSH BILDIRISHNOMALARI</Text>
                <Text style={styles.infoValue}>
                  Shu guruhga yangi xabar kelsa bildirishnoma yuborilsin
                </Text>
              </View>
              <Switch
                value={chatPushNotificationsEnabled}
                onValueChange={onToggleChatPushNotifications}
                disabled={chatPushNotificationsPending}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.background}
              />
            </View>
            {groupLinkUrl || currentChat?.description ? (
              <View style={styles.infoDivider} />
            ) : null}
          </>
        ) : null}

        {groupLinkUrl ? (
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>HAVOLANI ULASHISH</Text>
            <View style={styles.infoLinkRow}>
              <Text style={styles.infoLinkValue}>{groupLinkUrl}</Text>
              <Pressable onPress={onCopyGroupLink} style={styles.infoCopyButton} hitSlop={8}>
                <Ionicons name="copy-outline" size={18} color={Colors.text} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {currentChat?.description ? (
          <>
            <View style={styles.infoDivider} />
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>TASNIF</Text>
              <MessageRichText
                content={currentChat.description}
                onPressMention={onPressMention}
                onOpenLink={onOpenLink}
                styles={styles}
              />
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoSectionTitle}>A'zolar</Text>
        <View style={styles.infoMembersList}>
          {currentChat?.members?.map((member: any) => {
            const memberId = getEntityId(member);
            const isOwner = String(currentChat.createdBy || "") === memberId;
            const isAdmin = Boolean(
              currentChat.admins?.some(
                (admin: any) => (admin.userId || admin.id || admin._id) === memberId,
              ),
            );

            return (
              <Pressable
                key={memberId}
                style={styles.memberRow}
                onPress={() => onOpenPrivateChatWithMember(member)}
              >
                <View style={styles.memberRowMain}>
                  <Avatar
                    label={member.nickname || member.username || "User"}
                    uri={member.avatar}
                    size={42}
                    shape="circle"
                  />
                  <View style={styles.memberTextWrap}>
                    <UserDisplayName
                      user={member}
                      fallback={member.nickname || member.username || "User"}
                      size="sm"
                      textStyle={styles.memberName}
                    />
                    <Text style={styles.memberMetaText}>
                      {member.isOfficialProfile
                        ? member.officialBadgeLabel || "Rasmiy"
                        : member.username
                          ? `@${member.username}`
                          : "Foydalanuvchi"}
                    </Text>
                  </View>
                </View>
                {isOwner ? (
                  <Text style={styles.memberRoleBadge}>Ega</Text>
                ) : isAdmin ? (
                  <Text style={styles.memberRoleBadge}>Admin</Text>
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={Colors.subtleText}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );
}

export function ChatInfoDrawer({
  styles,
  mounted,
  infoPageBackdropOpacity,
  infoPageTranslateX,
  insetsTop,
  insetsBottom,
  panHandlers,
  isViewingGroupMemberInfo,
  drawerTitle,
  canEditGroup,
  drawerAvatarUri,
  currentChat,
  drawerUser,
  chatTitle,
  drawerProfileMeta,
  showChatPushNotificationsToggle,
  chatPushNotificationsEnabled,
  chatPushNotificationsPending,
  drawerStatusLabel,
  groupLinkUrl,
  onBack,
  onClose,
  onOpenEditGroup,
  onOpenAvatarPreview,
  onToggleChatPushNotifications,
  onCopyGroupLink,
  onPressMention,
  onOpenLink,
  onOpenPrivateChatWithMember,
}: {
  styles: Record<string, any>;
  mounted: boolean;
  infoPageBackdropOpacity: Animated.Value;
  infoPageTranslateX: Animated.Value;
  insetsTop: number;
  insetsBottom: number;
  panHandlers: any;
  isViewingGroupMemberInfo: boolean;
  drawerTitle: string;
  canEditGroup: boolean;
  drawerAvatarUri: string | null;
  currentChat: any;
  drawerUser: any;
  chatTitle: string;
  drawerProfileMeta: string;
  showChatPushNotificationsToggle: boolean;
  chatPushNotificationsEnabled: boolean;
  chatPushNotificationsPending: boolean;
  drawerStatusLabel: string;
  groupLinkUrl: string;
  onBack: () => void;
  onClose: () => void;
  onOpenEditGroup: () => void;
  onOpenAvatarPreview: () => void;
  onToggleChatPushNotifications: (value: boolean) => void;
  onCopyGroupLink: () => void;
  onPressMention: (username: string) => void;
  onOpenLink: (url: string) => void;
  onOpenPrivateChatWithMember: (member: any) => void;
}) {
  if (!mounted) {
    return null;
  }

  return (
    <View style={styles.infoPageRoot} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[styles.infoPageBackdrop, { opacity: infoPageBackdropOpacity }]}
      />

      <Animated.View
        style={[
          styles.infoPagePanel,
          {
            paddingTop: insetsTop,
            paddingBottom: insetsBottom,
            transform: [{ translateX: infoPageTranslateX }],
          },
        ]}
        {...panHandlers}
      >
        <View style={styles.infoPageSafeArea} {...panHandlers}>
          <View style={styles.infoPageHeader}>
            <Pressable
              style={styles.headerButton}
              onPress={isViewingGroupMemberInfo ? onBack : onClose}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.mutedText} />
            </Pressable>

            <Text style={styles.infoPageTitle} numberOfLines={1}>
              {drawerTitle}
            </Text>

            {!drawerUser && canEditGroup ? (
              <Pressable style={styles.headerButton} onPress={onOpenEditGroup}>
                <Edit2 size={18} color={Colors.mutedText} />
              </Pressable>
            ) : (
              <View style={styles.infoPageSpacer} />
            )}
          </View>

          <ScrollView
            style={styles.infoPageScroll}
            contentContainerStyle={styles.infoPageContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            {...panHandlers}
          >
            <View style={styles.infoProfileBlock}>
              <Pressable
                style={styles.infoAvatarButton}
                disabled={!drawerAvatarUri}
                onPress={onOpenAvatarPreview}
              >
                <Avatar
                  label={getDirectChatUserLabel(drawerUser) || chatTitle}
                  uri={drawerAvatarUri}
                  size={96}
                  isSavedMessages={Boolean(currentChat?.isSavedMessages && !drawerUser)}
                  isGroup={Boolean(currentChat?.isGroup && !drawerUser)}
                  shape="circle"
                />
              </Pressable>
              {drawerUser ? (
                <View style={styles.infoProfileNameWrap}>
                  <UserDisplayName
                    user={drawerUser}
                    fallback={getDirectChatUserLabel(drawerUser)}
                    size="lg"
                    numberOfLines={2}
                    textStyle={styles.infoProfileName}
                    containerStyle={styles.infoProfileNameContainer}
                  />
                </View>
              ) : (
                <Text style={styles.infoProfileName}>{chatTitle}</Text>
              )}
              <Text style={styles.infoProfileMeta}>{drawerProfileMeta}</Text>
            </View>

            {drawerUser ? (
              <ChatUserInfoPanel
                styles={styles}
                drawerUser={drawerUser}
                drawerStatusLabel={drawerStatusLabel}
                currentChatIsGroup={Boolean(currentChat?.isGroup)}
                showChatPushNotificationsToggle={showChatPushNotificationsToggle}
                chatPushNotificationsEnabled={chatPushNotificationsEnabled}
                chatPushNotificationsPending={chatPushNotificationsPending}
                onToggleChatPushNotifications={onToggleChatPushNotifications}
                onPressMention={onPressMention}
                onOpenLink={onOpenLink}
              />
            ) : (
              <ChatGroupInfoPanel
                styles={styles}
                currentChat={currentChat}
                groupLinkUrl={groupLinkUrl}
                showChatPushNotificationsToggle={showChatPushNotificationsToggle}
                chatPushNotificationsEnabled={chatPushNotificationsEnabled}
                chatPushNotificationsPending={chatPushNotificationsPending}
                onToggleChatPushNotifications={onToggleChatPushNotifications}
                onCopyGroupLink={onCopyGroupLink}
                onPressMention={onPressMention}
                onOpenLink={onOpenLink}
                onOpenPrivateChatWithMember={onOpenPrivateChatWithMember}
              />
            )}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}
