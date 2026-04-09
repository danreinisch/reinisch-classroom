/**
 * daily-digest/index.ts — Supabase Edge Function
 *
 * Sends a daily digest email to the teacher each weekday morning summarising:
 *   🔴 Regressing goals   — students whose progress is declining
 *   🟡 Stalled goals      — students whose progress is flat / not improving
 *   📅 IEP/Eval deadlines — upcoming (≤30 days) and recently overdue dates
 *   📊 Stale data         — goals with no data collected in >14 school days
 *   🏆 Mastery reached    — goals where current performance ≥ mastery target
 *   📊 Quick stats        — active students, goals tracked, data points (30 d)
 *
 * Environment variables required:
 *   SUPABASE_URL              — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service-role JWT (never expose client-side)
 *   RESEND_API_KEY            — Resend API key for email delivery
 *
 * Invoke via Supabase cron: `0 6 * * 1-5` (6 AM weekdays, server time)
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// ── Constants ────────────────────────────────────────────────────────────────

const RECIPIENT_EMAIL = "danielreinisch@winfieldriv.us";
const RECIPIENT_NAME = "Dan Reinisch";
const SENDER_EMAIL = "digest@reinisch-classroom.app";
const SENDER_NAME = "Reinisch Classroom";

/** Look back this many days for trend data */
const TREND_WINDOW_DAYS = 30;
/** A goal is "stalled" when the last 3 values span ≤ this many percent points */
const STALLED_BAND = 5;
/** IEP/Eval window: show deadlines within this many days (past or future) */
const IEP_WINDOW_DAYS = 30;
/** IEP deadlines older than this many days in the past are suppressed */
const IEP_OVERDUE_CAP = 90;
/** Data collection is "stale" when no entry exists for more than this many calendar days */
const STALE_THRESHOLD_DAYS = 14;

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a goal value string like "80%", "3/5", "80" → number | null */
function parseGoalValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const pct = s.match(/^([\d.]+)\s*%$/);
  if (pct) return parseFloat(pct[1]);
  const frac = s.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
  if (frac) {
    const denom = parseFloat(frac[2]);
    return denom === 0 ? null : (parseFloat(frac[1]) / denom) * 100;
  }
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

function isGoalActive(goal: Record<string, unknown>): boolean {
  const status = (goal.status as string | undefined) ?? "";
  return !["archived", "mastered", "discontinued"].includes(
    status.toLowerCase()
  );
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (_req: Request): Promise<Response> => {
  // ── Weekend guard ──────────────────────────────────────────────────────────
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return new Response(
      JSON.stringify({ skipped: true, reason: "weekend" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Env vars ───────────────────────────────────────────────────────────────
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing required environment variables" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Fetch data ─────────────────────────────────────────────────────────────
  type Student = {
    id: string;
    code: string;
    name: string;
    active: boolean | null;
    iep_due: string | null;
    eval_due: string | null;
  };

  type Goal = {
    id: string;
    student_id: string;
    code: string;
    desc: string | null;
    status: string;
    goal_area: string | null;
    baseline: string | null;
    mastery: string | null;
    target: string | null;
    measurement_type: string | null;
    observation_config: Record<string, unknown> | null;
    student_code?: string; // joined from students
  };

  type ProgressEntry = {
    id: string;
    goal_id: string;
    student_id: string;
    date: string;
    value: number | null;
    notes: string | null;
    goal_code?: string;   // synthesised
    student_code?: string; // synthesised
  };

  const trendCutoffStr = toDateStr(
    new Date(Date.now() - TREND_WINDOW_DAYS * 86_400_000)
  );
  const todayStr = toDateStr(now);

  const supaHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  const [rawStudents, rawGoals, progressRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/students?select=*`, { headers: supaHeaders }).then((r) => r.json()),
    fetch(`${SUPABASE_URL}/rest/v1/goals?select=*`, { headers: supaHeaders }).then((r) => r.json()),
    fetch(`${SUPABASE_URL}/rest/v1/goal_progress?date=gte.${trendCutoffStr}&select=*`, { headers: supaHeaders }).then((r) => r.json()),
  ]);

  const progressRows: ProgressEntry[] = Array.isArray(progressRes) ? progressRes : [];
  const students = (Array.isArray(rawStudents) ? rawStudents : []) as Student[];
  const goals = (Array.isArray(rawGoals) ? rawGoals : []) as Goal[];

  // Build lookup maps
  const studentById = new Map(students.map((s) => [s.id, s]));

  // Annotate goals with student_code
  for (const goal of goals) {
    const s = studentById.get(goal.student_id);
    if (s) goal.student_code = s.code;
  }

  // Annotate progress with goal_code and student_code
  // Build goal map by id
  const goalById = new Map(goals.map((g) => [g.id, g]));
  for (const p of progressRows) {
    const g = goalById.get(p.goal_id);
    if (g) {
      p.goal_code = g.code;
      const s = studentById.get(p.student_id);
      if (s) p.student_code = s.code;
    }
  }

  const activeStudents = students.filter((s) => s.active !== false);
  const activeGoals = goals.filter((g) => isGoalActive(g));

  // ── Section 1: Regressing & Stalled goals ─────────────────────────────────

  interface GoalAlert {
    studentName: string;
    studentCode: string;
    goalCode: string;
    goalArea: string;
    current: number;
    baseline: number | null;
    mastery: number | null;
    severity: "red" | "amber";
    detail: string;
  }

  const regressingAlerts: GoalAlert[] = [];
  const stalledAlerts: GoalAlert[] = [];

  for (const student of activeStudents) {
    const studentGoals = activeGoals.filter(
      (g) => g.student_code === student.code
    );

    for (const goal of studentGoals) {
      if (goal.measurement_type === "Observation") continue; // skip observation goals for trend

      const baselineNum = parseGoalValue(goal.baseline);
      const masteryNum = parseGoalValue(goal.mastery) ?? parseGoalValue(goal.target);

      const recentProgress = progressRows
        .filter(
          (p) =>
            p.student_code === student.code &&
            p.goal_code === goal.code
        )
        .sort((a, b) => b.date.localeCompare(a.date));

      if (recentProgress.length === 0 || baselineNum == null) continue;

      const values = recentProgress
        .map((p) => (p.value != null ? Number(p.value) : null))
        .filter((v): v is number => v != null);

      if (values.length === 0) continue;

      const currentNum = values[0];
      const last3 = values.slice(0, 3);

      let isRegressing = false;
      let isStalled = false;

      if (currentNum < baselineNum) {
        isRegressing = true;
      } else if (last3.length >= 2) {
        const allDecline = last3.every((v, i) => i === 0 || v < last3[i - 1]);
        if (allDecline) isRegressing = true;
      }

      if (!isRegressing) {
        if (last3.length >= 3) {
          const rangeSpan = Math.max(...last3) - Math.min(...last3);
          if (rangeSpan <= STALLED_BAND) isStalled = true;
        } else if (currentNum <= baselineNum + STALLED_BAND) {
          isStalled = true;
        }
      }

      const alert: GoalAlert = {
        studentName: student.name,
        studentCode: student.code,
        goalCode: goal.code,
        goalArea: goal.goal_area || "",
        current: Math.round(currentNum * 10) / 10,
        baseline: baselineNum != null ? Math.round(baselineNum * 10) / 10 : null,
        mastery: masteryNum != null ? Math.round(masteryNum * 10) / 10 : null,
        severity: isRegressing ? "red" : "amber",
        detail: `Current: ${currentNum}% | Baseline: ${goal.baseline ?? "—"} | Target: ${goal.mastery ?? goal.target ?? "—"}`,
      };

      if (isRegressing) regressingAlerts.push(alert);
      else if (isStalled) stalledAlerts.push(alert);
    }
  }

  // ── Section 2: IEP / Eval deadlines ───────────────────────────────────────

  interface IepDeadline {
    studentName: string;
    studentCode: string;
    type: "IEP" | "Eval";
    dueDate: Date;
    diffDays: number;
  }

  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + IEP_WINDOW_DAYS);

  const iepDeadlines: IepDeadline[] = [];
  for (const student of activeStudents) {
    for (const [field, label] of [
      ["iep_due", "IEP"],
      ["eval_due", "Eval"],
    ] as [keyof Student, "IEP" | "Eval"][]) {
      const raw = student[field] as string | null;
      if (!raw) continue;
      const dueDate = new Date(raw);
      dueDate.setUTCHours(0, 0, 0, 0);
      if (dueDate > windowEnd) continue;
      const diffDays = Math.round(
        (dueDate.getTime() - now.getTime()) / 86_400_000
      );
      if (diffDays < -IEP_OVERDUE_CAP) continue;
      iepDeadlines.push({
        studentName: student.name,
        studentCode: student.code,
        type: label,
        dueDate,
        diffDays,
      });
    }
  }
  iepDeadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  // ── Section 3: Stale data collection ──────────────────────────────────────

  interface StaleGoal {
    studentName: string;
    studentCode: string;
    goalCode: string;
    goalArea: string;
    lastDate: string | null;
    daysSince: number | null;
  }

  const staleThresholdStr = toDateStr(
    new Date(Date.now() - STALE_THRESHOLD_DAYS * 86_400_000)
  );

  const staleGoals: StaleGoal[] = [];
  for (const student of activeStudents) {
    const studentGoals = activeGoals.filter(
      (g) => g.student_code === student.code
    );
    for (const goal of studentGoals) {
      const entries = progressRows
        .filter(
          (p) => p.student_code === student.code && p.goal_code === goal.code
        )
        .sort((a, b) => b.date.localeCompare(a.date));

      const lastDate = entries.length > 0 ? entries[0].date : null;
      const isStale = !lastDate || lastDate < staleThresholdStr;
      if (!isStale) continue;

      const daysSince = lastDate
        ? Math.floor(
            (Date.now() - new Date(lastDate).getTime()) / 86_400_000
          )
        : null;

      staleGoals.push({
        studentName: student.name,
        studentCode: student.code,
        goalCode: goal.code,
        goalArea: goal.goal_area || "",
        lastDate,
        daysSince,
      });
    }
  }
  // Group by student for a cleaner display
  const staleGoalsByStudentCode = new Map<string, { studentName: string; studentCode: string; goals: StaleGoal[] }>();
  for (const sg of staleGoals) {
    if (!staleGoalsByStudentCode.has(sg.studentCode)) {
      staleGoalsByStudentCode.set(sg.studentCode, {
        studentName: sg.studentName,
        studentCode: sg.studentCode,
        goals: [],
      });
    }
    staleGoalsByStudentCode.get(sg.studentCode)!.goals.push(sg);
  }
  const staleStudents = Array.from(staleGoalsByStudentCode.values()).sort(
    (a, b) => b.goals.length - a.goals.length
  );

  // ── Section 4: Mastery reached ────────────────────────────────────────────

  interface MasteryItem {
    studentName: string;
    studentCode: string;
    goalCode: string;
    goalArea: string;
    current: number;
    mastery: number;
  }

  const masteryReached: MasteryItem[] = [];
  for (const student of activeStudents) {
    const studentGoals = activeGoals.filter(
      (g) => g.student_code === student.code
    );
    for (const goal of studentGoals) {
      const masteryNum = parseGoalValue(goal.mastery) ?? parseGoalValue(goal.target);
      if (masteryNum == null) continue;

      const recentProgress = progressRows
        .filter(
          (p) => p.student_code === student.code && p.goal_code === goal.code
        )
        .sort((a, b) => b.date.localeCompare(a.date));

      if (recentProgress.length === 0) continue;
      const currentVal = recentProgress[0].value;
      if (currentVal == null) continue;
      const currentNum = Number(currentVal);

      if (currentNum >= masteryNum) {
        masteryReached.push({
          studentName: student.name,
          studentCode: student.code,
          goalCode: goal.code,
          goalArea: goal.goal_area || "",
          current: Math.round(currentNum * 10) / 10,
          mastery: Math.round(masteryNum * 10) / 10,
        });
      }
    }
  }

  // ── Quick stats ────────────────────────────────────────────────────────────

  const quickStats = {
    activeStudents: activeStudents.length,
    activeGoals: activeGoals.length,
    dataPointsLast30Days: progressRows.length,
    regressingGoals: regressingAlerts.length,
    stalledGoals: stalledAlerts.length,
    staleGoals: staleGoals.length,
    masteryReached: masteryReached.length,
    upcomingDeadlines: iepDeadlines.length,
  };

  // ── Build HTML email ───────────────────────────────────────────────────────

  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

  function escHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function badge(text: string, color: string): string {
    return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${color};color:#fff;margin-left:6px;">${escHtml(text)}</span>`;
  }

  function sectionHeader(icon: string, title: string, count: number, badgeColor: string): string {
    return `
      <tr>
        <td style="padding:24px 0 8px;">
          <h2 style="margin:0;font-size:16px;font-weight:700;color:#111;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
            ${icon} ${escHtml(title)}${badge(String(count), badgeColor)}
          </h2>
        </td>
      </tr>`;
  }

  function alertRow(
    studentName: string,
    studentCode: string,
    goalCode: string,
    goalArea: string,
    detail: string,
    dotColor: string
  ): string {
    return `
      <tr>
        <td style="padding:6px 0;">
          <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:8px;background:#f9fafb;border-left:3px solid ${dotColor};">
            <div>
              <div style="font-weight:600;color:#111;font-size:13px;">
                ${escHtml(studentName)} <span style="color:#6b7280;font-weight:400;">(${escHtml(studentCode)})</span>
              </div>
              <div style="font-size:12px;color:#374151;margin-top:2px;">
                <strong>${escHtml(goalCode)}</strong>${goalArea ? ` · ${escHtml(goalArea)}` : ""}
              </div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px;">${escHtml(detail)}</div>
            </div>
          </div>
        </td>
      </tr>`;
  }

  function emptyRow(msg: string): string {
    return `<tr><td style="padding:8px 12px;color:#9ca3af;font-style:italic;font-size:13px;">${escHtml(msg)}</td></tr>`;
  }

  // Build sections HTML
  let sectionsHtml = "";

  // 1. Regressing
  sectionsHtml += sectionHeader('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;" aria-hidden="true"><polyline points="22 17 13 8 9 12 2 5"/><polyline points="16 17 22 17 22 11"/></svg>', "Regressing Goals", regressingAlerts.length, "#ef4444");
  if (regressingAlerts.length === 0) {
    sectionsHtml += emptyRow("No regressing goals — great news!");
  } else {
    for (const a of regressingAlerts) {
      sectionsHtml += alertRow(a.studentName, a.studentCode, a.goalCode, a.goalArea, a.detail, "#ef4444");
    }
  }

  // 2. Stalled
  sectionsHtml += sectionHeader('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;" aria-hidden="true"><line x1="8" y1="6" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="18"/></svg>', "Stalled Goals", stalledAlerts.length, "#eab308");
  if (stalledAlerts.length === 0) {
    sectionsHtml += emptyRow("No stalled goals.");
  } else {
    for (const a of stalledAlerts) {
      sectionsHtml += alertRow(a.studentName, a.studentCode, a.goalCode, a.goalArea, a.detail, "#eab308");
    }
  }

  // 3. IEP / Eval Deadlines
  sectionsHtml += sectionHeader('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', "IEP & Eval Deadlines", iepDeadlines.length, "#7c3aed");
  if (iepDeadlines.length === 0) {
    sectionsHtml += emptyRow("No upcoming IEP or Eval deadlines in the next 30 days.");
  } else {
    for (const d of iepDeadlines) {
      const dateStr = d.dueDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      let urgencyText: string;
      let dotColor: string;
      if (d.diffDays < 0) {
        urgencyText = `${Math.abs(d.diffDays)}d overdue`;
        dotColor = "#ef4444";
      } else if (d.diffDays === 0) {
        urgencyText = "Today!";
        dotColor = "#ef4444";
      } else if (d.diffDays <= 7) {
        urgencyText = `in ${d.diffDays}d`;
        dotColor = "#ef4444";
      } else if (d.diffDays <= 14) {
        urgencyText = `in ${d.diffDays}d`;
        dotColor = "#f59e0b";
      } else {
        urgencyText = `in ${d.diffDays}d`;
        dotColor = "#7c3aed";
      }
      sectionsHtml += alertRow(
        d.studentName,
        d.studentCode,
        d.type,
        "",
        `Due: ${dateStr} — ${urgencyText}`,
        dotColor
      );
    }
  }

  // 4. Stale data collection
  sectionsHtml += sectionHeader('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', "Stale Data Collection", staleGoals.length, "#f59e0b");
  if (staleStudents.length === 0) {
    sectionsHtml += emptyRow("All goals have recent data — you're on top of it!");
  } else {
    for (const s of staleStudents) {
      const goalSummary = s.goals
        .map((g) => `${g.goalCode}${g.daysSince != null ? ` (${g.daysSince}d ago)` : " (never)"}`)
        .join(", ");
      sectionsHtml += alertRow(
        s.studentName,
        s.studentCode,
        `${s.goals.length} goal${s.goals.length !== 1 ? "s" : ""} overdue`,
        "",
        goalSummary,
        "#f59e0b"
      );
    }
  }

  // 5. Mastery reached
  sectionsHtml += sectionHeader('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>', "Mastery Reached", masteryReached.length, "#16a34a");
  if (masteryReached.length === 0) {
    sectionsHtml += emptyRow("No new mastery reached in the last 30 days.");
  } else {
    for (const m of masteryReached) {
      sectionsHtml += alertRow(
        m.studentName,
        m.studentCode,
        m.goalCode,
        m.goalArea,
        `Current: ${m.current}% ≥ Mastery: ${m.mastery}%`,
        "#16a34a"
      );
    }
  }

  // Quick stats
  const statsHtml = `
    <tr>
      <td style="padding:24px 0 8px;">
        <h2 style="margin:0;font-size:16px;font-weight:700;color:#111;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Quick Stats
        </h2>
      </td>
    </tr>
    <tr>
      <td>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${[
              ["Active Students", quickStats.activeStudents, "#3b82f6"],
              ["Active Goals", quickStats.activeGoals, "#8b5cf6"],
              ["Data Points (30d)", quickStats.dataPointsLast30Days, "#06b6d4"],
              ["Regressing", quickStats.regressingGoals, "#ef4444"],
              ["Stalled", quickStats.stalledGoals, "#eab308"],
              ["Stale Goals", quickStats.staleGoals, "#f59e0b"],
              ["Mastery Reached", quickStats.masteryReached, "#16a34a"],
              ["Deadlines", quickStats.upcomingDeadlines, "#7c3aed"],
            ]
              .map(
                ([label, value, color]) => `
              <td align="center" style="padding:8px 6px;">
                <div style="background:#f9fafb;border-radius:8px;padding:12px 8px;border-top:3px solid ${color};">
                  <div style="font-size:22px;font-weight:700;color:${color};">${value}</div>
                  <div style="font-size:11px;color:#6b7280;margin-top:2px;">${label}</div>
                </div>
              </td>`
              )
              .join("")}
          </tr>
        </table>
      </td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Daily Classroom Digest — ${escHtml(dateLabel)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e40af,#7c3aed);padding:28px 32px;">
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:8px;" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>Daily Classroom Digest</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${escHtml(dateLabel)}</p>
            </td>
          </tr>

          <!-- Summary banner -->
          <tr>
            <td style="background:#eff6ff;padding:12px 32px;border-bottom:1px solid #dbeafe;">
              <p style="margin:0;font-size:13px;color:#1e40af;">
                <strong>${quickStats.activeStudents} active students</strong> ·
                ${quickStats.regressingGoals} regressing ·
                ${quickStats.stalledGoals} stalled ·
                ${quickStats.upcomingDeadlines} deadline${quickStats.upcomingDeadlines !== 1 ? "s" : ""} ·
                ${quickStats.staleGoals} stale goal${quickStats.staleGoals !== 1 ? "s" : ""} ·
                ${quickStats.masteryReached} mastered
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:8px 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${sectionsHtml}
                ${statsHtml}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
                Reinisch Classroom · Daily digest sent each weekday morning ·
                <a href="https://reinisch-classroom.netlify.app/teacher/overview/" style="color:#6b7280;">Open Teacher Center</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // ── Send via Resend ────────────────────────────────────────────────────────

  const hasAlerts =
    regressingAlerts.length > 0 ||
    stalledAlerts.length > 0 ||
    iepDeadlines.length > 0 ||
    staleStudents.length > 0 ||
    masteryReached.length > 0;

  const subjectPrefix = hasAlerts ? "[ACTION NEEDED]" : "[All Clear]";
  const subject = `${subjectPrefix} Daily Digest — ${dateLabel}`;

  const resendPayload = {
    from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
    to: [`${RECIPIENT_NAME} <${RECIPIENT_EMAIL}>`],
    subject,
    html,
  };

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(resendPayload),
  });

  const resendBody = await resendRes.json();

  if (!resendRes.ok) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to send email via Resend",
        resend: resendBody,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      date: todayStr,
      recipient: RECIPIENT_EMAIL,
      subject,
      stats: quickStats,
      sections: {
        regressing: regressingAlerts.length,
        stalled: stalledAlerts.length,
        iepDeadlines: iepDeadlines.length,
        staleStudents: staleStudents.length,
        masteryReached: masteryReached.length,
      },
      resendId: (resendBody as { id?: string }).id,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
