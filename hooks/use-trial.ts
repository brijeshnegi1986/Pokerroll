import { getSetting, setSetting } from "@/db/database";
import { TRIAL_DAYS } from "@/constants/subscription";

const SETTING_KEY = "appFirstOpened";
const MS_PER_DAY  = 86_400_000;

export function getTrialStatus(): {
  allowed: boolean;   // true during trial or if Pro (caller checks isPro separately)
  daysLeft: number;   // 0 = expired
  trialStarted: boolean;
} {
  const raw = getSetting(SETTING_KEY);
  if (!raw) return { allowed: true, daysLeft: TRIAL_DAYS, trialStarted: false };
  const firstOpened = parseInt(raw, 10);
  const elapsed     = Date.now() - firstOpened;
  const daysLeft    = Math.max(0, TRIAL_DAYS - Math.floor(elapsed / MS_PER_DAY));
  return { allowed: daysLeft > 0, daysLeft, trialStarted: true };
}

export function markTrialStarted(): void {
  if (!getSetting(SETTING_KEY)) setSetting(SETTING_KEY, String(Date.now()));
}
