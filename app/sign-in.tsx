import { supabase } from "@/lib/supabase";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { PokerRollLogo } from "@/components/PokerRollLogo";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

WebBrowser.maybeCompleteAuthSession();

function getRedirectUri(): string {
  if (__DEV__) {
    // In Expo SDK 50+, the dev server LAN IP lives in expoGoConfig.debuggerHost
    // e.g. "192.168.1.5:8081" — this is the address the physical device can actually reach
    const debuggerHost =
      Constants.expoGoConfig?.debuggerHost ??
      (Constants as any).manifest?.hostUri ??
      "localhost:8081";
    return `exp://${debuggerHost}`;
  }
  return AuthSession.makeRedirectUri({ scheme: "pokerroll", path: "auth/callback" });
}

export default function SignInScreen() {
  const { colors, spacing, radius } = usePokerTheme();
  const insets = useSafeAreaInsets();

  async function signInWithGoogle() {
    try {
      const redirectTo = getRedirectUri();
      Alert.alert("DEBUG — redirect URL", redirectTo); // temporary: remove after fix

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        console.error("OAuth error", error);
        Alert.alert("Sign in failed", "Could not start Google sign in. Try again.");
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get("code");
        const hashParams = new URLSearchParams(url.hash.slice(1));
        const accessToken = url.searchParams.get("access_token") ?? hashParams.get("access_token");
        const refreshToken = url.searchParams.get("refresh_token") ?? hashParams.get("refresh_token");

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
        router.replace("/(tabs)");
      } else if (result.type === "cancel") {
        // User closed the browser — do nothing
      }
    } catch (e) {
      console.error("Google sign in error", e);
      Alert.alert("Sign in failed", "Something went wrong. Please try again.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md }}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg.secondary, alignItems: "center", justifyContent: "center" }}
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <PokerRollLogo size={64} style={{ marginBottom: 24 }} />

        <Text style={{ color: colors.text.primary, fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 8 }}>
          Sign in to PokerRoll
        </Text>
        <Text style={{ color: colors.text.secondary, fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 48 }}>
          Back up your sessions, join challenges, and win prizes.
        </Text>

        {/* Google Sign In */}
        <TouchableOpacity
          onPress={signInWithGoogle}
          activeOpacity={0.85}
          style={{
            width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center",
            gap: 12, backgroundColor: "#fff", borderRadius: radius.lg,
            paddingVertical: 15, marginBottom: 12,
            shadowColor: "#000", shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8,
            elevation: 2,
          }}
        >
          <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
          <Text style={{ color: "#1a1a1a", fontSize: 16, fontWeight: "600" }}>
            Continue with Google
          </Text>
        </TouchableOpacity>

        {/* Apple Sign In — enabled once Apple Developer account is ready */}
        {/* {Platform.OS === "ios" && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.lg}
            style={{ width: "100%", height: 50, marginBottom: 12 }}
            onPress={signInWithApple}
          />
        )} */}

        {/* Skip */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
          activeOpacity={0.7}
        >
          <Text style={{ color: colors.text.tertiary, fontSize: 14 }}>
            Maybe later — continue without account
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={{ paddingBottom: insets.bottom + 16, paddingHorizontal: 32 }}>
        <Text style={{ color: colors.text.tertiary, fontSize: 11, textAlign: "center", lineHeight: 16 }}>
          By signing in you agree to our Terms of Service and Privacy Policy.
          Your session data stays on your device unless you choose to sync.
        </Text>
      </View>
    </View>
  );
}
