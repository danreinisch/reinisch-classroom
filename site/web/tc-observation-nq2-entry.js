// OBS-NQ2 Observation Center entrypoint.
// Ordering is deliberate: reviewed goal bootstrap must patch the shared db
// object before tc-observation loads its goals; contract capture then owns the
// reviewed cards before the legacy quick-capture enhancer scans the page.

await import('/web/obs-nq2-bootstrap.js?v=20260907-nq2a');
await import('/web/tc-observation.js?v=20260907-nq2a');
await import('/web/tc-observation-contract-capture.js?v=20260907-nq2a');
await import('/web/tc-observation-quick-capture.js?v=20260906-obs9b-quick-capture');
