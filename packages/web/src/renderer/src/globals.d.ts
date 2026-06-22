// Copyright 2026 Awecode Contributors. Apache-2.0.
import type { AwecodeClient } from './transport/client.js';
declare global {
  interface Window { awecode?: never }  // Web does NOT use window.awecode
}
