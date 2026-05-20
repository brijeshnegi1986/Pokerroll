import { PRO_FEATURES, ProFeature } from "@/constants/subscription";
import { useSubscription } from "@/context/SubscriptionContext";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator, Modal, Platform, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FEATURES_LIST: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }[] = [
  { icon: "history",          label: "Unlimited session history" },
  { icon: "lightning-bolt",   label: "Live session tracker" },
  { icon: "auto-fix",         label: "AI note enhancement" },
  { icon: "notebook-outline", label: "Notes history, export & copy" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Which locked feature triggered the paywall (shown in header) */
  feature?: ProFeature;
}

export function PaywallModal({ visible, onClose, feature }: Props) {
  const { colors, radius } = usePokerTheme();
  const { offerings, purchase, restore } = useSubscription();
  const insets = useSafeAreaInsets();

  const [selected, setSelected]   = useState<"monthly" | "annual">("annual");
  const [loading, setLoading]     = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const monthlyPkg = offerings?.availablePackages.find(p =>
    p.product.identifier.includes("monthly")
  );
  const annualPkg = offerings?.availablePackages.find(p =>
    p.product.identifier.includes("annual")
  );

  const monthlyPrice = monthlyPkg?.product.priceString  ?? "$4.99";
  const annualPrice  = annualPkg?.product.priceString   ?? "$29.99";

  async function handlePurchase() {
    const pkg = selected === "monthly" ? monthlyPkg : annualPkg;
    if (!pkg) return;
    setLoading(true);
    setError(null);
    const ok = await purchase(pkg.product.identifier);
    setLoading(false);
    if (ok) onClose();
    else setError("Purchase was not completed. Please try again.");
  }

  async function handleRestore() {
    setRestoring(true);
    setError(null);
    const ok = await restore();
    setRestoring(false);
    if (ok) onClose();
    else setError("No active subscription found for this account.");
  }

  const featureLabel = feature ? PRO_FEATURES[feature] : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.bg.primary,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24,
          paddingHorizontal: 20, paddingTop: 24,
        }}>
          {/* Close */}
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ position: "absolute", top: 16, right: 16 }}>
            <MaterialCommunityIcons name="close" size={22} color={colors.text.tertiary} />
          </TouchableOpacity>

          {/* Header */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.bg.brand + "22", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <MaterialCommunityIcons name="crown" size={26} color={colors.text.brand} />
            </View>
            <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: "800", textAlign: "center" }}>
              Upgrade to Pro
            </Text>
            {featureLabel ? (
              <Text style={{ color: colors.text.secondary, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 }}>
                <Text style={{ color: colors.text.brand, fontWeight: "700" }}>{featureLabel}</Text>
                {" "}is a Pro feature.
              </Text>
            ) : (
              <Text style={{ color: colors.text.secondary, fontSize: 13, textAlign: "center", marginTop: 6 }}>
                Unlock everything PokerRoll has to offer.
              </Text>
            )}
          </View>

          {/* Feature list */}
          <View style={{ gap: 10, marginBottom: 22 }}>
            {FEATURES_LIST.map(f => (
              <View key={f.label} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bg.brand + "18", alignItems: "center", justifyContent: "center" }}>
                  <MaterialCommunityIcons name={f.icon} size={16} color={colors.text.brand} />
                </View>
                <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "500" }}>{f.label}</Text>
                <MaterialCommunityIcons name="check-circle" size={16} color={colors.text.brand} style={{ marginLeft: "auto" }} />
              </View>
            ))}
          </View>

          {/* Plan selector */}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
            {/* Annual */}
            <TouchableOpacity onPress={() => setSelected("annual")} activeOpacity={0.8}
              style={{
                flex: 1, borderRadius: radius.md, borderWidth: 2,
                borderColor: selected === "annual" ? colors.border.brand : colors.border.default,
                backgroundColor: selected === "annual" ? colors.bg.brand + "12" : colors.bg.secondary,
                padding: 14, alignItems: "center",
              }}>
              <View style={{ backgroundColor: colors.bg.brand, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 }}>
                <Text style={{ color: colors.text.onBrand, fontSize: 10, fontWeight: "800" }}>BEST VALUE</Text>
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: "800" }}>{annualPrice}</Text>
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>per year</Text>
              <Text style={{ color: colors.text.brand, fontSize: 11, fontWeight: "700", marginTop: 4 }}>
                ~${(parseFloat(annualPrice.replace(/[^0-9.]/g, "")) / 12).toFixed(2)}/mo
              </Text>
            </TouchableOpacity>

            {/* Monthly */}
            <TouchableOpacity onPress={() => setSelected("monthly")} activeOpacity={0.8}
              style={{
                flex: 1, borderRadius: radius.md, borderWidth: 2,
                borderColor: selected === "monthly" ? colors.border.brand : colors.border.default,
                backgroundColor: selected === "monthly" ? colors.bg.brand + "12" : colors.bg.secondary,
                padding: 14, alignItems: "center", justifyContent: "center",
              }}>
              <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: "800" }}>{monthlyPrice}</Text>
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>per month</Text>
            </TouchableOpacity>
          </View>

          {/* Error */}
          {error && (
            <Text style={{ color: colors.text.danger, fontSize: 12, textAlign: "center", marginBottom: 10 }}>
              {error}
            </Text>
          )}

          {/* Subscribe button */}
          <TouchableOpacity onPress={handlePurchase} disabled={loading} activeOpacity={0.85}
            style={{ backgroundColor: colors.bg.brand, borderRadius: radius.md, paddingVertical: 16, alignItems: "center", marginBottom: 10 }}>
            {loading
              ? <ActivityIndicator color={colors.text.onBrand} />
              : <Text style={{ color: colors.text.onBrand, fontSize: 16, fontWeight: "800" }}>
                  Start {selected === "annual" ? "Annual" : "Monthly"} Plan
                </Text>
            }
          </TouchableOpacity>

          {/* Restore */}
          <TouchableOpacity onPress={handleRestore} disabled={restoring} style={{ alignItems: "center", paddingVertical: 8 }}>
            {restoring
              ? <ActivityIndicator color={colors.text.tertiary} size="small" />
              : <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>Restore Purchases</Text>
            }
          </TouchableOpacity>

          {/* Legal */}
          <Text style={{ color: colors.text.tertiary, fontSize: 10, textAlign: "center", marginTop: 8, lineHeight: 15 }}>
            {Platform.OS === "ios"
              ? "Payment charged to your Apple ID. Subscription auto-renews unless cancelled 24hrs before renewal."
              : "Payment charged to your Google Play account. Cancel anytime in Google Play settings."
            }
          </Text>
        </View>
      </View>
    </Modal>
  );
}
