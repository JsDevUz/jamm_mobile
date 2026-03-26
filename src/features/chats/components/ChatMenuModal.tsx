import { Modal, Pressable, Text, View } from "react-native";
import { Info, Edit2, LogOut, Trash2 } from "lucide-react-native";
import { Colors } from "../../../theme/colors";

export function ChatMenuModal({
  styles,
  visible,
  currentChatIsGroup,
  canEditGroup,
  isGroupOwnerLeaving,
  onClose,
  onOpenInfo,
  onEditGroup,
  onDeleteOrLeave,
}: {
  styles: Record<string, any>;
  visible: boolean;
  currentChatIsGroup: boolean;
  canEditGroup: boolean;
  isGroupOwnerLeaving: boolean;
  onClose: () => void;
  onOpenInfo: () => void;
  onEditGroup: () => void;
  onDeleteOrLeave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuOverlay} onPress={onClose}>
        <View style={styles.menuDropdown} onStartShouldSetResponder={() => true}>
          <Pressable style={styles.menuItem} onPress={onOpenInfo}>
            <Info size={18} color={Colors.text} />
            <Text style={styles.menuItemText}>
              {currentChatIsGroup ? "Guruh ma'lumotlari" : "Foydalanuvchi ma'lumotlari"}
            </Text>
          </Pressable>

          {canEditGroup ? (
            <Pressable style={styles.menuItem} onPress={onEditGroup}>
              <Edit2 size={18} color={Colors.text} />
              <Text style={styles.menuItemText}>Guruhni tahrirlash</Text>
            </Pressable>
          ) : null}

          <View style={styles.menuDivider} />

          <Pressable style={styles.menuItem} onPress={onDeleteOrLeave}>
            {isGroupOwnerLeaving ? (
              <LogOut size={18} color={Colors.danger} />
            ) : (
              <Trash2 size={18} color={Colors.danger} />
            )}
            <Text style={[styles.menuItemText, { color: Colors.danger }]}>
              {isGroupOwnerLeaving ? "Guruhni tark etish" : "Suhbatni o'chirish"}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
