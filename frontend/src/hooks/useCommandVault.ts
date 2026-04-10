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

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [groups, commands] = await Promise.all([
      apiRequest<ApiGroup[]>("/groups", { token }),
      apiRequest<ApiCommand[]>("/commands", { token }),
    ]);
    setData({
      groups: groups.map(mapGroup),
      commands: commands.map(mapCommand),
    });
    setLoading(false);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [groups, commands] = await Promise.all([
          apiRequest<ApiGroup[]>("/groups", { token }),
          apiRequest<ApiCommand[]>("/commands", { token }),
        ]);
        if (cancelled) return;
        setData({
          groups: groups.map(mapGroup),
          commands: commands.map(mapCommand),
        });
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
  }, [token]);

  const persist = useCallback((next: VaultData) => {
    // Backend is the source of truth; keep this for compatibility.
    setData(next);
  }, []);

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
  }, [token]);

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
  }, [token]);

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
    setData((prev) => ({
      ...prev,
      commands: [mapped, ...prev.commands],
    }));
  }, [token]);

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
    setData((prev) => ({
      ...prev,
      commands: prev.commands.map((c) => (c.id === id ? mapped : c)),
    }));
  }, [token]);

  const deleteCommand = useCallback(async (id: number) => {
    await apiRequest(`/commands/${id}`, { method: "DELETE", token });
    setData((prev) => ({ ...prev, commands: prev.commands.filter((c) => c.id !== id) }));
  }, [token]);

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
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `command-vault-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const searchCommands = useCallback(async (q: string, options?: { groupId?: number; limit?: number }) => {
    const res = await apiRequest<ApiSearchResponse>("/search", {
      token,
      query: {
        q,
        group_id: options?.groupId,
        limit: options?.limit ?? 200,
      },
    });

    return res.items.map(mapCommand);
  }, [token]);

  return {
    data,
    loading,
    importing,
    error,
    addGroup, updateGroup, deleteGroup,
    addCommand, updateCommand, deleteCommand,
    toggleFavorite, incrementCopy,
    importData, exportData, persist,
    reload,
    searchCommands,
  };
}
