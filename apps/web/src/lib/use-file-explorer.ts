import { useCallback, useEffect, useRef, useState } from "react";
import { listFiles, listRoots, type FileListing, type FileRoot } from "./files-api";

export type ExplorerStatus = "loading" | "ready" | "error";

export interface UseFileExplorerOptions {
  fetchImpl?: typeof fetch;
}

export interface UseFileExplorerResult {
  status: ExplorerStatus;
  error: string | null;
  roots: FileRoot[];
  rootId: string | null;
  path: string;
  listing: FileListing | null;
  setRoot: (rootId: string) => void;
  openPath: (relativePath: string) => void;
  navigateUp: () => void;
  /** Path segment strings for breadcrumbs ("" root first). */
  breadcrumbs: string[];
  /** Path-segment search filter (client-side over the current listing). */
  search: string;
  setSearch: (value: string) => void;
  filteredItems: FileListing["items"];
}

function segmentsOf(path: string): string[] {
  return path === "" ? [] : path.split("/");
}

/**
 * File explorer state at the public seam: roots, current path, listing,
 * and navigation. Server errors map to redacted user-facing messages —
 * filesystem details never reach the UI.
 */
export function useFileExplorer(options: UseFileExplorerOptions = {}): UseFileExplorerResult {
  const fetchImpl = options.fetchImpl ?? fetch;
  const [status, setStatus] = useState<ExplorerStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [roots, setRoots] = useState<FileRoot[]>([]);
  const [rootId, setRootId] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<FileListing | null>(null);
  const [search, setSearch] = useState("");
  const genRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const gen = ++genRef.current;
    setStatus("loading");
    setError(null);
    (async () => {
      try {
        const rootList = await listRoots(fetchImpl);
        if (cancelled || gen !== genRef.current) return;
        setRoots(rootList);
        setRootId(rootList[0]?.id ?? null);
      } catch {
        if (!cancelled && gen === genRef.current) {
          setStatus("error");
          setError("Unable to load file roots");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  const loadListing = useCallback(
    async (root: string, target: string) => {
      const gen = ++genRef.current;
      setStatus("loading");
      setError(null);
      try {
        const result = await listFiles({ root, path: target, fetchImpl });
        if (gen !== genRef.current) return;
        setListing(result);
        setPath(result.path);
        setStatus("ready");
      } catch (err) {
        if (gen !== genRef.current) return;
        setStatus("error");
        const httpStatus = (err as { status?: number }).status;
        setError(
          httpStatus === 404
            ? "Path not found"
            : httpStatus === 403
              ? "Path outside approved roots"
              : "Unable to load files",
        );
      }
    },
    [fetchImpl],
  );

  // Load the listing whenever the root becomes known or changes.
  useEffect(() => {
    if (rootId === null) return;
    void loadListing(rootId, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootId]);

  const setRoot = useCallback((next: string) => {
    setRootId((prev) => {
      if (prev === next) return prev;
      setPath("");
      setSearch("");
      return next;
    });
  }, []);

  const openPath = useCallback(
    (relative: string) => {
      if (rootId === null) return;
      setSearch("");
      void loadListing(rootId, relative);
    },
    [rootId, loadListing],
  );

  const navigateUp = useCallback(() => {
    if (rootId === null) return;
    const segments = segmentsOf(path);
    if (segments.length === 0) return;
    void loadListing(rootId, segments.slice(0, -1).join("/"));
  }, [rootId, path, loadListing]);

  const breadcrumbs = ["", ...segmentsOf(path)];

  const filteredItems = (listing?.items ?? []).filter((item) =>
    search === "" ? true : item.name.toLowerCase().includes(search.toLowerCase()),
  );

  return {
    status,
    error,
    roots,
    rootId,
    path,
    listing,
    setRoot,
    openPath,
    navigateUp,
    breadcrumbs,
    search,
    setSearch,
    filteredItems,
  };
}
