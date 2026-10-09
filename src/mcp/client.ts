/**
 * What the MCP tools need from Spryloom, behind an interface.
 *
 * The interface exists so the tools can be tested without a network, and so the
 * decisions the tools make about wording and about what to do with a failure are
 * separable from how the request is sent.
 */

import type { Manifest } from '@spryloom/manifest';
import type {
  AppExportResponse,
  InviteSkip,
  InviteSkipCode,
  JobRunSummary,
  JobRunsResponse,
  JobSummary,
  OperationView,
  PublishWarning,
} from '@spryloom/protocol';

export type { JobRunSummary, JobRunsResponse, JobSummary };

export interface PublishRequest {
  readonly manifest: Manifest;
  /** Absolute path to the folder being published. */
  readonly root: string;
  /** Ties the attempt together in the event log (D15). */
  readonly publishId: string;
  /**
   * How this publish reached us.
   *
   * The caller decides, because only the caller knows: the agent tools pass
   * `agent` and the command line passes `cli`. Release 1 exits on the share
   * arriving by agent (D15), so a client that decided this for itself would
   * quietly make that number wrong.
   */
  readonly source: 'agent' | 'cli';
}

export interface PublishResult {
  readonly url: string;
  readonly version: number;
  readonly workspace: string;
  /** Human-readable summary of what was created, in the order to show it. */
  readonly created: readonly string[];
  readonly buildSeconds: number;
  /**
   * Things worth fixing that did not stop the publish.
   *
   * Carried here rather than dropped, because the acceptance document says the
   * publish output shows them and a client that discarded them would silently
   * remove that from the product.
   */
  readonly warnings: readonly PublishWarning[];
}

/**
 * Re-exported rather than redeclared.
 *
 * It was defined here and in the protocol with identical shapes, which is two
 * places to change and one chance to forget.
 */
export type { PublishWarning };

/** Re-exported rather than redeclared, for the same reason. */
export type { InviteSkip, InviteSkipCode };

/** What a rollback returns. Not a publish: nothing was built. */
export interface RollbackOutcome {
  readonly version: number;
  readonly url: string;
}

/**
 * A request the platform refused, with enough detail to act on.
 *
 * Used by every method rather than only by publish, so a caller can branch on
 * the reason instead of matching on a sentence.
 */
export class SpryloomFailure extends Error {
  /** Stable code, recorded so common failures can be prevented in the skill (D11). */
  readonly reason: string;
  /** What the person should do. */
  readonly hint: string;
  /** True when nothing was changed, so the previous version is still serving. */
  readonly previousVersionIntact: boolean;
  /**
   * Output from the person's own build or app.
   *
   * Passed through rather than summarised: when a build fails, the compiler's
   * own words are more use than anything we could say about them.
   */
  readonly logs: readonly string[];

  constructor(options: {
    reason: string;
    message: string;
    hint: string;
    previousVersionIntact?: boolean;
    logs?: readonly string[];
  }) {
    super(options.message);
    this.name = 'SpryloomFailure';
    this.reason = options.reason;
    this.hint = options.hint;
    this.previousVersionIntact = options.previousVersionIntact ?? true;
    this.logs = options.logs ?? [];
  }
}

export interface AppStatus {
  readonly url: string;
  readonly version: number;
  readonly live: boolean;
  readonly archived: boolean;
  readonly users: number;
  /** Who can open it, in words. */
  readonly sharedWith: string;
  /** Seconds since epoch, so formatting stays a presentation decision. */
  readonly lastPublishedAt: number;
  /** A page (D105): files, no server. Absent is an app. */
  readonly kind?: 'page';
}

/** A secret, described. Never its value. */
export interface SecretSummary {
  readonly name: string;
  /** Seconds since epoch. */
  readonly updatedAt: number;
  readonly updatedBy: string;
}

export interface InviteResult {
  readonly invited: readonly string[];
  /** Addresses that were skipped, each with a code to act on and words to show. */
  readonly skipped: readonly InviteSkip[];
  /** Already invited, and sent a fresh invitation that replaces the earlier one (D100). */
  readonly resent: readonly string[];
}

export interface RevokeInviteResult {
  readonly revoked: boolean;
  readonly email: string;
}

/**
 * What the agent tools and the command line need from Spryloom.
 *
 * No method takes a workspace. The token says which workspace the caller is in,
 * and a client that also accepted one could be asked for a workspace it has no
 * way to reach.
 */
/**
 * How a caller watches a publish or a delete while it runs (D99).
 *
 * The work happens on the platform; watching only reads it. Stopping watching
 * never stops the work.
 */
export interface WatchOptions {
  /** Told once the folder is packed, before it is sent. */
  readonly onPacked?: (bytes: number) => void;
  /** Told each time the operation is read, including the first. */
  readonly onProgress?: (operation: OperationView) => void;
  /** Told when this app already had one running, which is watched instead. */
  readonly onAttach?: (operation: OperationView) => void;
  /** Aborted to stop watching. The work carries on. */
  readonly signal?: AbortSignal;
}

export type { OperationView };

export interface SpryloomClient {
  publish(request: PublishRequest, watch?: WatchOptions): Promise<PublishResult>;
  /** Every app in the caller's workspace, archived ones included. */
  listApps(): Promise<readonly AppListing[]>;
  status(slug: string): Promise<AppStatus | undefined>;
  exportApp(slug: string): Promise<AppExportResponse>;
  logs(slug: string, lines: number): Promise<readonly string[]>;
  rollback(slug: string, toVersion?: number | undefined, watch?: WatchOptions): Promise<RollbackOutcome>;
  invite(slug: string, emails: readonly string[]): Promise<InviteResult>;
  revokeInvite(slug: string, email: string): Promise<RevokeInviteResult>;
  /**
   * Revoke every token this person holds, on every machine.
   *
   * Returns how many terminals will stop working, this one included. What a
   * person reaches for when a laptop is lost.
   */
  signOutEverywhere(): Promise<number>;
  /**
   * An app's secrets: what they are called, never what they are.
   *
   * There is no method that returns a value, deliberately. One would become the
   * way secrets leak, through whoever can call it.
   */
  listSecrets(slug: string): Promise<readonly SecretSummary[]>;
  setSecret(slug: string, name: string, value: string): Promise<void>;
  removeSecret(slug: string, name: string): Promise<void>;
  archive(slug: string): Promise<void>;
  /** Restore an archived app without changing its database. */
  restore(slug: string, watch?: WatchOptions): Promise<RollbackOutcome>;
  /**
   * Start an app that has stopped.
   *
   * The version already there, not a new one. What somebody reaches for when an
   * app has run out of memory or crashed.
   */
  restart(slug: string, watch?: WatchOptions): Promise<void>;
  /** Who is signed in, or undefined. */
  currentUser(): Promise<CurrentUser | undefined>;
  /** Give an app a custom domain; returns the DNS records to add (D74). */
  addDomain(slug: string, hostname: string): Promise<DomainChallenge>;
  /** Check the DNS challenge and mark the domain verified if it is in place. */
  verifyDomain(slug: string, hostname: string): Promise<DomainSummary>;
  listDomains(slug: string): Promise<readonly DomainSummary[]>;
  removeDomain(slug: string, hostname: string): Promise<void>;
  /** M1*: an app's scheduled jobs. */
  listJobs(slug: string): Promise<readonly JobSummary[]>;
  /** Run a job now. Answers as it starts. */
  runJob(slug: string, job: string): Promise<JobRunSummary>;
  /** Clear a job's pause. */
  resumeJob(slug: string, job: string): Promise<JobSummary>;
  /** A job's recent runs, and what the newest finished one printed. */
  jobRuns(slug: string, job: string): Promise<JobRunsResponse>;
  /**
   * A page's saved data (D113), as the signed-in person: what they could see and
   * do in the page itself. The answer is the data service's, as it is.
   */
  pageData(page: PageAddress, call: PageDataCall): Promise<unknown>;
  /** Every record of a page, as JSON lines. For its owner and admins. */
  exportPageData(page: PageAddress): Promise<string>;
}

/** A page, by workspace and slug (D113). A page someone was invited to elsewhere has another workspace. */
export interface PageAddress {
  readonly workspace: string;
  readonly slug: string;
}

/** What may be asked of a page's records (spec §10.1). */
export interface PageDataCall {
  readonly action: 'summary' | 'list' | 'get' | 'add' | 'replace' | 'remove' | 'access_log';
  readonly list?: string;
  readonly id?: string;
  readonly data?: unknown;
  readonly limit?: number;
  readonly after?: string;
}

/**
 * Which page someone means: its address (`https://gear-wall.acme-com.spryloom.app`,
 * with or without `https://` and a path), or a slug in their own workspace.
 * Undefined when it is neither.
 */
export function pageAddress(input: string, ownWorkspace: string): PageAddress | undefined {
  const text = input.trim().replace(/^https?:\/\//i, '').split(/[/?#]/)[0]?.toLowerCase() ?? '';
  const SLUG = /^[a-z0-9]([a-z0-9-]{0,62})$/;
  if (SLUG.test(text)) return { workspace: ownWorkspace, slug: text };
  const labels = text.split('.');
  const [slug, workspace] = labels;
  if (labels.length >= 4 && slug !== undefined && workspace !== undefined && SLUG.test(slug) && SLUG.test(workspace)) return { workspace, slug };
  return undefined;
}

/** A custom domain as listed: the hostname and whether it is proved. */
export interface DomainSummary {
  readonly hostname: string;
  readonly verified: boolean;
}

/** What `addDomain` returns: the two DNS records a person must add. */
export interface DomainChallenge extends DomainSummary {
  readonly challenge: { readonly name: string; readonly type: 'TXT'; readonly value: string };
  readonly cname: { readonly name: string; readonly type: 'CNAME'; readonly value: string };
}

/** One app, as it appears in a list. */
export interface AppListing {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly version: number;
  readonly live: boolean;
  readonly archived: boolean;
  readonly users: number;
  /** Who can open it, in words. */
  readonly sharedWith: string;
  /** Seconds since epoch. */
  readonly lastPublishedAt: number;
  /** A page (D105): files, no server. Absent is an app. */
  readonly kind?: 'page';
  /** Running now: a publish, delete, rollback, restore or restart (D99). */
  readonly operation?: OperationView;
  /** Its first publish is still running. */
  readonly pending?: boolean;
}

export interface CurrentUser {
  readonly email: string;
  readonly workspace: string;
  readonly domain?: string;
}
