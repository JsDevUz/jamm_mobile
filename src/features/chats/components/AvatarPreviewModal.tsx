import { Modal, Pressable } from "react-native";
import { Image } from "expo-image";

export function AvatarPreviewModal({
  styles,
  visible,
  avatarUri,
  onClose,
}: {
  styles: Record<string, any>;
  visible: boolean;
  avatarUri: string | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.avatarPreviewOverlay} onPress={onClose}>
        {avatarUri ? (
          <Image
            source={{ uri: avatarUri }}
            style={styles.avatarPreviewImage}
            contentFit="contain"
          />
        ) : null}
      </Pressable>
    </Modal>
  );
}
