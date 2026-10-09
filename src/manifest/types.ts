/**
 * The `spryloom.yaml` contract.
 *
 * Decision D3: the coding agent writes this file while it builds the app, so the
 * platform is told what the app needs rather than having to infer it. Analysing
 * arbitrary code is a fallback, never the primary path.
 *
 * The manifest is also the source of the app's label page, which is the product's
 * trust surface. Anything a coworker is shown about what an app stores or can
 * reach is derived from here, so it cannot drift from what was provisioned.
 */

/** How the app's user interface is delivered. */
export type Frontend = 'react' | 'static' | 'none';

/** What runs on the server, if anything. */
export type Backend = 'node' | 'none';

/** Who can open the app. */
export type Visibility =
  /** Only the owner. */
  | 'private'
  /** Only people explicitly invited. */
  | 'invited'
  /** Anyone with an email address at the workspace domain. */
  | 'company'
  /** Anyone holding the link, still behind sign-in. */
  | 'link';

/** How a person proves who they are. */
export type SignInMethod = 'google' | 'email_link';

/**
 * What a manifest gets when nobody says otherwise.
 *
 * Only what works. `google` is a valid method and does nothing yet (D25), so
 * writing it into somebody's manifest puts a line in their contract that means
 * nothing — and the manifest is meant to be read and edited by hand. When
 * Google is added this becomes the place that changes.
 */
export const DEFAULT_SIGNIN: readonly SignInMethod[] = ['email_link'];

export interface AppSection {
  /** Human-readable name, shown in the dashboard and on the label page. */
  readonly name: string;
  /** DNS-safe identifier used as the app's hostname label. */
  readonly slug: string;
  /** One sentence shown to coworkers on the label page and in the invitation. */
  readonly description: string;
}

export interface RuntimeSection {
  readonly frontend: Frontend;
  readonly backend: Backend;
  /** Path to a user-supplied Dockerfile. When present, it is used as-is (D10). */
  readonly dockerfile?: string;
  /** Build command, when the app needs one. */
  readonly build?: string;
  /** Start command. Required when `backend` is not `none`. */
  readonly start?: string;
}

export interface AccessSection {
  readonly visibility: Visibility;
  /** Email domain, required when visibility is `company`. */
  readonly domain?: string;
  /** At least one sign-in method. */
  readonly signin: readonly SignInMethod[];
  /** Email addresses granted the admin role, beyond the owner. */
  readonly admins: readonly string[];
}

export interface DataSection {
  /** Whether the app is given a Postgres database. */
  readonly postgres: boolean;
  /** Table names, declared so the label page can say what the app stores. */
  readonly tables: readonly string[];
  /** Whether the app is given object storage for uploads. */
  readonly uploads: boolean;
  /**
   * A page's saved lists (D113): name to `shared` or `own`. Pages only; an app
   * keeps its data in its own database. Absent means the page saves nothing.
   */
  readonly lists?: Readonly<Record<string, ListMode>>;
}

/** Who reads a page's list: everyone who can open the page, or each person their own (D113). */
export type ListMode = 'shared' | 'own';

/** The limits on a page's lists (D113, spec §3.1). */
export const LIST_RULES = {
  maxLists: 20,
  /** Lowercase letters, digits and hyphens, starting with a letter, up to 40. */
  name: /^[a-z][a-z0-9-]{0,39}$/,
  modes: ['shared', 'own'] as readonly ListMode[],
} as const;

/**
 * Work the app does on a schedule (M1*, D81).
 *
 * Each run is the app's own image with the app's environment and the same
 * network limits, started by the platform at the times given and stopped when
 * the command exits or the timeout is reached.
 */
export interface Job {
  /** Lower case letters, digits and hyphens. Unique within the app. */
  readonly name: string;
  /** What to run, as it would be typed in the app's folder: `node jobs/remind.js`. */
  readonly command: string;
  /** Five-field cron expression. */
  readonly schedule: string;
  /** IANA time zone the schedule is read in. `UTC` when not given. */
  readonly timezone: string;
  /** Minutes a run may take before it is stopped. */
  readonly timeoutMinutes: number;
}

/** The limits a job is held to (D85). */
export const JOB_RULES = {
  maxJobs: 5,
  /** The shortest gap allowed between two runs of one job. */
  minIntervalHours: 10,
  defaultTimeoutMinutes: 10,
  maxTimeoutMinutes: 15,
} as const;

export interface Manifest {
  readonly app: AppSection;
  readonly runtime: RuntimeSection;
  readonly access: AccessSection;
  readonly data: DataSection;
  /** Scheduled jobs (M1*). */
  readonly jobs: readonly Job[];
  /**
   * Whether the app may email the people who use it, through the gateway, as
   * structured notifications (D86).
   */
  readonly email: boolean;
  /**
   * Outside hosts the app may reach, each from the egress host registry (D83).
   *
   * Empty means the app reaches its own database and nothing else. A declared
   * host is reached through the platform's gateway, never directly: the app's
   * network policy is the same database-only rule either way (D84).
   */
  readonly egress: readonly string[];
}

/** One problem found in a manifest. */
export interface ManifestIssue {
  /** Dotted path to the offending field, e.g. `access.visibility`. */
  readonly path: string;
  /** What is wrong, in the user's terms. */
  readonly message: string;
  /** What to do about it. */
  readonly hint?: string;
}

/**
 * Raised when a manifest cannot be used. Carries every problem found, not just
 * the first, so a person fixing the file sees the whole list at once.
 */
export class ManifestError extends Error {
  readonly issues: readonly ManifestIssue[];

  constructor(issues: readonly ManifestIssue[]) {
    super(formatIssues(issues));
    this.name = 'ManifestError';
    this.issues = issues;
  }
}

/** Render issues as the block the CLI and the agent show to a person. */
export function formatIssues(issues: readonly ManifestIssue[]): string {
  if (issues.length === 0) return 'spryloom.yaml is not valid.';
  const lines = [
    issues.length === 1
      ? 'spryloom.yaml has a problem:'
      : `spryloom.yaml has ${issues.length} problems:`,
    '',
  ];
  for (const issue of issues) {
    lines.push(`  ${issue.path}`);
    lines.push(`    ${issue.message}`);
    if (issue.hint !== undefined) lines.push(`    ${issue.hint}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
