import { Modal, Pressable, Text, View } from "react-native";
import { Avatar } from "../../../components/Avatar";
import { getDirectChatUserLabel } from "../../../utils/chat";

export function OutgoingCallModal({
  styles,
  outgoingCall,
  onCancel,
}: {
  styles: Record<string, any>;
  outgoingCall: {
    remoteUser?: {
      avatar?: string | null;
      nickname?: string;
      username?: string;
      name?: string;
    };
  } | null;
  onCancel: () => void;
}) {
  return (
    <Modal visible={Boolean(outgoingCall)} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.callingOverlay}>
        <View style={styles.callingCard}>
          <Avatar
            label={getDirectChatUserLabel(outgoingCall?.remoteUser) || "User"}
            uri={outgoingCall?.remoteUser?.avatar}
            size={72}
            shape="circle"
          />
          <Text style={styles.callingTitle}>
            {getDirectChatUserLabel(outgoingCall?.remoteUser) || "User"}
          </Text>
          <Text style={styles.callingSubtitle}>Calling...</Text>
          <View style={styles.callingDotsRow}>
            <View style={styles.callingDot} />
            <View style={styles.callingDot} />
            <View style={styles.callingDot} />
          </View>
          <Pressable style={styles.callingCancelButton} onPress={onCancel}>
            <Text style={styles.callingCancelButtonText}>Bekor qilish</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
