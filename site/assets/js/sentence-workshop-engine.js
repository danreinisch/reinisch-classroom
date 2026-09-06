import { bank, checkEdit } from "./sentence-workshop-content.js?v=20260906-sw4";
import * as endings from "./sentence-workshop-endings.js?v=20260906-sw4";
import * as repairs from "./sentence-workshop-repairs.js?v=20260906-sw4";

function lessonFor(session) {
  if (session.lessonId === "repairs")
    return { bank: repairs.bank, check: repairs.checkEdit, guided: 5, applied: 3 };
  return session.lessonId === "endings"
    ? { bank: endings.bank, check: endings.checkEdit, guided: 3, applied: 4 }
    : { bank, check: checkEdit, guided: 2, applied: 2 };
}

// Visit-only routing. First submissions and demonstrations are never overwritten.
export function createSession(lessonId = "boundaries") {
  if (!["boundaries", "endings", "repairs"].includes(lessonId))
    throw new Error("Unknown workshop lesson");
  return {
    lessonId,
    phase: "intro",
    item: null,
    records: {},
    cursors: { practice: 0, check: 0, simpler: 0, apply: 0 },
    returnPhase: null,
    reason: "",
  };
}

function selectNext(session, phase) {
  const items = lessonFor(session).bank[phase];
  const next =
    session.lessonId !== "boundaries" && phase === "simpler"
      ? items.find(
          (item) =>
            (session.lessonId === "repairs"
              ? item.kind === session.item?.kind
              : item.intent === session.item?.intent) && !session.records[item.id]
        ) || items.find((item) => !session.records[item.id])
      : items[session.cursors[phase]];
  session.cursors[phase]++;
  if (!next) {
    finish(session, "You have finished the available examples for this visit.");
    return;
  }
  session.phase = phase;
  session.item = next;
  session.records[next.id] = { phase, attempts: [], help: 0, demonstrated: false, resolved: false };
}

export function start(session) {
  if (session.phase === "intro") selectNext(session, "practice");
}

export function recordFor(session) {
  return session.item ? session.records[session.item.id] : null;
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
  if (!record || record.resolved || record.attempts.length >= 2) return null;
  const key =
    session.lessonId === "repairs"
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
    ...(session.lessonId === "repairs"
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

export function finish(session, reason = "You chose to finish this visit.") {
  session.phase = "summary";
  session.item = null;
  session.reason = reason;
}

export function next(session) {
  const record = recordFor(session);
  if (!record?.resolved) return;
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
        session.lessonId === "repairs"
          ? "You worked through examples with support. Try another short practice later, or ask for help finding what a sentence needs to be complete."
          : session.lessonId === "endings"
            ? "You worked through examples with support. Try another short practice later, or ask for help deciding whether a message tells, asks, or adds emphasis."
            : "You worked through examples with support. Try another short practice later, or ask for help finding where a complete sentence ends."
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
      session.lessonId === "repairs"
        ? Object.keys(repairs.kindNames).every((kind) => results.freshKinds.includes(kind))
        : session.lessonId === "endings"
          ? ["statement", "question", "strong"].every((kind) => results.freshKinds.includes(kind))
          : results.freshIndependent >= 2;
    selectNext(session, ready ? "apply" : "check");
  } else if (phase === "apply") {
    if (session.cursors.apply >= lessonFor(session).applied)
      finish(session, "You finished the message edits. Review what you practiced below.");
    else selectNext(session, "apply");
  }
}
