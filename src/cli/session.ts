/**
 * Where the terminal keeps its token.
 *
 * On disk, because a terminal that forgot who you were on every command would
 * be unusable. Two things follow from that:
 *
 *  - **The file is readable only by its owner.** Anyone who can read it can act
 *    as the person it belongs to.
 *  - **One file holds one token per platform.** Someone working against staging
 *    and production should not have to sign out of one to use the other.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { saveSession as writeSession } from '@spryloom/mcp';

/** Where the file lives, honouring the usual override. */
export function sessionPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env['SPRYLOOM_CONFIG'];
  if (configured !== undefined && configured !== '') return configured;
  const base = env['XDG_CONFIG_HOME'];
  return base !== undefined && base !== ''
    ? join(base, 'spryloom', 'session.json')
    : join(homedir(), '.config', 'spryloom', 'session.json');
}

export interface Session {
  readonly baseUrl: string;
  readonly token: string;
  readonly email: string;
  readonly workspace: string;
}

interface SessionFile {
  readonly version: 1;
  /** Keyed by platform address, so staging and production coexist. */
  readonly sessions: Record<string, Omit<Session, 'baseUrl'>>;
}

const empty: SessionFile = { version: 1, sessions: {} };

async function read(path: string): Promise<SessionFile> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as SessionFile;
    return parsed.version === 1 && typeof parsed.sessions === 'object' ? parsed : empty;
  } catch {
    // A missing or unreadable file means nobody is signed in, which is a normal
    // state rather than an error worth showing.
    return empty;
  }
}

export async function loadSession(
  baseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Session | undefined> {
  // An environment variable wins, so continuous integration never needs a file.
  const fromEnv = env['SPRYLOOM_TOKEN'];
  if (fromEnv !== undefined && fromEnv !== '') {
    return { baseUrl, token: fromEnv, email: '', workspace: '' };
  }

  const file = await read(sessionPath(env));
  const found = file.sessions[baseUrl];
  return found === undefined ? undefined : { baseUrl, ...found };
}

/** Written by the agent server's module, so `spry login` and signing in from the agent share one writer. */
export async function saveSession(
  session: Session,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await writeSession(session, env);
}

export async function clearSession(
  baseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const path = sessionPath(env);
  const file = await read(path);
  const { [baseUrl]: _removed, ...rest } = file.sessions;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ version: 1, sessions: rest }, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

/** Which platform this terminal is talking to. */
export function baseUrlFrom(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env['SPRYLOOM_URL'];
  return configured !== undefined && configured !== '' ? configured : 'https://app.spryloom.com';
}
