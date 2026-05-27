import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  Download,
  FileUp,
  Home,
  ListChecks,
  Loader2,
  NotebookText,
  ScanText,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { buildPrompt, requestAiDecision } from "./lib/ai";
import { downloadBackup, parseBackup } from "./lib/backup";
import {
  clearAllData,
  deleteHolding,
  getAppData,
  replaceAllData,
  saveAiSettings,
  saveDecisionLog,
  saveHolding,
  saveRules,
  saveWeeklyReview
} from "./lib/db";
import { recognizeHoldingsFromImage } from "./lib/ocr";
import { calculateCashRatio, evaluateRules, localDecisionHint, themeExposure } from "./lib/rules";
import {
  type AiSettings,
  type AppData,
  type DecisionAction,
  type DecisionLog,
  type Holding,
  type ImpactLevel,
  type Market,
  type OcrCandidate,
  type RuleSettings,
  uid
} from "./lib/types";
import { generateWeeklyReview } from "./lib/review";

type Tab = "today" | "holdings" | "logs" | "review" | "settings";

const markets: Market[] = ["A股", "港股", "美股", "基金", "其他"];

const emptyHolding = (): Holding => ({
  id: uid("holding"),
  name: "",
  code: "",
  market: "港股",
  theme: "",
  weight: 0,
  thesis: "",
  updatedAt: new Date().toISOString()
});

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function jsonAdvice(content: string) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as {
      impactLevel?: ImpactLevel;
      action?: DecisionAction;
      reasons?: string[];
      triggeredRules?: string[];
      reviewPoint?: string;
    };
  } catch {
    return null;
  }
}

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [status, setStatus] = useState("");

  const reload = async () => setData(await getAppData());

  useEffect(() => {
    reload().catch((error) => setStatus(error.message));
  }, []);

  if (!data) {
    return (
      <main className="boot-screen">
        <div className="boot-card">
          <Loader2 className="spin" size={22} />
          <strong>载入本地投资 OS</strong>
          <span>只从浏览器本地读取，不上传任何持仓截图</span>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Sparkles size={15} />
          </div>
          <div>
            <h1>投资 OS</h1>
            <p>本地优先 · 纪律先于消息</p>
          </div>
        </div>
        <button className="icon-button" type="button" onClick={() => reload()} aria-label="刷新">
          <ArrowRight size={18} />
        </button>
      </header>

      {status ? (
        <aside className="status-banner">
          <ShieldCheck size={16} />
          <span>{status}</span>
        </aside>
      ) : null}

      <main className="main-rail">
        {tab === "today" ? <Today data={data} reload={reload} setStatus={setStatus} /> : null}
        {tab === "holdings" ? <Holdings data={data} reload={reload} setStatus={setStatus} /> : null}
        {tab === "logs" ? <Logs data={data} /> : null}
        {tab === "review" ? <Review data={data} reload={reload} setStatus={setStatus} /> : null}
        {tab === "settings" ? <SettingsView data={data} reload={reload} setStatus={setStatus} /> : null}
      </main>

      <nav className="tabbar" aria-label="主导航">
        <TabButton active={tab === "today"} onClick={() => setTab("today")} icon={<Home size={18} />} label="今日" />
        <TabButton active={tab === "holdings"} onClick={() => setTab("holdings")} icon={<BarChart3 size={18} />} label="持仓" />
        <TabButton active={tab === "logs"} onClick={() => setTab("logs")} icon={<NotebookText size={18} />} label="日志" />
        <TabButton active={tab === "review"} onClick={() => setTab("review")} icon={<ListChecks size={18} />} label="复盘" />
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings size={18} />} label="设置" />
      </nav>
    </div>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button className={`tab-button ${props.active ? "is-active" : ""}`} type="button" onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function Today(props: { data: AppData; reload: () => Promise<void>; setStatus: (value: string) => void }) {
  const { holdings, rules, decisionLogs, aiSettings } = props.data;
  const [eventText, setEventText] = useState("");
  const [aiRaw, setAiRaw] = useState("");
  const [prompt, setPrompt] = useState("");
  const [reviewPoint, setReviewPoint] = useState("");
  const [finalDecision, setFinalDecision] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);

  const ruleResult = useMemo(() => evaluateRules(holdings, rules, eventText, decisionLogs), [holdings, rules, eventText, decisionLogs]);
  const advice = jsonAdvice(aiRaw);
  const recommendedAction = advice?.action ?? (localDecisionHint(ruleResult.messages) as DecisionAction);
  const impact = advice?.impactLevel ?? "中";
  const cashRatio = calculateCashRatio(holdings);
  const maxTheme = Math.max(0, ...Object.values(themeExposure(holdings)));
  const dangerCount = ruleResult.messages.filter((message) => message !== "未触发硬性规则，仍需记录理由").length;

  const build = () => {
    const next = buildPrompt({
      eventText,
      holdings,
      rules,
      recentLogs: decisionLogs,
      localRuleMessages: ruleResult.messages
    });
    setPrompt(next);
    return next;
  };

  const askAi = async () => {
    const next = prompt || build();
    setLoadingAi(true);
    try {
      const content = await requestAiDecision(aiSettings, next);
      setAiRaw(content);
      const parsed = jsonAdvice(content);
      setFinalDecision(parsed?.action ? `${parsed.action}：${parsed.reasons?.join("；") ?? ""}` : content.slice(0, 180));
      setReviewPoint(parsed?.reviewPoint ?? "");
      props.setStatus("AI 分析完成，可以写入日志。");
    } catch (error) {
      props.setStatus(error instanceof Error ? error.message : "AI 请求失败。");
    } finally {
      setLoadingAi(false);
    }
  };

  const saveLog = async () => {
    if (!eventText.trim()) {
      props.setStatus("请先输入事件。");
      return;
    }
    const log: DecisionLog = {
      id: uid("log"),
      createdAt: new Date().toISOString(),
      eventText,
      impactLevel: impact,
      action: recommendedAction,
      aiAdvice: aiRaw || "未调用 AI，仅使用本地规则判断。",
      localRules: ruleResult.messages,
      finalDecision: finalDecision || recommendedAction,
      reviewPoint: reviewPoint || "下次复盘时回看：这条消息是否真的改变了买入逻辑。"
    };
    await saveDecisionLog(log);
    setEventText("");
    setAiRaw("");
    setPrompt("");
    setReviewPoint("");
    setFinalDecision("");
    props.setStatus("决策日志已写入本地数据库。");
    await props.reload();
  };

  return (
    <section className="rail-stack">
      <section className={`hero-strip ${ruleResult.severity}`}>
        <div className="hero-copy">
          <span>今日纪律状态</span>
          <strong>{ruleResult.severity === "ok" ? "可观察，不急动" : ruleResult.severity === "warn" ? "先复核规则" : "进入防守模式"}</strong>
          <p>把消息、持仓、规则放在同一页里，先判断能不能动，再判断值不值得动。</p>
        </div>
        <div className="hero-score">
          <small>纪律分</small>
          <b>{100 - dangerCount * 28}</b>
        </div>
      </section>

      <section className="metric-grid">
        <Metric label="现金比例" value={`${cashRatio}%`} accent={cashRatio < rules.minCashRatio} />
        <Metric label="单只最大" value={holdings[0] ? `${holdings[0].weight}%` : "0%"} accent={Boolean(holdings[0] && holdings[0].weight > rules.maxSingleWeight)} />
        <Metric label="主题暴露" value={`${maxTheme}%`} accent={maxTheme > rules.maxThemeExposure} />
        <Metric label="待处理" value={`${dangerCount}`} accent={ruleResult.severity !== "ok"} />
      </section>

      <section className="panel">
        <PanelTitle icon={<Brain size={18} />} title="看到消息，要不要动？" />
        <textarea
          value={eventText}
          onChange={(event) => setEventText(event.target.value)}
          placeholder="粘贴新闻、公告、群聊、社媒内容，或者你自己突然想加仓的原因..."
          rows={6}
        />
        <div className={`rule-callout ${ruleResult.severity}`}>
          <ShieldCheck size={16} />
          <div>
            {ruleResult.messages.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        </div>
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={build}>
            <ScanText size={16} />
            Prompt 预览
          </button>
          <button className="primary-button" type="button" onClick={askAi} disabled={loadingAi}>
            {loadingAi ? <Loader2 className="spin" size={16} /> : <Brain size={16} />}
            让 AI 分析
          </button>
        </div>
      </section>

      {prompt ? (
        <section className="panel">
          <PanelTitle icon={<NotebookText size={18} />} title="发送前预览" />
          <pre className="prompt-box">{prompt}</pre>
        </section>
      ) : null}

      <section className="panel decision-panel">
        <PanelTitle icon={<AlertTriangle size={18} />} title="决策卡" />
        <div className="decision-grid">
          <div className="decision-tile">
            <span>建议动作</span>
            <strong>{recommendedAction}</strong>
          </div>
          <div className="decision-tile">
            <span>影响层级</span>
            <strong>{impact}</strong>
          </div>
        </div>
        {advice?.reasons?.length ? (
          <ul className="tight-list">
            {advice.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">未调用 AI 时，先按本地规则给出最保守的建议。</p>
        )}
        <label>
          最终决定
          <textarea value={finalDecision} onChange={(event) => setFinalDecision(event.target.value)} rows={3} placeholder="例如：不动，等周复盘再判断。" />
        </label>
        <label>
          复盘点
          <input value={reviewPoint} onChange={(event) => setReviewPoint(event.target.value)} placeholder="下次回看什么事实能证明这次判断对或错" />
        </label>
        <button className="primary-button full" type="button" onClick={saveLog}>
          <Check size={16} />
          写入决策日志
        </button>
      </section>
    </section>
  );
}

function Metric(props: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`metric ${props.accent ? "accent" : ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function PanelTitle(props: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {props.icon}
      <h2>{props.title}</h2>
    </div>
  );
}

function Holdings(props: { data: AppData; reload: () => Promise<void>; setStatus: (value: string) => void }) {
  const [editing, setEditing] = useState<Holding>(emptyHolding());
  const [candidates, setCandidates] = useState<OcrCandidate[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);

  const save = async () => {
    if (!editing.name.trim()) {
      props.setStatus("标的名称不能为空。");
      return;
    }
    await saveHolding(editing);
    setEditing(emptyHolding());
    props.setStatus("持仓已保存。");
    await props.reload();
  };

  const runOcr = async (file?: File) => {
    if (!file) return;
    setOcrLoading(true);
    try {
      const items = await recognizeHoldingsFromImage(file);
      setCandidates(items.length ? items : [{ ...emptyHolding(), id: uid("ocr"), rawText: "OCR 未识别到内容，请手动录入。", theme: "" }]);
      props.setStatus("OCR 候选已生成，确认后才会写入。");
    } catch (error) {
      setCandidates([{ ...emptyHolding(), id: uid("ocr"), rawText: error instanceof Error ? error.message : "OCR 失败，请手动录入。", theme: "" }]);
      props.setStatus("OCR 失败，可手动录入。");
    } finally {
      setOcrLoading(false);
    }
  };

  const confirmCandidate = async (candidate: OcrCandidate) => {
    await saveHolding({
      id: uid("holding"),
      name: candidate.name,
      code: candidate.code,
      market: candidate.market,
      theme: candidate.theme,
      weight: candidate.weight,
      thesis: candidate.thesis,
      updatedAt: new Date().toISOString()
    });
    setCandidates((items) => items.filter((item) => item.id !== candidate.id));
    props.setStatus("OCR 候选已确认并写入本地数据库。");
    await props.reload();
  };

  return (
    <section className="rail-stack">
      <section className="panel">
        <PanelTitle icon={<Sparkles size={18} />} title="手动录入持仓" />
        <HoldingForm value={editing} onChange={setEditing} />
        <button className="primary-button full" type="button" onClick={save}>
          <Check size={16} />
          保存持仓
        </button>
      </section>

      <section className="panel">
        <PanelTitle icon={<ScanText size={18} />} title="OCR 导入截图" />
        <input type="file" accept="image/*" onChange={(event) => runOcr(event.target.files?.[0])} />
        {ocrLoading ? <p className="muted">本地 OCR 识别中，截图不会上传服务器。</p> : <p className="muted">识别出来的内容必须逐条确认后才会入库。</p>}
        {candidates.map((candidate) => (
          <div className="candidate-card" key={candidate.id}>
            <small>{candidate.rawText}</small>
            <HoldingCandidate value={candidate} onChange={(next) => setCandidates((items) => items.map((item) => (item.id === next.id ? next : item)))} />
            <button className="ghost-button full" type="button" onClick={() => confirmCandidate(candidate)}>
              <Check size={16} />
              确认写入
            </button>
          </div>
        ))}
      </section>

      <section className="panel">
        <PanelTitle icon={<BarChart3 size={18} />} title="当前持仓" />
        {props.data.holdings.length ? (
          <div className="holding-list">
            {props.data.holdings.map((item) => (
              <article className="holding-row" key={item.id}>
                <button type="button" className="row-main" onClick={() => setEditing(item)}>
                  <strong>{item.name}</strong>
                  <span>
                    {item.code || "无代码"} · {item.market} · {item.theme || "未分类"}
                  </span>
                </button>
                <b>{item.weight}%</b>
                <button
                  className="icon-button"
                  type="button"
                  onClick={async () => {
                    await deleteHolding(item.id);
                    await props.reload();
                  }}
                  aria-label={`删除 ${item.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">还没有持仓。先手动录入，或者上传截图做 OCR 候选识别。</p>
        )}
      </section>
    </section>
  );
}

function HoldingForm(props: { value: Holding; onChange: (value: Holding) => void }) {
  const update = (patch: Partial<Holding>) => props.onChange({ ...props.value, ...patch });
  return (
    <div className="form-grid">
      <label>
        标的
        <input value={props.value.name} onChange={(event) => update({ name: event.target.value })} />
      </label>
      <label>
        代码
        <input value={props.value.code} onChange={(event) => update({ code: event.target.value.toUpperCase() })} />
      </label>
      <label>
        市场
        <select value={props.value.market} onChange={(event) => update({ market: event.target.value as Market })}>
          {markets.map((market) => (
            <option key={market}>{market}</option>
          ))}
        </select>
      </label>
      <label>
        仓位 %
        <input type="number" min="0" max="100" value={props.value.weight} onChange={(event) => update({ weight: Number(event.target.value) })} />
      </label>
      <label>
        主题
        <input value={props.value.theme} onChange={(event) => update({ theme: event.target.value })} placeholder="如 港股成长" />
      </label>
      <label className="wide">
        买入逻辑
        <textarea value={props.value.thesis} onChange={(event) => update({ thesis: event.target.value })} rows={3} />
      </label>
    </div>
  );
}

function HoldingCandidate(props: { value: OcrCandidate; onChange: (value: OcrCandidate) => void }) {
  const update = (patch: Partial<OcrCandidate>) => props.onChange({ ...props.value, ...patch });
  return (
    <div className="form-grid compact">
      <input value={props.value.name} onChange={(event) => update({ name: event.target.value })} placeholder="标的" />
      <input value={props.value.code} onChange={(event) => update({ code: event.target.value.toUpperCase() })} placeholder="代码" />
      <select value={props.value.market} onChange={(event) => update({ market: event.target.value as Market })}>
        {markets.map((market) => (
          <option key={market}>{market}</option>
        ))}
      </select>
      <input type="number" value={props.value.weight} onChange={(event) => update({ weight: Number(event.target.value) })} placeholder="仓位 %" />
      <input value={props.value.theme} onChange={(event) => update({ theme: event.target.value })} placeholder="主题" />
      <input value={props.value.thesis} onChange={(event) => update({ thesis: event.target.value })} placeholder="买入逻辑" />
    </div>
  );
}

function Logs(props: { data: AppData }) {
  return (
    <section className="rail-stack">
      <section className="panel">
        <PanelTitle icon={<NotebookText size={18} />} title="决策日志" />
        {props.data.decisionLogs.length ? (
          <div className="log-list">
            {props.data.decisionLogs.map((log) => (
              <article className="log-row" key={log.id}>
                <div>
                  <time>{formatTime(log.createdAt)}</time>
                  <strong>
                    {log.action} · {log.impactLevel}
                  </strong>
                </div>
                <p>{log.eventText}</p>
                <small>{log.finalDecision}</small>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">还没有日志。每次分析后可在今日页一键写入。</p>
        )}
      </section>
    </section>
  );
}

function Review(props: { data: AppData; reload: () => Promise<void>; setStatus: (value: string) => void }) {
  const createReview = async () => {
    const review = generateWeeklyReview(props.data.decisionLogs);
    await saveWeeklyReview(review);
    props.setStatus("本周复盘已生成。");
    await props.reload();
  };

  return (
    <section className="rail-stack">
      <section className="panel">
        <PanelTitle icon={<ListChecks size={18} />} title="每周复盘" />
        <button className="primary-button full" type="button" onClick={createReview}>
          <Check size={16} />
          汇总本周日志
        </button>
      </section>

      {props.data.weeklyReviews.length ? (
        props.data.weeklyReviews.map((review) => (
          <section className="panel review-card" key={review.id}>
            <h3>{review.weekStart} 周</h3>
            <p>{review.actionsSummary}</p>
            <p>{review.rulesFollowed}</p>
            <p>{review.emotionalSignals}</p>
            <strong>本周最该反思的一件事</strong>
            <p>{review.reflection}</p>
            <strong>下周只看 3 件事</strong>
            <ol>
              {(review.nextWatchItems.length ? review.nextWatchItems : ["现金是否回到规则区间", "最大持仓是否需要降集中度", "是否出现新的买入逻辑证据"]).slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
        ))
      ) : (
        <section className="panel">
          <p className="empty">暂无复盘。没有日志时也会显示空状态，不会报错。</p>
        </section>
      )}
    </section>
  );
}

function SettingsView(props: { data: AppData; reload: () => Promise<void>; setStatus: (value: string) => void }) {
  const [rules, setRulesState] = useState<RuleSettings>(props.data.rules);
  const [ai, setAiState] = useState<AiSettings>(props.data.aiSettings);
  const [testLoading, setTestLoading] = useState(false);

  const save = async () => {
    await saveRules(rules);
    await saveAiSettings(ai);
    props.setStatus("设置已保存到本地。");
    await props.reload();
  };

  const test = async () => {
    setTestLoading(true);
    try {
      await requestAiDecision(ai, "请只回复 JSON：{\"ok\":true,\"message\":\"配置可用\"}");
      props.setStatus("AI 测试请求成功。");
    } catch (error) {
      props.setStatus(error instanceof Error ? error.message : "AI 测试失败。");
    } finally {
      setTestLoading(false);
    }
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const next = await parseBackup(file);
      await replaceAllData(next);
      props.setStatus("备份已导入并恢复。");
      await props.reload();
    } catch (error) {
      props.setStatus(error instanceof Error ? error.message : "导入失败。");
    }
  };

  return (
    <section className="rail-stack">
      <section className="panel">
        <PanelTitle icon={<Settings size={18} />} title="AI 设置" />
        <label>
          Base URL
          <input value={ai.apiBaseUrl} onChange={(event) => setAiState({ ...ai, apiBaseUrl: event.target.value })} />
        </label>
        <label>
          API Key
          <input type="password" value={ai.apiKey} onChange={(event) => setAiState({ ...ai, apiKey: event.target.value })} placeholder="只保存在本地浏览器" />
        </label>
        <label>
          Model
          <input value={ai.model} onChange={(event) => setAiState({ ...ai, model: event.target.value })} />
        </label>
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={test} disabled={testLoading}>
            {testLoading ? <Loader2 className="spin" size={16} /> : <Brain size={16} />}
            测试
          </button>
          <button className="primary-button" type="button" onClick={save}>
            <Check size={16} />
            保存
          </button>
        </div>
      </section>

      <section className="panel">
        <PanelTitle icon={<ShieldCheck size={18} />} title="规则" />
        <div className="form-grid">
          <NumberField label="现金下限 %" value={rules.minCashRatio} onChange={(value) => setRulesState({ ...rules, minCashRatio: value })} />
          <NumberField label="单只上限 %" value={rules.maxSingleWeight} onChange={(value) => setRulesState({ ...rules, maxSingleWeight: value })} />
          <NumberField label="主题上限 %" value={rules.maxThemeExposure} onChange={(value) => setRulesState({ ...rules, maxThemeExposure: value })} />
          <NumberField label="单次调整上限 %" value={rules.maxSingleAdjustment} onChange={(value) => setRulesState({ ...rules, maxSingleAdjustment: value })} />
        </div>
        <label className="check-row">
          <input type="checkbox" checked={rules.noTradeAtOpen} onChange={(event) => setRulesState({ ...rules, noTradeAtOpen: event.target.checked })} />
          开盘禁动
        </label>
        <label className="check-row">
          <input type="checkbox" checked={rules.overnightCooldownAfterSell} onChange={(event) => setRulesState({ ...rules, overnightCooldownAfterSell: event.target.checked })} />
          卖出后隔夜冷却
        </label>
      </section>

      <section className="panel">
        <PanelTitle icon={<Download size={18} />} title="本地备份" />
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={() => downloadBackup(props.data)}>
            <Download size={16} />
            导出 backup.json
          </button>
          <label className="file-button">
            <FileUp size={16} />
            导入
            <input type="file" accept="application/json" onChange={(event) => importBackup(event.target.files?.[0])} />
          </label>
        </div>
        <button
          className="danger-button full"
          type="button"
          onClick={async () => {
            await clearAllData();
            props.setStatus("本地数据已清空并恢复默认设置。");
            await props.reload();
          }}
        >
          <Trash2 size={16} />
          清空本地数据
        </button>
      </section>
    </section>
  );
}

function NumberField(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {props.label}
      <input type="number" min="0" max="100" value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} />
    </label>
  );
}
