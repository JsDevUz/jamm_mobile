import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { PersistentCachedImage } from "../../components/PersistentCachedImage";
import { TextInput } from "../../components/TextInput";
import { UserDisplayName } from "../../components/UserDisplayName";
import { useI18n } from "../../i18n";
import { usersApi } from "../../lib/api";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type { ChatAdmin, ChatSummary, User } from "../../types/entities";
import { getEntityId, getUserLabel } from "../../utils/chat";

const GROUP_NAME_LIMIT = 60;
const GROUP_DESCRIPTION_LIMIT = 240;
const GROUP_MEMBER_LIMIT = 40;

const ADMIN_PERMISSION_OPTIONS = [
  { id: "edit_group_info", labelKey: "chatsSidebar.groupDialog.permissions.edit_group_info" },
  { id: "add_members", labelKey: "chatsSidebar.groupDialog.permissions.add_members" },
  { id: "remove_members", labelKey: "chatsSidebar.groupDialog.permissions.remove_members" },
  {
    id: "delete_others_messages",
    labelKey: "chatsSidebar.groupDialog.permissions.delete_others_messages",
  },
  { id: "add_admins", labelKey: "chatsSidebar.groupDialog.permissions.add_admins" },
  { id: "pin_messages", labelKey: "chatsSidebar.groupDialog.permissions.pin_messages" },
] as const;

type GroupDraft = {
  name: string;
  description: string;
  avatarUri?: string | null;
  memberIds: string[];
  admins?: ChatAdmin[];
};

type CreateGroupDialogProps = {
  visible: boolean;
  users: User[];
  asScreen?: boolean;
  onClose: () => void;
  onCreate: (draft: GroupDraft) => Promise<void>;
};

type EditGroupDialogProps = {
  visible: boolean;
  group: ChatSummary | null;
  users: User[];
  asScreen?: boolean;
  onClose: () => void;
  onSave: (draft: GroupDraft) => Promise<void>;
};

type MemberPickerProps = {
  visible: boolean;
  title: string;
  users: User[];
  selectedUserIds: string[];
  embedded?: boolean;
  onClose: () => void;
  onSave: (userIds: string[]) => void;
};

type AdminRightsDialogProps = {
  visible: boolean;
  user: User | null;
  permissions: string[];
  onClose: () => void;
  onDismissAdmin: () => void;
  onTogglePermission: (permissionId: string) => void;
};

async function pickImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.82,
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return result.assets[0].uri;
}

function MemberPickerDialog({
  visible,
  title,
  users,
  selectedUserIds,
  embedded = false,
  onClose,
  onSave,
}: MemberPickerProps) {
  const { t } = useI18n();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(screenWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isMounted, setIsMounted] = useState(visible);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [draftSelectedUserIds, setDraftSelectedUserIds] = useState<string[]>(
    selectedUserIds,
  );
  const currentUser = useAuthStore((state) => state.user);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      translateX.setValue(screenWidth);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 24,
          stiffness: 260,
          mass: 0.95,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!isMounted) {
      return;
    }

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: screenWidth,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
      }
    });
  }, [backdropOpacity, isMounted, screenWidth, translateX, visible]);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setSearching(false);
      return;
    }
    setDraftSelectedUserIds(selectedUserIds);
  }, [selectedUserIds, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const normalizedQuery = query.trim().replace(/^@+/, "");
    if (normalizedQuery.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const remoteUsers = await usersApi.searchGlobal(normalizedQuery);
        setResults(remoteUsers);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 420);

    return () => clearTimeout(timer);
  }, [query, visible]);

  const mergedUsers = useMemo(() => {
    const map = new Map<string, User>();

    [...users, ...results].forEach((user) => {
      const userId = getEntityId(user) || String(user.jammId || "");
      if (!userId) return;
      map.set(userId, {
        ...user,
        id: user.id || user._id || userId,
      });
    });

    return Array.from(map.values());
  }, [results, users]);

  const allEligibleUsers = useMemo(() => {
    return mergedUsers.filter((user) => {
      const userId = getEntityId(user);
      if (!userId || userId === getEntityId(currentUser)) {
        return false;
      }

      if (user.disableGroupInvites || user.isOfficialProfile) {
        return false;
      }

      return true;
    });
  }, [currentUser, mergedUsers]);

  const selectedUsers = useMemo(() => {
    const selectedSet = new Set(draftSelectedUserIds);
    return allEligibleUsers
      .filter((user) => {
        const userId = getEntityId(user);
        return Boolean(userId && selectedSet.has(userId));
      })
      .sort((left, right) => getUserLabel(left).localeCompare(getUserLabel(right)));
  }, [allEligibleUsers, draftSelectedUserIds]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().replace(/^@+/, "").toLowerCase();

    return allEligibleUsers
      .filter((user) => {
        const userId = getEntityId(user);
        if (!userId) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystack = [user.nickname, user.username, user.email, String(user.jammId || "")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => getUserLabel(left).localeCompare(getUserLabel(right)));
  }, [allEligibleUsers, query]);

  const toggleDraftUser = useCallback((userId: string) => {
    setDraftSelectedUserIds((current) => {
      if (current.includes(userId)) {
        return current.filter((memberId) => memberId !== userId);
      }

      if (current.length >= GROUP_MEMBER_LIMIT) {
        return current;
      }

      return [...current, userId];
    });
  }, []);

  if (!isMounted) {
    return null;
  }
  const content = (
    <View style={styles.memberPickerLayer} pointerEvents="box-none">
      <Animated.View style={[styles.createScreenBackdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.memberPickerPanel,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        <SafeAreaView style={styles.memberPickerSafeArea} edges={["top", "right", "bottom"]}>
          <View style={styles.memberPickerHeader}>
            <Pressable onPress={onClose} style={styles.memberPickerCloseButton}>
              <X size={18} color={Colors.text} />
            </Pressable>
            <Text style={styles.memberPickerHeaderTitle} numberOfLines={1}>
              {title}
            </Text>
            <Pressable
              onPress={() => onSave(draftSelectedUserIds)}
              style={styles.memberPickerSaveButton}
            >
              <Text style={styles.memberPickerSaveButtonText}>{t("common.save")}</Text>
            </Pressable>
          </View>

          <View style={styles.memberPickerSearchCard}>
            {selectedUsers.length > 0 ? (
              <View style={styles.memberPickerChipsWrap}>
                {selectedUsers.map((user) => {
                  const userId = getEntityId(user);
                  return (
                    <Pressable
                      key={userId}
                      onPress={() => toggleDraftUser(userId)}
                      style={styles.memberPickerChip}
                    >
                      <Avatar label={getUserLabel(user)} uri={user.avatar} size={26} />
                      <Text style={styles.memberPickerChipText} numberOfLines={1}>
                        {getUserLabel(user)}
                      </Text>
                      <X size={14} color="#fff" />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.memberPickerSearchRow}>
              <Search size={18} color={Colors.subtleText} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("chatsSidebar.groupDialog.searchPlaceholder")}
                placeholderTextColor={Colors.subtleText}
                style={styles.memberPickerSearchInput}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {searching ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
            </View>
          </View>

          <ScrollView
            style={styles.memberPickerResults}
            contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
            keyboardShouldPersistTaps="handled"
          >
            {filteredUsers.length === 0 ? (
              <Text style={styles.emptyInfo}>
                {query.trim()
                  ? t("chatsSidebar.groupDialog.searchEmpty")
                  : t("chatsSidebar.groupDialog.searchStart")}
              </Text>
            ) : (
              filteredUsers.map((user) => {
                const userId = getEntityId(user);
                const isSelected = Boolean(
                  userId && draftSelectedUserIds.includes(userId),
                );
                return (
                  <Pressable
                    key={userId}
                    style={styles.memberPickerRow}
                    onPress={() => toggleDraftUser(userId)}
                  >
                    <View style={styles.memberPickerCheckWrap}>
                      <View
                        style={[
                          styles.memberPickerCheck,
                          isSelected && styles.memberPickerCheckActive,
                        ]}
                      >
                        {isSelected ? <Check size={14} color="#fff" /> : null}
                      </View>
                    </View>

                    <Avatar label={getUserLabel(user)} uri={user.avatar} size={42} />

                    <View style={styles.memberPickerTextWrap}>
                      <UserDisplayName
                        user={user}
                        fallback={getUserLabel(user)}
                        textStyle={styles.memberPickerName}
                      />
                      <Text style={styles.memberPickerStatus}>@{user.username || "user"}</Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </View>
  );

  if (embedded) {
    return content;
  }

  return (
    <Modal visible={isMounted} transparent onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

function AdminRightsDialog({
  visible,
  user,
  permissions,
  onClose,
  onDismissAdmin,
  onTogglePermission,
}: AdminRightsDialogProps) {
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.subDialog} onPress={(event) => event.stopPropagation()}>
          <View style={styles.dialogHeader}>
            <View>
              <Text style={styles.dialogTitle}>
                {t("chatsSidebar.groupDialog.adminRightsTitle")}
              </Text>
              <Text style={styles.dialogSubtitle}>
                {t("chatsSidebar.groupDialog.adminRightsSubtitle")}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={18} color={Colors.mutedText} />
            </Pressable>
          </View>

          {user ? (
            <View style={styles.adminUserCard}>
              <Avatar label={getUserLabel(user)} uri={user.avatar} size={42} />
              <View style={styles.memberTextWrap}>
                <UserDisplayName
                  user={user}
                  fallback={getUserLabel(user)}
                  textStyle={styles.memberName}
                />
                <Text style={styles.memberMeta}>@{user.username || "user"}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.permissionsWrap}>
            {ADMIN_PERMISSION_OPTIONS.map((option) => {
              const active = permissions.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  onPress={() => onTogglePermission(option.id)}
                  style={styles.permissionRow}
                >
                  <Text style={styles.permissionLabel}>{t(option.labelKey)}</Text>
                  <View
                    style={[
                      styles.switchTrack,
                      active && styles.switchTrackActive,
                    ]}
                  >
                    <View
                      style={[
                        styles.switchThumb,
                        active && styles.switchThumbActive,
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footerActions}>
            <Pressable style={styles.footerGhostButton} onPress={onDismissAdmin}>
              <Text style={styles.footerDangerText}>
                {t("chatsSidebar.groupDialog.dismissAdmin")}
              </Text>
            </Pressable>
            <Pressable style={styles.footerPrimaryButton} onPress={onClose}>
              <Text style={styles.footerPrimaryText}>{t("common.save")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function GroupDialogLayout({
  visible,
  title,
  subtitle,
  users,
  saving,
  currentAvatar,
  initialMemberIds,
  initialName,
  initialDescription,
  currentAdmins,
  canEditInfo = true,
  canAddMembers = true,
  canRemoveMembers = true,
  canAddAdmins = false,
  ownerId,
  fullScreen = false,
  asScreen = false,
  submitLabel,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  users: User[];
  saving: boolean;
  currentAvatar?: string | null;
  initialMemberIds: string[];
  initialName: string;
  initialDescription: string;
  currentAdmins?: ChatAdmin[];
  canEditInfo?: boolean;
  canAddMembers?: boolean;
  canRemoveMembers?: boolean;
  canAddAdmins?: boolean;
  ownerId?: string;
  fullScreen?: boolean;
  asScreen?: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (draft: GroupDraft) => Promise<void>;
}) {
  const { t } = useI18n();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(screenWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isMounted, setIsMounted] = useState(visible);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [avatarUri, setAvatarUri] = useState<string | null | undefined>(currentAvatar);
  const [memberIds, setMemberIds] = useState<string[]>(initialMemberIds);
  const [admins, setAdmins] = useState<ChatAdmin[]>(currentAdmins || []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showSubmitHint, setShowSubmitHint] = useState(false);

  useEffect(() => {
    if (asScreen) {
      setIsMounted(visible);
      translateX.setValue(0);
      backdropOpacity.setValue(1);
      return;
    }

    if (!fullScreen) {
      setIsMounted(visible);
      return;
    }

    if (visible) {
      setIsMounted(true);
      translateX.setValue(screenWidth);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 24,
          stiffness: 260,
          mass: 0.95,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!isMounted) {
      return;
    }

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: screenWidth,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
      }
    });
  }, [asScreen, backdropOpacity, fullScreen, isMounted, screenWidth, translateX, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setName(initialName);
    setDescription(initialDescription);
    setAvatarUri(currentAvatar);
    setMemberIds(initialMemberIds);
    setAdmins(currentAdmins || []);
    setPickerOpen(false);
    setAdminUserId(null);
    setSubmitting(false);
    setSubmitError("");
    setShowSubmitHint(false);
  }, [visible]);

  const allUsersMap = useMemo(() => {
    const map = new Map<string, User>();

    users.forEach((user) => {
      const userId = getEntityId(user) || String(user.jammId || "");
      if (!userId) return;
      map.set(userId, user);
    });

    return map;
  }, [users]);

  const currentMembers = useMemo(
    () => memberIds.map((userId) => allUsersMap.get(userId)).filter(Boolean) as User[],
    [allUsersMap, memberIds],
  );

  const activeAdminUser = adminUserId ? allUsersMap.get(adminUserId) || null : null;
  const activeAdminPermissions =
    admins.find((admin) => getEntityId(admin) === adminUserId || admin.userId === adminUserId)
      ?.permissions || [];
  const hasGroupName = Boolean(name.trim());
  const needsMembers = memberIds.length === 0;
  const isBusy = saving || submitting;

  const animateScreenBack = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        damping: 22,
        stiffness: 260,
        mass: 0.85,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, translateX]);

  const handlePickImage = async () => {
    if (!canEditInfo || isBusy) return;
    const nextUri = await pickImage();
    if (nextUri) {
      setAvatarUri(nextUri);
    }
  };

  const toggleMember = (userId: string) => {
    if (memberIds.includes(userId)) {
      if (userId === ownerId) {
        return;
      }

      setMemberIds((current) => current.filter((memberId) => memberId !== userId));
      setAdmins((current) =>
        current.filter((admin) => (admin.userId || admin.id || admin._id) !== userId),
      );
      return;
    }

    if (memberIds.length >= GROUP_MEMBER_LIMIT) {
      return;
    }

    setMemberIds((current) => [...current, userId]);
  };

  const handleClose = () => {
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }

    if (adminUserId) {
      setAdminUserId(null);
      return;
    }

    onClose();
  };

  const toggleAdminPermission = (userId: string, permissionId: string) => {
    setAdmins((current) => {
      const matchIndex = current.findIndex(
        (admin) => (admin.userId || admin.id || admin._id) === userId,
      );

      if (matchIndex === -1) {
        return [...current, { userId, permissions: [permissionId] }];
      }

      const currentRecord = current[matchIndex];
      const permissions = currentRecord.permissions || [];
      const nextPermissions = permissions.includes(permissionId)
        ? permissions.filter((permission) => permission !== permissionId)
        : [...permissions, permissionId];

      if (nextPermissions.length === 0) {
        return current.filter((admin) => (admin.userId || admin.id || admin._id) !== userId);
      }

      return current.map((admin, index) =>
        index === matchIndex ? { ...admin, permissions: nextPermissions } : admin,
      );
    });
  };

  const handleSubmit = async () => {
    if (isBusy) {
      return;
    }

    if (needsMembers) {
      setShowSubmitHint(true);
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        avatarUri,
        memberIds,
        admins,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : t("chatsSidebar.groupDialog.saveError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleScreenSwipeGesture = useCallback(
    (event: { nativeEvent: { translationX: number } }) => {
      const nextTranslate = Math.max(0, event.nativeEvent.translationX);
      translateX.setValue(nextTranslate);
      backdropOpacity.setValue(1 - Math.min(1, nextTranslate / Math.max(screenWidth, 1)));
    },
    [backdropOpacity, screenWidth, translateX],
  );

  const handleScreenSwipeBack = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, oldState, translationX, velocityX } = event.nativeEvent;

      if (state === State.BEGAN) {
        translateX.stopAnimation();
        backdropOpacity.stopAnimation();
        return;
      }

      if (oldState !== State.ACTIVE) {
        if (state === State.CANCELLED || state === State.FAILED) {
          animateScreenBack();
        }
        return;
      }

      const shouldClose = translationX > screenWidth * 0.22 || velocityX > 700;
      if (!shouldClose) {
        animateScreenBack();
        return;
      }

      onClose();
    },
    [animateScreenBack, backdropOpacity, onClose, screenWidth, translateX],
  );

  const dialogBody = (
    <>
      <Pressable onPress={handlePickImage} style={styles.uploadCircle}>
        <View style={styles.uploadCircleInner}>
          {avatarUri ? (
            <PersistentCachedImage
              remoteUri={avatarUri}
              style={styles.uploadImage}
              contentFit="cover"
            />
          ) : (
            <>
              <Upload size={24} color={Colors.mutedText} />
              <Text style={styles.uploadText}>{t("chatsSidebar.groupDialog.upload")}</Text>
            </>
          )}
        </View>
        {canEditInfo ? (
          <View style={styles.cameraBadge}>
            <Camera size={12} color="#fff" />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t("chatsSidebar.groupDialog.groupName")}</Text>
        <TextInput
          value={name}
          onChangeText={(value) => setName(value.slice(0, GROUP_NAME_LIMIT))}
          placeholder={t("chatsSidebar.groupDialog.groupNamePlaceholder")}
          placeholderTextColor={Colors.subtleText}
          editable={canEditInfo}
          style={[styles.input, !canEditInfo && styles.inputDisabled]}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t("chatsSidebar.groupDialog.groupDescription")}</Text>
        <TextInput
          value={description}
          onChangeText={(value) => setDescription(value.slice(0, GROUP_DESCRIPTION_LIMIT))}
          placeholder={t("chatsSidebar.groupDialog.groupDescriptionPlaceholder")}
          placeholderTextColor={Colors.subtleText}
          editable={canEditInfo}
          multiline
          style={[styles.textarea, !canEditInfo && styles.inputDisabled]}
        />
      </View>

      <View style={styles.membersSection}>
        <View style={styles.membersHeader}>
          <Text style={styles.label}>
            {t("chatsSidebar.groupDialog.members", {
              count: memberIds.length,
              limit: GROUP_MEMBER_LIMIT,
            })}
          </Text>
          {canAddMembers ? (
            <Pressable onPress={() => setPickerOpen(true)} style={styles.inlineIconButton}>
              <Plus size={16} color={Colors.text} />
            </Pressable>
          ) : null}
        </View>

        {currentMembers.length === 0 ? (
          <View style={styles.emptyMembers}>
            <Text style={styles.emptyMembersText}>{t("chatsSidebar.groupDialog.membersHint")}</Text>
          </View>
        ) : (
          <View style={styles.membersList}>
            {currentMembers.map((user) => {
              const userId = getEntityId(user);
              const isOwner = Boolean(ownerId && ownerId === userId);
              const isAdmin = admins.some(
                (admin) => (admin.userId || admin.id || admin._id) === userId,
              );

              return (
                <View key={userId} style={styles.memberRow}>
                  <View style={styles.memberInfo}>
                    <Avatar label={getUserLabel(user)} uri={user.avatar} size={36} />
                    <View style={styles.memberTextWrap}>
                      <UserDisplayName
                        user={user}
                        fallback={getUserLabel(user)}
                        textStyle={styles.memberName}
                      />
                      <Text style={styles.memberMeta}>@{user.username || "user"}</Text>
                    </View>
                    {isOwner ? (
                      <Shield size={14} color="#F1C40F" />
                    ) : isAdmin ? (
                      <Shield size={14} color={Colors.primary} />
                    ) : null}
                  </View>

                  <View style={styles.memberActions}>
                    {canAddAdmins && !isOwner ? (
                      <Pressable
                        onPress={() => setAdminUserId(userId)}
                        style={styles.memberActionButton}
                      >
                        <Text
                          style={[
                            styles.memberActionText,
                            isAdmin && styles.memberActionTextActive,
                          ]}
                        >
                          {isAdmin
                            ? t("chatsSidebar.groupDialog.roleAdmin")
                            : t("chatsSidebar.groupDialog.roleMember")}
                        </Text>
                        <ChevronRight size={14} color={Colors.mutedText} />
                      </Pressable>
                    ) : null}

                    {canRemoveMembers && !isOwner ? (
                      <Pressable
                        onPress={() => toggleMember(userId)}
                        style={styles.memberTrashButton}
                      >
                        <Trash2 size={16} color={Colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {submitError ? <Text style={styles.submitErrorText}>{submitError}</Text> : null}
    </>
  );

  const footerContent = (
    <>
      <Pressable style={styles.footerGhostButton} onPress={onClose}>
        <Text style={styles.footerGhostText}>{t("common.cancel")}</Text>
      </Pressable>
      <View style={styles.footerPrimaryWrap}>
        {showSubmitHint && needsMembers ? (
          <View style={styles.footerTooltip}>
            <Text style={styles.footerTooltipText}>
              {t("chatsSidebar.groupDialog.submitHint")}
            </Text>
          </View>
        ) : null}
        <Pressable
          style={[
            styles.footerPrimaryButton,
            (!hasGroupName || needsMembers || isBusy) && styles.footerPrimaryButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!hasGroupName || isBusy}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.footerPrimaryText}>{submitLabel}</Text>
          )}
        </Pressable>
      </View>
    </>
  );

  if (fullScreen && !asScreen && !isMounted) {
    return null;
  }

  if (asScreen) {
    return (
      <>
        <SafeAreaView style={styles.routeScreenSafeArea} edges={["top", "right", "bottom"]}>
          <View style={styles.createScreenHeader}>
            <Pressable onPress={handleClose} style={styles.createScreenBackButton}>
              <ArrowLeft size={18} color={Colors.text} />
            </Pressable>
            <View style={styles.createScreenHeaderCopy}>
              <Text style={styles.createScreenTitle}>{title}</Text>
              <Text style={styles.createScreenSubtitle}>{subtitle}</Text>
            </View>
          </View>

          <ScrollView
            style={styles.createScreenBody}
            contentContainerStyle={[
              styles.createScreenBodyContent,
              { paddingBottom: 18 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {dialogBody}
          </ScrollView>

          <View style={[styles.createScreenFooter, { paddingBottom: 12 + insets.bottom }]}>
            {footerContent}
          </View>

          <MemberPickerDialog
            visible={pickerOpen}
            title={t("chatsSidebar.groupDialog.addMember")}
            users={users}
            selectedUserIds={memberIds}
            embedded
            onClose={() => setPickerOpen(false)}
            onSave={(nextUserIds) => {
              setMemberIds(nextUserIds);
              setAdmins((current) =>
                current.filter((admin) => {
                  const adminUserId = admin.userId || admin.id || admin._id;
                  return Boolean(adminUserId && nextUserIds.includes(adminUserId));
                }),
              );
              setShowSubmitHint(false);
              setPickerOpen(false);
            }}
          />

          <AdminRightsDialog
            visible={Boolean(adminUserId)}
            user={activeAdminUser}
            permissions={activeAdminPermissions}
            onClose={() => setAdminUserId(null)}
            onDismissAdmin={() => {
              if (!adminUserId) return;
              setAdmins((current) =>
                current.filter(
                  (admin) => (admin.userId || admin.id || admin._id) !== adminUserId,
                ),
              );
              setAdminUserId(null);
            }}
            onTogglePermission={(permissionId) => {
              if (!adminUserId) return;
              toggleAdminPermission(adminUserId, permissionId);
            }}
          />
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      {fullScreen ? (
        <View style={styles.createScreenLayer} pointerEvents="box-none">
          <Animated.View style={[styles.createScreenBackdrop, { opacity: backdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
          </Animated.View>

          <Animated.View
            style={[
              styles.createScreenPanel,
              {
                transform: [{ translateX }],
              },
            ]}
          >
            <SafeAreaView style={styles.createScreenSafeArea} edges={["top", "right", "bottom"]}>
              <PanGestureHandler
                activeOffsetX={24}
                failOffsetY={[-16, 16]}
                shouldCancelWhenOutside={false}
                onGestureEvent={handleScreenSwipeGesture}
                onHandlerStateChange={handleScreenSwipeBack}
              >
                <Animated.View style={styles.createScreenSwipeEdge} />
              </PanGestureHandler>
              <View style={styles.createScreenHeader}>
                <Pressable onPress={handleClose} style={styles.createScreenBackButton}>
                  <ArrowLeft size={18} color={Colors.text} />
                </Pressable>
                <View style={styles.createScreenHeaderCopy}>
                  <Text style={styles.createScreenTitle}>{title}</Text>
                  <Text style={styles.createScreenSubtitle}>{subtitle}</Text>
                </View>
              </View>

              <ScrollView
                style={styles.createScreenBody}
                contentContainerStyle={[
                  styles.createScreenBodyContent,
                  { paddingBottom: 18 + insets.bottom },
                ]}
                keyboardShouldPersistTaps="handled"
              >
                {dialogBody}
              </ScrollView>

              <View style={[styles.createScreenFooter, { paddingBottom: 12 + insets.bottom }]}>
                {footerContent}
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      ) : (
        <Modal
          visible={visible && !pickerOpen && !adminUserId}
          transparent
          animationType="fade"
          onRequestClose={onClose}
        >
          <Pressable style={styles.overlay} onPress={onClose}>
            <Pressable style={styles.dialog} onPress={(event) => event.stopPropagation()}>
              <View style={styles.dialogHeader}>
                <View>
                  <Text style={styles.dialogTitle}>{title}</Text>
                  <Text style={styles.dialogSubtitle}>{subtitle}</Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeButton}>
                  <X size={18} color={Colors.mutedText} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.dialogBody}
                contentContainerStyle={styles.dialogBodyContent}
                keyboardShouldPersistTaps="handled"
              >
                {dialogBody}
              </ScrollView>

              <View style={styles.footerActions}>{footerContent}</View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <MemberPickerDialog
        visible={pickerOpen}
        title={t("chatsSidebar.groupDialog.addMember")}
        users={users}
        selectedUserIds={memberIds}
        embedded={fullScreen}
        onClose={() => setPickerOpen(false)}
        onSave={(nextUserIds) => {
          setMemberIds(nextUserIds);
          setAdmins((current) =>
            current.filter((admin) => {
              const adminUserId = admin.userId || admin.id || admin._id;
              return Boolean(adminUserId && nextUserIds.includes(adminUserId));
            }),
          );
          setShowSubmitHint(false);
          setPickerOpen(false);
        }}
      />

      <AdminRightsDialog
        visible={Boolean(adminUserId)}
        user={activeAdminUser}
        permissions={activeAdminPermissions}
        onClose={() => setAdminUserId(null)}
        onDismissAdmin={() => {
          if (!adminUserId) return;
          setAdmins((current) =>
            current.filter((admin) => (admin.userId || admin.id || admin._id) !== adminUserId),
          );
          setAdminUserId(null);
        }}
        onTogglePermission={(permissionId) => {
          if (!adminUserId) return;
          toggleAdminPermission(adminUserId, permissionId);
        }}
      />
    </>
  );
}

export function CreateGroupDialog({
  visible,
  users,
  asScreen = false,
  onClose,
  onCreate,
}: CreateGroupDialogProps) {
  const { t } = useI18n();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(screenWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isMounted, setIsMounted] = useState(visible);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null | undefined>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showSubmitHint, setShowSubmitHint] = useState(false);

  useEffect(() => {
    if (asScreen) {
      setIsMounted(visible);
      translateX.setValue(0);
      backdropOpacity.setValue(1);
      return;
    }

    if (visible) {
      setIsMounted(true);
      translateX.setValue(screenWidth);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 24,
          stiffness: 260,
          mass: 0.95,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!isMounted) {
      return;
    }

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: screenWidth,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
      }
    });
  }, [asScreen, backdropOpacity, isMounted, screenWidth, translateX, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setName("");
    setDescription("");
    setAvatarUri(null);
    setMemberIds([]);
    setPickerOpen(false);
    setSubmitting(false);
    setSubmitError("");
    setShowSubmitHint(false);
  }, [visible]);

  const allUsersMap = useMemo(() => {
    const map = new Map<string, User>();

    users.forEach((user) => {
      const userId = getEntityId(user) || String(user.jammId || "");
      if (!userId) return;
      map.set(userId, user);
    });

    return map;
  }, [users]);

  const currentMembers = useMemo(
    () => memberIds.map((userId) => allUsersMap.get(userId)).filter(Boolean) as User[],
    [allUsersMap, memberIds],
  );

  const hasGroupName = Boolean(name.trim());
  const needsMembers = memberIds.length === 0;
  const isBusy = submitting;

  const animateScreenBack = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        damping: 22,
        stiffness: 260,
        mass: 0.85,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, translateX]);

  const handleClose = () => {
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    onClose();
  };

  const handlePickImage = async () => {
    if (isBusy) return;
    const nextUri = await pickImage();
    if (nextUri) {
      setAvatarUri(nextUri);
    }
  };

  const toggleMember = (userId: string) => {
    if (memberIds.includes(userId)) {
      setMemberIds((current) => current.filter((memberId) => memberId !== userId));
      return;
    }

    if (memberIds.length >= GROUP_MEMBER_LIMIT) {
      return;
    }

    setMemberIds((current) => [...current, userId]);
    setShowSubmitHint(false);
  };

  const handleSubmit = async () => {
    if (isBusy) {
      return;
    }

    if (needsMembers) {
      setShowSubmitHint(true);
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        avatarUri,
        memberIds,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : t("chatsSidebar.groupDialog.saveError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleScreenSwipeGesture = useCallback(
    (event: { nativeEvent: { translationX: number } }) => {
      const nextTranslate = Math.max(0, event.nativeEvent.translationX);
      translateX.setValue(nextTranslate);
      backdropOpacity.setValue(1 - Math.min(1, nextTranslate / Math.max(screenWidth, 1)));
    },
    [backdropOpacity, screenWidth, translateX],
  );

  const handleScreenSwipeBack = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, oldState, translationX, velocityX } = event.nativeEvent;

      if (state === State.BEGAN) {
        translateX.stopAnimation();
        backdropOpacity.stopAnimation();
        return;
      }

      if (oldState !== State.ACTIVE) {
        if (state === State.CANCELLED || state === State.FAILED) {
          animateScreenBack();
        }
        return;
      }

      const shouldClose = translationX > screenWidth * 0.22 || velocityX > 700;
      if (!shouldClose) {
        animateScreenBack();
        return;
      }

      onClose();
    },
    [animateScreenBack, backdropOpacity, onClose, screenWidth, translateX],
  );

  if (!isMounted && !asScreen) {
    return null;
  }

  return (
    <View style={asScreen ? styles.routeScreenRoot : styles.createScreenLayer} pointerEvents="box-none">
      {asScreen ? null : (
        <Animated.View style={[styles.createScreenBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
      )}

      <Animated.View
        style={[
          asScreen ? styles.routeScreenPanel : styles.createScreenPanel,
          {
            transform: asScreen ? undefined : [{ translateX }],
          },
        ]}
      >
        <SafeAreaView style={styles.createScreenSafeArea} edges={["top", "right", "bottom"]}>
          <PanGestureHandler
            activeOffsetX={24}
            failOffsetY={[-16, 16]}
            shouldCancelWhenOutside={false}
            onGestureEvent={handleScreenSwipeGesture}
            onHandlerStateChange={handleScreenSwipeBack}
          >
            <Animated.View style={styles.createScreenSwipeEdge} />
          </PanGestureHandler>
          <View style={styles.createScreenHeader}>
            <Pressable onPress={handleClose} style={styles.createScreenBackButton}>
              <ArrowLeft size={18} color={Colors.text} />
            </Pressable>
            <View style={styles.createScreenHeaderCopy}>
              <Text style={styles.createScreenTitle}>{t("chatsSidebar.groupDialog.title")}</Text>
              <Text style={styles.createScreenSubtitle}>
                Do'stlaringiz bilan muloqot qiling
              </Text>
            </View>
          </View>

          <ScrollView
            style={styles.createScreenBody}
            contentContainerStyle={[
              styles.createScreenBodyContent,
              { paddingBottom: 18 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable onPress={handlePickImage} style={styles.uploadCircle}>
              <View style={styles.uploadCircleInner}>
                {avatarUri ? (
                  <PersistentCachedImage
                    remoteUri={avatarUri}
                    style={styles.uploadImage}
                    contentFit="cover"
                  />
                ) : (
                  <>
                    <Upload size={24} color={Colors.mutedText} />
                    <Text style={styles.uploadText}>{t("chatsSidebar.groupDialog.upload")}</Text>
                  </>
                )}
              </View>
              <View style={styles.cameraBadge}>
                <Camera size={12} color="#fff" />
              </View>
            </Pressable>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t("chatsSidebar.groupDialog.groupName")}</Text>
              <TextInput
                value={name}
                onChangeText={(value) => setName(value.slice(0, GROUP_NAME_LIMIT))}
                placeholder={t("chatsSidebar.groupDialog.groupNamePlaceholder")}
                placeholderTextColor={Colors.subtleText}
                style={styles.input}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t("chatsSidebar.groupDialog.groupDescription")}</Text>
              <TextInput
                value={description}
                onChangeText={(value) => setDescription(value.slice(0, GROUP_DESCRIPTION_LIMIT))}
                placeholder={t("chatsSidebar.groupDialog.groupDescriptionPlaceholder")}
                placeholderTextColor={Colors.subtleText}
                multiline
                style={styles.textarea}
              />
            </View>

            <View style={styles.membersSection}>
              <View style={styles.membersHeader}>
                <Text style={styles.label}>
                  {t("chatsSidebar.groupDialog.members", {
                    count: memberIds.length,
                    limit: GROUP_MEMBER_LIMIT,
                  })}
                </Text>
                <Pressable
                  onPress={() => setPickerOpen(true)}
                  style={styles.inlineIconButton}
                >
                  <Plus size={16} color={Colors.text} />
                </Pressable>
              </View>

              {currentMembers.length === 0 ? (
                <View style={styles.emptyMembers}>
                  <Text style={styles.emptyMembersText}>
                    {t("chatsSidebar.groupDialog.membersHint")}
                  </Text>
                </View>
              ) : (
                <View style={styles.membersList}>
                  {currentMembers.map((user) => {
                    const userId = getEntityId(user);

                    return (
                      <View key={userId} style={styles.memberRow}>
                        <View style={styles.memberInfo}>
                          <Avatar label={getUserLabel(user)} uri={user.avatar} size={36} />
                          <View style={styles.memberTextWrap}>
                            <UserDisplayName
                              user={user}
                              fallback={getUserLabel(user)}
                              textStyle={styles.memberName}
                            />
                            <Text style={styles.memberMeta}>@{user.username || "user"}</Text>
                          </View>
                        </View>

                        <View style={styles.memberActions}>
                          <Pressable
                            onPress={() => toggleMember(userId)}
                            style={styles.memberTrashButton}
                          >
                            <Trash2 size={16} color={Colors.danger} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {submitError ? <Text style={styles.submitErrorText}>{submitError}</Text> : null}
          </ScrollView>

          <View style={[styles.createScreenFooter, { paddingBottom: 12 + insets.bottom }]}>
            <Pressable style={styles.footerGhostButton} onPress={onClose}>
                <Text style={styles.footerGhostText}>{t("common.cancel")}</Text>
              </Pressable>
              <View style={styles.footerPrimaryWrap}>
                {showSubmitHint && needsMembers ? (
                  <View style={styles.footerTooltip}>
                    <Text style={styles.footerTooltipText}>
                      {t("chatsSidebar.groupDialog.submitHint")}
                    </Text>
                  </View>
                ) : null}
              <Pressable
                style={[
                  styles.footerPrimaryButton,
                  (!hasGroupName || needsMembers || isBusy) &&
                    styles.footerPrimaryButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!hasGroupName || isBusy}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.footerPrimaryText}>
                    {t("chatsSidebar.groupDialog.createSubmit")}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

          <MemberPickerDialog
            visible={pickerOpen}
            title={t("chatsSidebar.groupDialog.addMember")}
            users={users}
            selectedUserIds={memberIds}
            embedded
            onClose={() => setPickerOpen(false)}
            onSave={(nextUserIds) => {
              setMemberIds(nextUserIds);
              setShowSubmitHint(false);
              setPickerOpen(false);
            }}
          />
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

export function EditGroupDialog({
  visible,
  group,
  users,
  asScreen = false,
  onClose,
  onSave,
}: EditGroupDialogProps) {
  const { t } = useI18n();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = getEntityId(currentUser);
  const ownerId = String(group?.createdBy || "");
  const myAdminRecord = group?.admins?.find(
    (admin) => (admin.userId || admin.id || admin._id) === currentUserId,
  );

  const hasPermission = (permission: string) =>
    ownerId === currentUserId || Boolean(myAdminRecord?.permissions?.includes(permission));

  return (
    <GroupDialogLayout
      visible={visible}
      title={t("chatsSidebar.groupDialog.editTitle")}
      subtitle={t("chatsSidebar.groupDialog.editSubtitle")}
      users={users}
      saving={false}
      asScreen={asScreen}
      currentAvatar={group?.avatar || null}
      initialMemberIds={(group?.members || []).map((member) => getEntityId(member)).filter(Boolean)}
      initialName={group?.name || ""}
      initialDescription={group?.description || ""}
      currentAdmins={group?.admins || []}
      canEditInfo={hasPermission("edit_group_info")}
      canAddMembers={hasPermission("add_members")}
      canRemoveMembers={hasPermission("remove_members")}
      canAddAdmins={hasPermission("add_admins")}
      ownerId={ownerId}
      fullScreen
      submitLabel={t("common.save")}
      onClose={onClose}
      onSubmit={onSave}
    />
  );
}

const styles = StyleSheet.create({
  routeScreenRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  routeScreenPanel: {
    flex: 1,
    width: "100%",
    backgroundColor: Colors.background,
  },
  routeScreenSafeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    padding: 12,
    justifyContent: "center",
  },
  embeddedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    padding: 12,
    zIndex: 20,
  },
  embeddedBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  dialog: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: "92%",
    overflow: "hidden",
  },
  subDialog: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: "82%",
    overflow: "hidden",
    marginHorizontal: 6,
  },
  embeddedSubDialog: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: "82%",
    overflow: "hidden",
    marginHorizontal: 6,
  },
  memberPickerLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 70,
    justifyContent: "flex-end",
  },
  memberPickerPanel: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "flex-end",
    backgroundColor: Colors.background,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: -6, height: 0 },
    elevation: 18,
  },
  memberPickerSafeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  memberPickerHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  memberPickerCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  memberPickerSaveButton: {
    minWidth: 78,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  memberPickerSaveButtonText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  memberPickerHeaderTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  memberPickerSearchCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  memberPickerChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  memberPickerChip: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 6,
    paddingRight: 12,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
  },
  memberPickerChipText: {
    maxWidth: 150,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  memberPickerSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
  },
  memberPickerSearchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  memberPickerResults: {
    flex: 1,
    paddingHorizontal: 16,
  },
  memberPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 62,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  memberPickerCheckWrap: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  memberPickerCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.subtleText,
    backgroundColor: "transparent",
  },
  memberPickerCheckActive: {
    backgroundColor: "#35C9F6",
    borderColor: "#35C9F6",
  },
  memberPickerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  memberPickerName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  memberPickerStatus: {
    color: Colors.mutedText,
    fontSize: 12,
    marginTop: 2,
  },
  createScreenLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    justifyContent: "flex-end",
  },
  createScreenBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.44)",
  },
  createScreenPanel: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "flex-end",
    backgroundColor: Colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: -6, height: 0 },
    elevation: 18,
  },
  createScreenSafeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  createScreenHeader: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  createScreenSwipeEdge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 28,
    zIndex: 3,
  },
  createScreenBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
  },
  createScreenHeaderCopy: {
    flex: 1,
    gap: 4,
    paddingTop: 2,
  },
  createScreenTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  createScreenSubtitle: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  createScreenBody: {
    flex: 1,
  },
  createScreenBodyContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 18,
  },
  createScreenFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: "row",
    gap: 12,
  },
  dialogHeader: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  dialogTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
  },
  dialogSubtitle: {
    color: Colors.mutedText,
    fontSize: 13,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogBody: {
    flexGrow: 0,
  },
  dialogBodyContent: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 18,
  },
  uploadCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: Colors.mutedText,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    position: "relative",
    marginBottom: 4,
  },
  uploadCircleInner: {
    width: "100%",
    height: "100%",
    borderRadius: 41,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
  },
  uploadImage: {
    width: "100%",
    height: "100%",
    borderRadius: 41,
  },
  uploadText: {
    color: Colors.mutedText,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
  },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: Colors.input,
    borderRadius: 10,
    color: Colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  textarea: {
    backgroundColor: Colors.input,
    borderRadius: 10,
    color: Colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 86,
    textAlignVertical: "top",
  },
  inputDisabled: {
    opacity: 0.58,
  },
  membersSection: {
    gap: 10,
  },
  membersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inlineIconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.input,
  },
  emptyMembers: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 18,
    backgroundColor: Colors.surfaceMuted,
  },
  emptyMembersText: {
    color: Colors.mutedText,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  membersList: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surfaceMuted,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  memberInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  memberTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  memberMeta: {
    color: Colors.mutedText,
    fontSize: 11,
    marginTop: 2,
  },
  memberActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  memberActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  memberActionText: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  memberActionTextActive: {
    color: Colors.primary,
  },
  memberTrashButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.background,
  },
  footerGhostButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  footerGhostText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  footerPrimaryWrap: {
    position: "relative",
  },
  footerTooltip: {
    position: "absolute",
    right: 0,
    bottom: 50,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(15,23,42,0.96)",
  },
  footerTooltipText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  footerDangerText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: "500",
  },
  footerPrimaryButton: {
    minWidth: 124,
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  footerPrimaryButtonDisabled: {
    opacity: 0.5,
  },
  footerPrimaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  submitErrorText: {
    color: "#f4a7a7",
    fontSize: 13,
    lineHeight: 18,
  },
  searchBar: {
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.input,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
  },
  searchResults: {
    maxHeight: 320,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  emptyInfo: {
    color: Colors.mutedText,
    textAlign: "center",
    paddingHorizontal: 20,
    paddingVertical: 22,
    fontSize: 14,
  },
  adminUserCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  permissionsWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 6,
  },
  permissionLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
  },
  switchTrack: {
    width: 34,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.subtleText,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  switchTrackActive: {
    backgroundColor: Colors.accent,
  },
  switchThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fff",
  },
  switchThumbActive: {
    alignSelf: "flex-end",
  },
});
