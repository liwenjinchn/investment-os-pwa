import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  FileCheck2,
  Link2,
  Loader2,
  Plus,
  Save,
  Scale,
  ShieldAlert,
  Trash2
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { requestAiDecision } from "./lib/ai";
import { deleteEventCase, saveDecisionLog, saveEventCase } from "./lib/db";
import {
  assessEventCase,
  buildEventRedTeamPrompt,
  eventImpactLevel,
  newEventCase,
  newEvidence,
  newScenario
} from "./lib/eventDecision";
import {
  type AppData,
  type DecisionAction,
  type EventDecisionCase,
  type EventEvidence,
  type EventScenario,
  type EventStatus,
  type EventType,
  type EvidenceNature,
  type EvidenceTier,
  type ThesisEffect,
  uid
} from "./lib/types";

interface EventCenterProps {
  data: AppData;
  reload: () => Promise<void>;
  setStatus: (value: string) => void;
}

const eventTypes: EventType[] = ["业绩与指引", "监管与诉讼", "并购与重组", "产品与经营", "资本配置", "指数与资金流", "宏观与行业", "其他"];
const evidenceTiers: EvidenceTier[] = ["一手文件", "公司口径", "独立来源", "市场信号", "未核实"];
const evidenceNatures: EvidenceNature[] = ["事实", "假设", "判断"];
const thesisEffects: ThesisEffect[] = ["强化", "不变", "削弱", "证伪"];
const decisionActions: DecisionAction[] = ["不动", "复盘", "减仓", "加仓", "写入观察"];

const dateLabel = (value: string) => {
  if (!value) return "未定日期";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
};

const statusTone: Record<EventStatus, string> = {
  待研判: "quiet",
  研判中: "warn",
  监控中: "active",
  已复盘: "done"
};

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

export function EventCenter(props: EventCenterProps) {
  const [draft, setDraft] = useState<EventDecisionCase | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const assessment = useMemo(
    () => (draft ? assessEventCase(draft, props.data.holdings, props.data.rules) : null),
    [draft, props.data.holdings, props.data.rules]
  );

  if (!draft || !assessment) {
    return <EventInbox {...props} onEdit={(item) => setDraft(structuredClone(item))} onCreate={() => setDraft(newEventCase(props.data.holdings[0]))} />;
  }

  const patch = (next: Partial<EventDecisionCase>) => setDraft((current) => (current ? { ...current, ...next } : current));

  const persist = async (message = "事件研判已保存到本地。") => {
    const status: EventStatus = draft.status === "待研判" && (draft.title.trim() || draft.summary.trim()) ? "研判中" : draft.status;
    await saveEventCase({ ...draft, status });
    patch({ status });
    props.setStatus(message);
    await props.reload();
  };

  const confirmDecision = async () => {
    if (assessment.gates.length) {
      props.setStatus(`还不能确认：${assessment.gates[0]}`);
      return;
    }
    if (!draft.decisionRationale.trim() || !draft.nextTrigger.trim() || !draft.reviewAt) {
      props.setStatus("确认前请补全最终理由、下一触发器和复盘日期。");
      return;
    }

    const wasMonitoring = draft.status === "监控中";
    const confirmed = { ...draft, status: "监控中" as const };
    await saveEventCase(confirmed);
    if (!wasMonitoring) {
      await saveDecisionLog({
        id: uid("log"),
        createdAt: new Date().toISOString(),
        eventText: `${draft.title}：${draft.summary}`,
        impactLevel: eventImpactLevel(assessment),
        action: draft.finalAction,
        aiAdvice: draft.aiRedTeam || "未调用 AI；使用本地证据、情景和组合规则完成研判。",
        localRules: [...assessment.gates, ...assessment.warnings, ...assessment.reasons],
        finalDecision: `${draft.finalAction}：${draft.decisionRationale}`,
        reviewPoint: `${draft.nextTrigger}；${draft.reviewAt} 复盘`,
        relatedCode: draft.symbol,
        eventCaseId: draft.id
      });
    }
    setDraft(confirmed);
    props.setStatus(wasMonitoring ? "监控规则已更新。" : "决策已确认，事件进入监控并写入决策日志。");
    await props.reload();
  };

  const askRedTeam = async () => {
    setAiLoading(true);
    try {
      const holding = props.data.holdings.find((item) => item.code.toUpperCase() === draft.symbol.toUpperCase());
      const answer = await requestAiDecision(props.data.aiSettings, buildEventRedTeamPrompt(draft, assessment, holding));
      patch({ aiRedTeam: answer });
      props.setStatus("反方审查已返回；保存前仍由你确认内容。 ");
    } catch (error) {
      props.setStatus(error instanceof Error ? error.message : "反方审查失败。");
    } finally {
      setAiLoading(false);
    }
  };

  const finishReview = async () => {
    if (!draft.actualOutcome.trim() || !draft.lesson.trim()) {
      props.setStatus("请先记录实际结果和可复用教训。");
      return;
    }
    const reviewed = { ...draft, status: "已复盘" as const };
    await saveEventCase(reviewed);
    setDraft(reviewed);
    props.setStatus("事件已完成复盘，历史研判与结果均已保留。");
    await props.reload();
  };

  return (
    <section className="rail-stack event-workbench">
      <div className="workbench-toolbar">
        <button className="back-button" type="button" onClick={() => setDraft(null)}>
          <ArrowLeft size={16} /> 事件队列
        </button>
        <span className={`status-chip ${statusTone[draft.status]}`}>{draft.status}</span>
      </div>

      <section className="event-lede">
        <div>
          <span className="kicker">EVENT UNDERWRITING</span>
          <h2>{draft.title || "新事件研判"}</h2>
          <p>先还原事实，再做情景；组合纪律永远拥有否决权。</p>
        </div>
        <div className={`readiness-seal ${assessment.readiness}`}>
          <small>决策状态</small>
          <strong>{assessment.readiness === "ready" ? "可确认" : assessment.readiness === "review" ? "需复核" : "被阻止"}</strong>
        </div>
      </section>

      <ProcessRail draft={draft} assessment={assessment} />

      <WorkflowSection number="01" title="定义事件" subtitle="这件事是什么，何时发生，影响哪条原始论点。" icon={<CircleDot size={18} />}>
        <div className="form-grid">
          <label>
            关联持仓
            <select
              value={props.data.holdings.find((item) => item.code === draft.symbol)?.id ?? ""}
              onChange={(event) => {
                const holding = props.data.holdings.find((item) => item.id === event.target.value);
                if (holding) patch({ symbol: holding.code, companyName: holding.name, affectedThesis: holding.thesis });
              }}
            >
              <option value="">未关联 / 手动填写</option>
              {props.data.holdings.map((item) => (
                <option key={item.id} value={item.id}>{item.name} · {item.code || "无代码"}</option>
              ))}
            </select>
          </label>
          <label>
            事件类型
            <select value={draft.eventType} onChange={(event) => patch({ eventType: event.target.value as EventType })}>
              {eventTypes.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="wide">
            事件标题
            <input value={draft.title} onChange={(event) => patch({ title: event.target.value })} placeholder="例如：公司下调下一财年收入指引" />
          </label>
          <label>
            公司 / 标的
            <input value={draft.companyName} onChange={(event) => patch({ companyName: event.target.value })} />
          </label>
          <label>
            代码
            <input value={draft.symbol} onChange={(event) => patch({ symbol: event.target.value.toUpperCase() })} />
          </label>
          <label>
            已知日期
            <input type="date" value={draft.eventDate} onChange={(event) => patch({ eventDate: event.target.value })} />
          </label>
          <label>
            预计时间窗
            <input value={draft.timeWindow} onChange={(event) => patch({ timeWindow: event.target.value })} placeholder="例如：未来 2 个季度" />
          </label>
          <label className="wide">
            只写已确认的事实摘要
            <textarea value={draft.summary} onChange={(event) => patch({ summary: event.target.value })} rows={4} placeholder="谁在什么时间，通过什么文件，确认了什么变化？" />
          </label>
          <label className="wide">
            受影响的原始论点
            <textarea value={draft.affectedThesis} onChange={(event) => patch({ affectedThesis: event.target.value })} rows={3} placeholder="不要写股价判断；写业务、竞争、盈利或估值假设。" />
          </label>
          <label className="wide">
            论点证伪条件
            <textarea value={draft.thesisBreakCondition} onChange={(event) => patch({ thesisBreakCondition: event.target.value })} rows={3} placeholder="出现什么可观察结果，就必须承认原逻辑不成立？" />
          </label>
        </div>
      </WorkflowSection>

      <WorkflowSection number="02" title="建立证据账本" subtitle="事实、假设与判断分开；一手文件优先。" icon={<FileCheck2 size={18} />}>
        <div className="evidence-stack">
          {draft.evidence.map((item, index) => (
            <EvidenceEditor
              key={item.id}
              item={item}
              index={index}
              onChange={(next) => patch({ evidence: draft.evidence.map((row) => (row.id === next.id ? next : row)) })}
              onDelete={() => patch({ evidence: draft.evidence.filter((row) => row.id !== item.id) })}
            />
          ))}
        </div>
        <button className="add-row-button" type="button" onClick={() => patch({ evidence: [...draft.evidence, newEvidence()] })}>
          <Plus size={16} /> 添加证据
        </button>
      </WorkflowSection>

      <WorkflowSection number="03" title="构建情景树" subtitle="概率必须合计 100%；组合影响使用百分点，不使用模糊的好坏。" icon={<Scale size={18} />}>
        <div className="scenario-stack">
          {draft.scenarios.map((item, index) => (
            <ScenarioEditor
              key={item.id}
              item={item}
              index={index}
              onChange={(next) => patch({ scenarios: draft.scenarios.map((row) => (row.id === next.id ? next : row)) })}
              onDelete={() => patch({ scenarios: draft.scenarios.filter((row) => row.id !== item.id) })}
            />
          ))}
        </div>
        <button className="add-row-button" type="button" onClick={() => patch({ scenarios: [...draft.scenarios, newScenario()] })}>
          <Plus size={16} /> 添加情景
        </button>
        <div className={`math-strip ${Math.abs(assessment.probabilityTotal - 100) < 0.01 ? "ok" : "bad"}`}>
          <div><span>概率合计</span><strong>{assessment.probabilityTotal}%</strong></div>
          <div><span>组合期望影响</span><strong>{assessment.expectedPortfolioImpact === null ? "未闭合" : `${assessment.expectedPortfolioImpact > 0 ? "+" : ""}${assessment.expectedPortfolioImpact}%`}</strong></div>
          <div><span>证据状态</span><strong>{assessment.evidenceLabel}</strong></div>
        </div>
      </WorkflowSection>

      <WorkflowSection number="04" title="纪律决策" subtitle="系统给流程建议；最终动作必须由你写明理由并确认。" icon={<ShieldAlert size={18} />}>
        <div className={`decision-verdict ${assessment.readiness}`}>
          <div>
            <span>系统流程建议</span>
            <strong>{assessment.suggestedAction}</strong>
            <p>{assessment.reasons.join("；")}</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => patch({ finalAction: assessment.suggestedAction })}>采用建议</button>
        </div>

        {assessment.gates.length ? <GateList title="确认前必须补齐" items={assessment.gates} tone="danger" /> : null}
        {assessment.warnings.length ? <GateList title="组合与证据警告" items={assessment.warnings} tone="warn" /> : null}

        <label>
          风险 / 反方备注
          <textarea value={draft.riskNotes} onChange={(event) => patch({ riskNotes: event.target.value })} rows={3} placeholder="这笔判断最可能怎样亏钱？市场可能已经知道什么？" />
        </label>
        <button className="red-team-button" type="button" onClick={askRedTeam} disabled={aiLoading}>
          {aiLoading ? <Loader2 className="spin" size={16} /> : <Brain size={16} />} 可选：让 AI 只做反方审查
        </button>
        {draft.aiRedTeam ? <div className="red-team-note"><strong>反方审查</strong><p>{draft.aiRedTeam}</p></div> : null}

        <div className="form-grid decision-fields">
          <label>
            最终动作
            <select value={draft.finalAction} onChange={(event) => patch({ finalAction: event.target.value as DecisionAction })}>
              {decisionActions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            复盘日期
            <input type="date" value={draft.reviewAt} onChange={(event) => patch({ reviewAt: event.target.value })} />
          </label>
          <label className="wide">
            最终理由
            <textarea value={draft.decisionRationale} onChange={(event) => patch({ decisionRationale: event.target.value })} rows={3} placeholder="为什么是这个动作？为什么不是其他动作？" />
          </label>
          <label className="wide">
            下一触发器
            <input value={draft.nextTrigger} onChange={(event) => patch({ nextTrigger: event.target.value })} placeholder="明确到：日期/指标/文件/阈值/动作" />
          </label>
        </div>
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={() => persist()}><Save size={16} /> 保存研判</button>
          <button className="primary-button" type="button" onClick={confirmDecision} disabled={assessment.gates.length > 0}><Check size={16} /> 确认并监控</button>
        </div>
      </WorkflowSection>

      {draft.status === "监控中" || draft.status === "已复盘" ? (
        <WorkflowSection number="05" title="事后复盘" subtitle="保留原判断，不事后改写；只追加结果与教训。" icon={<CalendarClock size={18} />}>
          <label>
            实际结果
            <textarea value={draft.actualOutcome} onChange={(event) => patch({ actualOutcome: event.target.value })} rows={4} disabled={draft.status === "已复盘"} />
          </label>
          <label>
            可复用教训
            <textarea value={draft.lesson} onChange={(event) => patch({ lesson: event.target.value })} rows={4} disabled={draft.status === "已复盘"} />
          </label>
          {draft.status === "监控中" ? <button className="primary-button full" type="button" onClick={finishReview}><Check size={16} /> 完成复盘</button> : <p className="completion-note">该事件已归档，原研判、动作和结果均保留。</p>}
        </WorkflowSection>
      ) : null}

      <section className="workbench-footer-actions">
        <button className="ghost-button" type="button" onClick={() => persist()}><Save size={16} /> 保存</button>
        <button
          className="danger-link"
          type="button"
          onClick={async () => {
            if (!window.confirm("删除这个事件及其研判内容？已有决策日志不会被删除。")) return;
            await deleteEventCase(draft.id);
            props.setStatus("事件已删除；历史决策日志仍保留。 ");
            setDraft(null);
            await props.reload();
          }}
        ><Trash2 size={15} /> 删除事件</button>
      </section>
    </section>
  );
}

function EventInbox(props: EventCenterProps & { onEdit: (item: EventDecisionCase) => void; onCreate: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const active = props.data.eventCases.filter((item) => item.status !== "已复盘");
  const due = active.filter((item) => item.reviewAt && item.reviewAt <= today);
  const blocked = active.filter((item) => assessEventCase(item, props.data.holdings, props.data.rules).readiness === "blocked");

  return (
    <section className="rail-stack">
      <section className="event-inbox-hero">
        <div>
          <span className="kicker">EVENT DESK</span>
          <h2>把新闻变成可复盘的决策</h2>
          <p>不追逐消息；只处理那些可能改变论点、组合风险或下一动作的事件。</p>
        </div>
        <button className="hero-action" type="button" onClick={props.onCreate}><Plus size={18} /> 新建研判</button>
      </section>

      <section className="event-metric-grid">
        <div><span>进行中</span><strong>{active.length}</strong><small>尚未完成复盘</small></div>
        <div className={due.length ? "attention" : ""}><span>到期</span><strong>{due.length}</strong><small>今天需要回看</small></div>
        <div className={blocked.length ? "attention" : ""}><span>被阻止</span><strong>{blocked.length}</strong><small>证据或情景未闭合</small></div>
      </section>

      <section className="panel event-list-panel">
        <div className="section-heading">
          <div><span>研判队列</span><h2>按下一复盘日排序</h2></div>
          <small>{props.data.eventCases.length} 个事件</small>
        </div>
        {props.data.eventCases.length ? (
          <div className="event-list">
            {[...props.data.eventCases]
              .sort((a, b) => (a.status === "已复盘" ? 1 : b.status === "已复盘" ? -1 : (a.reviewAt || "9999").localeCompare(b.reviewAt || "9999")))
              .map((item) => {
                const assessment = assessEventCase(item, props.data.holdings, props.data.rules);
                return (
                  <button className="event-row" type="button" key={item.id} onClick={() => props.onEdit(item)}>
                    <div className="event-date-block"><strong>{item.eventDate ? dateLabel(item.eventDate) : "待定"}</strong><span>{item.eventType}</span></div>
                    <div className="event-row-copy">
                      <div><span className={`status-dot ${statusTone[item.status]}`} /> <small>{item.status} · {assessment.evidenceLabel}</small></div>
                      <strong>{item.title || "未命名事件"}</strong>
                      <p>{item.companyName || item.symbol || "未关联标的"}{item.nextTrigger ? ` · 下一步：${item.nextTrigger}` : ""}</p>
                    </div>
                    <ChevronRight size={18} />
                  </button>
                );
              })}
          </div>
        ) : (
          <div className="event-empty">
            <Scale size={28} />
            <strong>还没有事件研判</strong>
            <p>从一条真正可能改变投资论点的公告开始。普通噪音不必录入。</p>
          </div>
        )}
      </section>
    </section>
  );
}

function WorkflowSection(props: { number: string; title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="panel workflow-section">
      <div className="workflow-heading">
        <span>{props.number}</span>
        <div className="workflow-icon">{props.icon}</div>
        <div><h2>{props.title}</h2><p>{props.subtitle}</p></div>
      </div>
      {props.children}
    </section>
  );
}

function ProcessRail(props: { draft: EventDecisionCase; assessment: ReturnType<typeof assessEventCase> }) {
  const steps = [
    ["事件", Boolean(props.draft.title && props.draft.affectedThesis)],
    ["证据", props.assessment.evidenceLabel !== "待补证"],
    ["情景", Math.abs(props.assessment.probabilityTotal - 100) < 0.01],
    ["决策", props.draft.status === "监控中" || props.draft.status === "已复盘"],
    ["复盘", props.draft.status === "已复盘"]
  ] as const;
  return <div className="process-rail">{steps.map(([label, done], index) => <div className={done ? "done" : ""} key={label}><span>{done ? <Check size={12} /> : index + 1}</span><small>{label}</small></div>)}</div>;
}

function EvidenceEditor(props: { item: EventEvidence; index: number; onChange: (item: EventEvidence) => void; onDelete: () => void }) {
  const update = (patch: Partial<EventEvidence>) => props.onChange({ ...props.item, ...patch });
  const href = safeUrl(props.item.sourceUrl);
  return (
    <article className="ledger-card">
      <div className="ledger-card-head"><span>证据 {String(props.index + 1).padStart(2, "0")}</span><button type="button" onClick={props.onDelete} aria-label="删除证据"><Trash2 size={15} /></button></div>
      <div className="form-grid">
        <label className="wide">标题 / 核心事实<input value={props.item.title} onChange={(event) => update({ title: event.target.value })} placeholder="用一句可核实的话描述" /></label>
        <label>证据等级<select value={props.item.tier} onChange={(event) => update({ tier: event.target.value as EvidenceTier })}>{evidenceTiers.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>内容性质<select value={props.item.nature} onChange={(event) => update({ nature: event.target.value as EvidenceNature })}>{evidenceNatures.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>发布日期<input type="date" value={props.item.publishedAt} onChange={(event) => update({ publishedAt: event.target.value })} /></label>
        <label>来源链接<div className="linked-input"><input value={props.item.sourceUrl} onChange={(event) => update({ sourceUrl: event.target.value })} placeholder="https://" />{href ? <a href={href} target="_blank" rel="noreferrer" aria-label="打开来源"><Link2 size={15} /></a> : null}</div></label>
        <label className="wide">它证明了什么<input value={props.item.note} onChange={(event) => update({ note: event.target.value })} placeholder="不要重复标题，写它如何影响论点或概率" /></label>
      </div>
    </article>
  );
}

function ScenarioEditor(props: { item: EventScenario; index: number; onChange: (item: EventScenario) => void; onDelete: () => void }) {
  const update = (patch: Partial<EventScenario>) => props.onChange({ ...props.item, ...patch });
  return (
    <article className="ledger-card scenario-card">
      <div className="ledger-card-head"><span>路径 {String(props.index + 1).padStart(2, "0")}</span><button type="button" onClick={props.onDelete} aria-label="删除情景"><Trash2 size={15} /></button></div>
      <div className="scenario-topline">
        <input value={props.item.name} onChange={(event) => update({ name: event.target.value })} aria-label="情景名称" />
        <label><span>概率</span><div><input type="number" min="0" max="100" value={props.item.probability} onChange={(event) => update({ probability: Number(event.target.value) })} /><b>%</b></div></label>
        <label><span>组合影响</span><div><input type="number" min="-100" max="100" step="0.1" value={props.item.portfolioImpact} onChange={(event) => update({ portfolioImpact: Number(event.target.value) })} /><b>%</b></div></label>
      </div>
      <div className="form-grid">
        <label>论点影响<select value={props.item.thesisEffect} onChange={(event) => update({ thesisEffect: event.target.value as ThesisEffect })}>{thesisEffects.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>可观察信号<input value={props.item.signpost} onChange={(event) => update({ signpost: event.target.value })} placeholder="日期、指标或文件" /></label>
        <label className="wide">概率依据<textarea value={props.item.rationale} onChange={(event) => update({ rationale: event.target.value })} rows={2} placeholder="为什么不是更高或更低？" /></label>
      </div>
    </article>
  );
}

function GateList(props: { title: string; items: string[]; tone: "danger" | "warn" }) {
  return <div className={`gate-list ${props.tone}`}><div><AlertTriangle size={16} /><strong>{props.title}</strong></div><ul>{props.items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}
