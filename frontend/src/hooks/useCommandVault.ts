import { useState, useCallback, useEffect } from "react";
import { apiRequest } from "@/lib/apiClient";

export interface Group {
  id: number;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export interface Command {
  id: number;
  groupId: number;
  title: string;
  command: string;
  description: string | null;
  defaultVariables: Record<string, string>;
  tags: string[];
  isFavorite: boolean;
  copyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface VaultData {
  groups: Group[];
  commands: Command[];
}

export interface CommandStats {
  total: number;
  favorites: number;
  byGroup: Record<number, number>;
}

type ApiGroup = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  created_at: string;
  updated_at: string;
};

type ApiCommand = {
  id: number;
  group_id: number;
  title: string;
  command: string;
  description: string | null;
  default_variables: Record<string, string>;
  tags: string[];
  is_favorite: boolean;
  copy_count: number;
  created_at: string;
  updated_at: string;
};

type ApiSearchResponse = {
  items: ApiCommand[];
};

type ApiCommandsPageResponse = {
  items: ApiCommand[];
  total: number;
  limit: number;
  offset: number;
};

type ApiCommandStatsResponse = {
  total: number;
  favorites: number;
  by_group: Record<string, number>;
};

type ApiImportRequest = {
  groups: Array<{
    source_id: number;
    name: string;
    description: string | null;
    color: string;
    icon: string;
  }>;
  commands: Array<{
    source_group_id: number;
    title: string;
    command: string;
    description: string | null;
    default_variables: Record<string, string>;
    tags: string[];
    is_favorite: boolean;
    copy_count: number;
  }>;
};

type ApiImportResponse = {
  groups_created: number;
  commands_created: number;
};

function mapGroup(g: ApiGroup): Group {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    color: g.color,
    icon: g.icon,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  };
}

function mapCommand(c: ApiCommand): Command {
  return {
    id: c.id,
    groupId: c.group_id,
    title: c.title,
    command: c.command,
    description: c.description,
    defaultVariables: c.default_variables ?? {},
    tags: c.tags,
    isFavorite: c.is_favorite,
    copyCount: c.copy_count,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

export function useCommandVault(token: string) {
  const [data, setData] = useState<VaultData>({ groups: [], commands: [] });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<CommandStats>({ total: 0, favorites: 0, byGroup: {} });

  const [commandsLoading, setCommandsLoading] = useState(false);
  const [commandsLoadingMore, setCommandsLoadingMore] = useState(false);
  const [commandsHasMore, setCommandsHasMore] = useState(false);
  const [commandsTotal, setCommandsTotal] = useState(0);
  const [commandsOffset, setCommandsOffset] = useState(0);
  const commandsLimit = 30;
  const [commandsView, setCommandsView] = useState<{ groupId?: number; favoritesOnly?: boolean }>({});

  const fetchStats = useCallback(async () => {
    const res = await apiRequest<ApiCommandStatsResponse>("/commands/stats", { token });
    const byGroup: Record<number, number> = {};
    for (const [k, v] of Object.entries(res.by_group ?? {})) {
      const gid = Number(k);
      if (!Number.isNaN(gid)) byGroup[gid] = v;
    }
    setStats({ total: res.total ?? 0, favorites: res.favorites ?? 0, byGroup });
  }, [token]);

  const fetchCommandsPage = useCallback(async (opts: { groupId?: number; favoritesOnly?: boolean; limit: number; offset: number }) => {
    const res = await apiRequest<ApiCommandsPageResponse>("/commands/paged", {
      token,
      query: {
        group_id: opts.groupId,
        is_favorite: opts.favoritesOnly ? true : undefined,
        limit: opts.limit,
        offset: opts.offset,
      },
    });

    return {
      items: res.items.map(mapCommand),
      total: res.total,
      limit: res.limit,
      offset: res.offset,
    };
  }, [token]);

  const loadInitialCommands = useCallback(async (view: { groupId?: number; favoritesOnly?: boolean }) => {
    setCommandsLoading(true);
    setCommandsView(view);
    try {
      const page = await fetchCommandsPage({ ...view, limit: commandsLimit, offset: 0 });
      setData((prev) => ({ ...prev, commands: page.items }));
      setCommandsTotal(page.total);
      setCommandsOffset(page.items.length);
      setCommandsHasMore(page.items.length < page.total);
    } finally {
      setCommandsLoading(false);
    }
  }, [fetchCommandsPage]);

  const loadMoreCommands = useCallback(async () => {
    if (commandsLoading || commandsLoadingMore || !commandsHasMore) return;
    setCommandsLoadingMore(true);
    try {
      const page = await fetchCommandsPage({
        ...commandsView,
        limit: commandsLimit,
        offset: commandsOffset,
      });

      setData((prev) => {
        const known = new Set(prev.commands.map((c) => c.id));
        const merged = [...prev.commands];
        for (const item of page.items) {
          if (known.has(item.id)) continue;
          known.add(item.id);
          merged.push(item);
        }
        return { ...prev, commands: merged };
      });
      const nextOffset = commandsOffset + page.items.length;
      setCommandsOffset(nextOffset);
      setCommandsTotal(page.total);
      setCommandsHasMore(nextOffset < page.total);
    } finally {
      setCommandsLoadingMore(false);
    }
  }, [commandsHasMore, commandsLoading, commandsLoadingMore, commandsOffset, commandsView, fetchCommandsPage]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const groups = await apiRequest<ApiGroup[]>("/groups", { token });
    setData((prev) => ({ ...prev, groups: groups.map(mapGroup) }));
    await Promise.all([
      fetchStats(),
      loadInitialCommands(commandsView),
    ]);
    setLoading(false);
  }, [commandsView, fetchStats, loadInitialCommands, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const groups = await apiRequest<ApiGroup[]>("/groups", { token });
        if (cancelled) return;
        setData({ groups: groups.map(mapGroup), commands: [] });

        await Promise.all([
          fetchStats(),
          loadInitialCommands({}),
        ]);

        if (cancelled) return;
        setLoading(false);
      } catch {
        if (cancelled) return;
        setData({ groups: [], commands: [] });
        setLoading(false);
        setError("Failed to load data");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStats, loadInitialCommands, token]);

  const persist = useCallback((next: VaultData) => {
    // Backend is the source of truth; keep this for compatibility.
    setData(next);
  }, []);

  const setCommandsViewAndReload = useCallback(async (view: { groupId?: number; favoritesOnly?: boolean }) => {
    await loadInitialCommands(view);
  }, [loadInitialCommands]);

  // Groups
  const addGroup = useCallback(async (g: Omit<Group, "id" | "createdAt" | "updatedAt">) => {
    const created = await apiRequest<ApiGroup>("/groups", {
      method: "POST",
      token,
      json: {
        name: g.name,
        description: g.description,
        color: g.color,
        icon: g.icon,
      },
    });
    const mapped = mapGroup(created);
    setData((prev) => ({
      ...prev,
      groups: [...prev.groups, mapped].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    await fetchStats();
  }, [fetchStats, token]);

  const updateGroup = useCallback(async (id: number, updates: Partial<Group>) => {
    const updated = await apiRequest<ApiGroup>(`/groups/${id}`, {
      method: "PATCH",
      token,
      json: {
        name: updates.name,
        description: updates.description,
        color: updates.color,
        icon: updates.icon,
      },
    });
    const mapped = mapGroup(updated);
    setData((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === id ? mapped : g)).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [token]);

  const deleteGroup = useCallback(async (id: number) => {
    await apiRequest(`/groups/${id}`, { method: "DELETE", token });
    setData((prev) => ({
      groups: prev.groups.filter((g) => g.id !== id),
      commands: prev.commands.filter((c) => c.groupId !== id),
    }));
    await fetchStats();
  }, [fetchStats, token]);

  // Commands
  const addCommand = useCallback(async (c: Omit<Command, "id" | "createdAt" | "updatedAt">) => {
    const created = await apiRequest<ApiCommand>("/commands", {
      method: "POST",
      token,
      json: {
        group_id: c.groupId,
        title: c.title,
        command: c.command,
        description: c.description,
        default_variables: c.defaultVariables,
        tags: c.tags,
        is_favorite: c.isFavorite,
        copy_count: c.copyCount,
      },
    });
    const mapped = mapCommand(created);
    setData((prev) => {
      const matchesGroup = commandsView.groupId == null || commandsView.groupId === mapped.groupId;
      const matchesFav = !commandsView.favoritesOnly || mapped.isFavorite;
      if (!matchesGroup || !matchesFav) return prev;
      return { ...prev, commands: [mapped, ...prev.commands] };
    });
    await fetchStats();
  }, [commandsView.favoritesOnly, commandsView.groupId, fetchStats, token]);

  const updateCommand = useCallback(async (id: number, updates: Partial<Command>) => {
    const updated = await apiRequest<ApiCommand>(`/commands/${id}`, {
      method: "PATCH",
      token,
      json: {
        group_id: updates.groupId,
        title: updates.title,
        command: updates.command,
        description: updates.description,
        default_variables: updates.defaultVariables,
        tags: updates.tags,
        is_favorite: updates.isFavorite,
        copy_count: updates.copyCount,
      },
    });
    const mapped = mapCommand(updated);
    setData((prev) => {
      const exists = prev.commands.some((c) => c.id === id);
      const matchesGroup = commandsView.groupId == null || commandsView.groupId === mapped.groupId;
      const matchesFav = !commandsView.favoritesOnly || mapped.isFavorite;

      if (!matchesGroup || !matchesFav) {
        // If the item is visible in the current list but no longer matches, remove it.
        return { ...prev, commands: prev.commands.filter((c) => c.id !== id) };
      }

      if (!exists) {
        // It matches current filters but isn't in the loaded slice (e.g. toggled fav from another view)
        // Don't force-insert; next refresh/page load will include it.
        return prev;
      }

      return { ...prev, commands: prev.commands.map((c) => (c.id === id ? mapped : c)) };
    });
    await fetchStats();
  }, [commandsView.favoritesOnly, commandsView.groupId, fetchStats, token]);

  const deleteCommand = useCallback(async (id: number) => {
    await apiRequest(`/commands/${id}`, { method: "DELETE", token });
    setData((prev) => ({ ...prev, commands: prev.commands.filter((c) => c.id !== id) }));
    await fetchStats();
  }, [fetchStats, token]);

  const toggleFavorite = useCallback(async (id: number) => {
    const current = data.commands.find((c) => c.id === id);
    if (!current) return;
    await updateCommand(id, { isFavorite: !current.isFavorite });
  }, [data.commands, updateCommand]);

  const incrementCopy = useCallback(async (id: number) => {
    const current = data.commands.find((c) => c.id === id);
    if (!current) return;
    await updateCommand(id, { copyCount: current.copyCount + 1 });
  }, [data.commands, updateCommand]);

  // Import
  const importData = useCallback(async (imported: VaultData) => {
    setImporting(true);
    try {
      const payload: ApiImportRequest = {
        groups: imported.groups.map((g) => ({
          source_id: g.id,
          name: g.name,
          description: g.description,
          color: g.color,
          icon: g.icon,
        })),
        commands: imported.commands.map((c) => ({
          source_group_id: c.groupId,
          title: c.title,
          command: c.command,
          description: c.description,
          default_variables: c.defaultVariables ?? {},
          tags: c.tags,
          is_favorite: c.isFavorite,
          copy_count: c.copyCount,
        })),
      };

      const res = await apiRequest<ApiImportResponse>("/import", {
        method: "POST",
        token,
        json: payload,
      });

      await reload();
      return { groups: res.groups_created, commands: res.commands_created };
    } finally {
      setImporting(false);
    }
  }, [reload, token]);

  // Export
  const exportData = useCallback(() => {
    void (async () => {
      const groups = await apiRequest<ApiGroup[]>("/groups", { token });
      const mappedGroups = groups.map(mapGroup);

      const allCommands: Command[] = [];
      const limit = 200;
      let offset = 0;
      while (true) {
        const page = await fetchCommandsPage({ limit, offset });
        allCommands.push(...page.items);
        offset += page.items.length;
        if (offset >= page.total || page.items.length === 0) break;
      }

      const payload: VaultData = { groups: mappedGroups, commands: allCommands };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `command-vault-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    })();
  }, [fetchCommandsPage, token]);

  const searchCommands = useCallback(async (
    q: string,
    options?: { groupId?: number; limit?: number; tags?: string[]; isFavorite?: boolean; signal?: AbortSignal }
  ) => {
    const res = await apiRequest<ApiSearchResponse>("/search", {
      token,
      signal: options?.signal,
      query: {
        q,
        group_id: options?.groupId,
        is_favorite: options?.isFavorite,
        tag: options?.tags,
        limit: options?.limit ?? 200,
      },
    });

    return res.items.map(mapCommand);
  }, [token]);

  return {
    data,
    loading,
    commandsLoading,
    commandsLoadingMore,
    commandsHasMore,
    commandsTotal,
    stats,
    importing,
    error,
    addGroup, updateGroup, deleteGroup,
    addCommand, updateCommand, deleteCommand,
    toggleFavorite, incrementCopy,
    importData, exportData, persist,
    reload,
    searchCommands,
    setCommandsView: setCommandsViewAndReload,
    loadMoreCommands,
  };
}
