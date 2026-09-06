import { bank, checkEdit } from "./sentence-workshop-content.js?v=20260906-sw1";

// Visit-only routing. First submissions and demonstrations are never overwritten.
export function createSession() {
  return {
    phase: "intro",
    item: null,
    records: {},
    cursors: { practice: 0, check: 0, simpler: 0, apply: 0 },
    returnPhase: null,
    reason: "",
  };
}

function selectNext(session, phase) {
  const next = bank[phase][session.cursors[phase]++];
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
  const key = JSON.stringify([edit.period, [...edit.capitals].sort((a, b) => a - b)]);
  if (record.lastEditKey === key)
    return {
      ...record.attempts.at(-1),
      message: "Change your edit before checking again. " + record.attempts.at(-1).message,
    };
  record.lastEditKey = key;
  const result = checkEdit(session.item, edit);
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
    freshBoundary: checks.filter((r) => r.attempts[0].boundary && !r.attempts[0].help).length,
    freshCapitals: checks.filter((r) => r.attempts[0].capitals && !r.attempts[0].help).length,
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
        "You worked through examples with support. Try another short practice later, or ask for help finding where a complete sentence ends."
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
    selectNext(session, completed.length >= 2 ? "check" : "practice");
  } else if (phase === "check") {
    selectNext(session, summary(session).freshIndependent >= 2 ? "apply" : "check");
  } else if (phase === "apply") {
    if (session.cursors.apply >= 2)
      finish(session, "You finished the message edits. Review what you practiced below.");
    else selectNext(session, "apply");
  }
}
