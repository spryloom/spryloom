#!/usr/bin/env node
/**
 * The `spryloom-mcp` binary.
 *
 * Everything it does is in `stdio.ts`, which `spry mcp` runs too. It does not
 * exit once that returns — the server has only just attached itself to stdin at
 * that point, and stays up until the agent closes it.
 */

import { serveOverStdio } from './stdio.js';

await serveOverStdio();
