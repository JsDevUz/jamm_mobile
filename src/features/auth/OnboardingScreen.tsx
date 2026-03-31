import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  AlertCircle,
  AtSign,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code,
  Globe,
  Hash,
  Rocket,
  Target,
  User,
  Zap,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { TextInput } from "../../components/TextInput";
import { usersApi } from "../../lib/api";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

type OnboardingData = {
  username: string;
  gender: string;
  age: string;
  interests: string[];
  goals: string[];
  level: string;
};

type ChoiceItem = {
  id: string;
  label: string;
  icon: typeof Code;
};

const INTERESTS: ChoiceItem[] = [
  { id: "dev", label: "Dasturlash", icon: Code },
  { id: "sci", label: "Fan va Texnika", icon: Zap },
  { id: "lang", label: "Tillar", icon: Globe },
  { id: "math", label: "Matematika", icon: BookOpen },
];

const GOALS: ChoiceItem[] = [
  { id: "learn", label: "O'rganish", icon: BookOpen },
  { id: "compete", label: "Musobaqalashish", icon: Award },
  { id: "fun", label: "Ko'ngilochar", icon: Rocket },
  { id: "social", label: "Muloqot", icon: Target },
];

const LEVELS: ChoiceItem[] = [
  { id: "beg", label: "Boshlang'ich", icon: BarChart3 },
  { id: "int", label: "O'rta daraja", icon: BarChart3 },
  { id: "adv", label: "Kuchli bilim", icon: BarChart3 },
];

const totalSteps = 5;

export function OnboardingScreen(_: Props) {
  const setUser = useAuthStore((state) => state.setUser);
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>({
    username: "",
    gender: "",
    age: "",
    interests: [],
    goals: [],
    level: "",
  });
  const [usernameError, setUsernameError] = useState("");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [flowError, setFlowError] = useState("");

  useEffect(() => {
    const username = data.username.trim().toLowerCase();

    if (!username) {
      setUsernameError("");
      setUsernameAvailable(false);
      setIsCheckingUsername(false);
      return;
    }

    const regex = /^[a-zA-Z0-9]{8,30}$/;
    if (!regex.test(username)) {
      setUsernameError("Kamida 8 ta harf yoki raqam bo'lsin");
      setUsernameAvailable(false);
      setIsCheckingUsername(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsCheckingUsername(true);
      void usersApi
        .checkUsernameAvailability(username)
        .then((response) => {
          if (cancelled) return;
          if (response.available) {
            setUsernameError("");
            setUsernameAvailable(true);
          } else {
            setUsernameError("Bu username band");
            setUsernameAvailable(false);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setUsernameError("Username tekshirib bo'lmadi");
          setUsernameAvailable(false);
        })
        .finally(() => {
          if (!cancelled) {
            setIsCheckingUsername(false);
          }
        });
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [data.username]);

  const toggleMultiSelect = useCallback(
    (field: "interests" | "goals", id: string) => {
      setFlowError("");
      setData((prev) => ({
        ...prev,
        [field]: prev[field].includes(id)
          ? prev[field].filter((item) => item !== id)
          : [...prev[field], id],
      }));
    },
    [],
  );

  const validateStep = useCallback(() => {
    if (step === 2 && data.interests.length === 0) {
      return "Kamida bitta qiziqish tanlang";
    }
    if (step === 3 && data.goals.length === 0) {
      return "Kamida bitta maqsad tanlang";
    }
    if (step === 4 && !data.level) {
      return "Bilim darajangizni tanlang";
    }
    if (step === 5) {
      const ageNum = Number(data.age);
      if (!data.username.trim()) return "Username kiriting";
      if (!usernameAvailable) return "Yaroqli username tanlang";
      if (!data.gender) return "Jinsingizni tanlang";
      if (!data.age.trim()) return "Yoshingizni kiriting";
      if (!Number.isFinite(ageNum) || ageNum < 4 || ageNum > 100) {
        return "Yosh 4 va 100 oralig'ida bo'lishi kerak";
      }
    }
    return "";
  }, [data.age, data.gender, data.goals.length, data.interests.length, data.level, data.username, step, usernameAvailable]);

  const handleNext = useCallback(async () => {
    const error = validateStep();
    if (error) {
      setFlowError(error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setFlowError("");

    if (step < totalSteps) {
      void Haptics.selectionAsync();
      setStep((current) => current + 1);
      return;
    }

    setSubmitting(true);
    try {
      const updatedUser = await usersApi.completeOnboarding({
        username: data.username.trim().toLowerCase(),
        gender: data.gender,
        age: Number(data.age),
        interests: data.interests,
        goals: data.goals,
        level: data.level,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUser(updatedUser);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Xatolik yuz berdi. Qaytadan urinib ko'ring.";
      setFlowError(message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  }, [data.age, data.gender, data.goals, data.interests, data.level, data.username, setUser, step, validateStep]);

  const handleBack = useCallback(() => {
    if (step === 1) return;
    setFlowError("");
    void Haptics.selectionAsync();
    setStep((current) => current - 1);
  }, [step]);

  const renderChoiceGrid = (items: ChoiceItem[], selectedIds: string[], onPress: (id: string) => void) => (
    <View style={styles.optionGrid}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = selectedIds.includes(item.id);
        return (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.optionCard,
              active && styles.optionCardActive,
              pressed && styles.optionCardPressed,
            ]}
            onPress={() => onPress(item.id)}
          >
            <Icon size={24} color={active ? Colors.primary : Colors.subtleText} />
            <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderSingleChoiceGrid = (items: ChoiceItem[], selectedId: string, onPress: (id: string) => void) => (
    <View style={styles.optionGrid}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = selectedId === item.id;
        return (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.optionCard,
              active && styles.optionCardActive,
              pressed && styles.optionCardPressed,
            ]}
            onPress={() => {
              setFlowError("");
              onPress(item.id);
            }}
          >
            <Icon size={24} color={active ? Colors.primary : Colors.subtleText} />
            <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconWrapper}>
              <Rocket size={40} color={Colors.primary} />
            </View>
            <Text style={styles.title}>Xush kelibsiz!</Text>
            <Text style={styles.description}>
              Platformamizga xush kelibsiz! Bu yerda siz bilimlaringizni sinovdan
              o'tkazishingiz, boshqalar bilan bellashishingiz va qiziqarli muloqot
              qilishingiz mumkin.
              {"\n\n"}
              Tajribangizni sizga moslashtirish uchun bir necha savolga javob
              beramiz.
            </Text>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconWrapper}>
              <Target size={40} color={Colors.primary} />
            </View>
            <Text style={styles.title}>Qiziqishlaringiz?</Text>
            <Text style={styles.description}>
              Sizni qaysi yo'nalishlar ko'proq qiziqtiradi? Bir nechta tanlash mumkin.
            </Text>
            {renderChoiceGrid(INTERESTS, data.interests, (id) => toggleMultiSelect("interests", id))}
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconWrapper}>
              <Award size={40} color={Colors.primary} />
            </View>
            <Text style={styles.title}>Asosiy maqsadlaringiz?</Text>
            <Text style={styles.description}>
              Platformadan qaysi maqsadda foydalanmoqchisiz?
            </Text>
            {renderChoiceGrid(GOALS, data.goals, (id) => toggleMultiSelect("goals", id))}
          </View>
        );
      case 4:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconWrapper}>
              <CheckCircle2 size={40} color={Colors.primary} />
            </View>
            <Text style={styles.title}>Bilim darajangiz?</Text>
            <Text style={styles.description}>
              Hozirgi bilim darajangizni qanday baholaysiz?
            </Text>
            {renderSingleChoiceGrid(LEVELS, data.level, (id) =>
              setData((prev) => ({ ...prev, level: id })),
            )}
          </View>
        );
      case 5:
        return (
          <View style={styles.stepContent}>
            <View style={styles.iconWrapper}>
              <User size={40} color={Colors.primary} />
            </View>
            <Text style={styles.title}>Shaxsiy ma'lumotlar</Text>
            <Text style={styles.description}>Profilingizni to'ldiring</Text>

            <View style={styles.formCard}>
              <View style={styles.inputWrap}>
                <AtSign size={16} color={Colors.subtleText} style={styles.inputIcon} />
                <TextInput
                  value={data.username}
                  onChangeText={(value) => {
                    setFlowError("");
                    setUsernameAvailable(false);
                    setData((prev) => ({
                      ...prev,
                      username: value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30),
                    }));
                  }}
                  placeholder="Username"
                  placeholderTextColor={Colors.subtleText}
                  style={[
                    styles.input,
                    usernameError
                      ? styles.inputError
                      : usernameAvailable && data.username
                        ? styles.inputSuccess
                        : null,
                  ]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {isCheckingUsername ? (
                  <ActivityIndicator size="small" color={Colors.mutedText} style={styles.trailingIcon} />
                ) : usernameAvailable && data.username ? (
                  <CheckCircle2 size={16} color={Colors.accent} style={styles.trailingIcon} />
                ) : null}
              </View>

              {usernameError ? (
                <View style={styles.inlineErrorRow}>
                  <AlertCircle size={13} color={Colors.danger} />
                  <Text style={styles.inlineErrorText}>{usernameError}</Text>
                </View>
              ) : null}

              <View style={styles.genderRow}>
                <Pressable
                  style={[
                    styles.genderButton,
                    data.gender === "male" && styles.genderButtonActive,
                  ]}
                  onPress={() => {
                    setFlowError("");
                    setData((prev) => ({ ...prev, gender: "male" }));
                  }}
                >
                  <Text
                    style={[
                      styles.genderButtonText,
                      data.gender === "male" && styles.genderButtonTextActive,
                    ]}
                  >
                    Erkak
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.genderButton,
                    data.gender === "female" && styles.genderButtonActive,
                  ]}
                  onPress={() => {
                    setFlowError("");
                    setData((prev) => ({ ...prev, gender: "female" }));
                  }}
                >
                  <Text
                    style={[
                      styles.genderButtonText,
                      data.gender === "female" && styles.genderButtonTextActive,
                    ]}
                  >
                    Ayol
                  </Text>
                </Pressable>
              </View>

              <View style={styles.inputWrap}>
                <Hash size={16} color={Colors.subtleText} style={styles.inputIcon} />
                <TextInput
                  value={data.age}
                  onChangeText={(value) => {
                    setFlowError("");
                    setData((prev) => ({
                      ...prev,
                      age: value.replace(/[^0-9]/g, "").slice(0, 3),
                    }));
                  }}
                  placeholder="Yoshingiz"
                  placeholderTextColor={Colors.subtleText}
                  style={styles.input}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <View style={styles.progressHeader}>
            {Array.from({ length: totalSteps }).map((_, index) => (
              <View key={index} style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: step >= index + 1 ? "100%" : "0%" },
                  ]}
                />
              </View>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {renderStep()}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={[styles.navButton, step === 1 && styles.navButtonHidden]}
              disabled={step === 1}
              onPress={handleBack}
            >
              <ChevronLeft size={18} color={step === 1 ? "transparent" : Colors.mutedText} />
              <Text style={[styles.navButtonText, step === 1 && styles.navButtonTextHidden]}>
                Orqaga
              </Text>
            </Pressable>

            <View style={styles.footerRight}>
              {flowError ? <Text style={styles.footerError}>{flowError}</Text> : null}
              <Pressable
                style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
                disabled={submitting}
                onPress={() => void handleNext()}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>
                      {step === totalSteps ? "Boshlash" : "Keyingisi"}
                    </Text>
                    <ChevronRight size={18} color="#fff" />
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  progressHeader: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 20,
  },
  stepContent: {
    flexGrow: 1,
    alignItems: "center",
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "rgba(88,101,242,0.1)",
    borderWidth: 1,
    borderColor: "rgba(88,101,242,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    marginTop: 24,
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    color: Colors.mutedText,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    maxWidth: 420,
    width: "100%",
    marginBottom: 28,
  },
  optionGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  optionCard: {
    width: "48%",
    minHeight: 110,
    borderRadius: 16,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  optionCardActive: {
    backgroundColor: "rgba(88,101,242,0.1)",
    borderColor: Colors.primary,
  },
  optionCardPressed: {
    transform: [{ translateY: -1 }],
  },
  optionLabel: {
    color: Colors.mutedText,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  optionLabelActive: {
    color: Colors.text,
  },
  formCard: {
    width: "100%",
    maxWidth: 380,
    gap: 12,
  },
  inputWrap: {
    position: "relative",
    width: "100%",
    justifyContent: "center",
  },
  inputIcon: {
    position: "absolute",
    left: 14,
    zIndex: 1,
  },
  trailingIcon: {
    position: "absolute",
    right: 14,
    zIndex: 1,
  },
  input: {
    width: "100%",
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: Colors.text,
    paddingLeft: 42,
    paddingRight: 42,
    fontSize: 15,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  inputSuccess: {
    borderColor: Colors.accent,
  },
  inlineErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -4,
  },
  inlineErrorText: {
    color: Colors.danger,
    fontSize: 12,
  },
  genderRow: {
    flexDirection: "row",
    gap: 10,
  },
  genderButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  genderButtonActive: {
    backgroundColor: "rgba(88,101,242,0.1)",
    borderColor: Colors.primary,
  },
  genderButtonText: {
    color: Colors.subtleText,
    fontSize: 14,
    fontWeight: "700",
  },
  genderButtonTextActive: {
    color: Colors.text,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: "rgba(32,34,37,0.5)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  navButton: {
    minWidth: 104,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navButtonHidden: {
    opacity: 0,
  },
  navButtonText: {
    color: Colors.mutedText,
    fontSize: 15,
    fontWeight: "700",
  },
  navButtonTextHidden: {
    color: "transparent",
  },
  footerRight: {
    flex: 1,
    alignItems: "flex-end",
    gap: 8,
  },
  footerError: {
    maxWidth: 260,
    color: Colors.danger,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "right",
  },
  primaryButton: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minWidth: 140,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
});
