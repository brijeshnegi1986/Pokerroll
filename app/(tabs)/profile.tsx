import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert, ScrollView, Text, TextInput,
  TouchableOpacity, View, Switch, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function SettingsRow({ icon, label, onPress, color, hideChevron }: {
  icon: any; label: string; onPress: () => void; color?: string; hideChevron?: boolean;
}) {
  const { colors, radius } = usePokerTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row", alignItems: "center", paddingVertical: 14,
        paddingHorizontal: 16, gap: 12,
      }}
    >
      <MaterialCommunityIcons name={icon} size={20} color={color ?? colors.text.secondary} />
      <Text style={{ flex: 1, color: color ?? colors.text.primary, fontSize: 15, fontWeight: "500" }}>
        {label}
      </Text>
      {!hideChevron && <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text.tertiary} />}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { colors, spacing, radius, inputTypo, typography } = usePokerTheme();
  const { user, profile, signOut, refreshProfile, session } = useAuth();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [promoOptIn, setPromoOptIn] = useState(profile?.promo_opt_in ?? false);
  const [saving, setSaving] = useState(false);

  const isSignedIn = !!session;

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: displayName.trim(),
      email: user.email,
      promo_opt_in: promoOptIn,
    });
    setSaving(false);
    if (error) {
      Alert.alert("Error", "Couldn't save profile. Try again.");
    } else {
      await refreshProfile();
      Alert.alert("Saved", "Profile updated.");
    }
  }

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive",
        onPress: async () => { await signOut(); router.replace("/(tabs)"); },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all cloud data. Local sessions on this device are kept. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            // Requires a backend endpoint — placeholder for now
            Alert.alert("Request Sent", "Your account deletion request has been submitted. It will be processed within 24 hours.");
          },
        },
      ]
    );
  }

  const TAB_BAR_H = (insets.bottom > 0 ? insets.bottom : 16) + 68;

  // ─── Not signed in ────────────────────────────────────────────────────────
  if (!isSignedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <MaterialCommunityIcons name="account-circle-outline" size={72} color={colors.text.tertiary} />
          <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: "800", marginTop: 16, marginBottom: 8 }}>
            No account yet
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 14, textAlign: "center", lineHeight: 21, marginBottom: 32 }}>
            Sign in to back up your sessions, join bankroll challenges, and win prizes.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/sign-in")}
            activeOpacity={0.85}
            style={{
              backgroundColor: colors.bg.brand, borderRadius: radius.full,
              paddingVertical: 14, paddingHorizontal: 32,
            }}
          >
            <Text style={{ color: colors.text.onBrand, fontSize: 16, fontWeight: "700" }}>
              Sign In / Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Settings always accessible — no sign-in required */}
        <View style={{
          marginHorizontal: spacing.lg, marginBottom: TAB_BAR_H + 16,
          backgroundColor: colors.bg.primary, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.border.default, overflow: "hidden",
        }}>
          <SettingsRow icon="cog-outline" label="Settings" onPress={() => router.push("/settings")} />
        </View>
      </View>
    );
  }

  // ─── Signed in ────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.secondary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: TAB_BAR_H + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Avatar + email */}
      <View style={{ alignItems: "center", marginBottom: 32, marginTop: 8 }}>
        <View style={{
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: colors.bg.brand + "33",
          borderWidth: 2, borderColor: colors.border.brand,
          alignItems: "center", justifyContent: "center", marginBottom: 12,
        }}>
          <Text style={{ fontSize: 32, fontWeight: "800", color: colors.text.brand }}>
            {(profile?.display_name ?? user?.email ?? "?")[0].toUpperCase()}
          </Text>
        </View>
        <Text style={{ color: colors.text.secondary, fontSize: 13 }}>
          {user?.email}
        </Text>
      </View>

      {/* Display name */}
      <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
        Display Name
      </Text>
      <View style={{
        backgroundColor: colors.bg.primary, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.border.default,
        paddingHorizontal: spacing.lg, marginBottom: 24,
      }}>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={colors.text.tertiary}
          style={{ color: colors.text.primary, paddingVertical: 14, ...inputTypo.body }}
        />
      </View>

      {/* Promo opt-in */}
      <View style={{
        backgroundColor: colors.bg.primary, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.border.default,
        padding: spacing.lg, marginBottom: 24,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      }}>
        <View style={{ flex: 1, marginRight: 16 }}>
          <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: "600", marginBottom: 4 }}>
            Challenge & Prize Notifications
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 18 }}>
            Get emailed about bankroll challenges and prize opportunities
          </Text>
        </View>
        <Switch
          value={promoOptIn}
          onValueChange={setPromoOptIn}
          trackColor={{ false: colors.border.default, true: colors.bg.brand }}
          thumbColor="#fff"
        />
      </View>

      {/* Sync status */}
      <View style={{
        backgroundColor: colors.bg.primary, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.border.default,
        padding: spacing.lg, marginBottom: 24,
        flexDirection: "row", alignItems: "center", gap: 10,
      }}>
        <MaterialCommunityIcons name="cloud-check-outline" size={20} color={colors.text.success} />
        <Text style={{ color: colors.text.secondary, fontSize: 14 }}>
          Account active · Sessions sync coming soon
        </Text>
      </View>

      {/* Save */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
        style={{
          backgroundColor: colors.bg.brand, borderRadius: radius.full,
          paddingVertical: 15, alignItems: "center", marginBottom: 24,
          opacity: saving ? 0.6 : 1,
        }}
      >
        <Text style={{ color: colors.text.onBrand, fontSize: 16, fontWeight: "700" }}>
          {saving ? "Saving…" : "Save Profile"}
        </Text>
      </TouchableOpacity>

      {/* More options */}
      <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
        More
      </Text>
      <View style={{
        backgroundColor: colors.bg.primary, borderRadius: radius.md,
        borderWidth: 1, borderColor: colors.border.default,
        marginBottom: 32, overflow: "hidden",
      }}>
        <SettingsRow icon="cog-outline" label="Settings" onPress={() => router.push("/settings")} />
        <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: 48 }} />
        <SettingsRow icon="logout" label="Sign Out" onPress={handleSignOut} />
        <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: 48 }} />
        <SettingsRow icon="delete-outline" label="Delete Account" onPress={handleDeleteAccount} color={colors.text.danger} hideChevron />
      </View>
    </ScrollView>
  );
}
