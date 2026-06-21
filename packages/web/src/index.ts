// Copyright 2026 Awecode Contributors. Apache-2.0.

/**
 * @awecode/web — Mobile PWA server.
 *
 * Serves the Desktop renderer as a PWA from an in-process HTTPS+WebSocket
 * server. Run via `awecode open web` (CLI command in @awecode/cli).
 *
 * Public API: startServer — wires HTTP + REST + WebSocket together, runs
 * the agent in-process via ProtocolSession (see ADR-0007).
 */

export { startServer } from './server/index.js';
export type { ServerOptions, RunningServer } from './server/index.js';
