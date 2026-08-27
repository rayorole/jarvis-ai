/**
 * Typed client for the Jarvis file explorer API (`/api/files*`).
 * Validated shape-wise so a malformed payload degrades to an empty list,
 * never a crash.
 */

export type FileNodeType = "file" | "directory";

export interface FileNode {
  path: string;
  name: string;
  type: FileNodeType;
  size: number | null;
  mtime: string | null;
}

export interface FileListing {
  root: string;
  path: string;
  items: FileNode[];
  truncated: boolean;
}

export interface FileRoot {
  id: string;
  label: string;
}

export const FILES_PATH = "/api/files";

export class FilesApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: unknown,
  ) {
    super(`files api error ${status}`);
    this.name = "FilesApiError";
  }
}

function isFileNode(v: unknown): v is FileNode {
  if (typeof v !== "object" || v === null) return false;
  const n = v as Record<string, unknown>;
  return (
    typeof n.path === "string" &&
    typeof n.name === "string" &&
    (n.type === "file" || n.type === "directory")
  );
}

function normalizeListing(v: unknown): FileListing {
  if (typeof v !== "object" || v === null) {
    return { root: "", path: "", items: [], truncated: false };
  }
  const l = v as Record<string, unknown>;
  return {
    root: typeof l.root === "string" ? l.root : "",
    path: typeof l.path === "string" ? l.path : "",
    items: Array.isArray(l.items) ? l.items.filter(isFileNode) : [],
    truncated: l.truncated === true,
  };
}

async function readError(response: Response): Promise<FilesApiError> {
  return new FilesApiError(response.status, await response.json().catch(() => null));
}

export async function listRoots(fetchImpl: typeof fetch = fetch): Promise<FileRoot[]> {
  const res = await fetchImpl(`${FILES_PATH}/roots`);
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as { items?: unknown };
  return Array.isArray(body.items) ? body.items.filter((r): r is FileRoot => typeof r === "object" && r !== null && typeof (r as FileRoot).id === "string") : [];
}

export interface ListFilesOptions {
  root?: string;
  path?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function listFiles(options: ListFilesOptions = {}): Promise<FileListing> {
  const doFetch = options.fetchImpl ?? fetch;
  const params = new URLSearchParams();
  if (options.root !== undefined) params.set("root", options.root);
  if (options.path !== undefined) params.set("path", options.path);
  const qs = params.toString();
  const res = await doFetch(`${FILES_PATH}/list${qs ? `?${qs}` : ""}`, { signal: options.signal });
  if (!res.ok) throw await readError(res);
  return normalizeListing(await res.json());
}
