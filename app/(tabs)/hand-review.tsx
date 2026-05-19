import { BACKEND_URL } from "@/constants/config";
import { addHandReview, deleteHandReview, getHandReviews, HandReview } from "@/db/database";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { PokerRollLogo } from "@/components/PokerRollLogo";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

type Suit = "s" | "h" | "d" | "c";
type Rank = "A" | "K" | "Q" | "J" | "T" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
type Card = `${Rank}${Suit}` | null;
type ActionType = "Fold" | "Check" | "Call" | "Raise" | "Bet" | "All-in";
type Position = "UTG" | "UTG+1" | "MP" | "HJ" | "CO" | "BTN" | "SB" | "BB";
type StackMode = "BB" | "$";
type SlotKey = "hole1" | "hole2" | "flop1" | "flop2" | "flop3" | "turn" | "river";

interface ActionItem {
  id: string;
  player: string;
  type: ActionType;
  amount: string;
}
interface StreetAnalysis {
  heroAction: string; assessment: string; suggestion: string; reasoning: string;
  grade: "A" | "B" | "C" | "D";
}
interface AIResult {
  preflop?: StreetAnalysis; flop?: StreetAnalysis;
  turn?: StreetAnalysis; river?: StreetAnalysis; summary: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RANKS: Rank[] = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const SUITS: Suit[] = ["s","h","d","c"];
const SUIT_SYMBOLS: Record<Suit,string> = { s:"♠", h:"♥", d:"♦", c:"♣" };
const POSITIONS: Position[] = ["UTG","UTG+1","MP","HJ","CO","BTN","SB","BB"];
const ACTIONS: ActionType[] = ["Fold","Check","Call","Raise","Bet","All-in"];

const POSITIONS_BY_COUNT: Record<number, Position[]> = {
  2: ["BTN","BB"],
  3: ["BTN","SB","BB"],
  4: ["CO","BTN","SB","BB"],
  5: ["UTG","CO","BTN","SB","BB"],
  6: ["UTG","HJ","CO","BTN","SB","BB"],
  7: ["UTG","UTG+1","HJ","CO","BTN","SB","BB"],
  8: ["UTG","UTG+1","MP","HJ","CO","BTN","SB","BB"],
  9: ["UTG","UTG+1","MP","HJ","CO","BTN","SB","BB"],
};

const SCREEN_W = Dimensions.get("window").width;

// Clockwise action order per street (first = first to act)
const PREFLOP_ORDER: Position[] = ["UTG","UTG+1","MP","HJ","CO","BTN","SB","BB"];
const POSTFLOP_ORDER: Position[] = ["SB","BB","UTG","UTG+1","MP","HJ","CO","BTN"];

// Returns true if hero is the FIRST actor on this street given active player count
function heroActsFirst(heroPos: Position, street: "preflop" | "postflop", numPlayers: number): boolean {
  const order = street === "preflop" ? PREFLOP_ORDER : POSTFLOP_ORDER;
  const pool = POSITIONS_BY_COUNT[numPlayers] ?? [];
  for (const pos of order) {
    if (!pool.includes(pos as Position)) continue;
    return pos === heroPos;
  }
  return true;
}

// ─── Table layout ─────────────────────────────────────────────────────────────
// Seats sit with their centres on the table ellipse edge.
// At the left/right extreme (angle 0°), seat centre = cx + rx = cx + tableW/2.
// Seat right edge = cx + tableW/2 + seatW/2.
// Setting containerW = tableW + seatW guarantees the seat edge equals containerW.
// tableW = SCREEN_W - screenPadding - seatW to fill the screen.

const SEAT_W = 54;   // fixed seat width — position badge + 2 card backs
const SEAT_H = 68;   // fixed seat height
const SCREEN_PAD = 32; // 16px scroll padding each side

function getTableLayout() {
  const tableW = SCREEN_W - SCREEN_PAD - SEAT_W;   // fills available width
  const tableH = Math.round(tableW * 0.50);          // nice oval ratio
  const rx = tableW / 2;
  const ry = tableH / 2;
  const containerW = tableW + SEAT_W;               // exact fit (no overflow)
  const containerH = tableH + SEAT_H;               // same logic vertically
  return { tableW, tableH, rx, ry, containerW, containerH };
}

// Returns {x, y} offset from the container centre for seat i out of n.
// Hero is at the bottom (π/2); clockwise = increasing angle in screen coords.
function seatOffset(i: number, n: number, rx: number, ry: number) {
  const angle = Math.PI / 2 + i * (2 * Math.PI / n);
  return { x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRed(suit: Suit) { return suit === "h" || suit === "d"; }
function parseCard(c: Card) {
  if (!c) return null;
  return { rank: c[0] as Rank, suit: c[1] as Suit };
}

function allSelectedCards(h: [Card,Card], f: [Card,Card,Card], t: Card, r: Card): string[] {
  return [h[0],h[1],f[0],f[1],f[2],t,r].filter(Boolean) as string[];
}

// Returns seat labels [hero, villain1, villain2, …] respecting manual overrides.
function computeSeatLabels(
  heroPos: Position,
  numPlayers: number,
  overrides: Record<number, Position>
): string[] {
  const pool = POSITIONS_BY_COUNT[numPlayers] ?? POSITIONS_BY_COUNT[6];
  const heroIdx = pool.indexOf(heroPos);
  return Array.from({ length: numPlayers }, (_, i) => {
    if (i === 0) return heroPos;
    if (overrides[i]) return overrides[i];
    return pool[(heroIdx + i) % pool.length];
  });
}

function gradeColor(g: string, c: any) {
  return g === "A" ? c.bg.success : g === "B" ? "#3b82f6" : g === "C" ? c.bg.warning : c.bg.danger;
}

function overallGrade(result: AIResult): string {
  const grades = [result.preflop?.grade, result.flop?.grade, result.turn?.grade, result.river?.grade]
    .filter(Boolean) as string[];
  if (grades.includes("D")) return "D";
  if (grades.includes("C")) return "C";
  if (grades.includes("B")) return "B";
  return "A";
}

function gradeIsGood(g: string) { return g === "A" || g === "B"; }

function newAction(player: "Hero" | "Villain"): ActionItem {
  return { id: `${Date.now()}-${Math.random()}`, player, type: "Check", amount: "" };
}

function stackInBB(size: string, mode: StackMode, bbDollars: string): number {
  const val = parseFloat(size) || 0;
  return mode === "BB" ? val : Math.round(val / (parseFloat(bbDollars) || 1));
}

function buildUserMessage(
  holeCards: [Card,Card], position: Position,
  stackSize: string, stackMode: StackMode, bbDollars: string,
  numPlayers: number, seatLabels: string[],
  flop: [Card,Card,Card], turn: Card, river: Card,
  streetActions: Record<string, ActionItem[]>
): string {
  const stackBB = stackInBB(stackSize, stackMode, bbDollars);
  const stackDisplay = stackMode === "$"
    ? `$${stackSize} (~${stackBB}BB)`
    : `${stackSize}BB`;

  const fmtAmount = (a: ActionItem) => {
    if (!a.amount) return "";
    if (stackMode === "$") {
      const bb = Math.round(parseFloat(a.amount) / (parseFloat(bbDollars) || 1));
      return ` $${a.amount} (~${bb}BB)`;
    }
    return ` ${a.amount}BB`;
  };

  const fmt = (items: ActionItem[]) =>
    items.map(a => `${a.player} ${a.type}${fmtAmount(a)}`).join(" → ");
  const villainInfo = seatLabels.slice(1).map((pos, i) => `Villain ${i+1} (${pos})`).join(", ");
  const lines = [
    `Hero: [${holeCards[0]??'??'} ${holeCards[1]??'??'}] | Position: ${position} | Stack: ${stackDisplay}`,
    `Villains: ${numPlayers-1} — ${villainInfo}`,
    `Preflop: ${fmt(streetActions.preflop)}`,
  ];
  if (flop[0] && flop[1] && flop[2])
    lines.push(`Flop: [${flop[0]} ${flop[1]} ${flop[2]}] | ${fmt(streetActions.flop)}`);
  if (turn)
    lines.push(`Turn: [${turn}] | ${fmt(streetActions.turn)}`);
  if (river)
    lines.push(`River: [${river}] | ${fmt(streetActions.river)}`);
  return lines.join("\n");
}

// ─── Card chips ───────────────────────────────────────────────────────────────

function TableCard({ card, size, onPress }: { card: Card; size: number; onPress?: () => void }) {
  const p = parseCard(card);
  const w = size; const h = size * 1.36;
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap onPress={onPress} activeOpacity={0.8}
      style={{
        width: w, height: h, borderRadius: 3,
        backgroundColor: p ? "#fff" : "transparent",
        borderWidth: 1.5, borderStyle: p ? "solid" : "dashed",
        borderColor: p ? "transparent" : "rgba(255,255,255,0.4)",
        alignItems: "center", justifyContent: "center",
      }}>
      {p && (
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: size * 0.38, fontWeight: "800", lineHeight: size * 0.44, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{p.rank}</Text>
          <Text style={{ fontSize: size * 0.3, fontWeight: "700", lineHeight: size * 0.36, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{SUIT_SYMBOLS[p.suit]}</Text>
        </View>
      )}
    </Wrap>
  );
}

function FormCardSlot({ card, onPress, colors }: { card: Card; onPress: () => void; colors: any }) {
  const p = parseCard(card);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={{
        width: 44, height: 58, borderRadius: 6,
        backgroundColor: p ? "#fff" : colors.bg.tertiary,
        borderWidth: 1.5, borderStyle: p ? "solid" : "dashed",
        borderColor: p ? colors.border.brand : colors.border.strong,
        alignItems: "center", justifyContent: "center",
      }}>
      {p ? (
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 15, fontWeight: "800", lineHeight: 18, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{p.rank}</Text>
          <Text style={{ fontSize: 12, fontWeight: "700", lineHeight: 15, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{SUIT_SYMBOLS[p.suit]}</Text>
        </View>
      ) : (
        <Text style={{ fontSize: 22, color: colors.text.tertiary, lineHeight: 26 }}>+</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Poker Table ──────────────────────────────────────────────────────────────

function PokerTable({
  numPlayers, seatLabels, holeCards, onHeroCardPress, onVillainSeatPress, colors,
}: {
  numPlayers: number; seatLabels: string[];
  holeCards: [Card,Card]; onHeroCardPress: (slot: "hole1"|"hole2") => void;
  onVillainSeatPress: (seatIdx: number) => void; colors: any;
}) {
  const { tableW, tableH, rx, ry, containerW, containerH } = getTableLayout();
  const cx = containerW / 2;
  const cy = containerH / 2;

  // Scale card size with player count
  const cardSize = numPlayers > 7 ? 14 : numPlayers > 5 ? 16 : 18;
  const badgeFontSize = numPlayers > 7 ? 7 : 8;

  return (
    <View style={{ alignItems: "center", marginBottom: 16 }}>
      <View style={{ width: containerW, height: containerH }}>

        {/* Felt oval */}
        <View style={{
          position: "absolute",
          left: cx - tableW / 2, top: cy - tableH / 2,
          width: tableW, height: tableH,
          borderRadius: tableH / 2,
          backgroundColor: "#1a5c38",
          borderWidth: 8, borderColor: "#7b4a2d",
          shadowColor: "#000", shadowOpacity: 0.55,
          shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 10,
        }} />

        {/* Inner rail highlight */}
        <View style={{
          position: "absolute",
          left: cx - tableW / 2 + 10, top: cy - tableH / 2 + 10,
          width: tableW - 20, height: tableH - 20,
          borderRadius: (tableH - 20) / 2,
          borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
        }} />

        {/* Brand logo centre */}
        <View style={{ position: "absolute", left: cx - 26, top: cy - 26 }}>
          <PokerRollLogo size={52} />
        </View>

        {/* Seats */}
        {seatLabels.map((pos, idx) => {
          const { x, y } = seatOffset(idx, numPlayers, rx, ry);
          const isHero = idx === 0;
          const isBtn = pos === "BTN";
          const left = cx + x - SEAT_W / 2;
          const top  = cy + y - SEAT_H / 2;

          const seatContent = (
            <>
              {/* Position badge */}
              <View style={{
                backgroundColor: isHero ? "#f59e0b" : "rgba(15,23,43,0.90)",
                borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4,
                borderWidth: isHero ? 0 : 1,
                borderColor: "rgba(255,255,255,0.15)",
              }}>
                <Text style={{ color: isHero ? "#020618" : "#fff", fontSize: badgeFontSize, fontWeight: "800" }}>
                  {pos}
                </Text>
              </View>

              {/* Dealer button */}
              {isBtn && (
                <View style={{
                  position: "absolute", top: 0, right: -2,
                  width: 15, height: 15, borderRadius: 8,
                  backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
                }}>
                  <Text style={{ fontSize: 6, fontWeight: "900", color: "#000" }}>D</Text>
                </View>
              )}

              {/* Cards */}
              <View style={{
                flexDirection: "row", gap: 2, padding: isHero ? 4 : 0,
                borderRadius: 6,
                borderWidth: isHero ? 1.5 : 0,
                borderColor: isHero ? "#f59e0b" : "transparent",
                backgroundColor: isHero ? "rgba(245,158,11,0.10)" : "transparent",
              }}>
                {isHero ? (
                  <>
                    <TableCard card={holeCards[0]} size={cardSize} onPress={() => onHeroCardPress("hole1")} />
                    <TableCard card={holeCards[1]} size={cardSize} onPress={() => onHeroCardPress("hole2")} />
                  </>
                ) : (
                  [0,1].map(ci => (
                    <View key={ci} style={{
                      width: cardSize, height: cardSize * 1.36, borderRadius: 2,
                      backgroundColor: "#4a5568", borderWidth: 1, borderColor: "#718096",
                    }} />
                  ))
                )}
              </View>

              {isHero && (
                <Text style={{ color: "#f59e0b", fontSize: 7, fontWeight: "800", marginTop: 2 }}>YOU</Text>
              )}
              {!isHero && (
                <MaterialCommunityIcons name="pencil" size={9} color="rgba(255,255,255,0.45)" style={{ marginTop: 3 }} />
              )}
            </>
          );

          // Villain seats: entire area is the touch target
          if (!isHero) {
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => onVillainSeatPress(idx)}
                activeOpacity={0.65}
                style={{
                  position: "absolute", left, top, width: SEAT_W, height: SEAT_H,
                  alignItems: "center", justifyContent: "center",
                  borderRadius: 10, borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.15)",
                  borderStyle: "dashed",
                }}
              >
                {seatContent}
              </TouchableOpacity>
            );
          }

          // Hero seat: plain view, card slots handle their own taps
          return (
            <View
              key={idx}
              style={{
                position: "absolute", left, top, width: SEAT_W, height: SEAT_H,
                alignItems: "center", justifyContent: "center",
              }}
            >
              {seatContent}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Villain Position Picker ──────────────────────────────────────────────────

function VillainPositionModal({
  visible, seatIdx, currentPos, autoPos, heroPos, takenPositions,
  onSelect, onReset, onClose, colors, radius,
}: {
  visible: boolean; seatIdx: number; currentPos: Position | null;
  autoPos: Position; heroPos: Position; takenPositions: Position[];
  onSelect: (p: Position) => void; onReset: () => void; onClose: () => void;
  colors: any; radius: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.65)" }}>
        <View style={{
          backgroundColor: colors.bg.secondary,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: 20, paddingBottom: 36,
        }}>
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "700" }}>
              Villain {seatIdx} Position
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginBottom: 16 }}>
            Auto-assigned: <Text style={{ fontWeight: "700", color: colors.text.secondary }}>{autoPos}</Text>
            {currentPos ? "  ·  Custom set" : ""}
          </Text>

          {/* Position grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {POSITIONS.map(p => {
              const isTaken = takenPositions.includes(p);
              const isSelected = (currentPos ?? autoPos) === p;
              return (
                <TouchableOpacity
                  key={p}
                  disabled={isTaken}
                  onPress={() => onSelect(p)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 10,
                    borderRadius: radius.full,
                    backgroundColor: isSelected ? colors.bg.brand : colors.bg.tertiary,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.border.brand : isTaken ? colors.border.subtle : colors.border.default,
                    opacity: isTaken ? 0.35 : 1,
                  }}>
                  <Text style={{
                    fontSize: 13, fontWeight: "700",
                    color: isSelected ? colors.text.onBrand : colors.text.primary,
                  }}>{p}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Taken positions note */}
          <Text style={{ color: colors.text.tertiary, fontSize: 11, marginBottom: 16 }}>
            <Text style={{ color: colors.text.brand }}>{heroPos}</Text> is reserved for Hero · Dimmed positions are taken
          </Text>

          {/* Reset button */}
          {currentPos && (
            <TouchableOpacity
              onPress={onReset}
              style={{
                paddingVertical: 12, borderRadius: radius.sm, alignItems: "center",
                borderWidth: 1, borderColor: colors.border.default,
                backgroundColor: colors.bg.tertiary, marginBottom: 8,
              }}>
              <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: "600" }}>
                Reset to Auto ({autoPos})
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={onClose}
            style={{
              paddingVertical: 14, borderRadius: radius.sm, alignItems: "center",
              backgroundColor: colors.bg.brand,
            }}>
            <Text style={{ color: colors.text.onBrand, fontSize: 15, fontWeight: "700" }}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Auto-advance sequences: after picking a card for a slot, move to the next slot
// in the same batch (both hole cards, all three flop cards) before closing.
const SLOT_NEXT: Partial<Record<SlotKey, SlotKey>> = {
  hole1: "hole2",
  flop1: "flop2",
  flop2: "flop3",
};

const SLOT_LABEL: Record<SlotKey, string> = {
  hole1: "Hole Card 1 of 2",
  hole2: "Hole Card 2 of 2",
  flop1: "Flop Card 1 of 3",
  flop2: "Flop Card 2 of 3",
  flop3: "Flop Card 3 of 3",
  turn:  "Turn Card",
  river: "River Card",
};

// Dot progress indicator shown inside the picker
function SlotProgress({ slot }: { slot: SlotKey }) {
  const groups: SlotKey[][] = [["hole1","hole2"],["flop1","flop2","flop3"]];
  const group = groups.find(g => g.includes(slot));
  if (!group || group.length < 2) return null;
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
      {group.map(s => (
        <View key={s} style={{
          width: s === slot ? 18 : 6, height: 6, borderRadius: 3,
          backgroundColor: s === slot ? "#f59e0b" : "rgba(255,255,255,0.25)",
        }} />
      ))}
    </View>
  );
}

// ─── Card Picker Modal ────────────────────────────────────────────────────────

function CardPickerModal({
  visible, activeSlot, usedCards, onSelect, onClose, colors,
}: {
  visible: boolean; activeSlot: SlotKey | null; usedCards: string[];
  onSelect: (c: string) => void; onClose: () => void; colors: any;
}) {
  const label = activeSlot ? SLOT_LABEL[activeSlot] : "Select Card";
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" }}>
        <View style={{
          backgroundColor: colors.bg.secondary,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: 16, paddingBottom: 36,
        }}>
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "700" }}>{label}</Text>
              {activeSlot && <SlotProgress slot={activeSlot} />}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Rank header row */}
          <View style={{ flexDirection: "row", marginTop: 12, marginBottom: 4, paddingLeft: 24 }}>
            {RANKS.map(r => (
              <View key={r} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 8, fontWeight: "600" }}>{r}</Text>
              </View>
            ))}
          </View>

          {/* Card grid */}
          {SUITS.map(suit => (
            <View key={suit} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
              <Text style={{ width: 22, fontSize: 14, fontWeight: "700", color: isRed(suit) ? "#dc2626" : colors.text.primary }}>
                {SUIT_SYMBOLS[suit]}
              </Text>
              {RANKS.map(rank => {
                const cs = `${rank}${suit}`;
                const used = usedCards.includes(cs);
                return (
                  <TouchableOpacity key={cs} disabled={used} onPress={() => onSelect(cs)}
                    activeOpacity={0.7}
                    style={{
                      flex: 1, marginHorizontal: 1, paddingVertical: 7, borderRadius: 5,
                      backgroundColor: used ? "transparent" : isRed(suit) ? "rgba(220,38,38,0.12)" : colors.bg.tertiary,
                      alignItems: "center", borderWidth: 1,
                      borderColor: used ? colors.border.subtle : isRed(suit) ? "rgba(220,38,38,0.3)" : colors.border.default,
                    }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: used ? colors.text.disabled : isRed(suit) ? "#dc2626" : colors.text.primary }}>
                      {rank}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ─── Action Timeline ──────────────────────────────────────────────────────────

function ActionTimeline({
  actions, onChange, colors, radius, stackMode,
}: {
  actions: ActionItem[]; onChange: (items: ActionItem[]) => void;
  colors: any; radius: any; stackMode: StackMode;
}) {
  const needsAmount = (t: ActionType) => ["Raise","Bet","All-in"].includes(t);

  function update(id: string, patch: Partial<ActionItem>) {
    onChange(actions.map(a => a.id === id ? { ...a, ...patch } : a));
  }
  function remove(id: string) { onChange(actions.filter(a => a.id !== id)); }
  function add(player: "Hero"|"Villain") { onChange([...actions, newAction(player)]); }

  return (
    <View style={{ gap: 8 }}>
      {actions.map(item => {
        const isHero = item.player === "Hero";
        return (
          <View key={item.id} style={{
            borderRadius: 10, borderWidth: 1, padding: 10,
            borderColor: isHero ? colors.border.brand : colors.border.default,
            backgroundColor: isHero ? colors.bg.brand + "12" : colors.bg.tertiary,
          }}>
            {/* Player toggle + remove */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {["Hero","Villain"].map(p => (
                  <TouchableOpacity key={p} onPress={() => update(item.id, { player: p })}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full,
                      backgroundColor: item.player === p ? (p==="Hero" ? colors.bg.brand : colors.bg.secondary) : "transparent",
                      borderWidth: 1,
                      borderColor: item.player === p ? (p==="Hero" ? colors.border.brand : colors.border.strong) : colors.border.subtle,
                    }}>
                    <Text style={{
                      fontSize: 11, fontWeight: "700",
                      color: item.player === p ? (p==="Hero" ? colors.text.onBrand : colors.text.primary) : colors.text.tertiary,
                    }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {actions.length > 1 && (
                <TouchableOpacity onPress={() => remove(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="close-circle-outline" size={18} color={colors.text.tertiary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Action pills */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: needsAmount(item.type) ? 8 : 0 }}>
              {ACTIONS.map(a => (
                <TouchableOpacity key={a} onPress={() => update(item.id, { type: a, amount: "" })}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full,
                    backgroundColor: item.type === a ? colors.bg.brand : colors.bg.secondary,
                    borderWidth: 1,
                    borderColor: item.type === a ? colors.border.brand : colors.border.default,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: item.type === a ? colors.text.onBrand : colors.text.primary }}>
                    {a}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Amount */}
            {needsAmount(item.type) && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  value={item.amount} onChangeText={t => update(item.id, { amount: t })}
                  placeholder="Amount" placeholderTextColor={colors.text.tertiary}
                  keyboardType="numeric"
                  style={{
                    flex: 1, backgroundColor: colors.bg.secondary, borderRadius: 8,
                    borderWidth: 1, borderColor: colors.border.default,
                    paddingHorizontal: 10, paddingVertical: 8,
                    color: colors.text.primary, fontSize: 14,
                  }}
                />
                <Text style={{ color: colors.text.secondary, fontSize: 13 }}>{stackMode}</Text>
              </View>
            )}
          </View>
        );
      })}

      {/* Add buttons */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["Hero","Villain"] as const).map(p => (
          <TouchableOpacity key={p} onPress={() => add(p)}
            style={{
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
              gap: 4, paddingVertical: 9, borderRadius: radius.sm,
              borderWidth: 1, borderStyle: "dashed",
              borderColor: p === "Hero" ? colors.border.brand : colors.border.default,
            }}>
            <MaterialCommunityIcons name="plus" size={13} color={p === "Hero" ? colors.text.brand : colors.text.secondary} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: p === "Hero" ? colors.text.brand : colors.text.secondary }}>
              {p} Action
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Street Result Panel ──────────────────────────────────────────────────────

function GradeBadge({ grade, colors }: { grade: string; colors: any }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: gradeColor(grade, colors), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>{grade}</Text>
    </View>
  );
}

function StreetPanel({ street, data, boardCards, colors }: {
  street: string; data: StreetAnalysis; boardCards?: Card[]; colors: any;
}) {
  return (
    <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border.default, padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "700" }}>{street}</Text>
        <GradeBadge grade={data.grade} colors={colors} />
      </View>
      {(boardCards ?? []).filter(Boolean).length > 0 && (
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
          {(boardCards ?? []).filter(Boolean).map((c, i) => {
            const p = parseCard(c);
            return p ? (
              <View key={i} style={{ width: 32, height: 44, borderRadius: 4, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "800", lineHeight: 14, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{p.rank}</Text>
                <Text style={{ fontSize: 10, fontWeight: "700", lineHeight: 12, color: isRed(p.suit) ? "#dc2626" : "#1e293b" }}>{SUIT_SYMBOLS[p.suit]}</Text>
              </View>
            ) : null;
          })}
        </View>
      )}
      {[["Action", data.heroAction], ["Assessment", data.assessment], ["Suggestion", data.suggestion], ["Reasoning", data.reasoning]].map(([label, value]) => (
        <Text key={label} style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 4 }}>
          <Text style={{ fontWeight: "700", color: colors.text.primary }}>{label}: </Text>{value}
        </Text>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HandReviewScreen() {
  const { colors, spacing, radius, typography } = usePokerTheme();

  // ── Hand state ──
  const [numPlayers, setNumPlayers] = useState(6);
  const [heroPosition, setHeroPosition] = useState<Position>("BTN");
  const [villainOverrides, setVillainOverrides] = useState<Record<number, Position>>({});
  const [stackSize, setStackSize] = useState("100");
  const [stackMode, setStackMode] = useState<StackMode>("BB");
  const [bbDollars, setBbDollars] = useState("2");
  const [holeCards, setHoleCards] = useState<[Card,Card]>([null,null]);
  const [flop, setFlop] = useState<[Card,Card,Card]>([null,null,null]);
  const [turn, setTurn] = useState<Card>(null);
  const [river, setRiver] = useState<Card>(null);
  const [preflopActions, setPreflopActions] = useState<ActionItem[]>([newAction("Hero")]);
  const [flopActions, setFlopActions] = useState<ActionItem[]>([newAction("Hero")]);
  const [turnActions, setTurnActions] = useState<ActionItem[]>([newAction("Hero")]);
  const [riverActions, setRiverActions] = useState<ActionItem[]>([newAction("Hero")]);

  // When hero position or player count changes, reset action timelines with the
  // correct first actor (who acts first on each street per poker position order).
  useEffect(() => {
    const pf = heroActsFirst(heroPosition, "preflop", numPlayers) ? "Hero" : "Villain";
    const po = heroActsFirst(heroPosition, "postflop", numPlayers) ? "Hero" : "Villain";
    setPreflopActions([newAction(pf)]);
    setFlopActions([newAction(po)]);
    setTurnActions([newAction(po)]);
    setRiverActions([newAction(po)]);
  }, [heroPosition, numPlayers]);

  // ── UI state ──
  const [pickerVisible, setPickerVisible] = useState(false);
  const [activeSlot, setActiveSlot] = useState<SlotKey|null>(null);
  const [editingSeat, setEditingSeat] = useState<number|null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyItems, setHistoryItems] = useState<HandReview[]>([]);
  const [expandedReview, setExpandedReview] = useState<HandReview|null>(null);

  const loadHistory = useCallback(() => {
    setHistoryItems(getHandReviews(30));
  }, []);

  // ── Derived ──
  const seatLabels = computeSeatLabels(heroPosition, numPlayers, villainOverrides);
  const allUsed = allSelectedCards(holeCards, flop, turn, river);
  const holesFilled = holeCards[0] && holeCards[1];
  const flopFilled = flop[0] && flop[1] && flop[2];
  const preflopFolded = preflopActions.some(a => a.player === "Hero" && a.type === "Fold");
  const flopFolded = flopActions.some(a => a.player === "Hero" && a.type === "Fold");
  const turnFolded = turnActions.some(a => a.player === "Hero" && a.type === "Fold");
  const stackBB = stackInBB(stackSize, stackMode, bbDollars);

  // Auto positions for the villain being edited
  const pool = POSITIONS_BY_COUNT[numPlayers] ?? POSITIONS_BY_COUNT[6];
  const heroIdx = pool.indexOf(heroPosition);
  function autoPositionForSeat(idx: number): Position {
    return pool[(heroIdx + idx) % pool.length];
  }

  function openPicker(slot: SlotKey) {
    // For hole cards: if tapping hole2 but hole1 is empty, start from hole1
    // For flop: start from first empty flop slot in the group
    let start: SlotKey = slot;
    if (slot === "hole2" && !holeCards[0]) start = "hole1";
    if (slot === "flop2" && !flop[0]) start = "flop1";
    if (slot === "flop3") {
      if (!flop[0]) start = "flop1";
      else if (!flop[1]) start = "flop2";
    }
    setActiveSlot(start);
    setPickerVisible(true);
  }

  function handleCardSelect(cardStr: string) {
    if (!activeSlot) return;
    const c = cardStr as Card;
    if      (activeSlot === "hole1") setHoleCards([c, holeCards[1]]);
    else if (activeSlot === "hole2") setHoleCards([holeCards[0], c]);
    else if (activeSlot === "flop1") setFlop([c, flop[1], flop[2]]);
    else if (activeSlot === "flop2") setFlop([flop[0], c, flop[2]]);
    else if (activeSlot === "flop3") setFlop([flop[0], flop[1], c]);
    else if (activeSlot === "turn")  setTurn(c);
    else if (activeSlot === "river") setRiver(c);
    // Auto-advance to next slot in the batch; close only at end of sequence
    const next = SLOT_NEXT[activeSlot];
    if (next) {
      setActiveSlot(next);
    } else {
      setPickerVisible(false);
      setActiveSlot(null);
    }
  }

  function setVillainPos(seatIdx: number, pos: Position) {
    setVillainOverrides(prev => ({ ...prev, [seatIdx]: pos }));
    setEditingSeat(null);
  }

  function resetVillainPos(seatIdx: number) {
    setVillainOverrides(prev => { const next = { ...prev }; delete next[seatIdx]; return next; });
    setEditingSeat(null);
  }

  function resetHand() {
    const pf = heroActsFirst(heroPosition, "preflop", numPlayers) ? "Hero" : "Villain";
    const po = heroActsFirst(heroPosition, "postflop", numPlayers) ? "Hero" : "Villain";
    setHoleCards([null,null]); setFlop([null,null,null]); setTurn(null); setRiver(null);
    setVillainOverrides({});
    setPreflopActions([newAction(pf)]); setFlopActions([newAction(po)]);
    setTurnActions([newAction(po)]); setRiverActions([newAction(po)]);
    setResult(null); setError(null);
  }

  async function analyzeHand() {
    if (!holeCards[0] || !holeCards[1]) return;
    setLoading(true); setError(null); setResult(null);
    const userMsg = buildUserMessage(
      holeCards, heroPosition, stackSize, stackMode, bbDollars,
      numPlayers, seatLabels, flop, turn, river,
      { preflop: preflopActions, flop: flopActions, turn: turnActions, river: riverActions }
    );
    try {
      const response = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: userMsg }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any)?.error ?? `Server error ${response.status}`);
      }
      const data = await response.json();
      const text: string = data.text ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Invalid response from server");
      const parsed = JSON.parse(match[0]) as AIResult;
      setResult(parsed);
      // Save to history
      try {
        addHandReview({
          holeCards: `${holeCards[0]} ${holeCards[1]}`,
          position: heroPosition,
          numPlayers,
          stackDisplay: stackMode === "$" ? `$${stackSize}` : `${stackSize}BB`,
          resultJson: JSON.stringify(parsed),
          overallGrade: overallGrade(parsed),
        });
      } catch (_) {}
    } catch (e: any) {
      setError(e?.message ?? "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Helpers ──
  function SLabel({ label }: { label: string }) {
    return (
      <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </Text>
    );
  }

  function Section({ label, children, extra }: { label: string; children: ReactNode; extra?: ReactNode }) {
    return (
      <View style={{ backgroundColor: colors.bg.secondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border.default, padding: 16, marginBottom: 12, gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <SLabel label={label} />
          {extra}
        </View>
        {children}
      </View>
    );
  }

  // ── History modal ──
  const HistoryModal = () => (
    <Modal visible={historyVisible} animationType="slide" onRequestClose={() => setHistoryVisible(false)}>
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 56, borderBottomWidth: 1, borderColor: colors.border.default }}>
          <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: "800" }}>Review History</Text>
          <TouchableOpacity onPress={() => { setHistoryVisible(false); setExpandedReview(null); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialCommunityIcons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {expandedReview ? (
          // ── Expanded single review ──
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={() => setExpandedReview(null)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <MaterialCommunityIcons name="arrow-left" size={18} color={colors.text.brand} />
              <Text style={{ color: colors.text.brand, fontSize: 14, fontWeight: "700" }}>Back to History</Text>
            </TouchableOpacity>
            {(() => {
              let parsed: AIResult | null = null;
              try { parsed = JSON.parse(expandedReview.result_json); } catch (_) {}
              if (!parsed) return <Text style={{ color: colors.text.secondary }}>Could not load review.</Text>;
              return (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: "800" }}>{expandedReview.hole_cards}</Text>
                    <View style={{ backgroundColor: colors.bg.tertiary, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: "700" }}>{expandedReview.position} · {expandedReview.num_players}p</Text>
                    </View>
                    <View style={{ marginLeft: "auto" }}>
                      <MaterialCommunityIcons
                        name={gradeIsGood(expandedReview.overall_grade) ? "check-circle" : "close-circle"}
                        size={28}
                        color={gradeIsGood(expandedReview.overall_grade) ? "#22c55e" : "#ef4444"}
                      />
                    </View>
                  </View>
                  {parsed.preflop && <StreetPanel street="Preflop" data={parsed.preflop} colors={colors} />}
                  {parsed.flop && <StreetPanel street="Flop" data={parsed.flop} colors={colors} />}
                  {parsed.turn && <StreetPanel street="Turn" data={parsed.turn} colors={colors} />}
                  {parsed.river && <StreetPanel street="River" data={parsed.river} colors={colors} />}
                  <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border.brand, padding: 16 }}>
                    <Text style={{ color: colors.text.brand, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Summary</Text>
                    <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 21 }}>{parsed.summary}</Text>
                  </View>
                </>
              );
            })()}
          </ScrollView>
        ) : (
          // ── History list ──
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {historyItems.length === 0 ? (
              <View style={{ alignItems: "center", marginTop: 60, gap: 12 }}>
                <MaterialCommunityIcons name="cards-playing-outline" size={48} color={colors.text.tertiary} />
                <Text style={{ color: colors.text.tertiary, fontSize: 15 }}>No reviews yet</Text>
              </View>
            ) : historyItems.map(item => {
              const good = gradeIsGood(item.overall_grade);
              const date = new Date(item.created_at);
              const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
              const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setExpandedReview(item)}
                  style={{
                    backgroundColor: colors.bg.secondary, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.border.default,
                    padding: 14, marginBottom: 10,
                    flexDirection: "row", alignItems: "center", gap: 12,
                  }}
                >
                  {/* Tick / Cross */}
                  <MaterialCommunityIcons
                    name={good ? "check-circle" : "close-circle"}
                    size={32}
                    color={good ? "#22c55e" : "#ef4444"}
                  />

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: "800" }}>
                        {item.hole_cards}
                      </Text>
                      <View style={{ backgroundColor: good ? "#22c55e20" : "#ef444420", borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: good ? "#22c55e" : "#ef4444", fontSize: 12, fontWeight: "800" }}>
                          Grade {item.overall_grade}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                      {item.position} · {item.num_players} players · {item.stack_display}
                    </Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }}>
                      {dateStr} at {timeStr}
                    </Text>
                  </View>

                  {/* Grade badge */}
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: gradeColor(item.overall_grade, colors), alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>{item.overall_grade}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );

  // ── Results ──
  if (result) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg.primary }}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: "800" }}>Hand Analysis</Text>
          <TouchableOpacity onPress={() => { loadHistory(); setHistoryVisible(true); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.bg.secondary }}>
            <MaterialCommunityIcons name="history" size={14} color={colors.text.secondary} />
            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: "600" }}>History</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.text.secondary, fontSize: 13, marginBottom: 20 }}>AI coaching feedback on every street</Text>
        {result.preflop && <StreetPanel street="Preflop" data={result.preflop} colors={colors} />}
        {result.flop && <StreetPanel street="Flop" data={result.flop} boardCards={[flop[0],flop[1],flop[2]]} colors={colors} />}
        {result.turn && <StreetPanel street="Turn" data={result.turn} boardCards={[turn]} colors={colors} />}
        {result.river && <StreetPanel street="River" data={result.river} boardCards={[river]} colors={colors} />}
        <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border.brand, padding: 16, marginBottom: 20 }}>
          <Text style={{ color: colors.text.brand, fontSize: 13, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Summary</Text>
          <Text style={{ color: colors.text.primary, fontSize: 14, lineHeight: 21 }}>{result.summary}</Text>
        </View>
        <TouchableOpacity onPress={resetHand} style={{ backgroundColor: colors.bg.brand, borderRadius: radius.md, paddingVertical: 16, alignItems: "center" }}>
          <Text style={{ color: colors.text.onBrand, fontSize: 16, fontWeight: "700" }}>Review Another Hand</Text>
        </TouchableOpacity>
        <HistoryModal />
      </ScrollView>
    );
  }

  // ── Input ──
  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg.primary }}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        <PokerTable
          numPlayers={numPlayers} seatLabels={seatLabels}
          holeCards={holeCards} onHeroCardPress={openPicker}
          onVillainSeatPress={setEditingSeat} colors={colors}
        />

        {/* Villain position hint + history button */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: -8, marginBottom: 16, paddingHorizontal: 4 }}>
          <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
            Tap any villain seat to set their position
          </Text>
          <TouchableOpacity onPress={() => { loadHistory(); setHistoryVisible(true); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.bg.secondary }}>
            <MaterialCommunityIcons name="history" size={13} color={colors.text.secondary} />
            <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: "600" }}>History</Text>
          </TouchableOpacity>
        </View>

        {/* ── Setup ── */}
        <View style={{ backgroundColor: colors.bg.secondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border.default, padding: 16, marginBottom: 12, gap: 14 }}>
          <SLabel label="Setup" />

          {/* Players */}
          <View>
            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: "600", marginBottom: 6 }}>Number of Players</Text>
            <View style={{ flexDirection: "row", gap: 5 }}>
              {[2,3,4,5,6,7,8,9].map(n => (
                <TouchableOpacity key={n} onPress={() => { setNumPlayers(n); setVillainOverrides({}); }}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: "center",
                    backgroundColor: numPlayers === n ? colors.bg.brand : colors.bg.tertiary,
                    borderWidth: 1,
                    borderColor: numPlayers === n ? colors.border.brand : colors.border.default,
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: numPlayers === n ? colors.text.onBrand : colors.text.primary }}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Hero position */}
          <View>
            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: "600", marginBottom: 6 }}>Hero Position</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {POSITIONS.map(p => {
                const available = (POSITIONS_BY_COUNT[numPlayers] ?? []).includes(p);
                const takenByVillain = Object.values(villainOverrides).includes(p as Position);
                const disabled = !available || takenByVillain;
                return (
                  <TouchableOpacity key={p} onPress={() => !disabled && setHeroPosition(p)} disabled={disabled}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full,
                      backgroundColor: heroPosition === p ? colors.bg.brand : disabled ? colors.bg.secondary : colors.bg.tertiary,
                      borderWidth: 1,
                      borderColor: heroPosition === p ? colors.border.brand : disabled ? colors.border.subtle : colors.border.default,
                      opacity: disabled ? 0.35 : 1,
                    }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: heroPosition === p ? colors.text.onBrand : colors.text.primary }}>{p}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Stack size */}
          <View>
            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: "600", marginBottom: 6 }}>Effective Stack</Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
              {(["BB","$"] as StackMode[]).map(mode => (
                <TouchableOpacity key={mode} onPress={() => setStackMode(mode)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.full,
                    backgroundColor: stackMode === mode ? colors.bg.brand : colors.bg.tertiary,
                    borderWidth: 1,
                    borderColor: stackMode === mode ? colors.border.brand : colors.border.default,
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: stackMode === mode ? colors.text.onBrand : colors.text.primary }}>{mode}</Text>
                </TouchableOpacity>
              ))}
              {stackMode === "$" && (
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>1BB =</Text>
                  <TextInput value={bbDollars} onChangeText={setBbDollars} placeholder="2"
                    placeholderTextColor={colors.text.tertiary} keyboardType="numeric"
                    style={{ flex: 1, backgroundColor: colors.bg.tertiary, borderRadius: 8, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: 8, paddingVertical: 6, color: colors.text.primary, fontSize: 13 }}
                  />
                  <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>$</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput value={stackSize} onChangeText={setStackSize}
                placeholder={stackMode === "BB" ? "100" : "200"}
                placeholderTextColor={colors.text.tertiary} keyboardType="numeric"
                style={{ flex: 1, backgroundColor: colors.bg.tertiary, borderRadius: 8, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: 12, paddingVertical: 10, color: colors.text.primary, fontSize: 14 }}
              />
              <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: "600" }}>{stackMode}</Text>
            </View>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 4 }}>
              {stackMode === "$" && stackSize ? `≈ ${stackBB} BB` : stackMode === "BB" && stackSize && bbDollars ? `≈ $${(parseFloat(stackSize) * parseFloat(bbDollars)).toFixed(0)}` : ""}
            </Text>
          </View>
        </View>

        {/* Hole cards */}
        <View style={{ backgroundColor: colors.bg.secondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border.default, padding: 16, marginBottom: 12 }}>
          <SLabel label="Hole Cards" />
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <FormCardSlot card={holeCards[0]} onPress={() => openPicker("hole1")} colors={colors} />
            <FormCardSlot card={holeCards[1]} onPress={() => openPicker("hole2")} colors={colors} />
            {holesFilled && <Text style={{ color: colors.text.tertiary, fontSize: 12, marginLeft: 4 }}>Tap to change</Text>}
          </View>
        </View>

        {/* Preflop */}
        <View style={{ backgroundColor: colors.bg.secondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border.default, padding: 16, marginBottom: 12 }}>
          <SLabel label="Preflop Actions" />
          <ActionTimeline actions={preflopActions} onChange={setPreflopActions} colors={colors} radius={radius} stackMode={stackMode} />
        </View>

        {/* Flop */}
        {holesFilled && !preflopFolded && (
          <View style={{ backgroundColor: colors.bg.secondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border.default, padding: 16, marginBottom: 12, gap: 12 }}>
            <SLabel label="Flop" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <FormCardSlot card={flop[0]} onPress={() => openPicker("flop1")} colors={colors} />
              <FormCardSlot card={flop[1]} onPress={() => openPicker("flop2")} colors={colors} />
              <FormCardSlot card={flop[2]} onPress={() => openPicker("flop3")} colors={colors} />
            </View>
            {flopFilled && <ActionTimeline actions={flopActions} onChange={setFlopActions} colors={colors} radius={radius} stackMode={stackMode} />}
          </View>
        )}

        {/* Turn */}
        {holesFilled && flopFilled && !preflopFolded && !flopFolded && (
          <View style={{ backgroundColor: colors.bg.secondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border.default, padding: 16, marginBottom: 12, gap: 12 }}>
            <SLabel label="Turn" />
            <FormCardSlot card={turn} onPress={() => openPicker("turn")} colors={colors} />
            {turn && <ActionTimeline actions={turnActions} onChange={setTurnActions} colors={colors} radius={radius} stackMode={stackMode} />}
          </View>
        )}

        {/* River */}
        {holesFilled && flopFilled && turn && !preflopFolded && !flopFolded && !turnFolded && (
          <View style={{ backgroundColor: colors.bg.secondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border.default, padding: 16, marginBottom: 12, gap: 12 }}>
            <SLabel label="River" />
            <FormCardSlot card={river} onPress={() => openPicker("river")} colors={colors} />
            {river && <ActionTimeline actions={riverActions} onChange={setRiverActions} colors={colors} radius={radius} stackMode={stackMode} />}
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={{ backgroundColor: colors.bg.danger + "18", borderWidth: 1, borderColor: colors.border.danger, borderRadius: radius.sm, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.text.danger} />
            <Text style={{ color: colors.text.danger, fontSize: 13, flex: 1 }}>{error}</Text>
            <TouchableOpacity onPress={analyzeHand}>
              <Text style={{ color: colors.text.brand, fontSize: 13, fontWeight: "700" }}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Analyze */}
        <TouchableOpacity onPress={analyzeHand} disabled={!holesFilled || loading} activeOpacity={0.85}
          style={{
            backgroundColor: holesFilled && !loading ? colors.bg.brand : colors.bg.tertiary,
            borderRadius: radius.md, paddingVertical: 16,
            alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 8,
          }}>
          {loading
            ? <ActivityIndicator color={colors.text.onBrand} size="small" />
            : <MaterialCommunityIcons name="robot-outline" size={20} color={holesFilled ? colors.text.onBrand : colors.text.disabled} />}
          <Text style={{ color: holesFilled && !loading ? colors.text.onBrand : colors.text.disabled, fontSize: 16, fontWeight: "700" }}>
            {loading ? "Analyzing Hand…" : "Analyze Hand"}
          </Text>
        </TouchableOpacity>
        {!holesFilled && (
          <Text style={{ color: colors.text.tertiary, fontSize: 12, textAlign: "center" }}>
            Select your hole cards to enable analysis
          </Text>
        )}
      </ScrollView>

      {/* Card picker — usedCards excludes the slot being replaced so it can be swapped */}
      <CardPickerModal
        visible={pickerVisible}
        activeSlot={activeSlot}
        usedCards={allUsed.filter(c => {
          if (activeSlot === "hole1") return c !== holeCards[0];
          if (activeSlot === "hole2") return c !== holeCards[1];
          if (activeSlot === "flop1") return c !== flop[0];
          if (activeSlot === "flop2") return c !== flop[1];
          if (activeSlot === "flop3") return c !== flop[2];
          if (activeSlot === "turn")  return c !== turn;
          if (activeSlot === "river") return c !== river;
          return true;
        })}
        onSelect={handleCardSelect}
        onClose={() => { setPickerVisible(false); setActiveSlot(null); }}
        colors={colors}
      />

      <HistoryModal />

      {/* Villain position picker */}
      {editingSeat !== null && (
        <VillainPositionModal
          visible
          seatIdx={editingSeat}
          currentPos={villainOverrides[editingSeat] ?? null}
          autoPos={autoPositionForSeat(editingSeat)}
          heroPos={heroPosition}
          takenPositions={[
            heroPosition,
            ...Object.entries(villainOverrides)
              .filter(([i]) => parseInt(i) !== editingSeat)
              .map(([, pos]) => pos as Position),
          ]}
          onSelect={p => setVillainPos(editingSeat, p)}
          onReset={() => resetVillainPos(editingSeat)}
          onClose={() => setEditingSeat(null)}
          colors={colors} radius={radius}
        />
      )}
    </>
  );
}
