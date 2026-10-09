import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { detect, type Detection, type Finding } from '@spryloom/detect';
import {
  MANIFEST_FILENAME,
  ManifestError,
  parseManifest,
  type Manifest,
} from '@spryloom/manifest';

import { describeRows, painter, wrap, type Output, type Painter } from '../ui.js';

export interface CommandContext {
  readonly output: Output;
  readonly colour: boolean;
  /** This spry's version, sent to the control plane on every request. */
  readonly version?: string;
}

/** Exit codes. `0` publishable, `1` something blocks it, `2` the command was used wrongly. */
/** `130` is Ctrl-C while watching a publish or a delete, the shell's own number for it. */
export type ExitCode = 0 | 1 | 2 | 130;

async function readManifest(root: string): Promise<Manifest | undefined> {
  let source: string;
  try {
    source = await readFile(join(root, MANIFEST_FILENAME), 'utf8');
  } catch {
    return undefined;
  }
  return parseManifest(source);
}

function describeData(manifest: Manifest | undefined, detection: Detection): string {
  if (manifest !== undefined) {
    if (!manifest.data.postgres) return 'none';
    const count = manifest.data.tables.length;
    return `postgres, ${count} ${count === 1 ? 'table' : 'tables'}`;
  }
  return detection.usesPostgres ? 'postgres (a database client is in your dependencies)' : 'none';
}

/** Print one finding: what is wrong, where, and what to do. */
function renderFinding(finding: Finding, paint: Painter): string[] {
  const mark = finding.severity === 'blocker' ? paint.red('✗') : paint.yellow('!');
  const where =
    finding.file === undefined
      ? ''
      : ` ${paint.cyan(finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`)}`;
  return [
    '',
    `  ${mark}${where}`,
    ...wrap(finding.message, '    '),
    ...wrap(finding.hint, '    ').map((line) => paint.dim(line)),
  ];
}

/**
 * Report what Spryloom sees in a folder and whether it could be published.
 *
 * Reads the manifest when one exists, since the manifest is the contract (D3),
 * and falls back to inspecting the folder when it does not.
 */
export async function check(root: string, context: CommandContext): Promise<ExitCode> {
  const paint = painter(context.colour);
  const { output } = context;

  let manifest: Manifest | undefined;
  try {
    manifest = await readManifest(root);
  } catch (error) {
    if (error instanceof ManifestError) {
      output.err(error.message);
      return 1;
    }
    throw error;
  }

  const detection = await detect(root);

  const title = manifest?.app.name ?? 'This folder';
  output.out('');
  output.out(paint.bold(title));
  if (manifest !== undefined) {
    output.out(paint.dim(`  ${manifest.app.description}`));
  }
  output.out('');

  const rows: Array<readonly [string, string]> = [
    ['frontend', manifest?.runtime.frontend ?? detection.frontend],
    ['backend', manifest?.runtime.backend ?? detection.backend],
    ['database', describeData(manifest, detection)],
    ['uploads', manifest?.data.uploads === true ? 'yes' : 'none'],
  ];
  if (manifest !== undefined) {
    rows.push(['who can use it', describeVisibility(manifest)]);
  }
  if (detection.dockerfile !== undefined) {
    rows.push(['dockerfile', `${detection.dockerfile} (yours, used as-is)`]);
  }
  for (const line of describeRows(rows, paint)) output.out(line);

  for (const finding of detection.findings) {
    for (const line of renderFinding(finding, paint)) output.out(line);
  }

  const blockers = detection.findings.filter((f) => f.severity === 'blocker');
  output.out('');

  if (blockers.length > 0) {
    output.out(
      paint.red(
        blockers.length === 1
          ? 'One thing has to be fixed before this can be published.'
          : `${blockers.length} things have to be fixed before this can be published.`,
      ),
    );
    return 1;
  }

  if (manifest === undefined) {
    output.out(paint.dim(`No ${MANIFEST_FILENAME} yet. Run \`spry init\` to write one.`));
    return 0;
  }

  output.out(paint.green('Ready to publish.'));
  return 0;
}

function describeVisibility(manifest: Manifest): string {
  switch (manifest.access.visibility) {
    case 'private':
      return 'only you';
    case 'invited':
      return 'people you invite';
    case 'company':
      return `anyone at ${manifest.access.domain ?? 'your company'}`;
    case 'link':
      return 'anyone with the link, after signing in';
  }
}
