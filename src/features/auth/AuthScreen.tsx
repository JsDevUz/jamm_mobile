import { useEffect, useState, useTransition } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { TextInput } from "../../components/TextInput";
import { API_BASE_URL } from "../../config/env";
import { authApi } from "../../lib/api";
import { bootstrapPushNotifications } from "../../lib/notifications";
import { setAuthToken } from "../../lib/session";
import type { RootStackParamList } from "../../navigation/types";
import useAuthStore from "../../store/auth-store";
import { Colors } from "../../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Auth">;
type AuthMode = "login" | "signup" | "forgot";

const allowedEmailPattern = /^[^\s@]+@(gmail\.com|jamm\.uz)$/i;

export function AuthScreen(_: Props) {
  const login = useAuthStore((state) => state.login);
  const signup = useAuthStore((state) => state.signup);
  const setUser = useAuthStore((state) => state.setUser);
  const [mode, setMode] = useState<AuthMode>("login");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSwitching, startSwitchTransition] = useTransition();

  const resetFeedback = () => {
    setError("");
    setSuccess("");
  };

  const switchMode = (nextMode: AuthMode, preserveFeedback = false) => {
    void Haptics.selectionAsync();
    startSwitchTransition(() => {
      setMode(nextMode);
      if (!preserveFeedback) {
        resetFeedback();
      }
      if (nextMode !== "signup") {
        setNickname("");
      }
      if (nextMode === "forgot") {
        setPassword("");
      }
    });
  };

  const validateEmail = () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!allowedEmailPattern.test(normalizedEmail)) {
      setError("Faqat gmail.com yoki jamm.uz email ruxsat etiladi.");
      return null;
    }

    return normalizedEmail;
  };

  const handleSubmit = async () => {
    resetFeedback();

    const normalizedEmail = validateEmail();
    if (!normalizedEmail) {
      return;
    }

    if (mode !== "forgot" && password.trim().length < 6) {
      setError("Parol kamida 6 ta belgidan iborat bo'lishi kerak.");
      return;
    }

    if (mode === "signup" && nickname.trim().length < 2) {
      setError("Nickname kamida 2 ta belgidan iborat bo'lsin.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login({
          email: normalizedEmail,
          password,
        });
        return;
      }

      if (mode === "signup") {
        const message = await signup({
          nickname: nickname.trim(),
          email: normalizedEmail,
          password,
        });
        setSuccess(message);
        setPassword("");
        switchMode("login", true);
        return;
      }

      const response = await authApi.forgotPassword({
        email: normalizedEmail,
      });
      setSuccess(
        response.message || "Tiklash havolasi emailingizga yuborildi.",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Autentifikatsiyada xatolik yuz berdi.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      const returnUrl = "jamm://auth/google/callback";
      await Linking.openURL(
        `${API_BASE_URL}/auth/google/start?return_url=${encodeURIComponent(returnUrl)}`,
      );
    } catch {
      Alert.alert("Google auth", "Google orqali kirish ochilmadi.");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const handleGoogleCallbackUrl = async (url?: string | null) => {
      const normalizedUrl = String(url || "").trim();
      if (!normalizedUrl.startsWith("jamm://auth/google/callback")) {
        return;
      }

      try {
        const parsed = new URL(normalizedUrl);
        const googleError = String(
          parsed.searchParams.get("google_error") || "",
        ).trim();
        const accessToken = String(
          parsed.searchParams.get("access_token") || "",
        ).trim();

        if (googleError) {
          if (!cancelled) {
            setError(googleError);
          }
          return;
        }

        if (!accessToken) {
          if (!cancelled) {
            setError("Google orqali kirish yakunlanmadi.");
          }
          return;
        }

        if (!cancelled) {
          setLoading(true);
          resetFeedback();
        }

        await setAuthToken(accessToken);
        const user = await authApi.me();

        if (cancelled) {
          return;
        }

        setUser(user);
        await bootstrapPushNotifications().catch((error) => {
          console.warn("Failed to register push notifications after Google auth", error);
        });
      } catch (callbackError) {
        if (!cancelled) {
          setError(
            callbackError instanceof Error
              ? callbackError.message
              : "Google orqali kirishda xatolik yuz berdi.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void Linking.getInitialURL()
      .then(handleGoogleCallbackUrl)
      .catch(() => undefined);

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleGoogleCallbackUrl(url);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [setUser]);

  const title =
    mode === "login"
      ? "Qaytib kelganingizdan xursandmiz!"
      : mode === "signup"
        ? "Akkaunt yarating"
        : "Parolni unutdingizmi?";

  const subtitle =
    mode === "login"
      ? "Hisobingizga kirish uchun ma'lumotlaringizni kiriting"
      : mode === "signup"
        ? "Ro'yxatdan o'tib, platformaga qo'shiling"
        : "Email manzilingizni kiriting, sizga tiklash havolasini yuboramiz";

  return (
    <View style={styles.background}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.shell}>
            <View style={styles.heroSection}>
              <View style={styles.logoBadge}>
                <Image
                  source={require("../../../assets/icon.png")}
                  style={styles.logoImage}
                  contentFit="cover"
                />
              </View>
              <Text style={styles.logoText}>Jamm</Text>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            {(mode === "login" || mode === "signup") && (
              <View style={styles.tabRow}>
                <Pressable
                  style={[styles.tabButton, mode === "login" && styles.activeTab]}
                  onPress={() => switchMode("login")}
                >
                  <Text
                    style={[styles.tabText, mode === "login" && styles.activeTabText]}
                  >
                    Kirish
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tabButton, mode === "signup" && styles.activeTab]}
                  onPress={() => switchMode("signup")}
                >
                  <Text
                    style={[styles.tabText, mode === "signup" && styles.activeTabText]}
                  >
                    Ro'yxatdan o'tish
                  </Text>
                </Pressable>
              </View>
            )}

            <View style={styles.authCard}>
              <View style={styles.form}>
                {mode === "signup" ? (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Ism (Nikname)</Text>
                    <View style={styles.inputShell}>
                      <Ionicons name="person-outline" size={16} color="#72767d" />
                      <TextInput
                        style={styles.input}
                        value={nickname}
                        onChangeText={setNickname}
                        autoCapitalize="words"
                        placeholder="Nikingiz"
                        placeholderTextColor="#4f545c"
                      />
                    </View>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email</Text>
                  <View style={styles.inputShell}>
                    <Ionicons name="mail-outline" size={16} color="#72767d" />
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholder="username@gmail.com yoki username@jamm.uz"
                      placeholderTextColor="#4f545c"
                    />
                  </View>
                </View>

                {mode !== "forgot" ? (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Parol</Text>
                    <View style={styles.inputShell}>
                      <Ionicons
                        name="lock-closed-outline"
                        size={16}
                        color="#72767d"
                      />
                      <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        placeholder="••••••••"
                        placeholderTextColor="#4f545c"
                      />
                      <Pressable
                        onPress={() => setShowPassword((current) => !current)}
                        hitSlop={10}
                        style={styles.passwordToggle}
                      >
                        <Ionicons
                          name={showPassword ? "eye-off-outline" : "eye-outline"}
                          size={16}
                          color="#72767d"
                        />
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {mode === "login" ? (
                  <View style={styles.inlineActionRow}>
                    <Pressable onPress={() => switchMode("forgot")}>
                      <Text style={styles.ghostLink}>Parolni unutdingizmi?</Text>
                    </Pressable>
                  </View>
                ) : null}

                {success ? (
                  <View style={styles.successBox}>
                    <Text style={styles.successText}>{success}</Text>
                  </View>
                ) : null}

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.submitButton,
                    pressed && styles.submitButtonPressed,
                    (loading || isSwitching) && styles.submitButtonDisabled,
                  ]}
                  disabled={loading || isSwitching}
                  onPress={handleSubmit}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.submitText}>
                        {mode === "login"
                          ? "Kirish"
                          : mode === "signup"
                            ? "Ro'yxatdan o'tish"
                            : "Havolani yuborish"}
                      </Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                  )}
                </Pressable>
              </View>

              {(mode === "login" || mode === "signup") && (
                <>
                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>yoki</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <Pressable
                    style={styles.googleButton}
                    onPress={() => void handleGoogleAuth()}
                  >
                    <Ionicons name="logo-google" size={18} color={Colors.text} />
                    <Text style={styles.googleButtonText}>
                      Google orqali {mode === "login" ? "kirish" : "ro'yxatdan o'tish"}
                    </Text>
                  </Pressable>
                </>
              )}

              <View style={styles.footerBlock}>
                <Text style={styles.footerText}>
                  {mode === "login"
                    ? "Hisobingiz yo'qmi?"
                    : mode === "signup"
                      ? "Hisobingiz bormi?"
                      : "Login sahifasiga qaytish"}
                </Text>
                <Pressable
                  onPress={() =>
                    switchMode(
                      mode === "login" ? "signup" : "login",
                      mode === "forgot",
                    )
                  }
                  hitSlop={12}
                >
                  <Text style={styles.footerLink}>
                    {mode === "login" ? "Ro'yxatdan o'ting" : "Kirish"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.policyRow}>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Maxfiylik siyosati",
                    "To'liq hujjat web versiyada ko'rsatiladi.",
                  )
                }
              >
                <Text style={styles.policyLink}>Maxfiylik siyosati</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Foydalanish shartlari",
                    "To'liq hujjat web versiyada ko'rsatiladi.",
                  )
                }
              >
                <Text style={styles.policyLink}>Foydalanish shartlari</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  background: {
    flex: 1,
    backgroundColor: "#0b0f14",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  shell: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    gap: 18,
  },
  heroSection: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
  },
  logoBadge: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(88, 101, 242, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(88, 101, 242, 0.22)",
  },
  authCard: {
    width: "100%",
    backgroundColor: "#11161d",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  logoImage: {
    width: 42,
    height: 42,
    borderRadius: 16,
  },
  logoText: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.62)",
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 320,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#0f141b",
    borderRadius: 18,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    borderRadius: 14,
  },
  activeTab: {
    backgroundColor: "#1a2230",
  },
  tabText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "600",
  },
  activeTabText: {
    color: "#fff",
  },
  form: {
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "rgba(255,255,255,0.42)",
  },
  inputShell: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: "#0b1016",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    color: "#dcddde",
    fontSize: 15,
    paddingVertical: 14,
  },
  passwordToggle: {
    padding: 4,
  },
  inlineActionRow: {
    alignItems: "flex-end",
    marginTop: -4,
  },
  ghostLink: {
    color: "#8ea7ff",
    fontSize: 13,
    fontWeight: "600",
  },
  successBox: {
    backgroundColor: "rgba(87, 242, 135, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(87, 242, 135, 0.28)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  successText: {
    color: "#57f287",
    fontSize: 13,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: "rgba(240, 71, 71, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(240, 71, 71, 0.3)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: "#ff8f8f",
    fontSize: 13,
    lineHeight: 18,
  },
  submitButton: {
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: "#5865f2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
    shadowColor: "#5865f2",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  submitButtonPressed: {
    opacity: 0.92,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 18,
    marginBottom: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  dividerText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.34)",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  googleButton: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#0b1016",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleButtonText: {
    color: "#dcddde",
    fontSize: 14,
    fontWeight: "600",
  },
  footerBlock: {
    alignItems: "center",
    gap: 2,
    marginTop: 18,
  },
  footerText: {
    textAlign: "center",
    fontSize: 13,
    color: "rgba(255,255,255,0.38)",
  },
  footerLink: {
    color: "#8ea7ff",
    textAlign: "center",
    fontWeight: "700",
    fontSize: 13,
  },
  policyRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
    marginTop: 18,
    flexWrap: "wrap",
  },
  policyLink: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
  },
});
