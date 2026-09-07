// OBS-NQ2 bootstrap: expose reviewed non-question goals to Observation Center
// without mutating the canonical goal rows or other Teacher Center pages.

const normalizedPath = location.pathname.replace(/\/+$/, '');

if (normalizedPath === '/teacher/observations') {
  const { db } = await import('/web/data-adapter.js');
  const {
    buildContractRegistry,
    resolveEvidenceContract,
  } = await import('/web/observation-evidence-contract.js?v=20260907-nq1');

  let registry = null;

  try {
    const response = await fetch(
      '/data/observation-evidence-contracts-2026-27.json?v=20260907-nq1',
      {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(`contract registry ${response.status}`);
    }

    registry = buildContractRegistry(await response.json());
  } catch (error) {
    console.warn('[obs-nq2] Could not load reviewed evidence contracts:', error.message);
  }

  const originalListGoalsAll = db.listGoalsAll.bind(db);
  const runtimeGoals = new Map();

  db.listGoalsAll = async (...args) => {
    const goals = await originalListGoalsAll(...args);

    if (!registry || !Array.isArray(goals)) {
      return goals;
    }

    return goals.map(goal => {
      const contract = resolveEvidenceContract(goal, registry);

      if (!contract || contract.capture_source !== 'observation_center') {
        return goal;
      }

      const existingConfig =
        goal?.observation_config && typeof goal.observation_config === 'object'
          ? goal.observation_config
          : {};

      const cloned = {
        ...goal,
        // Observation Center historically filters on this value. This runtime
        // clone opts the reviewed contract in without changing the database.
        measurement_type: 'Observation',
        observation_config: {
          ...existingConfig,
          category: 'contract',
          original_measurement_type: goal.measurement_type || null,
          evidence_contract: contract,
          label: contract.label || existingConfig.label || goal.goal_area || goal.code,
        },
      };

      runtimeGoals.set(cloned.code, cloned);
      return cloned;
    });
  };

  window.RCObsNQ2 = Object.freeze({
    registry,
    runtimeGoals,
    getGoal(goalCode) {
      return runtimeGoals.get(String(goalCode || '').trim().toUpperCase()) || null;
    },
  });
}
