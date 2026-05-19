// ─── Poker Range Charts ───────────────────────────────────────────────────────
// Standard 6-max NLH GTO-approximated ranges.
// Grid: RANKS[row] x RANKS[col] where:
//   row === col  →  pair  (AA, KK, …)
//   row < col    →  suited  (AKs when row=0, col=1)
//   row > col    →  offsuit (AKo when row=1, col=0)

export const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"] as const;

export type RangeAction = "R" | "C" | "M"; // Raise/3-bet, Call, Mixed
export type RangeData = Record<string, RangeAction>;

function build(raise: string[], call: string[] = [], mixed: string[] = []): RangeData {
  const out: RangeData = {};
  raise.forEach(h => (out[h] = "R"));
  call.forEach(h => (out[h] = "C"));
  mixed.forEach(h => (out[h] = "M"));
  return out;
}

/** Returns the hand string for grid cell (row, col). */
export function cellHand(row: number, col: number): string {
  if (row === col) return RANKS[row] + RANKS[row];
  if (row < col)  return RANKS[row] + RANKS[col] + "s";
  return RANKS[col] + RANKS[row] + "o";
}

/** Number of combos in the deck for a hand type. */
export function handCombos(hand: string): number {
  if (hand.length === 2) return 6;          // pair
  return hand.endsWith("s") ? 4 : 12;       // suited : offsuit
}

/** Range % of total 1326 combos. */
export function rangePercent(data: RangeData): number {
  const total = Object.entries(data).reduce(
    (s, [h, a]) => s + (a !== undefined ? handCombos(h) : 0), 0
  );
  return Math.round((total / 1326) * 100);
}

// ─── Open Raise (RFI) ─────────────────────────────────────────────────────────

export const RFI: Record<string, RangeData> = {
  UTG: build([
    "AA","KK","QQ","JJ","TT","99","88","77",
    "AKs","AQs","AJs","ATs","A5s","A4s","A3s",
    "KQs","KJs","KTs","QJs","QTs","JTs","T9s","98s","87s","76s",
    "AKo","AQo","AJo","KQo",
  ]),
  HJ: build([
    "AA","KK","QQ","JJ","TT","99","88","77","66",
    "AKs","AQs","AJs","ATs","A9s","A8s","A7s","A6s","A5s","A4s","A3s","A2s",
    "KQs","KJs","KTs","K9s","QJs","QTs","Q9s","JTs","J9s",
    "T9s","98s","97s","87s","76s","65s","54s",
    "AKo","AQo","AJo","ATo","KQo","KJo","QJo",
  ]),
  CO: build([
    "AA","KK","QQ","JJ","TT","99","88","77","66","55","44",
    "AKs","AQs","AJs","ATs","A9s","A8s","A7s","A6s","A5s","A4s","A3s","A2s",
    "KQs","KJs","KTs","K9s","K8s","K7s","K6s","K5s","K4s","K3s","K2s",
    "QJs","QTs","Q9s","Q8s","JTs","J9s","J8s","T9s","T8s",
    "98s","97s","96s","87s","86s","76s","75s","65s","64s","54s","53s",
    "AKo","AQo","AJo","ATo","KQo","KJo","KTo","QJo","QTo","JTo",
  ]),
  BTN: build([
    "AA","KK","QQ","JJ","TT","99","88","77","66","55","44","33","22",
    "AKs","AQs","AJs","ATs","A9s","A8s","A7s","A6s","A5s","A4s","A3s","A2s",
    "KQs","KJs","KTs","K9s","K8s","K7s","K6s","K5s","K4s","K3s","K2s",
    "QJs","QTs","Q9s","Q8s","Q7s","Q6s","Q5s","Q4s","Q3s","Q2s",
    "JTs","J9s","J8s","J7s","J6s","J5s","J4s",
    "T9s","T8s","T7s","T6s","T5s",
    "98s","97s","96s","95s","87s","86s","85s","76s","75s","74s","65s","64s","63s","54s","53s","43s","42s","32s",
    "AKo","AQo","AJo","ATo","A9o","A8o","A7o","A6o","A5o","A4o","A3o","A2o",
    "KQo","KJo","KTo","K9o","K8o","K7o",
    "QJo","QTo","Q9o","Q8o","JTo","J9o","J8o","T9o","T8o","98o","97o",
  ]),
  SB: build([
    "AA","KK","QQ","JJ","TT","99","88","77","66","55","44","33","22",
    "AKs","AQs","AJs","ATs","A9s","A8s","A7s","A6s","A5s","A4s","A3s","A2s",
    "KQs","KJs","KTs","K9s","K8s","K7s","K6s","K5s","K4s","K3s",
    "QJs","QTs","Q9s","Q8s","Q7s","Q6s","JTs","J9s","J8s","J7s","J6s",
    "T9s","T8s","T7s","T6s","98s","97s","96s","87s","86s","76s","75s","65s","64s","54s","53s","43s",
    "AKo","AQo","AJo","ATo","A9o","A8o","A7o","A6o","A5o","A4o","A3o","A2o",
    "KQo","KJo","KTo","K9o","K8o","QJo","QTo","Q9o","JTo","J9o","T9o","T8o","98o","97o",
  ]),
};

// ─── BB Defense (Call / 3-bet vs open) ───────────────────────────────────────

export const BB_DEFENSE: Record<string, RangeData> = {
  "vs BTN": build(
    // 3-bet
    ["AA","KK","QQ","AKs","AKo","A5s","A4s","A3s","A2s","76s","65s","54s"],
    // call
    [
      "JJ","TT","99","88","77","66","55","44","33","22",
      "AQs","AJs","ATs","A9s","A8s","A7s","A6s",
      "KQs","KJs","KTs","K9s","K8s","K7s","K6s","K5s","K4s",
      "QJs","QTs","Q9s","Q8s","Q7s","JTs","J9s","J8s","J7s",
      "T9s","T8s","T7s","98s","97s","96s","87s","86s","85s","75s","74s","64s","53s","43s",
      "AQo","AJo","ATo","A9o","A8o","A7o","A6o","A5o","A4o","A3o","A2o",
      "KQo","KJo","KTo","K9o","K8o","K7o","QJo","QTo","Q9o","Q8o",
      "JTo","J9o","J8o","T9o","T8o","98o","97o",
    ]
  ),
  "vs CO": build(
    ["AA","KK","QQ","AKs","AKo","A5s","A4s"],
    [
      "JJ","TT","99","88","77","66","55","44","33","22",
      "AQs","AJs","ATs","A9s","A8s","A7s","A6s","A3s","A2s",
      "KQs","KJs","KTs","K9s","K8s","K7s","QJs","QTs","Q9s","Q8s","Q7s",
      "JTs","J9s","J8s","J7s","T9s","T8s","T7s","98s","97s","96s",
      "87s","86s","76s","75s","65s","64s","54s","53s","43s",
      "AQo","AJo","ATo","A9o","A8o","A7o","A6o","A5o","A4o","A3o","A2o",
      "KQo","KJo","KTo","K9o","K8o","QJo","QTo","Q9o","JTo","J9o","T9o","T8o","98o","97o",
    ]
  ),
  "vs HJ": build(
    ["AA","KK","QQ","AKs","AKo"],
    [
      "JJ","TT","99","88","77","66","55","44","33","22",
      "AQs","AJs","ATs","A9s","A8s","A7s","A6s","A5s","A4s","A3s","A2s",
      "KQs","KJs","KTs","K9s","K8s","QJs","QTs","Q9s","Q8s","JTs","J9s","J8s",
      "T9s","T8s","98s","97s","87s","86s","76s","75s","65s","64s","54s","53s",
      "AQo","AJo","ATo","A9o","A8o","A7o","A6o","A5o","A4o",
      "KQo","KJo","KTo","K9o","QJo","QTo","JTo","J9o","T9o","98o",
    ]
  ),
};

// ─── 3-bet Ranges ─────────────────────────────────────────────────────────────

export const THREE_BET: Record<string, RangeData> = {
  "BTN vs CO": build(
    ["AA","KK","QQ","AKs","AKo","A5s","A4s","A3s","76s","65s"],
    ["JJ","TT","AQs","AQo","KQs","KJs","QJs","JTs","T9s","98s"],
    ["99","AJs","88","87s"]
  ),
  "BTN vs HJ": build(
    ["AA","KK","QQ","JJ","AKs","AKo","A5s","A4s","A3s"],
    ["TT","AQs","AJs","AQo","KQs","KJs","QJs","JTs","T9s","98s"],
    ["99","ATs","88"]
  ),
  "SB vs BTN": build(
    ["AA","KK","QQ","JJ","AKs","AKo","A5s","A4s","A3s","A2s","76s","65s","54s"],
    ["TT","99","AQs","AJs","AQo","KQs","KJs","QJs","JTs","T9s","98s","87s"],
    ["88","ATs","AJo"]
  ),
  "BB vs BTN": build(
    ["AA","KK","QQ","AKs","AKo","A5s","A4s","A3s","A2s","76s","65s","54s","43s"],
    ["JJ","TT","99","AQs","AJs","AQo","KQs","KJs","QJs","JTs","T9s","98s","87s","76s"],
    ["88","ATs","AJo","QTs"]
  ),
};
