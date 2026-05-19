import { getNoteHistory, deleteNoteEntry, NoteEntry } from "@/db/database";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";

export default function NotesScreen() {
  const { colors, spacing, radius, typography } = usePokerTheme();
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      setNotes(getNoteHistory());
    }, [])
  );

  const handleDelete = (id: number) => {
    Alert.alert("Delete Note", "Remove this note entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteNoteEntry(id);
          setNotes(prev => prev.filter(n => n.id !== id));
        },
      },
    ]);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (notes.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <MaterialCommunityIcons name="notebook-outline" size={56} color={colors.text.tertiary} />
        <Text style={{ color: colors.text.tertiary, fontSize: 16, fontWeight: "600" }}>No notes yet</Text>
        <Text style={{ color: colors.text.tertiary, fontSize: 13, textAlign: "center", paddingHorizontal: 40, lineHeight: 19 }}>
          Add notes to a session and they'll appear here after AI enhancement.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", marginBottom: spacing.lg }}>
        {notes.length} {notes.length === 1 ? "note" : "notes"} saved
      </Text>

      {notes.map(entry => {
        const isExpanded = expandedId === entry.id;
        const profit = entry.session_profit ?? 0;
        const profitColor = profit >= 0 ? colors.text.success : colors.text.danger;
        const displayText = entry.enhanced_notes ?? entry.raw_notes;
        const isEnhanced = !!entry.enhanced_notes;

        return (
          <View key={entry.id} style={{
            backgroundColor: colors.bg.secondary,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border.default,
            marginBottom: spacing.md,
            overflow: "hidden",
          }}>
            {/* Header */}
            <TouchableOpacity
              onPress={() => setExpandedId(isExpanded ? null : entry.id)}
              activeOpacity={0.75}
              style={{ padding: spacing.lg, flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}
            >
              {/* Profit indicator bar */}
              <View style={{
                width: 3, borderRadius: 2, alignSelf: "stretch",
                backgroundColor: profit >= 0 ? colors.bg.success : colors.bg.danger,
                minHeight: 40,
              }} />

              <View style={{ flex: 1, gap: 4 }}>
                {/* Session meta */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
                  <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: "700" }}>
                    {formatDate(entry.session_date)}
                  </Text>
                  <View style={{ backgroundColor: colors.bg.tertiary, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: "600" }}>
                      {entry.session_type === "tournament" ? "Tournament" : "Cash"}
                    </Text>
                  </View>
                  {entry.session_venue ? (
                    <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{entry.session_venue}</Text>
                  ) : null}
                </View>

                {/* Profit + time row */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <Text style={{ color: profitColor, fontSize: 13, fontWeight: "700" }}>
                    {profit >= 0 ? "+" : "-"}${Math.abs(profit).toFixed(0)}
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                    Saved {formatTime(entry.created_at)}
                  </Text>
                  {isEnhanced && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#7c3aed18", borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <MaterialCommunityIcons name="auto-fix" size={10} color="#7c3aed" />
                      <Text style={{ color: "#7c3aed", fontSize: 10, fontWeight: "700" }}>AI Enhanced</Text>
                    </View>
                  )}
                </View>

                {/* Preview (collapsed) */}
                {!isExpanded && (
                  <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 19, marginTop: 2 }} numberOfLines={2}>
                    {displayText}
                  </Text>
                )}
              </View>

              <MaterialCommunityIcons
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={20} color={colors.text.tertiary}
              />
            </TouchableOpacity>

            {/* Expanded full note */}
            {isExpanded && (
              <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
                <View style={{ height: 1, backgroundColor: colors.border.default }} />
                <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 22 }}>
                  {displayText}
                </Text>

                {/* Raw notes toggle (if enhanced differs) */}
                {isEnhanced && entry.raw_notes !== entry.enhanced_notes && (
                  <View style={{ backgroundColor: colors.bg.tertiary, borderRadius: radius.sm, padding: spacing.md }}>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                      Original (before enhancement)
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 20 }}>
                      {entry.raw_notes}
                    </Text>
                  </View>
                )}

                {/* Delete */}
                <TouchableOpacity
                  onPress={() => handleDelete(entry.id)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border.danger }}
                >
                  <MaterialCommunityIcons name="delete-outline" size={14} color={colors.text.danger} />
                  <Text style={{ color: colors.text.danger, fontSize: 12, fontWeight: "600" }}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
