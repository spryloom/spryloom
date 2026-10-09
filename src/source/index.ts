/**
 * Where the app being published comes from.
 *
 * Three ways in: a folder, a zip of one, and a GitHub repository. They all end
 * as the same thing, a folder on this machine, and everything downstream —
 * detection, the manifest, the exclusions, the upload — sees only that.
 *
 * That is the point of this module. The control plane accepts exactly one kind
 * of input, and it is the least trusted thing it handles (see
 * `@spryloom/api`'s archive). Adding two more ways for bytes to arrive there
 * would mean two more things to get right in the place where getting it wrong
 * is worst. Here, on the machine of the person publishing, a zip is just a zip.
 */

import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';

import {
  RepositoryError,
  describeRepository,
  downloadRepository,
  commonRoot,
  parseRepository,
  type DownloadOptions,
  type RepositoryReference,
} from './github.js';
import { ZipError, readZip, type ZipEntry } from './zip.js';
import { PAGE_FILE, pageFolderFromFile } from './page-file.js';

export {
  MAX_ENTRIES,
  MAX_EXPANDED_BYTES,
  MAX_ZIP_BYTES,
  ZipError,
  entryIsSafe,
  readZip,
  type ZipEntry,
  type ZipRefusal,
} from './zip.js';
export {
  DOWNLOAD_TIMEOUT_MS,
  RepositoryError,
  commonRoot,
  describeRepository,
  downloadRepository,
  parseRepository,
  type DownloadOptions,
  type RepositoryReference,
} from './github.js';

export { PAGE_FILE, PageFileError, localReferences, pageFolderFromFile, renderMarkdownPage, titleOf, type PageFolder } from './page-file.js';

export type Source =
  | { readonly kind: 'folder'; readonly path: string }
  /** One `.html` or `.md` file, published as a page (D105). */
  | { readonly kind: 'page'; readonly path: string }
  | { readonly kind: 'zip'; readonly path: string }
  | { readonly kind: 'repository'; readonly reference: RepositoryReference };

/**
 * Work out what someone meant.
 *
 * A path that ends `.zip` is a zip; anything GitHub-shaped is a repository;
 * everything else is a folder, which is what it has always been. Deciding by
 * shape rather than by a flag means `spry publish` keeps taking one argument.
 */
export function parseSource(input: string): Source {
  const trimmed = input.trim();

  if (/\.zip$/i.test(trimmed.replace(/[@#][^/\\]*$/, ''))) {
    return { kind: 'zip', path: trimmed };
  }

  // Only strings that name GitHub, never a bare `something/other` that is far
  // more likely to be a relative path someone typed.
  if (/^(https?:\/\/)?(www\.)?github\.com[/:]/i.test(trimmed) || /^git@github\.com:/i.test(trimmed)) {
    const reference = parseRepository(trimmed);
    if (reference !== undefined) return { kind: 'repository', reference };
  }

  // A single page file (D105). A folder that happens to be called
  // `site.html` is still a folder: resolving checks which it is.
  if (PAGE_FILE.test(trimmed)) return { kind: 'page', path: trimmed };

  return { kind: 'folder', path: trimmed };
}

/** How a source reads back to a person, for a line that says what is happening. */
export function describeSource(source: Source): string {
  switch (source.kind) {
    case 'folder':
    case 'page':
      return source.path;
    case 'zip':
      return source.path;
    case 'repository':
      return describeRepository(source.reference);
  }
}

export interface ResolvedSource {
  /** A folder on this machine holding the app. */
  readonly root: string;
  /** What it was, in words, for the line that says what is being published. */
  readonly describe: string;
  /**
   * What to call the app, when nothing else says.
   *
   * The folder a download or a zip is unpacked into is generated and means
   * nothing to anybody, so the name comes from the source: the repository, or
   * the directory the zip wraps, or the zip's own file name.
   */
  readonly suggestedName: string;
  /**
   * True when `root` is somewhere temporary.
   *
   * The caller needs to know: writing a generated manifest into a folder that is
   * about to be deleted would look like it had been saved when it had not.
   */
  readonly temporary: boolean;
  /**
   * True when one file was made into a page (D105). The generated manifest
   * then belongs to nothing on the person's machine, and is not handed back.
   */
  readonly singleFile?: boolean;
  /** Worth telling the person after publishing, such as files a page links to that weren't brought. */
  readonly notes?: readonly string[];
  /** A description to use when none is given: a single page's own title (D105). */
  readonly suggestedDescription?: string;
  dispose(): Promise<void>;
}

export interface ResolveOptions extends DownloadOptions {
  /** Read a zip from disk. Injected so a test does not need a file. */
  readonly readFile?: ((path: string) => Promise<Buffer>) | undefined;
}

/**
 * Turn a source into a folder.
 *
 * The caller disposes of it afterwards, whatever it was: for a folder that does
 * nothing, and for the other two it removes what was written.
 */
export async function resolveSource(
  source: Source,
  options: ResolveOptions = {},
): Promise<ResolvedSource> {
  switch (source.kind) {
    case 'folder': {
      const root = resolvePath(source.path);
      return {
        root,
        describe: root,
        suggestedName: basename(root),
        temporary: false,
        dispose: async () => undefined,
      };
    }

    case 'page': {
      const path = resolvePath(source.path);
      // Named like a page file but a directory: publish it as the folder it is.
      if ((await stat(path).catch(() => undefined))?.isDirectory() === true) {
        return { root: path, describe: path, suggestedName: basename(path), temporary: false, dispose: async () => undefined };
      }
      const page = await pageFolderFromFile(path);
      return {
        root: page.root,
        describe: path,
        suggestedName: page.suggestedName,
        temporary: true,
        singleFile: true,
        notes: page.notes,
        ...(page.title !== undefined && { suggestedDescription: page.title }),
        dispose: page.dispose,
      };
    }

    case 'zip': {
      const path = resolvePath(source.path);
      const read = options.readFile ?? (async (at: string) => (await import('node:fs/promises')).readFile(at));

      let archive: Buffer;
      try {
        archive = await read(path);
      } catch {
        throw new ZipError(
          'not_a_zip',
          `There is no file at ${path}.`,
          'Check the path, or publish from the folder itself.',
        );
      }

      const entries = readZip(archive);
      const wrapper = stripWrapper(entries);
      const root = await write(entries, wrapper);
      return {
        root,
        describe: path,
        // The folder the zip wraps, when it wraps one, and otherwise the zip's
        // own name. Both are what the person would have called it.
        suggestedName: wrapper ?? basename(path).replace(/\.zip$/i, ''),
        temporary: true,
        dispose: async () => rm(root, { recursive: true, force: true }),
      };
    }

    case 'repository': {
      const archive = await downloadRepository(source.reference, options);
      const entries = readZip(archive);
      // A zipball always wraps everything in one generated directory named for
      // the commit. Publishing it as it stands would put the app one level below
      // where the manifest says it is.
      const root = await write(entries, commonRoot(entries.map((entry) => entry.path)));
      return {
        root,
        describe: describeRepository(source.reference),
        suggestedName: source.reference.repo,
        temporary: true,
        dispose: async () => rm(root, { recursive: true, force: true }),
      };
    }
  }
}

/**
 * The single directory an archive wraps everything in, when it has one.
 *
 * Zipping a folder usually produces `myapp/…`, and publishing that would nest
 * the app inside a directory nobody asked for. One shared root is stripped; two
 * or more roots means the zip is of the contents, and nothing is stripped.
 */
export function stripWrapper(entries: readonly ZipEntry[]): string | undefined {
  return commonRoot(entries.filter((entry) => !entry.isDirectory).map((entry) => entry.path));
}

/** Write entries into a fresh directory, dropping `strip` from the front of each. */
async function write(entries: readonly ZipEntry[], strip: string | undefined): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'spryloom-source-'));

  try {
    for (const entry of entries) {
      // The wrapper's own entry has had its trailing slash removed by now, so it
      // does not match the `myapp/` prefix and would be recreated inside the
      // folder it is being stripped from.
      if (strip !== undefined && entry.path === strip) continue;
      const relative = strip === undefined ? entry.path : trimPrefix(entry.path, `${strip}/`);
      if (relative === '') continue;

      const target = join(root, relative);
      if (entry.isDirectory) {
        await mkdir(target, { recursive: true });
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, entry.contents, {
        // Only the execute bit is carried over, and only when the archive
        // recorded one. Everything else is ours to decide, and a file that
        // arrives group-writable should not stay that way.
        mode: entry.mode !== undefined && (entry.mode & 0o111) !== 0 ? 0o755 : 0o644,
      });
    }

    // An archive of nothing is a mistake worth naming, rather than a build that
    // fails later for a reason nobody can trace back to here.
    const files = entries.filter((entry) => !entry.isDirectory).length;
    if (files === 0) {
      throw new ZipError(
        'empty',
        'That archive holds no files.',
        'Check that the zip is of the folder holding the app.',
      );
    }
    await stat(root);
    return root;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

function trimPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

export { RepositoryError as GitHubError };
