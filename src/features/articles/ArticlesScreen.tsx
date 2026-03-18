import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  ArrowLeft,
  Bold,
  Code2,
  Eye,
  Heading1,
  Heading2,
  Heart,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  MessageCircle,
  PanelRight,
  Pencil,
  Plus,
  Quote,
  Send,
  Trash2,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
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
  getTierLimit,
} from "../../constants/appLimits";
import { articlesApi } from "../../lib/api";
import type { MainTabScreenProps } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";
import type {
  ArticleComment,
  ArticleCommentReply,
  ArticleSummary,
} from "../../types/articles";
import { getEntityId } from "../../utils/chat";

type Props = MainTabScreenProps<"Articles">;

type EditorMode = "write" | "preview" | "split";

type InlineToken =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; value: string; href: string };

type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "code"; code: string }
  | { type: "hr" }
  | { type: "image"; alt: string; src: string };

function timeAgo(iso?: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Hozir";
  if (mins < 60) return `${mins}d`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}s`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}k`;
  return new Date(iso).toLocaleDateString("uz-UZ", {
    day: "numeric",
    month: "short",
  });
}

function parseInline(text: string): InlineToken[] {
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|_([^_]+)_)/g;
  const parts: InlineToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    if (match[2] && match[3]) {
      parts.push({
        type: "link",
        value: match[2],
        href: match[3],
      });
    } else if (match[4]) {
      parts.push({ type: "code", value: match[4] });
    } else if (match[5]) {
      parts.push({ type: "strong", value: match[5] });
    } else if (match[6]) {
      parts.push({ type: "em", value: match[6] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: "text", value: text }];
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = String(content || "").replace(/\r/g, "").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];
  let listType: "unordered-list" | "ordered-list" | null = null;
  let quoteBuffer: string[] = [];
  let inCodeFence = false;
  let codeBuffer: string[] = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    blocks.push({ type: "paragraph", text: paragraphBuffer.join(" ") });
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer.length || !listType) return;
    blocks.push({ type: listType, items: [...listBuffer] });
    listBuffer = [];
    listType = null;
  };

  const flushQuote = () => {
    if (!quoteBuffer.length) return;
    blocks.push({ type: "blockquote", text: quoteBuffer.join(" ") });
    quoteBuffer = [];
  };

  const flushCode = () => {
    if (!codeBuffer.length) return;
    blocks.push({ type: "code", code: codeBuffer.join("\n") });
    codeBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      flushQuote();
      if (inCodeFence) {
        flushCode();
        inCodeFence = false;
      } else {
        inCodeFence = true;
      }
      continue;
    }

    if (inCodeFence) {
      codeBuffer.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({
        type: "image",
        alt: imageMatch[1],
        src: imageMatch[2],
      });
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({ type: "hr" });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2],
      });
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteBuffer.push(quoteMatch[1]);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== "unordered-list") {
        flushList();
      }
      listType = "unordered-list";
      listBuffer.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== "ordered-list") {
        flushList();
      }
      listType = "ordered-list";
      listBuffer.push(orderedMatch[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushQuote();
  flushCode();

  return blocks;
}

function InlineText({ text, style }: { text: string; style?: object }) {
  const tokens = useMemo(() => parseInline(text), [text]);

  return (
    <Text style={style}>
      {tokens.map((token, index) => {
        if (token.type === "strong") {
          return (
            <Text key={`strong-${index}`} style={styles.markdownStrong}>
              {token.value}
            </Text>
          );
        }

        if (token.type === "em") {
          return (
            <Text key={`em-${index}`} style={styles.markdownEm}>
              {token.value}
            </Text>
          );
        }

        if (token.type === "code") {
          return (
            <Text key={`code-${index}`} style={styles.markdownInlineCode}>
              {token.value}
            </Text>
          );
        }

        if (token.type === "link") {
          return (
            <Text
              key={`link-${index}`}
              style={styles.markdownLink}
              onPress={() => {
                void Linking.openURL(token.href).catch(() => {
                  Alert.alert("Link ochilmadi", token.href);
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

function ArticleMarkdownRenderer({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <View style={styles.markdownRoot}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <InlineText
              key={`heading-${index}`}
              text={block.text}
              style={[
                styles.markdownHeading,
                block.level === 1 && styles.markdownH1,
                block.level === 2 && styles.markdownH2,
                block.level === 3 && styles.markdownH3,
              ]}
            />
          );
        }

        if (block.type === "paragraph") {
          return (
            <InlineText
              key={`paragraph-${index}`}
              text={block.text}
              style={styles.markdownParagraph}
            />
          );
        }

        if (block.type === "blockquote") {
          return (
            <View key={`quote-${index}`} style={styles.markdownQuote}>
              <InlineText text={block.text} style={styles.markdownQuoteText} />
            </View>
          );
        }

        if (block.type === "unordered-list" || block.type === "ordered-list") {
          return (
            <View key={`list-${index}`} style={styles.markdownList}>
              {block.items.map((item, itemIndex) => (
                <View key={`list-item-${itemIndex}`} style={styles.markdownListRow}>
                  <Text style={styles.markdownListBullet}>
                    {block.type === "ordered-list" ? `${itemIndex + 1}.` : "•"}
                  </Text>
                  <InlineText text={item} style={styles.markdownListText} />
                </View>
              ))}
            </View>
          );
        }

        if (block.type === "code") {
          return (
            <ScrollView
              key={`code-${index}`}
              horizontal
              style={styles.markdownCodeBlock}
              contentContainerStyle={styles.markdownCodeInner}
              showsHorizontalScrollIndicator={false}
            >
              <Text style={styles.markdownCodeText}>{block.code}</Text>
            </ScrollView>
          );
        }

        if (block.type === "hr") {
          return <View key={`hr-${index}`} style={styles.markdownHr} />;
        }

        if (block.type === "image") {
          return (
            <PersistentCachedImage
              key={`image-${index}`}
              remoteUri={block.src}
              style={styles.markdownImage}
              requireManualDownload
            />
          );
        }

        return null;
      })}
    </View>
  );
}

async function pickImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.82,
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  return result.assets[0].uri;
}

function ArticleCommentsModal({
  visible,
  article,
  onClose,
  onCommentsCountChange,
}: {
  visible: boolean;
  article: ArticleSummary | null;
  onClose: () => void;
  onCommentsCountChange: (count: number) => void;
}) {
  const currentUser = useAuthStore((state) => state.user);
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<{
    commentId: string;
    nickname: string;
  } | null>(null);

  useEffect(() => {
    if (!visible || !article?._id) {
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const response = await articlesApi.getComments(article._id, 1, 10);
        setComments(response.data || []);
        setPage(1);
        setHasMore(1 < (response.totalPages || 1));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [article?._id, visible]);

  const loadMore = async () => {
    if (!article?._id || !hasMore || loading) {
      return;
    }

    setLoading(true);
    try {
      const nextPage = page + 1;
      const response = await articlesApi.getComments(article._id, nextPage, 10);
      setComments((prev) => [...prev, ...(response.data || [])]);
      setPage(nextPage);
      setHasMore(nextPage < (response.totalPages || 1));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!article?._id || !text.trim() || sending) return;

    setSending(true);
    try {
      let nextCount = article.comments || 0;

      if (replyingTo) {
        await articlesApi.addReply(
          article._id,
          replyingTo.commentId,
          text.trim(),
          replyingTo.nickname,
        );
        nextCount += 1;
      } else {
        const response = await articlesApi.addComment(article._id, text.trim());
        nextCount = response.comments || nextCount + 1;
      }

      const refreshed = await articlesApi.getComments(article._id, 1, 10);
      setComments(refreshed.data || []);
      setPage(1);
      setHasMore(1 < (refreshed.totalPages || 1));
      onCommentsCountChange(nextCount);
      setReplyingTo(null);
      setText("");
    } finally {
      setSending(false);
    }
  };

  const renderReply = (reply: ArticleCommentReply) => (
    <View key={reply._id} style={styles.replyRow}>
      <Avatar
        label={reply.user?.nickname || reply.user?.username || "U"}
        uri={reply.user?.avatar}
        size={30}
      />
      <View style={styles.commentCard}>
        <View style={styles.commentBubble}>
          <View style={styles.commentAuthorRow}>
            <UserDisplayName
              user={reply.user}
              fallback={reply.user?.nickname || reply.user?.username || "User"}
              size="sm"
              textStyle={styles.commentAuthor}
            />
            <Text style={styles.commentMeta}>{timeAgo(reply.createdAt)}</Text>
          </View>
          <Text style={styles.commentText}>{reply.content}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <DraggableBottomSheet
      visible={visible}
      title="Article izohlari"
      onClose={onClose}
      minHeight={540}
      initialHeightRatio={0.82}
      footer={
        <View style={styles.commentsInputWrap}>
          {replyingTo ? (
            <View style={styles.replyingBar}>
              <Text style={styles.replyingText} numberOfLines={1}>
                {replyingTo.nickname} ga javob
              </Text>
              <Pressable onPress={() => setReplyingTo(null)}>
                <X size={14} color={Colors.mutedText} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.commentsForm}>
            <Avatar
              label={currentUser?.nickname || currentUser?.username || "U"}
              uri={currentUser?.avatar}
              size={34}
            />
            <View style={styles.commentComposer}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Izoh yozing..."
                placeholderTextColor={Colors.subtleText}
                style={styles.commentInput}
              />
              <Pressable
                style={[
                  styles.sendFab,
                  (!text.trim() || sending) && styles.sendFabDisabled,
                ]}
                disabled={!text.trim() || sending}
                onPress={() => void handleSubmit()}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Send size={16} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      }
    >
      <ScrollView
        style={styles.commentsBody}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.commentsBodyContent}
        keyboardShouldPersistTaps="handled"
      >
            {loading && comments.length === 0 ? (
              <View style={styles.loaderState}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : comments.length === 0 ? (
              <View style={styles.commentsEmpty}>
                <Text style={styles.commentsEmptyText}>Hali izoh yo'q</Text>
              </View>
            ) : (
              <>
                {comments.map((comment) => (
                  <View key={comment._id} style={styles.commentRow}>
                    <Avatar
                      label={comment.user?.nickname || comment.user?.username || "U"}
                      uri={comment.user?.avatar}
                      size={38}
                    />
                    <View style={styles.commentCard}>
                      <View style={styles.commentBubble}>
                        <View style={styles.commentAuthorRow}>
                          <UserDisplayName
                            user={comment.user}
                            fallback={comment.user?.nickname || comment.user?.username || "User"}
                            size="sm"
                            textStyle={styles.commentAuthor}
                          />
                          <Text style={styles.commentMeta}>{timeAgo(comment.createdAt)}</Text>
                        </View>
                        <Text style={styles.commentText}>{comment.content}</Text>
                      </View>
                      <Pressable
                        style={styles.replyButton}
                        onPress={() =>
                          setReplyingTo({
                            commentId: comment._id,
                            nickname:
                              comment.user?.nickname ||
                              comment.user?.username ||
                              "User",
                          })
                        }
                      >
                        <Text style={styles.replyButtonText}>Javob yozish</Text>
                      </Pressable>
                      {comment.replies?.length ? (
                        <View style={styles.repliesWrap}>
                          {comment.replies.map(renderReply)}
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))}

                {hasMore ? (
                  <Pressable style={styles.loadMoreButton} onPress={() => void loadMore()}>
                    <Text style={styles.loadMoreText}>
                      {loading ? "Yuklanmoqda..." : "Ko'proq izohlar"}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
      </ScrollView>
    </DraggableBottomSheet>
  );
}

function ArticleEditorModal({
  visible,
  initialArticle,
  articleWordLimit,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  initialArticle: {
    title: string;
    excerpt: string;
    markdown: string;
    coverImage: string;
    tags: string[];
  } | null;
  articleWordLimit: number;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    excerpt: string;
    markdown: string;
    coverImage: string;
    tags: string[];
  }) => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<EditorMode>("write");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [keyboardInset, setKeyboardInset] = useState(0);
  const editorScrollRef = useRef<ScrollView>(null);
  const editorFieldOffsetsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!visible) {
      return;
    }

    setMode("write");
    setTitle(initialArticle?.title || "");
    setExcerpt(initialArticle?.excerpt || "");
    setMarkdown(initialArticle?.markdown || "");
    setCoverImage(initialArticle?.coverImage || "");
    setTagsText(initialArticle?.tags?.join(", ") || "");
    setSelection({
      start: initialArticle?.markdown?.length || 0,
      end: initialArticle?.markdown?.length || 0,
    });
  }, [initialArticle, visible]);

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      return;
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const handleKeyboardShow = (event: { endCoordinates?: { height?: number } }) => {
      if (Platform.OS !== "android") {
        return;
      }

      const nextInset = Math.max(0, Number(event.endCoordinates?.height || 0) - insets.bottom);
      setKeyboardInset(nextInset);
    };

    const handleKeyboardHide = () => {
      setKeyboardInset(0);
    };

    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom, visible]);

  const wordCount = countWords(markdown);
  const isCompactLayout = width < 960;
  const isTabletLayout = width < 820;
  const isPhoneLayout = width < 640;
  const showEditorPane = mode !== "preview";
  const showPreviewPane = mode !== "write";
  const tags = tagsText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, APP_LIMITS.articleTagCount);

  const scrollEditorToField = useCallback((fieldKey: string) => {
    const targetY = editorFieldOffsetsRef.current[fieldKey];
    if (typeof targetY !== "number") {
      return;
    }

    requestAnimationFrame(() => {
      editorScrollRef.current?.scrollTo({
        y: Math.max(targetY - 24, 0),
        animated: true,
      });
    });
  }, []);

  const insertSnippet = (prefix: string, suffix = "") => {
    const before = markdown.slice(0, selection.start);
    const selected = markdown.slice(selection.start, selection.end);
    const after = markdown.slice(selection.end);
    const nextValue = `${before}${prefix}${selected}${suffix}${after}`;
    setMarkdown(nextValue);
    const nextPosition = selection.start + prefix.length;
    setSelection({
      start: nextPosition,
      end: nextPosition + selected.length,
    });
  };

  const handleUploadInlineImage = async () => {
    const fileUri = await pickImage();
    if (!fileUri) return;

    setUploading(true);
    try {
      const uploaded = await articlesApi.uploadImage(fileUri);
      insertSnippet(`\n\n![](${uploaded.url})\n\n`);
    } catch (error) {
      Alert.alert(
        "Rasm yuklanmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleUploadCover = async () => {
    const fileUri = await pickImage();
    if (!fileUri) return;

    setUploading(true);
    try {
      const uploaded = await articlesApi.uploadImage(fileUri);
      setCoverImage(uploaded.url);
    } catch (error) {
      Alert.alert(
        "Cover yuklanmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !markdown.trim() || saving) {
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        excerpt: excerpt.trim(),
        markdown: markdown.trim(),
        coverImage: coverImage.trim(),
        tags,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.editorKeyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={[styles.editorOverlay, isPhoneLayout && styles.editorOverlayPhone]}
          onPress={onClose}
        >
          <Pressable
            style={[
              styles.editorDialog,
              isPhoneLayout && styles.editorDialogPhone,
              Platform.OS === "android" && keyboardInset > 0
                ? { paddingBottom: keyboardInset }
                : null,
            ]}
            onPress={(event) => event.stopPropagation()}
          >
          <View
            style={[
              styles.editorHeader,
              isTabletLayout && styles.editorHeaderStacked,
              isPhoneLayout && [
                styles.editorHeaderPhone,
                {
                  paddingTop: insets.top + 14,
                },
              ],
            ]}
          >
            <View style={[styles.editorHeaderMeta, isPhoneLayout && styles.editorHeaderMetaPhone]}>
              <Text style={styles.editorTitle}>
                {initialArticle ? "Maqolani tahrirlash" : "Yangi maqola"}
              </Text>
              <Text style={styles.editorSubtitle}>
                Medium uslubidagi markdown editor: cover, inline image, preview va publish.
              </Text>
            </View>
            <View
              style={[
                styles.editorHeaderActions,
                isTabletLayout && styles.editorHeaderActionsStacked,
                isPhoneLayout && styles.editorHeaderActionsPhone,
              ]}
            >
              <View style={[styles.modeSwitch, isPhoneLayout && styles.modeSwitchPhone]}>
                <Pressable
                  style={[
                    styles.modeButton,
                    isPhoneLayout && styles.modeButtonPhone,
                    mode === "write" && styles.modeButtonActive,
                  ]}
                  onPress={() => setMode("write")}
                >
                  <Pencil
                    size={14}
                    color={mode === "write" ? Colors.text : Colors.mutedText}
                  />
                  <Text
                    style={[
                      styles.modeButtonText,
                      mode === "write" && styles.modeButtonTextActive,
                    ]}
                  >
                    Write
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modeButton,
                    isPhoneLayout && styles.modeButtonPhone,
                    mode === "split" && styles.modeButtonActive,
                  ]}
                  onPress={() => setMode("split")}
                >
                  <PanelRight
                    size={14}
                    color={mode === "split" ? Colors.text : Colors.mutedText}
                  />
                  <Text
                    style={[
                      styles.modeButtonText,
                      mode === "split" && styles.modeButtonTextActive,
                    ]}
                  >
                    Split
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modeButton,
                    isPhoneLayout && styles.modeButtonPhone,
                    mode === "preview" && styles.modeButtonActive,
                  ]}
                  onPress={() => setMode("preview")}
                >
                  <Eye
                    size={14}
                    color={mode === "preview" ? Colors.text : Colors.mutedText}
                  />
                  <Text
                    style={[
                      styles.modeButtonText,
                      mode === "preview" && styles.modeButtonTextActive,
                    ]}
                  >
                    Preview
                  </Text>
                </Pressable>
              </View>
              <Pressable
                style={[
                  styles.headerPublishButton,
                  isTabletLayout && styles.headerPublishButtonWide,
                  (!title.trim() || !markdown.trim() || saving) &&
                    styles.publishButtonDisabled,
                ]}
                disabled={!title.trim() || !markdown.trim() || saving}
                onPress={() => void handleSubmit()}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.headerPublishButtonText}>
                    {initialArticle ? "Saqlash" : "Publish"}
                  </Text>
                )}
              </Pressable>
            </View>
            <Pressable
              style={[
                styles.editorCloseCircle,
                isPhoneLayout && styles.editorCloseCirclePhone,
                isPhoneLayout ? { top: insets.top + 12 } : null,
              ]}
              onPress={onClose}
            >
              <X size={18} color={Colors.text} />
            </Pressable>
          </View>

          <View
            style={[
              styles.editorContent,
              mode === "split" &&
                (isCompactLayout ? styles.editorContentStacked : styles.editorContentSplit),
            ]}
          >
            {showEditorPane ? (
              <View
                style={[
                  styles.editorPane,
                  mode === "split" && !isCompactLayout && styles.editorPaneSplit,
                ]}
              >
                <View style={styles.toolbarCard}>
                  <View style={styles.editorFieldHeader}>
                    <Text style={styles.editorFieldLabel}>Markdown asboblari</Text>
                    <Text style={styles.editorFieldMeta}>
                      {uploading ? "Yuklanmoqda..." : `${wordCount}/${articleWordLimit} so'z`}
                    </Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.toolbar}
                    keyboardShouldPersistTaps="handled"
                    style={styles.toolbarScroller}
                  >
                    <Pressable style={styles.toolButton} onPress={() => insertSnippet("**", "**")}>
                      <Bold size={16} color={Colors.text} />
                    </Pressable>
                    <Pressable style={styles.toolButton} onPress={() => insertSnippet("_", "_")}>
                      <Italic size={16} color={Colors.text} />
                    </Pressable>
                    <Pressable style={styles.toolButton} onPress={() => insertSnippet("\n# ")}>
                      <Heading1 size={16} color={Colors.text} />
                    </Pressable>
                    <Pressable style={styles.toolButton} onPress={() => insertSnippet("\n## ")}>
                      <Heading2 size={16} color={Colors.text} />
                    </Pressable>
                    <Pressable style={styles.toolButton} onPress={() => insertSnippet("\n- ")}>
                      <List size={16} color={Colors.text} />
                    </Pressable>
                    <Pressable style={styles.toolButton} onPress={() => insertSnippet("\n1. ")}>
                      <ListOrdered size={16} color={Colors.text} />
                    </Pressable>
                    <Pressable style={styles.toolButton} onPress={() => insertSnippet("\n> ")}>
                      <Quote size={16} color={Colors.text} />
                    </Pressable>
                    <Pressable
                      style={styles.toolButton}
                      onPress={() => insertSnippet("\n```txt\n", "\n```\n")}
                    >
                      <Code2 size={16} color={Colors.text} />
                    </Pressable>
                    <Pressable
                      style={styles.toolButton}
                      onPress={() => void handleUploadInlineImage()}
                    >
                      <ImagePlus size={16} color={uploading ? Colors.subtleText : Colors.text} />
                    </Pressable>
                  </ScrollView>
                </View>

                <ScrollView
                  ref={editorScrollRef}
                  style={styles.editorScroll}
                  contentContainerStyle={[
                    styles.editorPaneContent,
                    isPhoneLayout && styles.editorPaneContentPhone,
                  ]}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                >
                  <View
                    style={styles.editorFieldCard}
                    onLayout={(event) => {
                      editorFieldOffsetsRef.current.title = event.nativeEvent.layout.y;
                    }}
                  >
                    <View style={styles.editorFieldHeader}>
                      <Text style={styles.editorFieldLabel}>Maqola sarlavhasi</Text>
                      <Text style={styles.editorFieldMeta}>
                        {title.trim().length}/{APP_LIMITS.articleTitleChars}
                      </Text>
                    </View>
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      onFocus={() => scrollEditorToField("title")}
                      placeholder="Sarlavha"
                      placeholderTextColor={Colors.subtleText}
                      style={styles.titleInput}
                      maxLength={APP_LIMITS.articleTitleChars}
                    />
                  </View>

                  <View
                    style={styles.editorFieldCard}
                    onLayout={(event) => {
                      editorFieldOffsetsRef.current.excerpt = event.nativeEvent.layout.y;
                    }}
                  >
                    <View style={styles.editorFieldHeader}>
                      <Text style={styles.editorFieldLabel}>Qisqacha mazmun</Text>
                      <Text style={styles.editorFieldMeta}>
                        {excerpt.trim().length}/{APP_LIMITS.articleExcerptChars}
                      </Text>
                    </View>
                    <TextInput
                      value={excerpt}
                      onChangeText={setExcerpt}
                      onFocus={() => scrollEditorToField("excerpt")}
                      placeholder="Qisqacha mazmun"
                      placeholderTextColor={Colors.subtleText}
                      style={styles.excerptInput}
                      multiline
                      maxLength={APP_LIMITS.articleExcerptChars}
                    />
                  </View>

                  <View
                    style={styles.editorFieldCard}
                    onLayout={(event) => {
                      editorFieldOffsetsRef.current.tags = event.nativeEvent.layout.y;
                    }}
                  >
                    <View style={styles.editorFieldHeader}>
                      <Text style={styles.editorFieldLabel}>Teglar</Text>
                      <Text style={styles.editorFieldMeta}>
                        {tags.length}/{APP_LIMITS.articleTagCount}
                      </Text>
                    </View>
                    <TextInput
                      value={tagsText}
                      onChangeText={setTagsText}
                      onFocus={() => scrollEditorToField("tags")}
                      placeholder="tag1, tag2, tag3"
                      placeholderTextColor={Colors.subtleText}
                      style={styles.tagsInput}
                    />
                  </View>

                  <View
                    style={styles.editorFieldCard}
                    onLayout={(event) => {
                      editorFieldOffsetsRef.current.cover = event.nativeEvent.layout.y;
                    }}
                  >
                    <View style={styles.editorFieldHeader}>
                      <Text style={styles.editorFieldLabel}>Cover image</Text>
                      <Text style={styles.editorFieldMeta}>
                        {uploading ? "Yuklanmoqda..." : coverImage ? "Tayyor" : "Ixtiyoriy"}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.coverUploadCard, isPhoneLayout && styles.coverUploadCardPhone]}
                      onPress={() => void handleUploadCover()}
                    >
                      {coverImage ? (
                        <PersistentCachedImage
                          remoteUri={coverImage}
                          style={styles.coverPreview}
                          requireManualDownload
                        />
                      ) : (
                        <View style={styles.coverUploadHint}>
                          <ImagePlus size={26} color={Colors.text} />
                          <Text style={styles.coverUploadHintTitle}>
                            {uploading ? "Cover yuklanmoqda..." : "Cover rasm yuklash"}
                          </Text>
                          <Text style={styles.coverUploadHintText}>
                            Frontenddagi kabi hero cover shu yerdan tanlanadi.
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  </View>

                  <View
                    style={styles.editorFieldCard}
                    onLayout={(event) => {
                      editorFieldOffsetsRef.current.markdown = event.nativeEvent.layout.y;
                    }}
                  >
                    <View style={styles.editorFieldHeader}>
                      <Text style={styles.editorFieldLabel}>Markdown kontent</Text>
                      <Text style={styles.editorFieldMeta}>
                        {markdown.trim() ? "Live preview tayyor" : "Kontent yozishni boshlang"}
                      </Text>
                    </View>
                    <TextInput
                      value={markdown}
                      onChangeText={setMarkdown}
                      onFocus={() => scrollEditorToField("markdown")}
                      onSelectionChange={(event) => {
                        setSelection(event.nativeEvent.selection);
                      }}
                      placeholder="Markdown yozing..."
                      placeholderTextColor={Colors.subtleText}
                      style={styles.markdownInput}
                      multiline
                      textAlignVertical="top"
                    />
                  </View>
                </ScrollView>
              </View>
            ) : null}

            {showPreviewPane ? (
              <ScrollView
                style={[
                  styles.previewPane,
                  mode === "split" && !isCompactLayout && styles.previewPaneSplit,
                ]}
                contentContainerStyle={[
                  styles.previewPaneContent,
                  isPhoneLayout && styles.previewPaneContentPhone,
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              >
                <View style={styles.previewPanel}>
                  <View style={styles.previewHeader}>
                    <View>
                      <Text style={styles.previewEyebrow}>Live preview</Text>
                      <Text style={styles.previewHeaderTitle}>Frontend ko'rinishi</Text>
                    </View>
                    <View style={styles.previewBadge}>
                      <Eye size={14} color={Colors.text} />
                      <Text style={styles.previewBadgeText}>
                        {mode === "split" ? "Split" : "Preview"}
                      </Text>
                    </View>
                  </View>
                  {coverImage ? (
                    <PersistentCachedImage
                      remoteUri={coverImage}
                      style={styles.previewCover}
                      requireManualDownload
                    />
                  ) : null}
                  <Text style={styles.previewTitle}>{title || "Sarlavha"}</Text>
                  {excerpt ? <Text style={styles.previewExcerpt}>{excerpt}</Text> : null}
                  {tags.length ? (
                    <View style={styles.previewTagRow}>
                      {tags.map((tag) => (
                        <View key={tag} style={styles.previewTag}>
                          <Text style={styles.previewTagText}>#{tag}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <ArticleMarkdownRenderer
                    content={markdown || "Markdown preview shu yerda chiqadi."}
                  />
                </View>
              </ScrollView>
            ) : null}
          </View>

          <View
            style={[
              styles.editorFooter,
              { paddingBottom: Math.max(insets.bottom, 14) },
            ]}
          >
            <Text style={styles.editorCounter}>
              {uploading ? "Media yuklanmoqda..." : "Markdown va preview doim birga yangilanadi"}
            </Text>
            <Text
              style={[
                styles.editorCounter,
                wordCount > articleWordLimit && styles.editorCounterDanger,
              ]}
            >
              {wordCount}/{articleWordLimit} so'z
            </Text>
          </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ArticlesScreen({ navigation, route }: Props) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const currentUserId = getEntityId(user);
  const [query, setQuery] = useState("");
  const [selectedArticleIdentifier, setSelectedArticleIdentifier] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<ArticleSummary | null>(null);
  const viewedRef = useRef(new Set<string>());

  const articlesQuery = useQuery({
    queryKey: ["articles"],
    queryFn: () => articlesApi.fetchArticles(1, 40),
  });

  const selectedArticleQuery = useQuery({
    queryKey: ["article", selectedArticleIdentifier],
    queryFn: () => articlesApi.getArticle(selectedArticleIdentifier || ""),
    enabled: Boolean(selectedArticleIdentifier),
  });

  const selectedArticleContentQuery = useQuery({
    queryKey: ["article-content", selectedArticleIdentifier],
    queryFn: () => articlesApi.getArticleContent(selectedArticleIdentifier || ""),
    enabled: Boolean(selectedArticleIdentifier),
  });

  const likeMutation = useMutation({
    mutationFn: (identifier: string) => articlesApi.likeArticle(identifier),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["articles"] });
      if (selectedArticleIdentifier) {
        await queryClient.invalidateQueries({
          queryKey: ["article", selectedArticleIdentifier],
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["liked-articles"] });
      await queryClient.invalidateQueries({ queryKey: ["profile-articles", currentUserId] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      excerpt: string;
      markdown: string;
      coverImage: string;
      tags: string[];
    }) => articlesApi.createArticle(payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["articles"] });
      await queryClient.invalidateQueries({ queryKey: ["profile-articles", currentUserId] });
      setSelectedArticleIdentifier(created.slug || created._id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      identifier,
      payload,
    }: {
      identifier: string;
      payload: {
        title: string;
        excerpt: string;
        markdown: string;
        coverImage: string;
        tags: string[];
      };
    }) => articlesApi.updateArticle(identifier, payload),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ["articles"] });
      await queryClient.invalidateQueries({ queryKey: ["profile-articles", currentUserId] });
      await queryClient.invalidateQueries({ queryKey: ["article", selectedArticleIdentifier] });
      await queryClient.invalidateQueries({
        queryKey: ["article-content", selectedArticleIdentifier],
      });
      setSelectedArticleIdentifier(updated.slug || updated._id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (identifier: string) => articlesApi.deleteArticle(identifier),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["articles"] });
      await queryClient.invalidateQueries({ queryKey: ["profile-articles", currentUserId] });
      setSelectedArticleIdentifier(null);
    },
  });

  useEffect(() => {
    const deepLinkedArticleId = String(route.params?.articleId || "").trim();
    if (!deepLinkedArticleId) {
      return;
    }

    setSelectedArticleIdentifier(deepLinkedArticleId);
    navigation.setParams({ articleId: undefined });
  }, [navigation, route.params?.articleId]);

  useEffect(() => {
    const currentArticle = selectedArticleQuery.data;
    if (!currentArticle?._id) {
      return;
    }

    if (currentArticle.previouslySeen || viewedRef.current.has(currentArticle._id)) {
      return;
    }

    viewedRef.current.add(currentArticle._id);
    void articlesApi.viewArticle(currentArticle._id).then((viewStats) => {
      queryClient.setQueryData<ArticleSummary | undefined>(
        ["article", selectedArticleIdentifier],
        (previous) =>
          previous
            ? {
                ...previous,
                views: viewStats.views || previous.views,
                previouslySeen: true,
              }
            : previous,
      );
      void queryClient.invalidateQueries({ queryKey: ["articles"] });
    });
  }, [queryClient, selectedArticleIdentifier, selectedArticleQuery.data]);

  const filteredArticles = useMemo(() => {
    const items = articlesQuery.data?.data || [];
    const needle = query.trim().toLowerCase();
    if (!needle) return items;

    return items.filter((article) => {
      const author = article.author?.nickname || article.author?.username || "";
      return [article.title, article.excerpt, author]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [articlesQuery.data?.data, query]);

  const currentArticle = selectedArticleQuery.data || null;
  const isOwnArticle = Boolean(
    currentArticle?.author && getEntityId(currentArticle.author) === currentUserId,
  );
  const articleWordLimit = getTierLimit(
    APP_LIMITS.articleWords,
    user?.premiumStatus,
  );

  const handleOpenArticle = async (identifier: string) => {
    await Haptics.selectionAsync();
    setSelectedArticleIdentifier(identifier);
  };

  const handleDeleteArticle = () => {
    if (!currentArticle) return;

    Alert.alert("Maqolani o'chirish", "Haqiqatan ham bu maqolani o'chirmoqchimisiz?", [
      { text: "Bekor qilish", style: "cancel" },
      {
        text: "O'chirish",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate(currentArticle.slug || currentArticle._id);
        },
      },
    ]);
  };

  const handleSubmitArticle = async (payload: {
    title: string;
    excerpt: string;
    markdown: string;
    coverImage: string;
    tags: string[];
  }) => {
    if (countWords(payload.markdown) > articleWordLimit) {
      Alert.alert("Limit", `Maqola maksimal ${articleWordLimit} so'z bo'lishi kerak.`);
      return;
    }

    try {
      if (editingArticle) {
        await updateMutation.mutateAsync({
          identifier: editingArticle.slug || editingArticle._id,
          payload,
        });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setEditorOpen(false);
      setEditingArticle(null);
    } catch (error) {
      Alert.alert(
        "Maqola saqlanmadi",
        error instanceof Error ? error.message : "Noma'lum xatolik yuz berdi.",
      );
    }
  };

  if (selectedArticleIdentifier) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <View style={styles.readerContainer}>
          <View style={styles.readerHeader}>
            <Pressable
              style={styles.readerHeaderButton}
              onPress={() => setSelectedArticleIdentifier(null)}
            >
              <ArrowLeft size={18} color={Colors.text} />
            </Pressable>
            <Text style={styles.readerHeaderTitle} numberOfLines={1}>
              {currentArticle?.title || "Article"}
            </Text>
            <View style={styles.readerHeaderActions}>
              {isOwnArticle ? (
                <>
                  <Pressable
                    style={styles.readerHeaderButton}
                    onPress={() => {
                      setEditingArticle(currentArticle);
                      setEditorOpen(true);
                    }}
                  >
                    <Pencil size={17} color={Colors.text} />
                  </Pressable>
                  <Pressable style={styles.readerHeaderButton} onPress={handleDeleteArticle}>
                    <Trash2 size={17} color={Colors.danger} />
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>

          {selectedArticleQuery.isLoading || selectedArticleContentQuery.isLoading ? (
            <View style={styles.loaderState}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : !currentArticle ? (
            <View style={styles.loaderState}>
              <Text style={styles.emptyText}>Maqola topilmadi</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.readerScroll}
              contentContainerStyle={styles.readerContent}
              showsVerticalScrollIndicator={false}
            >
              {currentArticle.coverImage ? (
                <PersistentCachedImage
                  remoteUri={currentArticle.coverImage}
                  style={styles.readerCover}
                  requireManualDownload
                />
              ) : null}

              <Text style={styles.readerTitle}>{currentArticle.title}</Text>
              {currentArticle.excerpt ? (
                <Text style={styles.readerExcerpt}>{currentArticle.excerpt}</Text>
              ) : null}

              <View style={styles.readerMeta}>
                <UserDisplayName
                  user={currentArticle.author}
                  fallback={
                    currentArticle.author?.nickname ||
                    currentArticle.author?.username ||
                    "Author"
                  }
                  size="sm"
                  textStyle={styles.readerAuthor}
                />
                <Text style={styles.readerMetaDot}>·</Text>
                <Text style={styles.readerMetaText}>
                  {new Date(
                    currentArticle.publishedAt || currentArticle.createdAt || Date.now(),
                  ).toLocaleDateString("uz-UZ", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              </View>

              <View style={styles.readerActions}>
                <Pressable
                  style={[
                    styles.readerActionButton,
                    currentArticle.liked && styles.readerActionButtonActive,
                  ]}
                  onPress={() => likeMutation.mutate(currentArticle.slug || currentArticle._id)}
                >
                  <Heart
                    size={16}
                    color={currentArticle.liked ? Colors.danger : Colors.text}
                    fill={currentArticle.liked ? Colors.danger : "transparent"}
                  />
                  <Text
                    style={[
                      styles.readerActionText,
                      currentArticle.liked && styles.readerActionTextActive,
                    ]}
                  >
                    {currentArticle.likes}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.readerActionButton}
                  onPress={() => setCommentsOpen(true)}
                >
                  <MessageCircle size={16} color={Colors.text} />
                  <Text style={styles.readerActionText}>{currentArticle.comments}</Text>
                </Pressable>

                <View style={styles.readerActionButton}>
                  <Eye size={16} color={Colors.text} />
                  <Text style={styles.readerActionText}>{currentArticle.views}</Text>
                </View>
              </View>

              <View style={styles.readerDivider} />
              <ArticleMarkdownRenderer
                content={selectedArticleContentQuery.data?.content || ""}
              />
            </ScrollView>
          )}
        </View>

        <ArticleCommentsModal
          visible={commentsOpen}
          article={currentArticle}
          onClose={() => setCommentsOpen(false)}
          onCommentsCountChange={(count) => {
            queryClient.setQueryData<ArticleSummary | undefined>(
              ["article", selectedArticleIdentifier],
              (previous) => (previous ? { ...previous, comments: count } : previous),
            );
            void queryClient.invalidateQueries({ queryKey: ["articles"] });
          }}
        />

        <ArticleEditorModal
          visible={editorOpen}
          articleWordLimit={articleWordLimit}
          initialArticle={
            editingArticle
              ? {
                  title: editingArticle.title || "",
                  excerpt: editingArticle.excerpt || "",
                  markdown: selectedArticleContentQuery.data?.content || "",
                  coverImage: editingArticle.coverImage || "",
                  tags: editingArticle.tags || [],
                }
              : null
          }
          onClose={() => {
            setEditorOpen(false);
            setEditingArticle(null);
          }}
          onSubmit={handleSubmitArticle}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <View style={styles.listHeader}>
          <View style={styles.headerSearchWrap}>
            <Ionicons name="search-outline" size={16} color={Colors.subtleText} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Maqola qidirish..."
              placeholderTextColor={Colors.subtleText}
              style={styles.searchInput}
            />
          </View>
          <View style={styles.listHeaderActions}>
            <Pressable
              style={styles.addButton}
              onPress={() => {
                setEditingArticle(null);
                setEditorOpen(true);
              }}
            >
              <Plus size={18} color={Colors.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.listScroll}
          refreshControl={
            <RefreshControl
              refreshing={articlesQuery.isRefetching}
              onRefresh={() => articlesQuery.refetch()}
              tintColor={Colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {articlesQuery.isLoading ? (
            <View style={styles.loaderState}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : filteredArticles.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="newspaper-outline" size={30} color={Colors.mutedText} />
              <Text style={styles.emptyTitle}>Maqolalar topilmadi</Text>
              <Text style={styles.emptyText}>
                Qidiruvni o'zgartiring yoki yangi maqola yarating.
              </Text>
            </View>
          ) : (
            filteredArticles.map((article) => {
              const target = article.slug || article._id;
              return (
                <Pressable
                  key={article._id}
                  style={styles.articleItem}
                  onPress={() => void handleOpenArticle(target)}
                >
                  <View style={styles.articleThumb}>
                    {article.coverImage ? (
                      <PersistentCachedImage
                        remoteUri={article.coverImage}
                        style={styles.articleThumbImage}
                        requireManualDownload
                      />
                    ) : null}
                  </View>
                  <View style={styles.articleItemBody}>
                    <Text style={styles.articleItemTitle} numberOfLines={2}>
                      {article.title}
                    </Text>
                    <Text style={styles.articleItemExcerpt} numberOfLines={2}>
                      {article.excerpt || "Qisqacha mazmun mavjud emas"}
                    </Text>
                    <View style={styles.articleItemMeta}>
                      <Text style={styles.articleItemMetaText}>
                        {article.author?.nickname || article.author?.username || "Author"}
                      </Text>
                      <Text style={styles.articleItemMetaText}>{article.likes} like</Text>
                      <Text style={styles.articleItemMetaText}>{article.comments} izoh</Text>
                    </View>
                    <Text style={styles.articleItemTime}>
                      {timeAgo(article.publishedAt || article.createdAt)}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

      </View>

      <ArticleEditorModal
        visible={editorOpen}
        articleWordLimit={articleWordLimit}
        initialArticle={null}
        onClose={() => {
          setEditorOpen(false);
          setEditingArticle(null);
        }}
        onSubmit={handleSubmitArticle}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listHeader: {
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerSearchWrap: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  listHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 120,
    gap: 12,
  },
  loaderState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    color: Colors.mutedText,
    textAlign: "center",
    lineHeight: 20,
  },
  articleItem: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 12,
  },
  articleThumb: {
    width: 92,
    height: 92,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: Colors.input,
    flexShrink: 0,
  },
  articleThumbImage: {
    width: "100%",
    height: "100%",
  },
  articleItemBody: {
    flex: 1,
    minWidth: 0,
  },
  articleItemTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  articleItemExcerpt: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  articleItemMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  articleItemMetaText: {
    color: Colors.subtleText,
    fontSize: 12,
  },
  articleItemTime: {
    color: Colors.subtleText,
    fontSize: 11,
    marginTop: 8,
  },
  readerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  readerHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  readerHeaderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  readerHeaderTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },
  readerHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readerScroll: {
    flex: 1,
  },
  readerContent: {
    padding: 18,
    paddingBottom: 34,
  },
  readerCover: {
    width: "100%",
    aspectRatio: 1.7,
    borderRadius: 22,
    marginBottom: 18,
  },
  readerTitle: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  readerExcerpt: {
    color: Colors.mutedText,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 12,
  },
  readerMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  readerAuthor: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  readerMetaDot: {
    color: Colors.mutedText,
  },
  readerMetaText: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  readerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
  },
  readerActionButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  readerActionButtonActive: {
    borderColor: Colors.danger,
    backgroundColor: "rgba(240,71,71,0.08)",
  },
  readerActionText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  readerActionTextActive: {
    color: Colors.danger,
  },
  readerDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 20,
  },
  markdownRoot: {
    gap: 14,
  },
  markdownHeading: {
    color: Colors.text,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  markdownH1: {
    fontSize: 32,
    lineHeight: 38,
    marginTop: 12,
  },
  markdownH2: {
    fontSize: 24,
    lineHeight: 30,
    marginTop: 10,
  },
  markdownH3: {
    fontSize: 19,
    lineHeight: 24,
    marginTop: 8,
  },
  markdownParagraph: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 30,
  },
  markdownStrong: {
    fontWeight: "800",
    color: Colors.text,
  },
  markdownEm: {
    fontStyle: "italic",
  },
  markdownInlineCode: {
    fontFamily: "Courier",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  markdownLink: {
    color: "#7DB6FF",
    textDecorationLine: "underline",
  },
  markdownQuote: {
    borderLeftWidth: 3,
    borderLeftColor: "rgba(88,101,242,0.55)",
    backgroundColor: "rgba(88,101,242,0.06)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  markdownQuoteText: {
    color: Colors.mutedText,
    fontSize: 15,
    lineHeight: 24,
    fontStyle: "italic",
  },
  markdownList: {
    gap: 8,
  },
  markdownListRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  markdownListBullet: {
    color: Colors.mutedText,
    fontSize: 16,
    lineHeight: 28,
    width: 24,
  },
  markdownListText: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    lineHeight: 28,
  },
  markdownCodeBlock: {
    borderRadius: 18,
    backgroundColor: "#101827",
  },
  markdownCodeInner: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  markdownCodeText: {
    color: "#f8fafc",
    fontFamily: "Courier",
    fontSize: 13,
    lineHeight: 20,
  },
  markdownHr: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  markdownImage: {
    width: "100%",
    aspectRatio: 1.6,
    borderRadius: 20,
  },
  commentsOverlay: {
    flex: 1,
    backgroundColor: "rgba(8, 15, 28, 0.62)",
    justifyContent: "flex-end",
  },
  commentsModal: {
    width: "100%",
    height: "82%",
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  commentsHeader: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  commentsTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  closeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.hover,
    alignItems: "center",
    justifyContent: "center",
  },
  commentsBody: {
    flex: 1,
  },
  commentsBodyContent: {
    padding: 18,
    paddingBottom: 24,
  },
  commentsEmpty: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  commentsEmptyText: {
    color: Colors.mutedText,
    fontSize: 14,
  },
  commentRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  commentCard: {
    flex: 1,
    minWidth: 0,
  },
  commentBubble: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  commentAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  commentAuthor: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  commentMeta: {
    color: Colors.mutedText,
    fontSize: 12,
  },
  commentText: {
    color: Colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  replyButton: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  replyButtonText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  repliesWrap: {
    marginTop: 10,
    marginLeft: 8,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: Colors.border,
    gap: 10,
  },
  replyRow: {
    flexDirection: "row",
    gap: 10,
  },
  loadMoreButton: {
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.input,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  loadMoreText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  commentsInputWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 14,
    backgroundColor: Colors.surface,
  },
  replyingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.hover,
    marginBottom: 10,
  },
  replyingText: {
    flex: 1,
    color: Colors.mutedText,
    fontSize: 13,
  },
  commentsForm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  commentComposer: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 6,
    gap: 8,
  },
  commentInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    minHeight: 40,
  },
  sendFab: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendFabDisabled: {
    opacity: 0.5,
  },
  editorOverlay: {
    flex: 1,
    backgroundColor: "rgba(8,15,28,0.72)",
    justifyContent: "center",
    padding: 12,
  },
  editorKeyboard: {
    flex: 1,
  },
  editorOverlayPhone: {
    padding: 0,
  },
  editorDialog: {
    width: "100%",
    height: "100%",
    maxHeight: "100%",
    backgroundColor: "#121A27",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  editorDialogPhone: {
    borderRadius: 0,
    borderWidth: 0,
  },
  editorHeader: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    backgroundColor: "rgba(18,26,39,0.94)",
  },
  editorHeaderStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  editorHeaderPhone: {
    paddingLeft: 12,
    paddingBottom: 12,
    position: "relative",
  },
  editorHeaderMeta: {
    flex: 1,
    minWidth: 0,
  },
  editorHeaderMetaPhone: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
    paddingRight: 52,
    zIndex: 1,
  },
  editorTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  editorSubtitle: {
    color: Colors.mutedText,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  editorHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  editorHeaderActionsStacked: {
    width: "100%",
    flexWrap: "wrap",
  },
  editorHeaderActionsPhone: {
    alignItems: "stretch",
    width: "100%",
  },
  modeSwitch: {
    flexDirection: "row",
    backgroundColor: "rgba(8,15,28,0.38)",
    borderRadius: 999,
    padding: 4,
    flexShrink: 1,
  },
  modeSwitchPhone: {
    width: "100%",
    borderRadius: 18,
  },
  modeButton: {
    minWidth: 78,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 6,
  },
  modeButtonPhone: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    paddingHorizontal: 8,
  },
  modeButtonActive: {
    backgroundColor: Colors.surface,
  },
  modeButtonText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  modeButtonTextActive: {
    color: Colors.text,
  },
  editorCloseCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(8,15,28,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  editorCloseCirclePhone: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    zIndex: 3,
  },
  headerPublishButton: {
    minWidth: 108,
    height: 40,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  headerPublishButtonWide: {
    flexGrow: 1,
  },
  headerPublishButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  editorContent: {
    flex: 1,
    minHeight: 0,
  },
  editorContentSplit: {
    flexDirection: "row",
  },
  editorContentStacked: {
    flexDirection: "column",
  },
  editorPane: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "rgba(18,26,39,0.82)",
  },
  editorPaneSplit: {
    flex: 1.08,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  editorScroll: {
    flex: 1,
    minHeight: 0,
  },
  editorPaneContent: {
    padding: 22,
    gap: 14,
  },
  editorPaneContentPhone: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 24,
  },
  editorFieldCard: {
    gap: 8,
  },
  editorFieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  editorFieldLabel: {
    color: Colors.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },
  editorFieldMeta: {
    color: Colors.mutedText,
    fontSize: 11,
    fontWeight: "600",
  },
  titleInput: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 14,
  },
  excerptInput: {
    minHeight: 82,
    borderRadius: 16,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  tagsInput: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
  },
  toolbarCard: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: "rgba(18,26,39,0.88)",
  },
  toolbarScroller: {
    flexGrow: 0,
  },
  toolbar: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
  toolButton: {
    minWidth: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  coverUploadCard: {
    minHeight: 180,
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(88,101,242,0.36)",
    backgroundColor: "rgba(88,101,242,0.08)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  coverUploadCardPhone: {
    minHeight: 148,
    borderRadius: 18,
  },
  coverUploadHint: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
  },
  coverUploadHintTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  coverUploadHintText: {
    color: Colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  coverPreview: {
    width: "100%",
    height: "100%",
  },
  markdownInput: {
    minHeight: 320,
    borderRadius: 18,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  previewPane: {
    flex: 1,
    minHeight: 0,
  },
  previewPaneSplit: {
    flex: 0.92,
  },
  previewPaneContent: {
    padding: 28,
    gap: 12,
  },
  previewPaneContentPhone: {
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 36,
  },
  previewPanel: {
    gap: 12,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
  },
  previewEyebrow: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  previewHeaderTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 3,
  },
  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(8,15,28,0.42)",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewBadgeText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  previewCover: {
    width: "100%",
    aspectRatio: 1.8,
    borderRadius: 28,
  },
  previewTitle: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  previewExcerpt: {
    color: Colors.mutedText,
    fontSize: 17,
    lineHeight: 28,
  },
  previewTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  previewTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(8,15,28,0.42)",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewTagText: {
    color: Colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  editorFooter: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "rgba(18,26,39,0.96)",
  },
  editorCounter: {
    color: Colors.mutedText,
    fontSize: 12,
    flex: 1,
  },
  editorCounterDanger: {
    color: Colors.danger,
  },
  publishButtonDisabled: {
    opacity: 0.5,
  },
});
