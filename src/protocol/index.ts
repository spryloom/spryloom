/**
 * The wire contract between the CLI, the agent tools, and the control plane.
 *
 * Shared so both sides are built against one definition rather than two
 * descriptions of the same thing that drift apart. Nothing here has behaviour;
 * it is names, shapes and the wording of failures.
 */

export const API_VERSION = 1;

/** Sent on every authenticated request. */
export const AUTH_HEADER = 'authorization';

/**
 * How the platform's own dashboard, published as an app, identifies the person
 * it is acting for (D76).
 *
 * An app is told who its visitor is by the identity token the proxy mints per
 * request. The dashboard app forwards that token to the public API in place
 * of a bearer token, with the method and path of the request it was minted
 * for, so the API can verify the signature. The API accepts it only from the
 * one app it is configured to trust, and only on routes that read.
 */
export const IDENTITY_AUTH_SCHEME = 'Spryloom-Identity';
/** `<METHOD> <path>` of the request the identity token is bound to. */
export const IDENTITY_REQUEST_HEADER = 'identity-request';

/**
 * Which client is calling, as `spry/<version>`.
 *
 * Sent by the CLI and the agent tools on every request, so the control plane
 * can turn away a client too old for the API it serves, with an upgrade
 * command, rather than failing somewhere confusing (D99).
 */
export const CLIENT_HEADER = 'x-spryloom-client';

/** Prefix on every token we issue, so one found in a log is recognisable. */
export const TOKEN_PREFIX = 'spry_';

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

/**
 * How every failure is reported.
 *
 * `message` says what went wrong and `hint` says what to do, because the CLI and
 * the agent show them in different places and the wording of each is specified
 * in the acceptance document.
 */
export interface ApiError {
  readonly error: string;
  readonly message: string;
  readonly hint?: string;
  /** Output from the user's own app or build, when there is any. */
  readonly logs?: readonly string[];
  /** True when nothing changed, so a caller can say so honestly. */
  readonly unchanged?: boolean;
}

export const isApiError = (value: unknown): value is ApiError =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ApiError).error === 'string' &&
  typeof (value as ApiError).message === 'string';

// ---------------------------------------------------------------------------
// Signing in from a terminal
// ---------------------------------------------------------------------------

/**
 * Sign-in without a password and without pasting anything.
 *
 * The terminal asks to begin, the person clicks a link in their email, and the
 * terminal collects the token it was waiting for. The same shape as a device
 * flow, and for the same reason: a terminal is a bad place to type a secret.
 */
export interface LoginStartRequest {
  readonly email: string;
}

export interface LoginStartResponse {
  /** Identifies this attempt. Safe to show; it grants nothing on its own. */
  readonly requestId: string;
  /** Held by the terminal and never emailed, so only this terminal can collect. */
  readonly pollToken: string;
  /**
   * A short code the terminal shows and the person checks in their browser.
   *
   * Without it, somebody who gets a person to open a link they triggered
   * themselves collects that person's token, and the person has no way to see
   * that the sign-in they approved was not the one in front of them.
   */
  readonly userCode: string;
  /**
   * Where to approve this sign-in, when nothing will email it.
   *
   * Only ever present on an installation that says it delivers links locally —
   * somebody running Spryloom on their own laptop, where there is no mail
   * server and the person at the terminal is the person signing in. A hosted
   * installation never returns this, because the email is what proves the
   * address belongs to whoever asked.
   *
   * It replaces reading the link out of a log file, which was the only way a
   * local installation could be used at all.
   */
  readonly approveUrl?: string;
  /** How long the person has to click, in seconds. */
  readonly expiresIn: number;
  /** How long to wait between polls, in seconds. */
  readonly interval: number;
}

/**
 * How a terminal proves it is the one that asked.
 *
 * The poll token travels as a bearer token on the poll request. Written down
 * because it is otherwise a convention two sides have to remember rather than a
 * contract either can check.
 */
export const POLL_AUTH = 'bearer';

export type LoginPollStatus =
  /** Nobody has clicked the link yet. */
  | 'waiting'
  /** Clicked, and the token is here. */
  | 'complete'
  /** Nobody clicked in time. */
  | 'expired';

export interface LoginPollResponse {
  readonly status: LoginPollStatus;
  /** Present only when complete. */
  readonly token?: string;
  readonly workspace?: string;
  readonly email?: string;
}

// ---------------------------------------------------------------------------
// Who is signed in
// ---------------------------------------------------------------------------

export interface WhoAmIResponse {
  readonly email: string;
  readonly workspace: string;
  /** Email domain of the workspace, when it has one. */
  readonly domain?: string;
}

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------

export interface AppSummary {
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
  /** A publish, delete, rollback, restore or restart running now (D99, finding F7). */
  readonly operation?: OperationView;
  /** True for an app whose first publish is still running: it is not live yet. */
  readonly pending?: boolean;
  /** A page (D105): files, no server. Absent is an app. */
  readonly kind?: 'page';
}

export interface AppListResponse {
  readonly apps: readonly AppSummary[];
}

/** A portable control-plane export. App database rows are intentionally separate. */
export interface AppExportResponse {
  readonly formatVersion: 1;
  readonly exportedAt: number;
  readonly app: AppSummary & {
    readonly owner: string;
    readonly admins: readonly string[];
    readonly invited: readonly string[];
    readonly manifest?: unknown;
    readonly databaseName?: string;
  };
  readonly versions: readonly {
    readonly version: number;
    readonly publishedAt: number;
    readonly publishedBy: string;
    readonly image: string;
  }[];
  readonly audit: readonly {
    readonly at: number;
    readonly actor: string;
    readonly action: string;
    readonly subject?: string;
    readonly detail?: string;
  }[];
  readonly database: { readonly included: false; readonly instruction: string };
}

/**
 * A publish.
 *
 * The app's files are sent as a gzipped tar in the request body, and everything
 * else travels in the query string, because the body is already the archive.
 */
/** Content type of a publish body. The archive itself, not a form. */
export const PUBLISH_CONTENT_TYPE = 'application/gzip';

export interface PublishQuery {
  /** Ties the attempt together in the event log. */
  readonly publishId: string;
  /** How the publish reached us; the share arriving by agent is an exit criterion. */
  readonly source: 'agent' | 'cli' | 'dashboard';
}

export interface PublishResponse {
  readonly url: string;
  readonly version: number;
  readonly workspace: string;
  /** What was created, in the order to show it. */
  readonly created: readonly string[];
  readonly buildSeconds: number;
  /** Things worth fixing that did not stop the publish. */
  readonly warnings: readonly PublishWarning[];
}

/**
 * Something the platform is doing that takes longer than a request (D99).
 *
 * A publish or a delete is accepted at once and then worked through in named
 * stages. The client polls it, which keeps every request short, and the record
 * is what lets a publish carry on when the API restarts part-way.
 */
export type OperationKind = 'publish' | 'delete' | 'rollback' | 'restore' | 'restart';
export type OperationStatus = 'accepted' | 'running' | 'succeeded' | 'failed';

/** The stages each kind goes through, in order. Clients draw these. */
export const OPERATION_STAGES: Readonly<Record<OperationKind, readonly string[]>> = {
  publish: ['preparing', 'database', 'building', 'starting', 'health', 'jobs', 'switching'],
  delete: ['stopping', 'domains', 'machine', 'database', 'secrets', 'verifying'],
  rollback: ['preparing', 'starting', 'health', 'jobs', 'switching'],
  restore: ['preparing', 'starting', 'health', 'jobs'],
  restart: ['starting', 'health'],
};

/**
 * The stages of a page's operations (D105). A page is files in storage, so
 * there is nothing to build, start or check: it is stored, then switched to.
 */
export const PAGE_OPERATION_STAGES: Readonly<Partial<Record<OperationKind, readonly string[]>>> = {
  publish: ['preparing', 'storing', 'switching'],
  rollback: ['preparing', 'switching'],
  restore: ['preparing'],
  delete: ['stopping', 'files', 'domains', 'verifying'],
};

/** A page that is built first (D107): a static app with a build step and no server. */
export const BUILT_PAGE_PUBLISH_STAGES: readonly string[] = ['preparing', 'building', 'storing', 'switching'];

/** The stages an operation goes through, for an app, a page, or a page that is built first. */
export const operationStages = (kind: OperationKind, page = false, built = false): readonly string[] =>
  page && built && kind === 'publish'
    ? BUILT_PAGE_PUBLISH_STAGES
    : ((page ? PAGE_OPERATION_STAGES[kind] : undefined) ?? OPERATION_STAGES[kind]);

/** What a stage is called on screen. */
export const STAGE_LABELS: Readonly<Record<string, string>> = {
  preparing: 'Preparing',
  database: 'Database',
  building: 'Building',
  starting: 'Starting',
  health: 'Health check',
  jobs: 'Jobs',
  switching: 'Switching over',
  stopping: 'Stopping',
  machine: 'Removing the machine',
  secrets: 'Removing secrets',
  domains: 'Removing domains',
  verifying: 'Checking it is all gone',
  storing: 'Storing the files',
  files: 'Removing the files',
  // Where one stage name means something different in a delete.
  'delete:database': 'Deleting the database',
};

/** What a stage is called on screen, for the kind of operation it belongs to. */
export const stageLabel = (kind: OperationKind, stage: string): string =>
  STAGE_LABELS[`${kind}:${stage}`] ?? STAGE_LABELS[stage] ?? stage.charAt(0).toUpperCase() + stage.slice(1);

export interface OperationView {
  readonly id: string;
  readonly kind: OperationKind;
  readonly app: string;
  readonly status: OperationStatus;
  readonly stages: readonly string[];
  /** The stage being worked on, or the last one reached. */
  readonly stage: string;
  /** The latest useful output line, such as a build line. Redacted. */
  readonly lastLine?: string;
  /** How many times this has been started. More than 1 means it was resumed. */
  readonly attempt: number;
  /** For a publish: the version it is making. For a rollback: the version it returns to. */
  readonly version?: number;
  readonly elapsedSeconds: number;
  readonly stageSeconds: number;
  /** For a publish that succeeded. */
  readonly result?: PublishResponse;
  /** For a delete that succeeded: what was removed and checked gone. */
  readonly removed?: readonly string[];
  /** For a rollback, restore or restart that succeeded: the version now serving, and where. */
  readonly outcome?: { readonly version: number; readonly url: string };
  /** For one that failed. */
  readonly error?: ApiError;
}

/** What `POST …/publish` and `DELETE …/apps/:slug` answer with: 202, or 409 with the one already running. */
export interface OperationAccepted {
  readonly operation: OperationView;
}

export interface PublishWarning {
  readonly code: string;
  readonly message: string;
  readonly hint: string;
  readonly file?: string;
  readonly line?: number;
}

export interface RollbackRequest {
  /** Which version to return to. Omitted means the one before the current. */
  readonly toVersion?: number;
}

/**
 * What deleting an app took with it.
 *
 * Says what actually went rather than only that something did, because the
 * things it removes live at three different providers and nobody should have
 * to go and check.
 */
export interface DeleteAppResponse {
  readonly deleted: string;
  readonly removed: readonly string[];
}

export interface RollbackResponse {
  readonly version: number;
  readonly url: string;
}

export interface LogsResponse {
  readonly lines: readonly string[];
}

export interface InviteRequest {
  readonly emails: readonly string[];
}

/**
 * Why an address was not invited.
 *
 * A code as well as a sentence, because callers act on these differently and
 * matching on the sentence would break the moment the wording improved. Only
 * `already_invited` means the person asked for something that is already true.
 */
export type InviteSkipCode = 'invalid_address' | 'wrong_domain' | 'already_invited';

export interface InviteSkip {
  readonly email: string;
  readonly code: InviteSkipCode;
  /** What to show a person. */
  readonly reason: string;
}

/**
 * What an app's secrets are called, and when they were set.
 *
 * Never the values. There is no route that returns one: a secret somebody can
 * read back is a secret that leaks through whoever can read it.
 */
export interface SecretListResponse {
  readonly secrets: ReadonlyArray<{
    readonly name: string;
    readonly updatedAt: number;
    readonly updatedBy: string;
  }>;
}

export interface SetSecretRequest {
  readonly value: string;
}

/** What signing out everywhere did. */
export interface SignOutEverywhereResponse {
  /** How many terminals will stop working, this one included. */
  readonly revoked: number;
}

export interface InviteResponse {
  readonly invited: readonly string[];
  readonly skipped: readonly InviteSkip[];
  /**
   * Already invited, and sent a fresh invitation: their earlier link no longer
   * works (D100). An invitation lasts a week, so this is how a missed one is
   * replaced.
   */
  readonly resent?: readonly string[];
}

export interface RevokeInviteResponse {
  readonly revoked: boolean;
  readonly email: string;
}

// ---------------------------------------------------------------------------
// Scheduled jobs (M1*, D81)
// ---------------------------------------------------------------------------

export type JobRunResult = 'running' | 'succeeded' | 'failed' | 'timed_out' | 'skipped' | 'lost';

export interface JobRunSummary {
  readonly id: string;
  /** What started it: its schedule, or somebody running it by hand. */
  readonly trigger: 'schedule' | 'manual';
  readonly version: number;
  /** Seconds since epoch. */
  readonly scheduledFor: number;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly result: JobRunResult;
  readonly exitCode?: number;
  /** Why, in words, when it did not succeed. */
  readonly detail?: string;
}

export interface JobSummary {
  readonly name: string;
  readonly command: string;
  readonly schedule: string;
  readonly timezone: string;
  /** The schedule in words: "weekdays at 9:00 AM". */
  readonly described: string;
  readonly timeoutMinutes: number;
  /** Seconds since epoch. Absent while paused. */
  readonly nextRunAt?: number;
  readonly paused: boolean;
  readonly consecutiveFailures: number;
  readonly lastRun?: JobRunSummary;
}

export interface JobListResponse {
  readonly jobs: readonly JobSummary[];
}

export interface JobRunsResponse {
  readonly runs: readonly JobRunSummary[];
  /** The last lines the newest finished run printed, newest last. */
  readonly lines: readonly string[];
}

export interface JobRunStarted {
  readonly run: JobRunSummary;
}

// ---------------------------------------------------------------------------
// The gateway and the control plane (D84, D86)
// ---------------------------------------------------------------------------

/**
 * What the control plane tells the gateway about the app a key belongs to.
 *
 * The gateway asks on every request it has not asked about in the last thirty
 * seconds, so a revoked key stops working within a minute.
 */
export interface GatewayAuthorization {
  readonly workspace: string;
  readonly app: string;
  readonly appName: string;
  readonly email: boolean;
  readonly egress: readonly string[];
  /** True when today's outside-access cap is used up. */
  readonly egressCapReached: boolean;
  /** True when the app is suspended or its email is. */
  readonly emailSuspended: boolean;
}

/** One finished tunnel, as the gateway reports it. */
export interface GatewayUsageReport {
  readonly workspace: string;
  readonly app: string;
  readonly host: string;
  readonly bytes: number;
  readonly result: 'allowed' | 'not_declared' | 'not_in_registry' | 'address_refused' | 'server_name_mismatch' | 'cap' | 'failed';
  /**
   * True for a report made while the tunnel is still open, so a single long
   * tunnel is held to the day's limit too. Its bytes count; it is not another
   * connection.
   */
  readonly interim?: boolean;
}

export interface GatewayUsageAnswer {
  readonly egressCapReached: boolean;
}

export * from './notify.js';
export * from './client.js';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Every route in one place, so the client cannot drift from the server.
 *
 * Functions rather than strings, because a slug that is not escaped is a way to
 * reach a path nobody meant to expose.
 */
export const routes = {
  loginStart: (): string => '/api/v1/login',
  loginPoll: (requestId: string): string => `/api/v1/login/${encodeURIComponent(requestId)}`,
  loginApprove: (requestId: string): string =>
    `/api/v1/login/${encodeURIComponent(requestId)}/approve`,
  /** The answer to "how did you find Spryloom?", once, after a first sign-in (D127). */
  loginFound: (): string => '/api/v1/login/found',
  whoAmI: (): string => '/api/v1/me',
  secrets: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/secrets`,
  secret: (slug: string, name: string): string =>
    `/api/v1/apps/${encodeURIComponent(slug)}/secrets/${encodeURIComponent(name)}`,
  /** Revoke every token this person holds, on every machine. */
  signOutEverywhere: (): string => '/api/v1/me/tokens',
  /** Revoke the token this request carries, and no other. */
  signOut: (): string => '/api/v1/me/token',
  apps: (): string => '/api/v1/apps',
  app: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}`,
  exportApp: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/export`,
  /** A page's saved data (D113), as the signed-in person. By workspace, so a page someone was invited to elsewhere works too. */
  pageData: (workspace: string, slug: string): string =>
    `/api/v1/pages/${encodeURIComponent(workspace)}/${encodeURIComponent(slug)}/data`,
  /** Every record of a page, for its owner and admins (D113). */
  pageDataExport: (workspace: string, slug: string): string =>
    `/api/v1/pages/${encodeURIComponent(workspace)}/${encodeURIComponent(slug)}/data/export`,
  publish: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/publish`,
  operation: (id: string): string => `/api/v1/operations/${encodeURIComponent(id)}`,
  activeOperation: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/operation`,
  logs: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/logs`,
  rollback: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/rollback`,
  invite: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/invite`,
  revokeInvite: (slug: string, email: string): string =>
    `/api/v1/apps/${encodeURIComponent(slug)}/invite?email=${encodeURIComponent(email)}`,
  archive: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/archive`,
  /**
   * Deleting takes the name again, in the query string.
   *
   * Not politeness: it is the difference between a delete somebody meant and a
   * delete that was one argument away from a different app.
   */
  deleteApp: (slug: string, confirm: string): string =>
    `/api/v1/apps/${encodeURIComponent(slug)}?confirm=${encodeURIComponent(confirm)}`,
  restore: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/restore`,
  restart: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/restart`,
  /** The dashboard's two reads (D76): a workspace at a glance, and one app in full. */
  workspaceOverview: (): string => '/api/v1/workspace/overview',
  appOverview: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/overview`,
  jobs: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/jobs`,
  jobRun: (slug: string, job: string): string =>
    `/api/v1/apps/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(job)}/run`,
  jobResume: (slug: string, job: string): string =>
    `/api/v1/apps/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(job)}/resume`,
  jobRuns: (slug: string, job: string): string =>
    `/api/v1/apps/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(job)}/runs`,
  domains: (slug: string): string => `/api/v1/apps/${encodeURIComponent(slug)}/domains`,
  domainVerify: (slug: string, hostname: string): string =>
    `/api/v1/apps/${encodeURIComponent(slug)}/domains/${encodeURIComponent(hostname)}/verify`,
  domain: (slug: string, hostname: string): string =>
    `/api/v1/apps/${encodeURIComponent(slug)}/domains/${encodeURIComponent(hostname)}`,
} as const;

/**
 * The same routes as patterns, for a server to register.
 *
 * Separate from `routes` on purpose. Those escape what they are given, which is
 * right for building a URL and wrong for registering a route: a pattern like
 * `:slug` comes back percent-encoded and then matches nothing.
 */
export const patterns = {
  /**
   * Whether the control plane is working, for something outside it to poll.
   *
   * Outside `/api/v1` and unauthenticated on purpose: a monitor cannot hold a
   * credential that survives the platform being down, and a check that needs
   * one goes silent at exactly the moment it is wanted.
   */
  health: '/health',
  loginStart: '/api/v1/login',
  loginPoll: '/api/v1/login/:requestId',
  loginApprove: '/api/v1/login/:requestId/approve',
  loginFound: '/api/v1/login/found',
  whoAmI: '/api/v1/me',
  secrets: '/api/v1/apps/:slug/secrets',
  secret: '/api/v1/apps/:slug/secrets/:name',
  signOutEverywhere: '/api/v1/me/tokens',
  signOut: '/api/v1/me/token',
  apps: '/api/v1/apps',
  app: '/api/v1/apps/:slug',
  exportApp: '/api/v1/apps/:slug/export',
  pageData: '/api/v1/pages/:workspace/:slug/data',
  pageDataExport: '/api/v1/pages/:workspace/:slug/data/export',
  publish: '/api/v1/apps/:slug/publish',
  operation: '/api/v1/operations/:id',
  activeOperation: '/api/v1/apps/:slug/operation',
  logs: '/api/v1/apps/:slug/logs',
  rollback: '/api/v1/apps/:slug/rollback',
  invite: '/api/v1/apps/:slug/invite',
  archive: '/api/v1/apps/:slug/archive',
  restore: '/api/v1/apps/:slug/restore',
  restart: '/api/v1/apps/:slug/restart',
  workspaceOverview: '/api/v1/workspace/overview',
  appOverview: '/api/v1/apps/:slug/overview',
  jobs: '/api/v1/apps/:slug/jobs',
  jobRun: '/api/v1/apps/:slug/jobs/:job/run',
  jobResume: '/api/v1/apps/:slug/jobs/:job/resume',
  jobRuns: '/api/v1/apps/:slug/jobs/:job/runs',
  /** The page an app-mail footer links to, and the one-click unsubscribe target. */
  mute: '/mute',
  /** Postmark's bounce and complaint webhook. Mounted only when a token is configured. */
  postmarkHook: '/hooks/postmark',
} as const;

/** Names for the failures a caller is expected to handle. */
export const errorCodes = {
  notSignedIn: 'not_signed_in',
  notFound: 'not_found',
  notAllowed: 'not_allowed',
  invalid: 'invalid',
  publishFailed: 'publish_failed',
  rollbackFailed: 'rollback_failed',
  tooLarge: 'too_large',
  rateLimited: 'rate_limited',
  /** Another publish or delete of this app is already running (D99). */
  busy: 'busy',
  /** This spry is older than the API it is talking to. */
  clientTooOld: 'client_too_old',
  deleteFailed: 'delete_failed',
} as const;

/** The oldest spry the API accepts publishes and deletes from (D99). */
export const MIN_CLIENT_VERSION = '0.1.4';

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];
export * from './found.js';
