import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput as NativeTextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { FlashListRef } from "@shopify/flash-list";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import {
  Bold,
  Eye,
  Flame,
  Hash,
  Heart,
  ImagePlus,
  Italic,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { DraggableBottomSheet } from "../../components/DraggableBottomSheet";
import { PersistentCachedImage } from "../../components/PersistentCachedImage";
import { TextInput } from "../../components/TextInput";
import { UserDisplayName } from "../../components/UserDisplayName";
import {
  APP_LIMITS,
  countWords,
  isPremiumStatus,
} from "../../constants/appLimits";
import { postsApi } from "../../lib/api";
import {
  loadCachedFeedComments,
  loadCachedFeedTab,
  loadFeedLastActiveTab,
  loadFeedScrollPosition,
  saveCachedFeedComments,
  saveCachedFeedTab,
  saveFeedLastActiveTab,
  saveFeedScrollPosition,
} from "../../lib/feed-cache";
import {
  openJammAwareLink,
  openJammProfileMention,
} from "../../navigation/internalLinks";
import { useI18n } from "../../i18n";
import { realtime } from "../../lib/realtime";
import type { MainTabScreenProps } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type { User } from "../../types/entities";
import type {
  CommentsResponse,
  FeedImage,
  FeedPost,
  FeedResponse,
  FeedTab,
  PostComment,
} from "../../types/posts";
import { getEntityId } from "../../utils/chat";

type Props = MainTabScreenProps<"Feed">;
type Translator = (key: string, replacements?: Record<string, string | number>) => string;

const LOCALE_BY_LANGUAGE = {
  uz: "uz-UZ",
  en: "en-US",
  ru: "ru-RU",
} as const;

type PostComposerSubmitPayload = {
  content: string;
  images?: FeedImage[];
};

type ComposerAttachment = {
  id: string;
  localUri?: string;
  remoteUrl?: string;
  previewUri: string;
  blurDataUrl?: string;
  width?: number | null;
  height?: number | null;
  name?: string;
  mimeType?: string;
  file?: File | Blob | null;
  uploading: boolean;
  error: string | null;
};

type FeedLightboxState = {
  images: FeedImage[];
  initialIndex: number;
};

type FeedInfiniteData = InfiniteData<FeedResponse, unknown>;

const getFeedImageKey = (image: FeedImage, index: number) => `${image.url}-${index}`;

type FeedInlineToken =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "underline"; value: string }
  | { type: "code"; value: string }
  | { type: "mention"; value: string; username: string }
  | { type: "link"; value: string; href: string };

function parseFeedInline(text: string): FeedInlineToken[] {
  const pattern =
    /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|_([^_]+)_|@(\w+))/g;
  const tokens: FeedInlineToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    if (match[2] && match[3]) {
      tokens.push({
        type: "link",
        value: match[2],
        href: match[3],
      });
    } else if (match[4]) {
      tokens.push({ type: "code", value: match[4] });
    } else if (match[5]) {
      tokens.push({ type: "strong", value: match[5] });
    } else if (match[6]) {
      tokens.push({ type: "underline", value: match[6] });
    } else if (match[7]) {
      tokens.push({ type: "em", value: match[7] });
    } else if (match[8]) {
      tokens.push({
        type: "mention",
        value: `@${match[8]}`,
        username: match[8],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return tokens.length ? tokens : [{ type: "text", value: text }];
}

function FeedMarkdownText({
  content,
  style,
  numberOfLines,
  t,
}: {
  content: string;
  style?: object;
  numberOfLines?: number;
  t: Translator;
}) {
  const tokens = useMemo(() => parseFeedInline(String(content || "")), [content]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {tokens.map((token, index) => {
        if (token.type === "strong") {
          return (
            <Text key={`strong-${index}`} style={styles.feedMarkdownStrong}>
              {token.value}
            </Text>
          );
        }

        if (token.type === "em") {
          return (
            <Text key={`em-${index}`} style={styles.feedMarkdownEm}>
              {token.value}
            </Text>
          );
        }

        if (token.type === "underline") {
          return (
            <Text key={`underline-${index}`} style={styles.feedMarkdownUnderline}>
              {token.value}
            </Text>
          );
        }

        if (token.type === "code") {
          return (
            <Text key={`code-${index}`} style={styles.feedMarkdownCode}>
              {token.value}
            </Text>
          );
        }

        if (token.type === "link") {
          return (
            <Text
              key={`link-${index}`}
              style={styles.feedMarkdownLink}
              onPress={() => {
                void openJammAwareLink(token.href).catch(() => {
                  Alert.alert(t("feed.linkOpenFailed"), token.href);
                });
              }}
            >
              {token.value}
            </Text>
          );
        }

        if (token.type === "mention") {
          return (
            <Text
              key={`mention-${index}`}
              style={styles.feedMarkdownLink}
              onPress={() => {
                void openJammProfileMention(token.username).catch(() => {
                  Alert.alert(t("feed.profileOpenFailed"), token.value);
                });
              }}
            >
              {token.value}
            </Text>
          );
        }

        return <Fragment key={`text-${index}`}>{token.value}</Fragment>;
      })}
    </Text>
  );
}

function timeAgo(
  iso: string,
  language: keyof typeof LOCALE_BY_LANGUAGE,
  t: Translator,
) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("feed.timeAgo.now");
  if (mins < 60) return t("feed.timeAgo.minutesShort", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("feed.timeAgo.hoursShort", { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t("feed.timeAgo.daysShort", { count: days });
  return new Date(iso).toLocaleDateString(LOCALE_BY_LANGUAGE[language], {
    day: "numeric",
    month: "short",
  });
}

function formatTimestamp(iso: string, language: keyof typeof LOCALE_BY_LANGUAGE) {
  const date = new Date(iso);
  const locale = LOCALE_BY_LANGUAGE[language];
  return `${date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  })} · ${date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function isPremiumUser(user?: User | null) {
  return isPremiumStatus(user?.premiumStatus);
}

function getMimeType(uri?: string | null, fileName?: string | null) {
  const source = (fileName || uri || "").toLowerCase();
  if (source.endsWith(".png")) return "image/png";
  if (source.endsWith(".webp")) return "image/webp";
  if (source.endsWith(".gif")) return "image/gif";
  if (source.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

async function createBlurDataUrl(uri: string) {
  const placeholder = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 24 } }],
    {
      compress: 0.35,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );

  return placeholder.base64
    ? `data:image/jpeg;base64,${placeholder.base64}`
    : undefined;
}

function FeedImageCarousel({
  images,
  onInteractionChange,
  onOpenImage,
}: {
  images: FeedImage[];
  onInteractionChange?: (active: boolean) => void;
  onOpenImage: (images: FeedImage[], initialIndex: number) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  return (
    <View style={styles.imageCarousel}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.imageViewport}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        onScrollBeginDrag={() => onInteractionChange?.(true)}
        onScrollEndDrag={() => onInteractionChange?.(false)}
        onMomentumScrollEnd={(event) => {
          onInteractionChange?.(false);
          const width = viewportWidth || event.nativeEvent.layoutMeasurement.width || 1;
          const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
          setActiveIndex(Math.max(0, Math.min(nextIndex, images.length - 1)));
        }}
        scrollEventThrottle={16}
      >
        {images.map((image, index) => (
          <View
            key={getFeedImageKey(image, index)}
            style={[
              styles.imageSlide,
              viewportWidth > 0 ? { width: viewportWidth } : null,
            ]}
          >
            <PersistentCachedImage
              remoteUri={image.url}
              blurDataUrl={image.blurDataUrl}
              style={styles.imageFill}
              requireManualDownload
              manualDownloadVariant="icon"
              onPress={() => onOpenImage(images, index)}
            />
          </View>
        ))}
      </ScrollView>

      {images.length > 1 ? (
        <View style={styles.imageDots}>
          {images.map((image, index) => (
            <Pressable
              key={`${getFeedImageKey(image, index)}-dot`}
              onPress={() => {
                setActiveIndex(index);
                scrollRef.current?.scrollTo({
                  x: index * Math.max(viewportWidth, 1),
                  animated: true,
                });
              }}
              style={[
                styles.imageDot,
                index === activeIndex && styles.imageDotActive,
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PostComposerModal({
  visible,
  initialContent,
  initialImages = [],
  currentUser,
  title,
  submitLabel,
  showImageTool = true,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  initialContent: string;
  initialImages?: FeedImage[];
  currentUser: User | null;
  title: string;
  submitLabel: string;
  showImageTool?: boolean;
  onClose: () => void;
  onSubmit: (payload: PostComposerSubmitPayload) => Promise<void>;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const inputRef = useRef<NativeTextInput>(null);
  const displayName = currentUser?.nickname || currentUser?.username || t("common.you");
  const usedWords = countWords(text);
  const canUseImages = showImageTool && isPremiumUser(currentUser);
  const hasValidAttachments = attachments.some(
    (attachment) => (attachment.remoteUrl || attachment.localUri) && !attachment.error,
  );

  useEffect(() => {
    const nextText = initialContent || "";
    setText(nextText);
    setAttachments(
      (initialImages || []).map((image, index) => ({
        id: image.url || `initial-${index}`,
        remoteUrl: image.url,
        previewUri: image.url,
        blurDataUrl: image.blurDataUrl,
        width: image.width,
        height: image.height,
        name: "image",
        uploading: false,
        error: null,
      })),
    );
    setSelection({ start: nextText.length, end: nextText.length });
    if (!visible) return;

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 80);

    return () => clearTimeout(timer);
  }, [initialContent, initialImages, visible]);

  const cleanupFailedUploads = useCallback(async (urls: string[]) => {
    await Promise.all(
      urls.map(async (url) => {
        try {
          await postsApi.deleteUploadedImage(url);
        } catch {
          // Keep silent; failed cleanup should not block the UI.
        }
      }),
    );
  }, []);

  const insertMarkdown = (prefix: string, suffix = "") => {
    const before = text.slice(0, selection.start);
    const selected = text.slice(selection.start, selection.end);
    const after = text.slice(selection.end);
    const nextText = `${before}${prefix}${selected}${suffix}${after}`;

    if (countWords(nextText) > APP_LIMITS.postWords) {
      return;
    }

    const nextSelection = {
      start: selection.start + prefix.length,
      end: selection.end + prefix.length,
    };

    setText(nextText);
    setSelection(nextSelection);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleImagePress = () => {
    if (!showImageTool) return;
    if (!canUseImages) {
      Alert.alert(t("feed.imagePremiumTitle"), t("feed.imagePremiumDescription"));
      return;
    }

    const remainingSlots = APP_LIMITS.postImagesPerPost.premium - attachments.length;
    if (remainingSlots <= 0) {
      Alert.alert(t("feed.imageLimitTitle"), t("feed.imageLimitDescription"));
      return;
    }

    void (async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const assets = result.assets.slice(0, remainingSlots);
      if (assets.length < result.assets.length) {
        Alert.alert(t("feed.selectionLimitTitle"), t("feed.selectionLimitDescription"));
      }

      const preparedAttachments: ComposerAttachment[] = [];

      for (const asset of assets) {
        if (typeof asset.fileSize === "number" && asset.fileSize > APP_LIMITS.postImageBytes) {
          Alert.alert(
            t("feed.imageTooLargeTitle"),
            t("feed.imageTooLargeDescription", {
              name: asset.fileName || "Image",
            }),
          );
          continue;
        }

        try {
          const blurDataUrl = await createBlurDataUrl(asset.uri);
          preparedAttachments.push({
            id: `${asset.fileName || "image"}-${asset.uri}-${Date.now()}-${Math.random()}`,
            localUri: asset.uri,
            previewUri: asset.uri,
            blurDataUrl:
              blurDataUrl ||
              (asset.base64
                ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
                : undefined),
            width: asset.width ?? null,
            height: asset.height ?? null,
            name: asset.fileName || `post-image-${Date.now()}.jpg`,
            mimeType: asset.mimeType || getMimeType(asset.uri, asset.fileName),
            file: (asset as ImagePicker.ImagePickerAsset & { file?: File }).file ?? null,
            uploading: false,
            error: null,
          });
        } catch {
          Alert.alert(
            t("feed.previewErrorTitle"),
            t("feed.previewErrorDescription", {
              name: asset.fileName || "Image",
            }),
          );
        }
      }

      if (preparedAttachments.length === 0) {
        return;
      }

      setAttachments((prev) => [...prev, ...preparedAttachments]);
    })();
  };

  const removeAttachment = (attachmentId: string) => {
    if (!showImageTool) return;
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  };

  const performSubmit = async () => {
    const nextContent = text.trim();
    const localAttachments = attachments.filter(
      (attachment) => attachment.localUri && !attachment.remoteUrl && !attachment.error,
    );
    const existingImages = attachments
      .filter((attachment) => attachment.remoteUrl && !attachment.error)
      .map(({ remoteUrl, blurDataUrl, width, height }) => ({
        url: remoteUrl as string,
        blurDataUrl,
        width,
        height,
      }));

    if (
      (!nextContent && existingImages.length === 0 && localAttachments.length === 0) ||
      saving ||
      uploading ||
      usedWords > APP_LIMITS.postWords
    ) {
      return;
    }

    const uploadedUrlsToCleanup: string[] = [];
    setSaving(true);
    setUploading(true);

    try {
      const uploadedImages: FeedImage[] = [];

      for (const attachment of localAttachments) {
        setAttachments((prev) =>
          prev.map((item) =>
            item.id === attachment.id ? { ...item, uploading: true, error: null } : item,
          ),
        );

        try {
          const response = await postsApi.uploadImage({
            uri: attachment.localUri as string,
            name: attachment.name,
            type: attachment.mimeType,
            file: attachment.file,
          });

          uploadedUrlsToCleanup.push(response.url);
          uploadedImages.push({
            url: response.url,
            blurDataUrl: attachment.blurDataUrl,
            width: attachment.width,
            height: attachment.height,
          });

          setAttachments((prev) =>
            prev.map((item) =>
              item.id === attachment.id
                ? {
                    ...item,
                    remoteUrl: response.url,
                    uploading: false,
                    error: null,
                  }
                : item,
            ),
          );
        } catch {
          setAttachments((prev) =>
            prev.map((item) =>
              item.id === attachment.id
                ? { ...item, uploading: false, error: t("feed.uploadFailed") }
                : item,
            ),
          );
          throw new Error("upload_failed");
        }
      }

      await onSubmit({
        content: nextContent,
        images: showImageTool ? [...existingImages, ...uploadedImages] : existingImages,
      });
      onClose();
    } catch {
      await cleanupFailedUploads(uploadedUrlsToCleanup);
      setAttachments((prev) =>
        prev.map((attachment) =>
          attachment.localUri && !attachment.remoteUrl
            ? { ...attachment, uploading: false }
            : attachment,
        ),
      );
      Alert.alert(t("feed.uploadErrorTitle"), t("feed.uploadErrorDescription"));
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFillObject} />
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalCenterWrap}
        >
          <Pressable style={styles.composerCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.composerHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Pressable onPress={onClose} style={styles.modalCloseButton}>
                <X size={18} color={Colors.text} />
              </Pressable>
            </View>

            <View style={styles.composerBody}>
              <Avatar label={displayName} uri={currentUser?.avatar} size={40} />

              <View style={styles.composerTextWrap}>
                <UserDisplayName
                  user={currentUser}
                  fallback={displayName}
                  textStyle={styles.composerAuthor}
                />
                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={(nextText) => {
                    if (countWords(nextText) <= APP_LIMITS.postWords) {
                      setText(nextText);
                    }
                  }}
                  onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
                  selection={selection}
                  multiline
                  placeholder={t("feed.fullComposePlaceholder")}
                  placeholderTextColor={Colors.mutedText}
                  style={styles.composerTextarea}
                  textAlignVertical="top"
                  spellCheck={false}
                />
                <Text
                  style={[
                    styles.composerCounter,
                    usedWords > APP_LIMITS.postWords - 10 && styles.composerCounterWarn,
                  ]}
                >
                  {t("feed.wordCounter", {
                    used: usedWords,
                    limit: APP_LIMITS.postWords,
                  })}
                </Text>
                {attachments.length ? (
                  <View style={styles.composerAttachmentsGrid}>
                    {attachments.map((attachment) => (
                      <View key={attachment.id} style={styles.composerAttachmentCard}>
                        <Image
                          source={{ uri: attachment.previewUri || attachment.remoteUrl }}
                          style={styles.composerAttachmentImage}
                          contentFit="cover"
                          placeholder={
                            attachment.blurDataUrl
                              ? { uri: attachment.blurDataUrl }
                              : undefined
                          }
                        />
                        {showImageTool ? (
                          <Pressable
                            style={styles.composerAttachmentRemove}
                            onPress={() => removeAttachment(attachment.id)}
                          >
                            <X size={14} color="#fff" />
                          </Pressable>
                        ) : null}
                        {attachment.uploading || attachment.error ? (
                          <View style={styles.composerAttachmentStatus}>
                            {attachment.uploading ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <Text style={styles.composerAttachmentStatusText}>
                                {attachment.error}
                              </Text>
                            )}
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.composerToolbar}>
              <Pressable
                style={styles.composerToolButton}
                onPress={() => insertMarkdown("**", "**")}
              >
                <Bold size={15} color={Colors.mutedText} />
              </Pressable>
              <Pressable
                style={styles.composerToolButton}
                onPress={() => insertMarkdown("_", "_")}
              >
                <Italic size={15} color={Colors.mutedText} />
              </Pressable>
              <Pressable style={styles.composerToolButton} onPress={() => insertMarkdown("#")}>
                <Hash size={15} color={Colors.mutedText} />
              </Pressable>

              {showImageTool ? (
                <Pressable style={styles.composerToolButton} onPress={handleImagePress}>
                  <ImagePlus size={15} color={Colors.mutedText} />
                </Pressable>
              ) : null}

              <View style={styles.composerToolDivider} />
              <View style={styles.composerSpacer} />

              <Pressable
                onPress={() => void performSubmit()}
                disabled={
                  (!text.trim() && !hasValidAttachments) ||
                  saving ||
                  uploading ||
                  usedWords > APP_LIMITS.postWords ||
                  attachments.some((attachment) => attachment.uploading)
                }
                style={[
                  styles.composerSubmit,
                  ((!text.trim() && !hasValidAttachments) ||
                    saving ||
                    uploading ||
                    usedWords > APP_LIMITS.postWords ||
                    attachments.some((attachment) => attachment.uploading)) &&
                    styles.composerSubmitDisabled,
                ]}
              >
                {saving || uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Send size={14} color="#fff" />
                    <Text style={styles.composerSubmitText}>{submitLabel}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function CommentsModal({
  post,
  visible,
  onClose,
  onCountChange,
}: {
  post: FeedPost | null;
  visible: boolean;
  onClose: () => void;
  onCountChange: (postId: string, nextCount: number) => void;
}) {
  const { t, language } = useI18n();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = getEntityId(currentUser);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [commentsCacheHydrated, setCommentsCacheHydrated] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [editingComment, setEditingComment] = useState<{
    commentId: string;
    nickname: string;
    kind: "comment" | "reply";
  } | null>(null);
  const [replyingTo, setReplyingTo] = useState<{
    commentId: string;
    replyToUserId?: string;
    nickname: string;
  } | null>(null);

  const loadComments = useCallback(
    async (nextPage = 1) => {
      if (!post?._id) return;
      setLoading(true);
      try {
        const response: CommentsResponse = await postsApi.getComments(post._id, nextPage, 10);
        setComments((prev) => (nextPage === 1 ? response.data || [] : [...prev, ...(response.data || [])]));
        setPage(nextPage);
        setTotalPages(response.totalPages || 1);
        if (currentUserId && nextPage === 1) {
          await saveCachedFeedComments(currentUserId, post._id, response);
        }
      } catch (error) {
        if (nextPage === 1) {
          console.warn("Failed to fetch comments", error);
        }
      } finally {
        setLoading(false);
      }
    },
    [currentUserId, post?._id],
  );

  useEffect(() => {
    let cancelled = false;
    setCommentsCacheHydrated(false);

    if (!visible || !post?._id) {
      setCommentsCacheHydrated(true);
      return;
    }

    const hydrateComments = async () => {
      try {
        if (currentUserId) {
          const cachedComments = await loadCachedFeedComments(currentUserId, post._id);
          if (!cancelled && cachedComments) {
            setComments(cachedComments.data || []);
            setPage(cachedComments.page || 1);
            setTotalPages(cachedComments.totalPages || 1);
          }
        }
      } catch (error) {
        console.warn("Failed to hydrate cached comments", error);
      } finally {
        if (!cancelled) {
          setCommentsCacheHydrated(true);
        }
      }
    };

    setText("");
    setEditingComment(null);
    setReplyingTo(null);
    void hydrateComments();
    void loadComments(1);

    return () => {
      cancelled = true;
    };
  }, [currentUserId, loadComments, post?._id, visible]);

  const handleCloseComments = useCallback(() => {
    Keyboard.dismiss();
    setEditingComment(null);
    setReplyingTo(null);
    setText("");
    onClose();
  }, [onClose]);

  const startReply = useCallback(
    (commentId: string, replyToUserId: string | undefined, nickname: string) => {
      setEditingComment(null);
      setReplyingTo({
        commentId,
        replyToUserId,
        nickname,
      });
      setText("");
    },
    [],
  );

  const startEdit = useCallback(
    (
      item: {
        _id: string;
        content: string;
      },
      nickname: string,
      kind: "comment" | "reply",
    ) => {
      setReplyingTo(null);
      setEditingComment({
        commentId: item._id,
        nickname,
        kind,
      });
      setText(item.content || "");
    },
    [],
  );

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      if (!post?._id) {
        return;
      }

      Alert.alert(t("comments.deleteTitle"), t("comments.deleteDescription"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                const response = await postsApi.deleteComment(post._id, commentId);
                if (editingComment?.commentId === commentId) {
                  setEditingComment(null);
                  setText("");
                }
                if (replyingTo?.commentId === commentId) {
                  setReplyingTo(null);
                }
                onCountChange(post._id, response.comments);
                await loadComments(1);
              } catch (error) {
                Alert.alert(
                  t("comments.deleteFailedTitle"),
                  error instanceof Error
                    ? error.message
                    : t("comments.deleteFailedDescription"),
                );
              }
            })();
          },
        },
      ]);
    },
    [editingComment?.commentId, loadComments, onCountChange, post?._id, replyingTo?.commentId],
  );

  const handleSubmit = async () => {
    if (!post?._id || !text.trim() || sending) return;
    setSending(true);
    try {
      if (editingComment) {
        await postsApi.updateComment(post._id, editingComment.commentId, text.trim());
      } else if (replyingTo) {
        const response = await postsApi.addReply(
          post._id,
          replyingTo.commentId,
          text.trim(),
          replyingTo.replyToUserId,
        );
        if (typeof response.comments === "number") {
          onCountChange(post._id, response.comments);
        }
      } else {
        const response = await postsApi.addComment(post._id, text.trim());
        onCountChange(post._id, response.comments);
      }

      setText("");
      setEditingComment(null);
      setReplyingTo(null);
      await loadComments(1);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!visible || !post?._id) {
      return;
    }

    return realtime.onPostEvent("post_comments_updated", (payload) => {
      if (String(payload?.postId || "") !== post._id) {
        return;
      }

      if (typeof payload?.comments === "number") {
        onCountChange(post._id, payload.comments);
      }
      void loadComments(1);
    });
  }, [loadComments, onCountChange, post?._id, visible]);

  return (
    <DraggableBottomSheet
      visible={visible}
      title={t("comments.title")}
      onClose={handleCloseComments}
      minHeight={540}
      initialHeightRatio={0.94}
      footer={
        <View style={styles.commentInputWrap}>
          {editingComment ? (
            <View style={styles.replyingBar}>
              <Text style={styles.replyingText}>
                {t("comments.editingLabel", { name: editingComment.nickname })}
              </Text>
              <Pressable
                onPress={() => {
                  setEditingComment(null);
                  setText("");
                }}
              >
                <X size={14} color={Colors.mutedText} />
              </Pressable>
            </View>
          ) : null}
          {replyingTo ? (
            <View style={styles.replyingBar}>
              <Text style={styles.replyingText}>
                {t("comments.replyingLabel", { name: replyingTo.nickname })}
              </Text>
              <Pressable onPress={() => setReplyingTo(null)}>
                <X size={14} color={Colors.mutedText} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.commentComposerRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={
                editingComment
                  ? editingComment.kind === "reply"
                    ? t("comments.editReplyPlaceholder")
                    : t("comments.editCommentPlaceholder")
                  : replyingTo
                    ? t("comments.replyPlaceholder", { name: replyingTo.nickname })
                    : t("comments.commentPlaceholder")
              }
              placeholderTextColor={Colors.mutedText}
              style={styles.commentInput}
            />
            <Pressable
              onPress={handleSubmit}
              disabled={!text.trim() || sending}
              style={[
                styles.commentSendButton,
                (!text.trim() || sending) && styles.modalSubmitDisabled,
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Send size={16} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      }
    >
      <ScrollView
        style={styles.commentsScroll}
        contentContainerStyle={styles.commentsContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        onScrollEndDrag={(event) => {
          const offsetY = Number(event.nativeEvent.contentOffset?.y || 0);
          if (offsetY < -36) {
            handleCloseComments();
          }
        }}
      >
              {!commentsCacheHydrated || (loading && comments.length === 0) ? (
                <Text style={styles.commentsEmpty}>{t("comments.loading")}</Text>
              ) : comments.length === 0 ? (
                <Text style={styles.commentsEmpty}>{t("comments.empty")}</Text>
              ) : (
                comments.map((comment) => {
                  const name =
                    comment.user?.nickname ||
                    comment.user?.username ||
                    t("common.userFallback");
                  const isOwnComment = getEntityId(comment.user) === currentUserId;

                  return (
                    <View key={comment._id} style={styles.commentRow}>
                      <Avatar label={name} uri={comment.user?.avatar} size={36} shape="circle" />
                      <View style={styles.commentBody}>
                        <View style={styles.commentBubble}>
                          <UserDisplayName
                            user={comment.user}
                            fallback={name}
                            size="sm"
                            textStyle={styles.commentAuthor}
                          />
                          <Text style={styles.commentText}>{comment.content}</Text>
                        </View>
                        <View style={styles.commentMetaRow}>
                          <Text style={styles.commentTime}>
                            {timeAgo(comment.createdAt, language, t)}
                          </Text>
                          <Pressable
                            onPress={() =>
                              startReply(
                                comment._id,
                                comment.user?._id || comment.user?.id,
                                name,
                              )
                            }
                          >
                            <Text style={styles.replyAction}>{t("comments.reply")}</Text>
                          </Pressable>
                          {isOwnComment ? (
                            <>
                              <Pressable
                                onPress={() => startEdit(comment, name, "comment")}
                              >
                                <Text style={styles.commentAction}>{t("common.edit")}</Text>
                              </Pressable>
                              <Pressable onPress={() => handleDeleteComment(comment._id)}>
                                <Text
                                  style={[styles.commentAction, styles.commentActionDanger]}
                                >
                                  {t("common.delete")}
                                </Text>
                              </Pressable>
                            </>
                          ) : null}
                        </View>

                        {comment.replies?.map((reply) => {
                          const replyName =
                            reply.user?.nickname ||
                            reply.user?.username ||
                            t("common.userFallback");
                          const isOwnReply = getEntityId(reply.user) === currentUserId;

                          return (
                            <View key={reply._id} style={styles.replyRow}>
                              <Avatar
                                label={replyName}
                                uri={reply.user?.avatar}
                                size={28}
                                shape="circle"
                              />
                              <View style={styles.replyBubble}>
                                <UserDisplayName
                                  user={reply.user}
                                  fallback={replyName}
                                  size="sm"
                                  textStyle={styles.commentAuthor}
                                />
                                <Text style={styles.commentText}>
                                  {reply.replyToUser ? `@${reply.replyToUser} ` : ""}
                                  {reply.content}
                                </Text>
                              </View>
                              <View style={styles.replyMetaRow}>
                                <Text style={styles.commentTime}>
                                  {timeAgo(reply.createdAt, language, t)}
                                </Text>
                                {isOwnReply ? (
                                  <>
                                    <Pressable
                                      onPress={() => startEdit(reply, replyName, "reply")}
                                    >
                                      <Text style={styles.commentAction}>{t("common.edit")}</Text>
                                    </Pressable>
                                    <Pressable onPress={() => handleDeleteComment(reply._id)}>
                                      <Text
                                        style={[
                                          styles.commentAction,
                                          styles.commentActionDanger,
                                        ]}
                                      >
                                        {t("common.delete")}
                                      </Text>
                                    </Pressable>
                                  </>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )}

              {page < totalPages ? (
                <Pressable
                  onPress={() => void loadComments(page + 1)}
                  style={styles.moreCommentsButton}
                >
                  <Text style={styles.moreCommentsText}>{t("comments.loadMore")}</Text>
                </Pressable>
              ) : null}
      </ScrollView>
    </DraggableBottomSheet>
  );
}

function FeedPostCard({
  post,
  currentUserId,
  onImageInteractionChange,
  onLike,
  onOpenComments,
  onOpenImage,
  onEdit,
  onDelete,
  onOpenAuthorProfile,
}: {
  post: FeedPost;
  currentUserId: string;
  onImageInteractionChange?: (active: boolean) => void;
  onLike: (post: FeedPost) => void;
  onOpenComments: (post: FeedPost) => void;
  onOpenImage: (images: FeedImage[], initialIndex: number) => void;
  onEdit: (post: FeedPost) => void;
  onDelete: (post: FeedPost) => void;
  onOpenAuthorProfile: (post: FeedPost) => void;
}) {
  const { t, language } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const authorName =
    post.author?.nickname || post.author?.username || t("common.userFallback");
  const isOwner = String(post.author?._id || post.author?.id || "") === currentUserId;
  const hasImages = Array.isArray(post.images) && post.images.length > 0;
  const shouldClamp =
    (!hasImages && (post.content?.length || 0) > 280) ||
    (hasImages && (post.content?.length || 0) > 120);

  return (
    <View style={styles.postCard}>
      <View style={styles.postTopRow}>
        <Pressable onPress={() => onOpenAuthorProfile(post)} hitSlop={6}>
          <Avatar label={authorName} uri={post.author?.avatar} size={25} />
        </Pressable>
        <View style={styles.postMeta}>
          <View style={styles.postHeader}>
            <View style={styles.postHeaderMain}>
              <Pressable onPress={() => onOpenAuthorProfile(post)} hitSlop={6}>
                <UserDisplayName
                  user={post.author}
                  fallback={authorName}
                  textStyle={styles.postAuthor}
                />
              </Pressable>
              <Text style={styles.postHeaderDot}>·</Text>
              <Text style={styles.postUsername}>
                @{post.author?.username || "user"}
              </Text>
            </View>

            {isOwner ? (
              <View style={styles.postMenuWrap}>
                <Pressable onPress={() => setMenuOpen((current) => !current)} style={styles.postMenuButton}>
                  <Text style={styles.postMenuDots}>...</Text>
                </Pressable>
                {menuOpen ? (
                  <View style={styles.postMenuDropdown}>
                    <Pressable
                      style={styles.postMenuItem}
                      onPress={() => {
                        setMenuOpen(false);
                        onEdit(post);
                      }}
                    >
                      <Pencil size={16} color={Colors.text} />
                      <Text style={styles.postMenuItemText}>{t("feed.editPost")}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.postMenuItem}
                      onPress={() => {
                        setMenuOpen(false);
                        onDelete(post);
                      }}
                    >
                      <Trash2 size={16} color={Colors.danger} />
                      <Text style={[styles.postMenuItemText, { color: Colors.danger }]}>
                        {t("feed.deletePost")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {hasImages ? (
        <FeedImageCarousel
          images={post.images}
          onInteractionChange={onImageInteractionChange}
          onOpenImage={onOpenImage}
        />
      ) : null}

      {post.content ? (
        <FeedMarkdownText
          style={[styles.postText, hasImages && styles.postTextCompact]}
          content={post.content}
          t={t}
          numberOfLines={expanded ? undefined : hasImages ? 3 : 8}
        />
      ) : null}

      {shouldClamp && !expanded ? (
        <Pressable onPress={() => setExpanded(true)}>
          <Text style={styles.readMore}>{t("feed.readMore")}</Text>
        </Pressable>
      ) : null}

      <View style={styles.postActions}>
        <View style={styles.actionRow}>
          <Pressable style={styles.actionButton} onPress={() => onLike(post)}>
            <Heart
              size={18}
              color={post.liked ? Colors.danger : Colors.mutedText}
              fill={post.liked ? Colors.danger : "transparent"}
            />
            <Text
              style={[
                styles.actionText,
                post.liked && { color: Colors.danger },
              ]}
            >
              {post.likes}
            </Text>
          </Pressable>

          <Pressable style={styles.actionButton} onPress={() => onOpenComments(post)}>
            <MessageCircle size={18} color={Colors.mutedText} />
            <Text style={styles.actionText}>{post.comments}</Text>
          </Pressable>

          <View style={styles.actionButton}>
            <Eye size={18} color={Colors.mutedText} />
            <Text style={styles.actionText}>{post.views}</Text>
          </View>
        </View>

        <Text style={styles.postTime}>{formatTimestamp(post.createdAt, language)}</Text>
      </View>
    </View>
  );
}

export function FeedScreen({ navigation }: Props) {
  const { t } = useI18n();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = String(currentUser?._id || currentUser?.id || "");
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FeedTab>("foryou");
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const [commentPost, setCommentPost] = useState<FeedPost | null>(null);
  const [lightboxState, setLightboxState] = useState<FeedLightboxState | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [feedCacheHydrated, setFeedCacheHydrated] = useState(false);
  const viewedRef = useRef(new Set<string>());
  const pagerRef = useRef<ScrollView>(null);
  const lightboxScrollRef = useRef<ScrollView>(null);
  const lightboxTranslateY = useRef(new Animated.Value(0)).current;
  const lightboxBackdropOpacity = useRef(new Animated.Value(1)).current;
  const lightboxPanStartYRef = useRef(0);
  const forYouListRef = useRef<FlashListRef<FeedPost>>(null);
  const followingListRef = useRef<FlashListRef<FeedPost>>(null);
  const pagerScrollX = useRef(new Animated.Value(0)).current;
  const currentIndexRef = useRef(0);
  const [tabsRowWidth, setTabsRowWidth] = useState(0);
  const [pagerScrollEnabled, setPagerScrollEnabled] = useState(true);
  const savedTabScrollOffsetsRef = useRef<Record<FeedTab, number>>({
    foryou: 0,
    following: 0,
  });
  const pendingTabScrollRestoreRef = useRef<Record<FeedTab, number | null>>({
    foryou: null,
    following: null,
  });
  const tabScrollPersistTimeoutsRef = useRef<Record<FeedTab, ReturnType<typeof setTimeout> | null>>({
    foryou: null,
    following: null,
  });

  const forYouQuery = useInfiniteQuery({
    queryKey: ["feed", "foryou"],
    queryFn: ({ pageParam = 1 }) => postsApi.fetchFeed("foryou", pageParam, 10),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      (lastPage.totalPages || 1) > lastPageParam ? lastPageParam + 1 : undefined,
  });

  const followingQuery = useInfiniteQuery({
    queryKey: ["feed", "following"],
    queryFn: ({ pageParam = 1 }) => postsApi.fetchFeed("following", pageParam, 10),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      (lastPage.totalPages || 1) > lastPageParam ? lastPageParam + 1 : undefined,
  });
  const hasForYouSnapshot = Boolean(forYouQuery.data);
  const hasFollowingSnapshot = Boolean(followingQuery.data);

  const forYouPosts = useMemo(
    () => forYouQuery.data?.pages.flatMap((page) => page.data || []) || [],
    [forYouQuery.data?.pages],
  );
  const followingPosts = useMemo(
    () => followingQuery.data?.pages.flatMap((page) => page.data || []) || [],
    [followingQuery.data?.pages],
  );

  useEffect(() => {
    let cancelled = false;
    setFeedCacheHydrated(false);

    if (!currentUserId) {
      setFeedCacheHydrated(true);
      return;
    }

    const hydrateFeedCache = async () => {
      try {
        const [cachedForYou, cachedFollowing, cachedForYouOffset, cachedFollowingOffset, cachedTab] =
          await Promise.all([
            loadCachedFeedTab(currentUserId, "foryou"),
            loadCachedFeedTab(currentUserId, "following"),
            loadFeedScrollPosition(currentUserId, "foryou"),
            loadFeedScrollPosition(currentUserId, "following"),
            loadFeedLastActiveTab(currentUserId),
          ]);

        if (!cancelled && cachedForYou && !queryClient.getQueryData(["feed", "foryou"])) {
          queryClient.setQueryData(["feed", "foryou"], cachedForYou);
        }

        if (!cancelled && cachedFollowing && !queryClient.getQueryData(["feed", "following"])) {
          queryClient.setQueryData(["feed", "following"], cachedFollowing);
        }

        if (!cancelled) {
          savedTabScrollOffsetsRef.current = {
            foryou: typeof cachedForYouOffset === "number" ? cachedForYouOffset : 0,
            following: typeof cachedFollowingOffset === "number" ? cachedFollowingOffset : 0,
          };
          pendingTabScrollRestoreRef.current = {
            foryou: typeof cachedForYouOffset === "number" ? cachedForYouOffset : null,
            following: typeof cachedFollowingOffset === "number" ? cachedFollowingOffset : null,
          };

          if (cachedTab) {
            currentIndexRef.current = cachedTab === "following" ? 1 : 0;
            setActiveTab(cachedTab);
          }
        }
      } catch (error) {
        console.warn("Failed to hydrate cached feed", error);
      } finally {
        if (!cancelled) {
          setFeedCacheHydrated(true);
        }
      }
    };

    void hydrateFeedCache();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, queryClient]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    void saveFeedLastActiveTab(currentUserId, activeTab).catch((error) => {
      console.warn("Failed to persist feed active tab", error);
    });
  }, [activeTab, currentUserId]);

  useEffect(() => {
    const snapshot = forYouQuery.data;
    if (!currentUserId || !snapshot) {
      return;
    }

    void saveCachedFeedTab(currentUserId, "foryou", snapshot).catch((error) => {
      console.warn("Failed to persist for you feed cache", error);
    });
  }, [currentUserId, forYouQuery.data, hasForYouSnapshot]);

  useEffect(() => {
    const snapshot = followingQuery.data;
    if (!currentUserId || !snapshot) {
      return;
    }

    void saveCachedFeedTab(currentUserId, "following", snapshot).catch((error) => {
      console.warn("Failed to persist following feed cache", error);
    });
  }, [currentUserId, followingQuery.data, hasFollowingSnapshot]);

  useEffect(() => {
    const nextIndex = activeTab === "following" ? 1 : 0;
    currentIndexRef.current = nextIndex;
    requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({
        x: nextIndex * screenWidth,
        animated: false,
      });
    });
  }, [activeTab, screenWidth]);

  useEffect(() => {
    if (!lightboxState) {
      return;
    }

    setLightboxIndex(lightboxState.initialIndex);

    requestAnimationFrame(() => {
      lightboxScrollRef.current?.scrollTo({
        x: lightboxState.initialIndex * Math.max(screenWidth, 1),
        animated: false,
      });
    });
  }, [lightboxState, screenWidth]);

  const updatePostAcrossFeeds = useCallback(
    (postId: string, updater: (post: FeedPost) => FeedPost) => {
      const queryKeys = [
        ["feed", "foryou"],
        ["feed", "following"],
      ];

      queryKeys.forEach((queryKey) => {
        queryClient.setQueryData<any>(queryKey, (current: {
          pages?: FeedResponse[];
        } | undefined) => {
          if (!current?.pages) return current;
          return {
            ...current,
            pages: current.pages.map((page: FeedResponse) => ({
              ...page,
              data: (page.data || []).map((post: FeedPost) =>
                post._id === postId ? updater(post) : post,
              ),
            })),
          };
        });
      });
    },
    [queryClient],
  );

  const removePostAcrossFeeds = useCallback(
    (postId: string) => {
      [["feed", "foryou"], ["feed", "following"]].forEach((queryKey) => {
        queryClient.setQueryData<any>(queryKey, (current: {
          pages?: FeedResponse[];
        } | undefined) => {
          if (!current?.pages) return current;
          return {
            ...current,
            pages: current.pages.map((page: FeedResponse) => ({
              ...page,
              data: (page.data || []).filter((post: FeedPost) => post._id !== postId),
            })),
          };
        });
      });
    },
    [queryClient],
  );

  const prependForYouPost = useCallback(
    (post: FeedPost) => {
      queryClient.setQueryData<any>(["feed", "foryou"], (current: {
        pages?: FeedResponse[];
        pageParams?: number[];
      } | undefined) => {
        if (!current?.pages?.length) {
          return {
            pages: [{ data: [post], totalPages: 1, page: 1 }],
            pageParams: [1],
          };
        }

        return {
          ...current,
          pages: current.pages.map((page: FeedResponse, index: number) =>
            index === 0 ? { ...page, data: [post, ...(page.data || [])] } : page,
          ),
        };
      });
    },
    [queryClient],
  );

  const animateToTab = useCallback(
    (nextTab: FeedTab, withHaptics = false) => {
      if (withHaptics) {
        void Haptics.selectionAsync();
      }

      const nextIndex = nextTab === "following" ? 1 : 0;
      currentIndexRef.current = nextIndex;
      setActiveTab(nextTab);
      pagerRef.current?.scrollTo({
        x: nextIndex * screenWidth,
        animated: true,
      });
    },
    [screenWidth],
  );

  const handleLike = async (post: FeedPost) => {
    const optimisticLiked = !post.liked;
    updatePostAcrossFeeds(post._id, (current) => ({
      ...current,
      liked: optimisticLiked,
      likes: current.likes + (optimisticLiked ? 1 : -1),
    }));

    try {
      const result = await postsApi.likePost(post._id);
      updatePostAcrossFeeds(post._id, (current) => ({
        ...current,
        liked: result.liked,
        likes: result.likes,
      }));
    } catch {
      updatePostAcrossFeeds(post._id, () => post);
    }
  };

  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: FeedPost; isViewable?: boolean }> }) => {
      viewableItems.forEach((entry) => {
        const post = entry.item;
        if (!post?._id || viewedRef.current.has(post._id) || !entry.isViewable) {
          return;
        }

        viewedRef.current.add(post._id);
        void postsApi.viewPost(post._id)
          .then((result) => {
            updatePostAcrossFeeds(post._id, (current) => ({
              ...current,
              views: result.views,
              previouslySeen: true,
            }));
          })
          .catch(() => {
            viewedRef.current.delete(post._id);
          });
      });
    },
  );

  const handleCreatePost = async ({ content, images }: PostComposerSubmitPayload) => {
    const createdPost = (await postsApi.createPost({ content, images })) as FeedPost;
    prependForYouPost(createdPost);
    animateToTab("foryou");
    setComposeOpen(false);
  };

  const handleEditPost = async ({ content }: PostComposerSubmitPayload) => {
    if (!editingPost?._id) return;
    const updatedPost = (await postsApi.updatePost(editingPost._id, { content })) as FeedPost;
    updatePostAcrossFeeds(editingPost._id, (current) => ({
      ...current,
      ...updatedPost,
      images: current.images,
    }));
    setEditingPost(null);
  };

  const handleDeletePost = (post: FeedPost) => {
    Alert.alert(t("feed.deleteTitle"), t("feed.deleteDescription"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await postsApi.deletePost(post._id);
          removePostAcrossFeeds(post._id);
        },
      },
    ]);
  };

  const handleOpenAuthorProfile = useCallback(
    (post: FeedPost) => {
      const authorId = String(post.author?._id || post.author?.id || "").trim();
      const authorJammId = String(post.author?.jammId || "").trim();

      if (!authorId && !authorJammId) {
        return;
      }

      const isOwnProfile =
        (authorId && authorId === currentUserId) ||
        String(post.author?.jammId || "") === String(currentUser?.jammId || "");

      if (isOwnProfile) {
        navigation.navigate("Profile");
        return;
      }

      navigation.navigate("Profile", {
        userId: authorId || undefined,
        jammId: authorJammId || undefined,
      });
    },
    [currentUser?.jammId, currentUserId, navigation],
  );

  const handleCommentCountChange = (postId: string, nextCount: number) => {
    updatePostAcrossFeeds(postId, (current) => ({
      ...current,
      comments: nextCount,
    }));
    setCommentPost((current) =>
      current && current._id === postId ? { ...current, comments: nextCount } : current,
    );
  };

  const displayName =
    currentUser?.nickname || currentUser?.username || t("common.you");

  const handleImageInteractionChange = useCallback((active: boolean) => {
    setPagerScrollEnabled(!active);
  }, []);

  const handleOpenLightbox = useCallback((images: FeedImage[], initialIndex: number) => {
    setLightboxState({ images, initialIndex });
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setLightboxState(null);
    setLightboxIndex(0);
  }, []);

  const animateLightboxTo = useCallback(
    (toValue: number, opacity: number, onDone?: () => void) => {
      Animated.parallel([
        Animated.spring(lightboxTranslateY, {
          toValue,
          useNativeDriver: true,
          damping: 26,
          stiffness: 260,
          mass: 0.92,
        }),
        Animated.timing(lightboxBackdropOpacity, {
          toValue: opacity,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          onDone?.();
        }
      });
    },
    [lightboxBackdropOpacity, lightboxTranslateY],
  );

  useEffect(() => {
    lightboxTranslateY.setValue(0);
    lightboxBackdropOpacity.setValue(1);
    lightboxPanStartYRef.current = 0;
  }, [lightboxBackdropOpacity, lightboxState, lightboxTranslateY]);

  const lightboxPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dy) > 8 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.05,
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          Math.abs(gestureState.dy) > 8 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.05,
        onPanResponderGrant: () => {
          lightboxTranslateY.stopAnimation((value) => {
            lightboxPanStartYRef.current = value;
          });
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextTranslateY = lightboxPanStartYRef.current + gestureState.dy;
          lightboxTranslateY.setValue(nextTranslateY);
          lightboxBackdropOpacity.setValue(
            Math.max(0.35, 1 - Math.min(Math.abs(nextTranslateY) / 220, 0.65)),
          );
        },
        onPanResponderRelease: (_event, gestureState) => {
          const releaseDistance = Math.abs(
            lightboxPanStartYRef.current + gestureState.dy,
          );
          const shouldClose =
            releaseDistance > 64 || Math.abs(gestureState.vy) > 0.75;

          if (shouldClose) {
            animateLightboxTo(
              gestureState.dy >= 0 ? screenHeight : -screenHeight,
              0,
              handleCloseLightbox,
            );
            return;
          }

          animateLightboxTo(0, 1);
        },
        onPanResponderTerminate: () => {
          animateLightboxTo(0, 1);
        },
      }),
    [
      animateLightboxTo,
      handleCloseLightbox,
      lightboxBackdropOpacity,
      lightboxTranslateY,
      screenHeight,
    ],
  );

  useEffect(() => {
    const subscriptions = [
      realtime.onPostEvent("post_updated", (payload) => {
        const postId = String(payload?._id || payload?.id || "");
        if (!postId) {
          return;
        }

        updatePostAcrossFeeds(postId, (current) => ({
          ...current,
          ...payload,
          liked: current.liked,
          previouslySeen: current.previouslySeen,
        }));
        setCommentPost((current) =>
          current && current._id === postId
            ? {
                ...current,
                ...payload,
                liked: current.liked,
                previouslySeen: current.previouslySeen,
              }
            : current,
        );
      }),
      realtime.onPostEvent("post_deleted", (payload) => {
        const postId = String(payload?.postId || "");
        if (!postId) {
          return;
        }

        removePostAcrossFeeds(postId);
        setCommentPost((current) => (current && current._id === postId ? null : current));
        setEditingPost((current) => (current && current._id === postId ? null : current));
      }),
      realtime.onPostEvent("post_comments_updated", (payload) => {
        const postId = String(payload?.postId || "");
        if (!postId || typeof payload?.comments !== "number") {
          return;
        }

        handleCommentCountChange(postId, payload.comments);
      }),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [handleCommentCountChange, removePostAcrossFeeds, updatePostAcrossFeeds]);

  const persistFeedScrollOffset = useCallback(
    (tab: FeedTab) => {
      if (!currentUserId) {
        return;
      }

      const timeoutId = tabScrollPersistTimeoutsRef.current[tab];
      if (timeoutId) {
        clearTimeout(timeoutId);
        tabScrollPersistTimeoutsRef.current[tab] = null;
      }

      void saveFeedScrollPosition(
        currentUserId,
        tab,
        savedTabScrollOffsetsRef.current[tab],
      ).catch((error) => {
        console.warn("Failed to persist feed scroll position", error);
      });
    },
    [currentUserId],
  );

  const scheduleFeedScrollOffsetPersist = useCallback(
    (tab: FeedTab) => {
      if (!currentUserId) {
        return;
      }

      const timeoutId = tabScrollPersistTimeoutsRef.current[tab];
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      tabScrollPersistTimeoutsRef.current[tab] = setTimeout(() => {
        tabScrollPersistTimeoutsRef.current[tab] = null;
        persistFeedScrollOffset(tab);
      }, 180);
    },
    [currentUserId, persistFeedScrollOffset],
  );

  const handleFeedScroll = useCallback(
    (tab: FeedTab, event: NativeSyntheticEvent<NativeScrollEvent>) => {
      savedTabScrollOffsetsRef.current[tab] = Math.max(
        0,
        event.nativeEvent.contentOffset?.y || 0,
      );
    },
    [],
  );

  useEffect(() => {
    return () => {
      (["foryou", "following"] as FeedTab[]).forEach((tab) => {
        persistFeedScrollOffset(tab);
      });
    };
  }, [persistFeedScrollOffset]);

  const indicatorTranslateX =
    tabsRowWidth > 0
      ? pagerScrollX.interpolate({
          inputRange: [0, screenWidth],
          outputRange: [0, tabsRowWidth / 2],
          extrapolate: "clamp",
        })
      : 0;

  const renderFeedList = (
    tab: FeedTab,
    posts: FeedPost[],
    query: typeof forYouQuery,
  ) => (
    <FlashList
      ref={tab === "foryou" ? forYouListRef : followingListRef}
      data={posts}
      keyExtractor={(item) => item._id}
      drawDistance={600}
      onLoad={() => {
        const nextOffset = pendingTabScrollRestoreRef.current[tab];
        const listRef = tab === "foryou" ? forYouListRef.current : followingListRef.current;
        if (nextOffset !== null && listRef) {
          savedTabScrollOffsetsRef.current[tab] = nextOffset;
          listRef.scrollToOffset({
            offset: nextOffset,
            animated: false,
          });
          pendingTabScrollRestoreRef.current[tab] = null;
        }
      }}
      onScroll={(event) => handleFeedScroll(tab, event)}
      onScrollEndDrag={() => scheduleFeedScrollOffsetPersist(tab)}
      onMomentumScrollEnd={() => scheduleFeedScrollOffsetPersist(tab)}
      scrollEventThrottle={16}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.4}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      onViewableItemsChanged={handleViewableItemsChanged.current as never}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      contentContainerStyle={styles.feedListContent}
      ListHeaderComponent={
        <Pressable onPress={() => setComposeOpen(true)} style={styles.composeBar}>
          <Avatar label={displayName} uri={currentUser?.avatar} size={42} />
          <Text style={styles.composePlaceholder}>{t("feed.composePlaceholder")}</Text>
        </Pressable>
      }
      ListEmptyComponent={
        !feedCacheHydrated || query.isLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.emptyText}>{t("common.loading")}</Text>
          </View>
        ) : query.isError ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyText}>{t("feed.offline")}</Text>
            </View>
            <Text style={styles.emptyText}>
              {query.error instanceof Error
                ? query.error.message
                : t("feed.loadFailed")}
            </Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              {tab === "following" ? (
                <Users size={28} color={Colors.mutedText} />
              ) : (
                <Flame size={28} color={Colors.mutedText} />
              )}
            </View>
            <Text style={styles.emptyText}>
              {tab === "following"
                ? t("feed.emptyFollowing")
                : t("feed.emptyForYou")}
            </Text>
          </View>
        )
      }
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <Text style={styles.footerStatus}>{t("common.loading")}</Text>
        ) : posts.length > 0 ? (
          <Text style={styles.footerStatus}>{t("feed.allShown")}</Text>
        ) : null
      }
      renderItem={({ item }) => (
        <FeedPostCard
          post={item}
          currentUserId={currentUserId}
          onImageInteractionChange={handleImageInteractionChange}
          onLike={handleLike}
          onOpenComments={setCommentPost}
          onOpenImage={handleOpenLightbox}
          onEdit={setEditingPost}
          onDelete={handleDeletePost}
          onOpenAuthorProfile={handleOpenAuthorProfile}
        />
      )}
    />
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <View style={styles.feedHeader}>
          <View style={styles.feedHeaderInner}>
            <View style={styles.feedTitleRow}>
              <Text style={styles.feedTitle}>{t("feed.title")}</Text>
              <Pressable
                onPress={() => setComposeOpen(true)}
                style={styles.plusButton}
              >
                <Plus size={14} color={Colors.text} />
              </Pressable>
            </View>

            <View
              style={styles.tabsRow}
              onLayout={(event) => setTabsRowWidth(event.nativeEvent.layout.width)}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.tabIndicator,
                  tabsRowWidth > 0
                    ? {
                        width: tabsRowWidth / 2,
                        transform: [{ translateX: indicatorTranslateX as any }],
                      }
                    : null,
                ]}
              />
              <Pressable
                style={styles.tab}
                onPress={() => animateToTab("foryou", true)}
              >
                <Text style={[styles.tabText, activeTab === "foryou" && styles.tabTextActive]}>
                  {t("feed.tabs.forYou")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.tab}
                onPress={() => animateToTab("following", true)}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "following" && styles.tabTextActive,
                  ]}
                >
                  {t("feed.tabs.following")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.feedBody}>
          <Animated.ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            bounces={false}
            nestedScrollEnabled
            scrollEnabled={pagerScrollEnabled}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(
                event.nativeEvent.contentOffset.x / Math.max(screenWidth, 1),
              );
              const nextTab = nextIndex === 1 ? "following" : "foryou";
              currentIndexRef.current = nextIndex;
              setActiveTab(nextTab);
            }}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: pagerScrollX } } }],
              { useNativeDriver: false },
            )}
            style={styles.feedPagerTrack}
          >
            <View style={[styles.feedPage, { width: screenWidth }]}>
              {renderFeedList("foryou", forYouPosts, forYouQuery)}
            </View>
            <View style={[styles.feedPage, { width: screenWidth }]}>
              {renderFeedList("following", followingPosts, followingQuery)}
            </View>
          </Animated.ScrollView>
        </View>

      </View>

      <PostComposerModal
        visible={composeOpen}
        initialContent=""
        initialImages={[]}
        currentUser={currentUser}
        title={t("feed.createTitle")}
        submitLabel={t("feed.createSubmit")}
        showImageTool
        onClose={() => setComposeOpen(false)}
        onSubmit={handleCreatePost}
      />

      <PostComposerModal
        visible={Boolean(editingPost)}
        initialContent={editingPost?.content || ""}
        initialImages={editingPost?.images || []}
        currentUser={currentUser}
        title={t("feed.editTitle")}
        submitLabel={t("feed.editSubmit")}
        showImageTool={false}
        onClose={() => setEditingPost(null)}
        onSubmit={handleEditPost}
      />

      <CommentsModal
        post={commentPost}
        visible={Boolean(commentPost)}
        onClose={() => setCommentPost(null)}
        onCountChange={handleCommentCountChange}
      />

      <Modal
        visible={Boolean(lightboxState)}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleCloseLightbox}
      >
        <Animated.View style={[styles.lightboxRoot, { opacity: lightboxBackdropOpacity }]}>
          <Animated.View
            style={{ flex: 1, transform: [{ translateY: lightboxTranslateY }] }}
            {...lightboxPanResponder.panHandlers}
          >
            <ScrollView
              ref={lightboxScrollRef}
              horizontal
              pagingEnabled
              bounces={false}
              directionalLockEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.lightboxPager}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(
                  event.nativeEvent.contentOffset.x / Math.max(screenWidth, 1),
                );
                setLightboxIndex(
                  Math.max(0, Math.min(nextIndex, (lightboxState?.images.length || 1) - 1)),
                );
              }}
            >
              {(lightboxState?.images || []).map((image, index) => (
                <View
                  key={`lightbox-${getFeedImageKey(image, index)}`}
                  style={[styles.lightboxSlide, { width: screenWidth }]}
                >
                  <PersistentCachedImage
                    remoteUri={image.url}
                    blurDataUrl={image.blurDataUrl}
                    style={styles.lightboxImage}
                    contentFit="contain"
                  />
                </View>
              ))}
            </ScrollView>

            <View
              style={[
                styles.lightboxTopBar,
                { top: Math.max(insets.top + 10, 16) },
              ]}
            >
              <Text style={styles.lightboxCounter}>
                {lightboxState?.images.length ? `${lightboxIndex + 1} / ${lightboxState.images.length}` : ""}
              </Text>
              <Pressable onPress={handleCloseLightbox} style={styles.lightboxCloseButton}>
                <X size={20} color="#fff" />
              </Pressable>
            </View>

            {(lightboxState?.images.length || 0) > 1 ? (
              <View
                style={[
                  styles.lightboxDots,
                  { bottom: Math.max(insets.bottom + 18, 26) },
                ]}
              >
                {lightboxState?.images.map((image, index) => (
                  <View
                    key={`lightbox-dot-${getFeedImageKey(image, index)}`}
                    style={[
                      styles.lightboxDot,
                      index === lightboxIndex && styles.lightboxDotActive,
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </Animated.View>
        </Animated.View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  feedHeader: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  feedHeaderInner: {
    paddingHorizontal: 16,
  },
  feedTitleRow: {
    paddingTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  feedTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.text,
  },
  plusButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.hover,
  },
  tabsRow: {
    flexDirection: "row",
    marginTop: 12,
    position: "relative",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    zIndex: 1,
  },
  tabIndicator: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 3,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  tabText: {
    color: Colors.subtleText,
    fontSize: 15,
    fontWeight: "500",
  },
  tabTextActive: {
    color: Colors.text,
    fontWeight: "700",
  },
  feedBody: {
    flex: 1,
    overflow: "hidden",
  },
  feedPagerTrack: {
    flex: 1,
    flexDirection: "row",
  },
  feedPage: {
    flex: 1,
  },
  feedListContent: {
    paddingBottom: 120,
  },
  composeBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginTop: 8,
  },
  composePlaceholder: {
    fontSize: 15,
    color: Colors.subtleText,
    flex: 1,
  },
  postCard: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  postTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  postMeta: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  postHeaderMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    flex: 1,
  },
  postHeaderDot: {
    color: Colors.subtleText,
    fontSize: 15,
    lineHeight: 18,
  },
  postAuthor: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
  },
  postUsername: {
    fontSize: 15,
    color: Colors.subtleText,
  },
  postTime: {
    fontSize: 13,
    color: Colors.subtleText,
  },
  postText: {
    fontSize: 17,
    lineHeight: 29,
    color: "#fff",
  },
  feedMarkdownStrong: {
    fontWeight: "800",
    color: Colors.text,
  },
  feedMarkdownEm: {
    fontStyle: "italic",
    color: Colors.text,
  },
  feedMarkdownUnderline: {
    textDecorationLine: "underline",
    color: Colors.text,
  },
  feedMarkdownCode: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    backgroundColor: Colors.input,
    color: Colors.text,
  },
  feedMarkdownLink: {
    color: Colors.primary,
    textDecorationLine: "underline",
  },
  postTextCompact: {
    fontSize: 16,
    lineHeight: 25,
  },
  imageCarousel: {
    marginHorizontal: -16,
    gap: 10,
  },
  imageViewport: {
    aspectRatio: 16 / 15,
    overflow: "hidden",
    backgroundColor: Colors.input,
  },
  imageSlide: {
    width: "100%",
    height: "100%",
  },
  imageFill: {
    width: "100%",
    height: "100%",
  },
  imageDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  imageDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(114,118,125,0.55)",
  },
  imageDotActive: {
    width: 10,
    height: 10,
    backgroundColor: Colors.primary,
  },
  readMore: {
    color: Colors.primary,
    fontSize: 16,
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionText: {
    color: Colors.subtleText,
    fontSize: 15,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.5,
  },
  emptyText: {
    color: Colors.subtleText,
    textAlign: "center",
    fontSize: 15,
  },
  footerStatus: {
    textAlign: "center",
    padding: 16,
    color: Colors.subtleText,
    fontSize: 13,
  },
  postMenuWrap: {
    position: "relative",
  },
  postMenuButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  postMenuDots: {
    color: Colors.subtleText,
    fontSize: 18,
    lineHeight: 18,
  },
  postMenuDropdown: {
    position: "absolute",
    top: 36,
    right: 0,
    minWidth: 148,
    padding: 6,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 10,
  },
  postMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  postMenuItemText: {
    color: Colors.text,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCenterWrap: {
    width: "100%",
    paddingHorizontal: 20,
  },
  composerCard: {
    width: "100%",
    maxWidth: 580,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  composerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  composerBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  composerTextWrap: {
    flex: 1,
    gap: 4,
  },
  composerAuthor: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  composerTextarea: {
    minHeight: 140,
    maxHeight: 260,
    paddingTop: 2,
    color: Colors.text,
    fontSize: 16,
    lineHeight: 26,
  },
  composerCounter: {
    alignSelf: "flex-end",
    color: Colors.mutedText,
    fontSize: 12,
  },
  composerCounterWarn: {
    color: Colors.warning,
  },
  composerAttachmentsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  composerAttachmentCard: {
    width: 96,
    height: 96,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: Colors.input,
    position: "relative",
  },
  composerAttachmentImage: {
    width: "100%",
    height: "100%",
  },
  composerAttachmentRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  composerAttachmentStatus: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  composerAttachmentStatusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  composerToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  composerToolButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  composerToolDivider: {
    width: 1,
    height: 20,
    marginHorizontal: 4,
    backgroundColor: Colors.border,
  },
  composerSpacer: {
    flex: 1,
  },
  composerSubmit: {
    minWidth: 108,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  composerSubmitDisabled: {
    opacity: 0.5,
  },
  composerSubmitText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  modalSubmitDisabled: {
    opacity: 0.5,
  },
  commentsSheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  commentsSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  commentsSheetKeyboard: {
    justifyContent: "flex-end",
  },
  commentsSheetPanel: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: Colors.surface,
    overflow: "hidden",
  },
  commentsSheetHandleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: Colors.surface,
  },
  commentsSheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: Colors.border,
  },
  commentsSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  commentsTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  commentsScroll: {
    flex: 1,
  },
  commentsContent: {
    padding: 16,
    paddingBottom: 128,
    gap: 14,
  },
  commentsEmpty: {
    color: Colors.subtleText,
    textAlign: "center",
    paddingVertical: 24,
  },
  commentRow: {
    flexDirection: "row",
    gap: 10,
  },
  commentBody: {
    flex: 1,
    gap: 6,
  },
  commentBubble: {
    backgroundColor: Colors.input,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  commentAuthor: {
    color: Colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  commentText: {
    color: Colors.text,
    lineHeight: 20,
  },
  commentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  commentTime: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  commentAction: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  commentActionDanger: {
    color: Colors.danger,
  },
  replyAction: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  replyRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginLeft: 8,
  },
  replyBubble: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  replyMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    marginTop: 4,
    marginLeft: 4,
  },
  moreCommentsButton: {
    alignSelf: "center",
    paddingVertical: 8,
  },
  moreCommentsText: {
    color: Colors.primary,
    fontWeight: "600",
  },
  commentInputWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 10,
    backgroundColor: Colors.surface,
  },
  replyingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.input,
  },
  replyingText: {
    color: Colors.mutedText,
    fontSize: 13,
  },
  commentComposerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: Colors.input,
    color: Colors.text,
    paddingHorizontal: 14,
  },
  commentSendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  lightboxPager: {
    flex: 1,
  },
  lightboxSlide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },
  lightboxTopBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lightboxCounter: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  lightboxCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  lightboxDots: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  lightboxDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.38)",
  },
  lightboxDotActive: {
    width: 10,
    height: 10,
    backgroundColor: "#fff",
  },
});
