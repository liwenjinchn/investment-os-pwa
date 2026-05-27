import type { AppData } from "./types";

export function downloadBackup(data: AppData) {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "investment-os-pwa",
    version: 1,
    data
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `investment-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function parseBackup(file: File): Promise<AppData> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const data = parsed.data ?? parsed;
  if (!Array.isArray(data.holdings) || !data.rules || !data.aiSettings) {
    throw new Error("备份文件格式不正确。");
  }
  return {
    holdings: data.holdings,
    rules: data.rules,
    aiSettings: data.aiSettings,
    decisionLogs: data.decisionLogs ?? [],
    weeklyReviews: data.weeklyReviews ?? []
  };
}
