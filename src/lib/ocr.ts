import { createWorker } from "tesseract.js";
import type { Market, OcrCandidate } from "./types";
import { uid } from "./types";

const marketFromCode = (code: string): Market => {
  if (/^\d{6}$/.test(code)) return "A股";
  if (/^\d{4,5}$/.test(code)) return "港股";
  if (/^[A-Z]{1,5}$/.test(code)) return "美股";
  return "其他";
};

export async function recognizeHoldingsFromImage(file: File): Promise<OcrCandidate[]> {
  const worker = await createWorker("chi_sim+eng");
  try {
    const { data } = await worker.recognize(file);
    return parseHoldingsText(data.text);
  } finally {
    await worker.terminate();
  }
}

export function parseHoldingsText(text: string): OcrCandidate[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const candidates = lines
    .map((line) => {
      const code = line.match(/\b([A-Z]{1,5}|\d{4,6})\b/)?.[1] ?? "";
      const weightMatch = line.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
      const weight = weightMatch ? Number(weightMatch[1]) : 0;
      const name = line
        .replace(code, "")
        .replace(/(\d{1,2}(?:\.\d+)?)\s*%/, "")
        .replace(/[|,，]/g, " ")
        .trim()
        .slice(0, 24);
      if (!name && !code) return null;
      return {
        id: uid("ocr"),
        rawText: line,
        name: name || code || "待确认标的",
        code,
        market: marketFromCode(code),
        theme: "",
        weight,
        thesis: ""
      } satisfies OcrCandidate;
    })
    .filter((item): item is OcrCandidate => Boolean(item));

  return candidates.slice(0, 20);
}
