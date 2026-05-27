import { openDB, type DBSchema } from "idb";
import {
  type AiSettings,
  type AppData,
  type DecisionLog,
  defaultAiSettings,
  defaultRules,
  type Holding,
  type RuleSettings,
  type WeeklyReview
} from "./types";

interface InvestmentDb extends DBSchema {
  holdings: {
    key: string;
    value: Holding;
    indexes: { "by-updated": string };
  };
  rules: {
    key: string;
    value: RuleSettings;
  };
  aiSettings: {
    key: string;
    value: AiSettings;
  };
  decisionLogs: {
    key: string;
    value: DecisionLog;
    indexes: { "by-created": string };
  };
  weeklyReviews: {
    key: string;
    value: WeeklyReview;
    indexes: { "by-week": string };
  };
}

const DB_NAME = "investment-os-local";
const DB_VERSION = 1;

export const dbPromise = openDB<InvestmentDb>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    const holdings = db.createObjectStore("holdings", { keyPath: "id" });
    holdings.createIndex("by-updated", "updatedAt");

    db.createObjectStore("rules", { keyPath: "id" });
    db.createObjectStore("aiSettings", { keyPath: "id" });

    const logs = db.createObjectStore("decisionLogs", { keyPath: "id" });
    logs.createIndex("by-created", "createdAt");

    const reviews = db.createObjectStore("weeklyReviews", { keyPath: "id" });
    reviews.createIndex("by-week", "weekStart");
  }
});

export async function ensureDefaults() {
  const db = await dbPromise;
  if (!(await db.get("rules", "main"))) {
    await db.put("rules", defaultRules());
  }
  if (!(await db.get("aiSettings", "main"))) {
    await db.put("aiSettings", defaultAiSettings());
  }
}

export async function getAppData(): Promise<AppData> {
  await ensureDefaults();
  const db = await dbPromise;
  const [holdings, rules, aiSettings, decisionLogs, weeklyReviews] = await Promise.all([
    db.getAll("holdings"),
    db.get("rules", "main"),
    db.get("aiSettings", "main"),
    db.getAllFromIndex("decisionLogs", "by-created"),
    db.getAllFromIndex("weeklyReviews", "by-week")
  ]);

  return {
    holdings: holdings.sort((a, b) => b.weight - a.weight),
    rules: rules ?? defaultRules(),
    aiSettings: aiSettings ?? defaultAiSettings(),
    decisionLogs: decisionLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    weeklyReviews: weeklyReviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export async function saveHolding(holding: Holding) {
  const db = await dbPromise;
  await db.put("holdings", { ...holding, updatedAt: new Date().toISOString() });
}

export async function deleteHolding(id: string) {
  const db = await dbPromise;
  await db.delete("holdings", id);
}

export async function saveRules(rules: RuleSettings) {
  const db = await dbPromise;
  await db.put("rules", { ...rules, id: "main", updatedAt: new Date().toISOString() });
}

export async function saveAiSettings(settings: AiSettings) {
  const db = await dbPromise;
  await db.put("aiSettings", { ...settings, id: "main", updatedAt: new Date().toISOString() });
}

export async function saveDecisionLog(log: DecisionLog) {
  const db = await dbPromise;
  await db.put("decisionLogs", log);
}

export async function saveWeeklyReview(review: WeeklyReview) {
  const db = await dbPromise;
  await db.put("weeklyReviews", review);
}

export async function replaceAllData(data: AppData) {
  const db = await dbPromise;
  const tx = db.transaction(["holdings", "rules", "aiSettings", "decisionLogs", "weeklyReviews"], "readwrite");
  await Promise.all([
    tx.objectStore("holdings").clear(),
    tx.objectStore("rules").clear(),
    tx.objectStore("aiSettings").clear(),
    tx.objectStore("decisionLogs").clear(),
    tx.objectStore("weeklyReviews").clear()
  ]);
  await Promise.all([
    ...data.holdings.map((item) => tx.objectStore("holdings").put(item)),
    tx.objectStore("rules").put(data.rules),
    tx.objectStore("aiSettings").put(data.aiSettings),
    ...data.decisionLogs.map((item) => tx.objectStore("decisionLogs").put(item)),
    ...data.weeklyReviews.map((item) => tx.objectStore("weeklyReviews").put(item))
  ]);
  await tx.done;
}

export async function clearAllData() {
  await replaceAllData({
    holdings: [],
    rules: defaultRules(),
    aiSettings: defaultAiSettings(),
    decisionLogs: [],
    weeklyReviews: []
  });
}
