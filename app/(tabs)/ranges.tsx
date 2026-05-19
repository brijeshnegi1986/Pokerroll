import { usePokerTheme } from "@/hooks/use-poker-theme";
import {
  BB_DEFENSE, cellHand, handCombos, RANKS, rangePercent,
  RangeData, RFI, THREE_BET,
} from "@/constants/ranges";
import { Dimensions, ScrollView, Text, TouchableOpacity, View } from "react-native";

const SCREEN_W = Dimensions.get("window").width;
const GRID_PAD = 16;
const RANK_LABEL_W = 18;
const CELL = Math.floor((SCREEN_W - GRID_PAD * 2 - RANK_LABEL_W) / 13);

const ACTION_COLOR: Record<string, string> = {
  R: "#16a34a",  // green — raise / open
  C: "#2563eb",  // blue — call / defend
  M: "#d97706",  // amber — mixed strategy
};
const ACTION_LABEL: Record<string, string> = {
  R: "Raise / Open",
  C: "Call / Defend",
  M: "Mixed",
};

type ChartType = "rfi" | "3bet" | "bbdef";

const RFI_POSITIONS    = ["UTG","HJ","CO","BTN","SB"] as const;
const BBDEF_POSITIONS  = Object.keys(BB_DEFENSE) as string[];
const THREEBET_POSITIONS = Object.keys(THREE_BET) as string[];

// ─── Grid ─────────────────────────────────────────────────────────────────────

function RangeGrid({ data }: { data: RangeData }) {
  return (
    <View style={{ paddingHorizontal: GRID_PAD }}>
      {/* Column rank headers */}
      <View style={{ flexDirection: "row", marginLeft: RANK_LABEL_W, marginBottom: 2 }}>
        {RANKS.map(r => (
          <View key={r} style={{ width: CELL, alignItems: "center" }}>
            <Text style={{ fontSize: 8, fontWeight: "700", color: "rgba(255,255,255,0.4)" }}>{r}</Text>
          </View>
        ))}
      </View>

      {/* Grid rows */}
      {RANKS.map((rowRank, row) => (
        <View key={rowRank} style={{ flexDirection: "row", marginBottom: 1 }}>
          {/* Row rank label */}
          <View style={{ width: RANK_LABEL_W, justifyContent: "center" }}>
            <Text style={{ fontSize: 8, fontWeight: "700", color: "rgba(255,255,255,0.4)" }}>{rowRank}</Text>
          </View>

          {/* Cells */}
          {RANKS.map((_, col) => {
            const hand = cellHand(row, col);
            const action = data[hand];
            const isPair = row === col;
            const bg = action ? ACTION_COLOR[action] : isPair ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)";
            // Show first 2 chars only (rank pair, no suit suffix)
            const label = hand.length >= 2 ? hand.slice(0, 2) : hand;
            return (
              <View
                key={col}
                style={{
                  width: CELL, height: CELL, marginHorizontal: 0.5,
                  backgroundColor: bg, borderRadius: 2,
                  alignItems: "center", justifyContent: "center",
                  borderWidth: isPair ? 0.5 : 0,
                  borderColor: "rgba(255,255,255,0.12)",
                }}
              >
                <Text style={{
                  fontSize: 7, fontWeight: "700", lineHeight: 9,
                  color: action ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.18)",
                }}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RangesScreen() {
  const { colors, radius } = usePokerTheme();
  const [chartType, setChartType] = useState<ChartType>("rfi");
  const [position, setPosition] = useState<string>("BTN");

  // Reset position when chart type changes
  const handleChartType = (t: ChartType) => {
    setChartType(t);
    if (t === "rfi")    setPosition("BTN");
    if (t === "3bet")   setPosition(THREEBET_POSITIONS[0]);
    if (t === "bbdef")  setPosition(BBDEF_POSITIONS[0]);
  };

  const currentData: RangeData =
    chartType === "rfi"   ? (RFI[position] ?? {})
    : chartType === "3bet" ? (THREE_BET[position] ?? {})
    : (BB_DEFENSE[position] ?? {});

  const pct = rangePercent(currentData);

  const positions =
    chartType === "rfi"   ? [...RFI_POSITIONS]
    : chartType === "3bet" ? THREEBET_POSITIONS
    : BBDEF_POSITIONS;

  const chartTypeLabels: { key: ChartType; label: string }[] = [
    { key: "rfi",   label: "Open (RFI)"  },
    { key: "bbdef", label: "BB Defense"  },
    { key: "3bet",  label: "3-bet Range" },
  ];

  const actionsInChart = Array.from(
    new Set(Object.values(currentData))
  ) as string[];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      contentContainerStyle={{ paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Chart type selector */}
      <View style={{
        flexDirection: "row", gap: 6, padding: 16, paddingBottom: 8,
      }}>
        {chartTypeLabels.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => handleChartType(key)}
            style={{
              flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: "center",
              backgroundColor: chartType === key ? colors.bg.brand : colors.bg.secondary,
              borderWidth: 1,
              borderColor: chartType === key ? colors.border.brand : colors.border.default,
            }}
          >
            <Text style={{
              fontSize: 11, fontWeight: "700",
              color: chartType === key ? colors.text.onBrand : colors.text.secondary,
            }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Position selector */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 6, paddingBottom: 12 }}
      >
        {positions.map(pos => (
          <TouchableOpacity
            key={pos}
            onPress={() => setPosition(pos)}
            style={{
              paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full,
              backgroundColor: position === pos ? colors.bg.brand : colors.bg.secondary,
              borderWidth: 1,
              borderColor: position === pos ? colors.border.brand : colors.border.default,
            }}
          >
            <Text style={{
              fontSize: 12, fontWeight: "700",
              color: position === pos ? colors.text.onBrand : colors.text.primary,
            }}>{pos}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Stats bar */}
      <View style={{
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: 16, marginBottom: 10,
      }}>
        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
          Range: <Text style={{ color: colors.text.primary, fontWeight: "700" }}>{pct}%</Text>
          {" "}of hands
        </Text>
        {/* Legend */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {actionsInChart.map(a => (
            <View key={a} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: ACTION_COLOR[a] }} />
              <Text style={{ color: colors.text.tertiary, fontSize: 10 }}>{ACTION_LABEL[a]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Grid */}
      <RangeGrid data={currentData} />

      {/* Hand key */}
      <View style={{
        marginHorizontal: 16, marginTop: 14,
        backgroundColor: colors.bg.secondary, borderRadius: radius.sm,
        borderWidth: 1, borderColor: colors.border.default, padding: 12,
      }}>
        <Text style={{ color: colors.text.tertiary, fontSize: 11, lineHeight: 17 }}>
          <Text style={{ color: colors.text.secondary, fontWeight: "700" }}>Grid guide: </Text>
          Top-right triangle = suited (AKs). Bottom-left = offsuit (AKo). Diagonal = pairs (AA).
          {"\n"}Ranges are approximate GTO baselines for 6-max NLH.
        </Text>
      </View>
    </ScrollView>
  );
}

// useState import needed
import { useState } from "react";
