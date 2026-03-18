import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { PersistentCachedImage } from "../../../components/PersistentCachedImage";
import type { CourseMember } from "../../../types/courses";
import { Colors } from "../../../theme/colors";
import { adminResourceSectionStyles as styles } from "./adminResourceSectionStyles";

type AdminMembersSectionProps = {
  pendingMembers: CourseMember[];
  approvedMembers: CourseMember[];
  actionTargetId?: string | null;
  getMemberId: (member: CourseMember) => string | undefined;
  getMemberName: (member: CourseMember) => string;
  getMemberAvatar: (member: CourseMember) => string | undefined;
  onApprove: (memberId: string) => void | Promise<void>;
  onRemove: (memberId: string, label: string) => void | Promise<void>;
};

export function AdminMembersSection({
  pendingMembers,
  approvedMembers,
  actionTargetId,
  getMemberId,
  getMemberName,
  getMemberAvatar,
  onApprove,
  onRemove,
}: AdminMembersSectionProps) {
  return (
    <View style={styles.stack}>
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Kutayotganlar ({pendingMembers.length})</Text>
        </View>
        {pendingMembers.length ? (
          <View style={styles.list}>
            {pendingMembers.map((member) => {
              const memberId = String(getMemberId(member) || "");
              const loading = actionTargetId === memberId;
              const avatar = getMemberAvatar(member);
              const name = getMemberName(member);
              return (
                <View key={memberId} style={styles.memberRow}>
                  <View style={styles.memberMeta}>
                    <View style={styles.memberAvatar}>
                      {avatar ? (
                        <PersistentCachedImage remoteUri={avatar} style={styles.memberAvatarImage} />
                      ) : (
                        <Text style={styles.memberAvatarLetter}>
                          {String(name || "?").charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberName}>{name}</Text>
                      <Text style={styles.memberSub}>Tasdiq kutmoqda</Text>
                    </View>
                  </View>
                  <View style={styles.resourceActions}>
                    <Pressable
                      style={styles.inlineAction}
                      disabled={loading}
                      onPress={() => void onApprove(memberId)}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <>
                          <Check size={14} color={Colors.primary} />
                          <Text style={styles.inlineActionText}>Tasdiqlash</Text>
                        </>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.inlineAction, styles.inlineActionDanger]}
                      disabled={loading}
                      onPress={() => void onRemove(memberId, "So'rov")}
                    >
                      <Text style={styles.inlineActionTextDanger}>Rad etish</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>Kutayotgan so'rovlar yo'q.</Text>
        )}
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>A'zolar ({approvedMembers.length})</Text>
        </View>
        {approvedMembers.length ? (
          <View style={styles.list}>
            {approvedMembers.map((member) => {
              const memberId = String(getMemberId(member) || "");
              const loading = actionTargetId === memberId;
              const avatar = getMemberAvatar(member);
              const name = getMemberName(member);
              return (
                <View key={memberId} style={styles.memberRow}>
                  <View style={styles.memberMeta}>
                    <View style={styles.memberAvatar}>
                      {avatar ? (
                        <PersistentCachedImage remoteUri={avatar} style={styles.memberAvatarImage} />
                      ) : (
                        <Text style={styles.memberAvatarLetter}>
                          {String(name || "?").charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberName}>{name}</Text>
                      <Text style={styles.memberSub}>Obuna bo'lingan</Text>
                    </View>
                  </View>
                  <Pressable
                    style={[styles.inlineAction, styles.inlineActionDanger]}
                    disabled={loading}
                    onPress={() => void onRemove(memberId, "A'zo")}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={Colors.danger} />
                    ) : (
                      <Text style={styles.inlineActionTextDanger}>Olib tashlash</Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>Hozircha a'zolar yo'q.</Text>
        )}
      </View>
    </View>
  );
}
