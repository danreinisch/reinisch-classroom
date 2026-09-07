import { bank, checkEdit } from "./sentence-workshop-content.js?v=20260906-sw8";
import * as endings from "./sentence-workshop-endings.js?v=20260906-sw8";
import * as repairs from "./sentence-workshop-repairs.js?v=20260906-sw8";
import * as commas from "./sentence-workshop-commas.js?v=20260906-sw8";
import * as openings from "./sentence-workshop-openings.js?v=20260906-sw8";

function lessonFor(session) {
  if (session.lessonId === "openings")
    return { bank: openings.bank, check: openings.checkEdit, guided: 4, applied: 4 };
  if (session.lessonId === "commas")
    return { bank: commas.bank, check: commas.checkEdit, guided: 3, applied: 3 };
  if (session.lessonId === "repairs")
    return { bank: repairs.bank, check: repairs.checkEdit, guided: 5, applied: 3 };
  return session.lessonId === "endings"
    ? { bank: endings.bank, check: endings.checkEdit, guided: 3, applied: 4 }
    : { bank, check: checkEdit, guided: 2, applied: 2 };
}

// Visit-only routing. First submissions and demonstrations are never overwritten.
export function createSession(lessonId = "boundaries") {
  if (!["boundaries", "endings", "repairs", "commas", "openings"].includes(lessonId))
    throw new Error("Unknown workshop lesson");
  return {
    lessonId,
    phase: "intro",
    item: null,
    records: {},
    cursors: { practice: 0, check: 0, simpler: 0, apply: 0 },
    returnPhase: null,
    reason: "",
    history: [],
    position: -1,
    endReason: "",
  };
}

function selectNext(session, phase) {
  const items = lessonFor(session).bank[phase];
  const next =
    session.lessonId !== "boundaries" && phase === "simpler"
      ? items.find(
          (item) =>
            (["repairs", "commas", "openings"].includes(session.lessonId)
              ? item.kind === session.item?.kind
              : item.intent === session.item?.intent) && !session.records[item.id]
        ) || items.find((item) => !session.records[item.id])
      : items[session.cursors[phase]];
  session.cursors[phase]++;
  if (!next) {
    finish(session, "You have finished the available examples for this visit.", true);
    return;
  }
  session.phase = phase;
  session.item = next;
  session.records[next.id] = {
    phase,
    attempts: [],
    help: 0,
    demonstrated: false,
    resolved: false,
    retryAt: 0,
  };
  session.history.push({ item: next, phase, returnPhase: session.returnPhase });
  session.position = session.history.length - 1;
}

export function start(session) {
  if (session.phase === "intro") selectNext(session, "practice");
}

export function recordFor(session) {
  return session.item ? session.records[session.item.id] : null;
}

export function canEdit(session) {
  const record = recordFor(session);
  return !!record && !record.resolved && record.attempts.length - record.retryAt < 2;
}

// Reopen this edit without erasing first submissions or instructional support.
export function retry(session) {
  const record = recordFor(session);
  if (!record || (!record.attempts.length && !record.demonstrated)) return;
  record.retryAt = record.attempts.length;
  record.lastEditKey = null;
  record.resolved = false;
}

function restore(session, position) {
  const entry = session.history[position];
  if (!entry) return;
  session.position = position;
  session.item = entry.item;
  session.phase = entry.phase;
  session.returnPhase = entry.returnPhase;
}

export function previous(session) {
  restore(session, session.phase === "summary" ? session.position : session.position - 1);
}

// Skipping changes location only; it never submits an answer or creates a mistake.
export function forward(session) {
  next(session, { skip: true });
}

export function hint(session) {
  const record = recordFor(session);
  if (!record || record.resolved) return;
  record.help = Math.min(2, record.help + 1);
}

export function demonstrate(session) {
  const record = recordFor(session);
  if (!record || record.resolved) return;
  record.help = 3;
  record.demonstrated = true;
  record.resolved = true;
}

export function submit(session, edit) {
  const record = recordFor(session);
  if (!canEdit(session)) return null;
  const key = ["commas", "openings"].includes(session.lessonId)
    ? JSON.stringify(
        Array.isArray(edit?.commas) ? [...edit.commas].sort((a, b) => a - b) : edit?.commas
      )
    : session.lessonId === "repairs"
      ? JSON.stringify([edit.choice, edit.gap, edit.join])
      : session.lessonId === "endings"
        ? JSON.stringify(edit.ending)
        : JSON.stringify([edit.period, [...edit.capitals].sort((a, b) => a - b)]);
  if (record.lastEditKey === key)
    return {
      ...record.attempts.at(-1),
      message: "Change your edit before checking again. " + record.attempts.at(-1).message,
    };
  record.lastEditKey = key;
  const result = lessonFor(session).check(session.item, edit);
  record.attempts.push({ ...result, help: record.help });
  if (result.correct) record.resolved = true;
  return result;
}

export function summary(session) {
  const records = Object.values(session.records);
  const checks = records.filter((r) => r.phase === "check" && r.attempts.length);
  const independent = (r) => r.attempts[0]?.correct && r.attempts[0].help === 0;
  return {
    attempted: records.filter((r) => r.attempts.length).length,
    freshAttempted: checks.length,
    freshIndependent: checks.filter(independent).length,
    ...(session.lessonId === "openings"
      ? {
          freshOpenings: checks.filter(independent).length,
          freshKinds: [...new Set(checks.filter(independent).map((r) => r.attempts[0].kind))],
        }
      : session.lessonId === "commas"
        ? {
            freshCommas: checks.filter(independent).length,
            freshKinds: [...new Set(checks.filter(independent).map((r) => r.attempts[0].kind))],
          }
        : session.lessonId === "repairs"
          ? {
              freshRepairs: checks.filter(independent).length,
              freshKinds: [...new Set(checks.filter(independent).map((r) => r.attempts[0].kind))],
            }
          : session.lessonId === "endings"
            ? {
                freshEnding: checks.filter(independent).length,
                freshKinds: [...new Set(checks.filter(independent).map((r) => r.attempts[0].kind))],
              }
            : {
                freshBoundary: checks.filter((r) => r.attempts[0].boundary && !r.attempts[0].help)
                  .length,
                freshCapitals: checks.filter((r) => r.attempts[0].capitals && !r.attempts[0].help)
                  .length,
              }),
    supported: records.filter((r) => r.attempts.some((a) => a.correct) && !independent(r)).length,
    demonstrations: records.filter((r) => r.demonstrated).length,
    appliedIndependent: records.filter((r) => r.phase === "apply" && independent(r)).length,
    appliedAttempted: records.filter((r) => r.phase === "apply" && r.attempts.length).length,
  };
}

export function finish(session, reason = "You chose to finish this visit.", complete = false) {
  session.phase = "summary";
  session.item = null;
  session.reason = reason;
  if (complete) session.endReason = reason;
}

export function next(session, { skip = false } = {}) {
  const record = recordFor(session);
  if (!record || (!skip && !record.resolved)) return;
  // Travel through the existing visit before creating another task. Never reset records.
  if (session.position < session.history.length - 1) {
    restore(session, session.position + 1);
    return;
  }
  if (session.endReason) {
    finish(session, session.endReason, true);
    return;
  }
  const phase = session.phase;
  if (phase === "simpler") {
    const destination = session.returnPhase;
    session.returnPhase = null;
    selectNext(session, destination);
    return;
  }
  // At most two prerequisite detours. Always give a finite, useful finish.
  if (record.demonstrated && phase !== "apply") {
    if (session.cursors.simpler >= 2) {
      finish(
        session,
        session.lessonId === "openings"
          ? "You worked through examples with support. Try another short practice later, or ask for help finding where an opening ends and the main message begins."
          : session.lessonId === "commas"
            ? "You worked through examples with support. Try another short practice later, or ask for help finding the separate items in a list."
            : session.lessonId === "repairs"
              ? "You worked through examples with support. Try another short practice later, or ask for help finding what a sentence needs to be complete."
              : session.lessonId === "endings"
                ? "You worked through examples with support. Try another short practice later, or ask for help deciding whether a message tells, asks, or adds emphasis."
                : "You worked through examples with support. Try another short practice later, or ask for help finding where a complete sentence ends.",
        true
      );
      return;
    }
    session.returnPhase = phase;
    selectNext(session, "simpler");
    return;
  }
  if (phase === "practice") {
    const completed = Object.values(session.records).filter(
      (r) => r.phase === "practice" && r.attempts.some((a) => a.correct)
    );
    selectNext(session, completed.length >= lessonFor(session).guided ? "check" : "practice");
  } else if (phase === "check") {
    const results = summary(session);
    const ready =
      session.lessonId === "openings"
        ? Object.keys(openings.kindNames).every((kind) => results.freshKinds.includes(kind))
        : session.lessonId === "commas"
          ? Object.keys(commas.kindNames).every((kind) => results.freshKinds.includes(kind))
          : session.lessonId === "repairs"
            ? Object.keys(repairs.kindNames).every((kind) => results.freshKinds.includes(kind))
            : session.lessonId === "endings"
              ? ["statement", "question", "strong"].every((kind) =>
                  results.freshKinds.includes(kind)
                )
              : results.freshIndependent >= 2;
    selectNext(session, ready ? "apply" : "check");
  } else if (phase === "apply") {
    if (session.cursors.apply >= lessonFor(session).applied)
      finish(session, "You finished the message edits. Review what you practiced below.", true);
    else selectNext(session, "apply");
  }
}
