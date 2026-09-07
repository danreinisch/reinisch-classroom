const VALID_EVENT_TYPES = new Set([
  'opportunity',
  'count',
  'performance_trial',
  'work_sample',
  'composite',
  'objective_driven',
  'benchmark',
]);

const VALID_CAPTURE_SOURCES = new Set([
  'observation_center',
  'teacher_review',
  'objective_evidence',
  'benchmark',
  'authoritative_record',
]);

const VALID_DISPOSITIONS = new Set([
  'absent',
  'no_opportunity',
]);

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function legacyContractFromConfig(config = {}) {
  const category = String(config?.category || '').trim();
  const label = String(config?.label || '').trim() || null;

  if (category === 'session_outcome') {
    return {
      version: 1,
      event_type: 'opportunity',
      capture_source: 'observation_center',
      label,
      fields: [
        { key: 'result', kind: 'enum', values: ['met', 'not_met'] },
      ],
      dispositions: ['absent', 'no_opportunity'],
      legacy_category: category,
    };
  }

  if (category === 'tally') {
    return {
      version: 1,
      event_type: 'performance_trial',
      capture_source: 'observation_center',
      label,
      fields: [
        { key: 'successful', kind: 'integer', min: 0 },
        { key: 'opportunities', kind: 'integer', min: 0 },
      ],
      dispositions: ['absent', 'no_opportunity'],
      legacy_category: category,
    };
  }

  if (category === 'prompt_count') {
    return {
      version: 1,
      event_type: 'count',
      capture_source: 'observation_center',
      label,
      fields: [
        { key: 'prompt_count', kind: 'integer', min: 0 },
      ],
      dispositions: ['absent', 'no_opportunity'],
      legacy_category: category,
      ...(config.target_max_prompts != null
        ? {
            success_rule: {
              field: 'prompt_count',
              operator: 'lte',
              value: Number(config.target_max_prompts),
            },
          }
        : {}),
    };
  }

  if (category === 'behavior_checklist') {
    const subBehaviors = Array.isArray(config.sub_behaviors)
      ? config.sub_behaviors
      : [];

    return {
      version: 1,
      event_type: 'composite',
      capture_source: 'observation_center',
      label,
      components: subBehaviors.map((text, index) => ({
        key: `behavior_${index + 1}`,
        label: String(text),
        kind: 'met_not_met',
        required: true,
      })),
      success_rule: { operator: 'all_required_met' },
      dispositions: ['absent', 'no_opportunity'],
      legacy_category: category,
    };
  }

  return null;
}

function normalizeField(field) {
  if (!field || typeof field !== 'object' || Array.isArray(field)) return null;
  const key = String(field.key || '').trim();
  const kind = String(field.kind || '').trim();
  if (!key || !kind) return null;
  return {
    ...clone(field),
    key,
    kind,
  };
}

function normalizeComponent(component) {
  if (!component || typeof component !== 'object' || Array.isArray(component)) return null;
  const key = String(component.key || '').trim();
  const label = String(component.label || '').trim();
  const kind = String(component.kind || '').trim();
  if (!key || !label || !kind) return null;
  return {
    ...clone(component),
    key,
    label,
    kind,
    required: component.required !== false,
  };
}

export function normalizeEvidenceContract(rawContract) {
  if (!rawContract || typeof rawContract !== 'object' || Array.isArray(rawContract)) {
    return null;
  }

  const eventType = String(rawContract.event_type || '').trim();
  const captureSource = String(rawContract.capture_source || '').trim();

  const normalized = {
    ...clone(rawContract),
    version: Number(rawContract.version || 1),
    event_type: eventType,
    capture_source: captureSource,
    label: rawContract.label == null
      ? null
      : String(rawContract.label).trim() || null,
    fields: Array.isArray(rawContract.fields)
      ? rawContract.fields.map(normalizeField).filter(Boolean)
      : [],
    components: Array.isArray(rawContract.components)
      ? rawContract.components.map(normalizeComponent).filter(Boolean)
      : [],
    dispositions: Array.isArray(rawContract.dispositions)
      ? [...new Set(rawContract.dispositions
          .map(value => String(value || '').trim())
          .filter(value => VALID_DISPOSITIONS.has(value)))]
      : [],
    parent_direct_capture: rawContract.parent_direct_capture !== false,
    high_frequency: rawContract.high_frequency === true,
    events_per_period: rawContract.events_per_period == null
      ? null
      : Number(rawContract.events_per_period),
  };

  return normalized;
}

export function validateEvidenceContract(rawContract) {
  const contract = normalizeEvidenceContract(rawContract);
  const errors = [];

  if (!contract) return ['contract must be an object'];
  if (!Number.isFinite(contract.version) || contract.version < 1) {
    errors.push('version must be a positive number');
  }
  if (!VALID_EVENT_TYPES.has(contract.event_type)) {
    errors.push(`unsupported event_type: ${contract.event_type || '(blank)'}`);
  }
  if (!VALID_CAPTURE_SOURCES.has(contract.capture_source)) {
    errors.push(`unsupported capture_source: ${contract.capture_source || '(blank)'}`);
  }
  if (contract.events_per_period != null &&
      (!Number.isFinite(contract.events_per_period) || contract.events_per_period <= 0)) {
    errors.push('events_per_period must be a positive number when provided');
  }

  if (contract.event_type === 'composite' &&
      contract.components.length === 0 &&
      contract.fields.length === 0) {
    errors.push('composite contracts require components or fields');
  }

  if (contract.event_type === 'benchmark' && !String(contract.metric || '').trim()) {
    errors.push('benchmark contracts require metric');
  }

  if (contract.event_type === 'objective_driven' && contract.parent_direct_capture !== false) {
    errors.push('objective_driven contracts must disable parent_direct_capture');
  }

  if (contract.capture_source === 'observation_center' &&
      contract.event_type !== 'objective_driven' &&
      contract.event_type !== 'benchmark' &&
      contract.fields.length === 0 &&
      contract.components.length === 0) {
    errors.push('observation_center contracts require fields or components');
  }

  return errors;
}

export function getEvidenceContract(goal, registry = null) {
  const embedded = goal?.observation_config?.evidence_contract;
  if (embedded) return normalizeEvidenceContract(embedded);

  const code = String(goal?.code || '').trim();
  const registryContract = registry?.contracts?.[code];
  if (registryContract) return normalizeEvidenceContract(registryContract);

  return normalizeEvidenceContract(
    legacyContractFromConfig(goal?.observation_config || {})
  );
}

export function isObservationCenterContract(goal, registry = null) {
  const contract = getEvidenceContract(goal, registry);
  return contract?.capture_source === 'observation_center';
}

export function isDirectParentCaptureContract(goal, registry = null) {
  const contract = getEvidenceContract(goal, registry);
  if (!contract) return false;
  return contract.parent_direct_capture !== false;
}

export function contractAllowsDisposition(goalOrContract, disposition, registry = null) {
  const normalizedDisposition = String(disposition || '').trim();
  if (!VALID_DISPOSITIONS.has(normalizedDisposition)) return false;

  const contract = goalOrContract?.event_type
    ? normalizeEvidenceContract(goalOrContract)
    : getEvidenceContract(goalOrContract, registry);

  return Boolean(contract?.dispositions?.includes(normalizedDisposition));
}

export function evidenceContractSummary(goal, registry = null) {
  const contract = getEvidenceContract(goal, registry);
  if (!contract) return null;

  return {
    event_type: contract.event_type,
    capture_source: contract.capture_source,
    label: contract.label,
    field_keys: contract.fields.map(field => field.key),
    component_keys: contract.components.map(component => component.key),
    dispositions: [...contract.dispositions],
    parent_direct_capture: contract.parent_direct_capture,
    high_frequency: contract.high_frequency,
    events_per_period: contract.events_per_period,
  };
}

export {
  VALID_EVENT_TYPES,
  VALID_CAPTURE_SOURCES,
  VALID_DISPOSITIONS,
};
