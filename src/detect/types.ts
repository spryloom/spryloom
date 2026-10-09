import type { Backend, Frontend } from '@spryloom/manifest';

/**
 * Something worth telling the person about, found while reading their app.
 *
 * Decision D11: these are the same rules the agent skill applies while writing
 * the app. Anything reported here that reaches a real user is a gap in the
 * skill, not a mistake by the user.
 */
export interface Finding {
  /** `blocker` prevents a publish. `warning` is reported and does not. */
  readonly severity: 'blocker' | 'warning';
  /** Stable identifier, used to measure which findings occur in practice. */
  readonly code: FindingCode;
  /** What is wrong, in the user's terms. */
  readonly message: string;
  /** What to do about it. */
  readonly hint: string;
  /** Repository-relative path, when the finding points at a file. */
  readonly file?: string;
  /** 1-indexed line, when the finding points at a line. */
  readonly line?: number;
}

export type FindingCode =
  /** No `package.json` and no `index.html`: nothing recognisable to run. */
  | 'nothing_to_run'
  /** A port literal is passed to `listen` without reading `PORT` first. */
  | 'hardcoded_port'
  /** No lockfile, so the build cannot be reproduced. */
  | 'no_lockfile'
  /** A `.env` file is present in the source, which would bake secrets into the image. */
  | 'env_file_committed'
  /** A backend was found but no start command could be determined. */
  | 'no_start_command'
  /** The declared Dockerfile path does not exist. */
  | 'dockerfile_missing';

/** Which tool installs dependencies, decided by the lockfile that is present. */
export type PackageManager = 'npm' | 'pnpm' | 'yarn';

export interface Detection {
  readonly frontend: Frontend;
  readonly backend: Backend;
  /** Repository-relative path to a user-supplied Dockerfile, when one exists (D10). */
  readonly dockerfile?: string;
  readonly build?: string;
  readonly start?: string;
  readonly packageManager?: PackageManager;
  /** Major Node version requested by `engines`, when the app asks for one. */
  readonly nodeMajor?: number;
  /** Directory the built frontend ends up in, when one could be determined. */
  readonly staticDir?: string;
  /** True when a Postgres client library is a dependency. */
  readonly usesPostgres: boolean;
  readonly findings: readonly Finding[];
}
