import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
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

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Video size={18} color="#fff" />
          </View>
          <Text style={styles.title}>{t("chatsSidebar.meetDialog.title")}</Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <X size={16} color={Colors.text} />
          </Pressable>
        </View>

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
          <>
            <View style={styles.urlRow}>
              <Text style={styles.urlText} numberOfLines={1}>{meetUrl}</Text>
              <Pressable style={styles.copyButton} onPress={onCopy}>
                {copied ? <X size={16} color="#fff" /> : <Copy size={16} color="#fff" />}
              </Pressable>
            </View>

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
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#11151d",
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginTop: 8,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  title: {
    flex: 1,
    marginHorizontal: 12,
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 24,
  },
  helperText: {
    color: Colors.mutedText,
    fontSize: 13,
  },
  urlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 12,
  },
  urlText: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
  },
  copyButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  errorCard: {
    gap: 10,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "rgba(240,71,71,0.12)",
    marginBottom: 12,
  },
  errorText: {
    color: "#f8b4b4",
    fontSize: 13,
  },
  retryButton: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  retryText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  startButton: {
    height: 44,
    borderRadius: 12,
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
    fontWeight: "700",
  },
});
