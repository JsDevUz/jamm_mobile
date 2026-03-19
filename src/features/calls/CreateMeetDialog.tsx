import { Modal, ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Copy, Video, X } from "lucide-react-native";
import { useI18n } from "../../i18n";
import { Colors } from "../../theme/colors";
import type { MeetSummary } from "../../types/entities";

type Props = {
  visible: boolean;
  meet: MeetSummary | null;
  meetUrl: string;
  loading: boolean;
  copied: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
  onCopy: () => void;
  onStart: () => void;
};

export function CreateMeetDialog({
  visible,
  meet,
  meetUrl,
  loading,
  copied,
  error,
  onClose,
  onRetry,
  onCopy,
  onStart,
}: Props) {
  const { t } = useI18n();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerMeta}>
              <View style={styles.headerIcon}>
                <Video size={20} color="#fff" />
              </View>
              <View style={styles.headerTextWrap}>
                <Text style={styles.title}>{t("chatsSidebar.meetDialog.title")}</Text>
                <Text style={styles.subtitle}>
                  {t("chatsSidebar.meetDialog.subtitle")}
                </Text>
              </View>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <X size={18} color={Colors.text} />
            </Pressable>
          </View>

          <View style={styles.body}>
            {loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.helperText}>{t("chatsSidebar.meetDialog.preparing")}</Text>
              </View>
            ) : error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable style={styles.retryButton} onPress={onRetry}>
                  <Text style={styles.retryText}>Qayta urinish</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.contentStack}>
                <View style={styles.urlCard}>
                  <View style={styles.urlField}>
                    <Text style={styles.urlText}>{meetUrl}</Text>
                  </View>
                  <Pressable style={styles.copyButton} onPress={onCopy}>
                    <Copy size={18} color="#fff" />
                  </Pressable>
                </View>
                <Text style={styles.helperText}>
                  {copied
                    ? t("chatsSidebar.meetDialog.copied")
                    : t("chatsSidebar.meetDialog.singleActive")}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Pressable
              style={[
                styles.startButton,
                (loading || !meet?.roomId || Boolean(error)) && styles.startButtonDisabled,
              ]}
              disabled={loading || !meet?.roomId || Boolean(error)}
              onPress={onStart}
            >
              <Text style={styles.startButtonText}>{t("chatsSidebar.meetDialog.start")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.56)",
    justifyContent: "center",
    padding: 18,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 18,
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 18,
  },
  contentStack: {
    gap: 12,
  },
  urlCard: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.input,
  },
  urlField: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceMuted,
  },
  urlText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  copyButton: {
    width: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  helperText: {
    color: Colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  errorCard: {
    gap: 12,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(240,71,71,0.12)",
  },
  errorText: {
    color: "#f8b4b4",
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceMuted,
  },
  retryText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  footer: {
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  startButton: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  startButtonDisabled: {
    opacity: 0.45,
  },
  startButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
});
