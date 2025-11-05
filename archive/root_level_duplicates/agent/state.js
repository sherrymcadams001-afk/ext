// Deprecated duplicate state implementation.
// This module now acts as a thin compatibility shim re-exporting the canonical state factory.
// TODO: Remove after confirming no external imports rely on this path.
export { createAgentState } from "./core/state.js";

// If legacy helpers are referenced elsewhere, they can be mapped to the new API.
// For now we intentionally omit the legacy incremental/statistics logic to avoid divergence.
