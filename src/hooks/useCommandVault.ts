import { useState, useCallback, useEffect } from "react";

export interface Group {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  createdAt: string;
}

export interface Command {
  id: string;
  groupId: string;
  title: string;
  command: string;
  description: string;
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

const STORAGE_KEY = "command-vault-data";

const SEED_DATA: VaultData = {
  groups: [
    {
      id: "seed-docker",
      name: "Docker",
      description: "Common Docker commands for container management",
      color: "#3b82f6",
      icon: "🐳",
      createdAt: new Date().toISOString(),
    },
  ],
  commands: [
    {
      id: "seed-cmd-1",
      groupId: "seed-docker",
      title: "Start container",
      command: "docker run -it --name {{container_name}} {{image_name}}",
      description: "Run a new container interactively",
      tags: ["docker", "run"],
      isFavorite: false,
      copyCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "seed-cmd-2",
      groupId: "seed-docker",
      title: "List containers",
      command: "docker ps -a",
      description: "List all containers including stopped ones",
      tags: ["docker", "list"],
      isFavorite: true,
      copyCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "seed-cmd-3",
      groupId: "seed-docker",
      title: "Remove all stopped containers",
      command: "docker container prune -f",
      description: "Clean up stopped containers",
      tags: ["docker", "cleanup"],
      isFavorite: false,
      copyCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
};

function loadData(): VaultData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
  return SEED_DATA;
}

function saveData(data: VaultData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function useCommandVault() {
  const [data, setData] = useState<VaultData>(loadData);

  const persist = useCallback((next: VaultData) => {
    setData(next);
    saveData(next);
  }, []);

  // Groups
  const addGroup = useCallback((g: Omit<Group, "id" | "createdAt">) => {
    setData((prev) => {
      const next = {
        ...prev,
        groups: [...prev.groups, { ...g, id: crypto.randomUUID(), createdAt: new Date().toISOString() }],
      };
      saveData(next);
      return next;
    });
  }, []);

  const updateGroup = useCallback((id: string, updates: Partial<Group>) => {
    setData((prev) => {
      const next = { ...prev, groups: prev.groups.map((g) => (g.id === id ? { ...g, ...updates } : g)) };
      saveData(next);
      return next;
    });
  }, []);

  const deleteGroup = useCallback((id: string) => {
    setData((prev) => {
      const next = {
        groups: prev.groups.filter((g) => g.id !== id),
        commands: prev.commands.filter((c) => c.groupId !== id),
      };
      saveData(next);
      return next;
    });
  }, []);

  // Commands
  const addCommand = useCallback((c: Omit<Command, "id" | "createdAt" | "updatedAt" | "copyCount">) => {
    setData((prev) => {
      const now = new Date().toISOString();
      const next = {
        ...prev,
        commands: [...prev.commands, { ...c, id: crypto.randomUUID(), createdAt: now, updatedAt: now, copyCount: 0 }],
      };
      saveData(next);
      return next;
    });
  }, []);

  const updateCommand = useCallback((id: string, updates: Partial<Command>) => {
    setData((prev) => {
      const next = {
        ...prev,
        commands: prev.commands.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c)),
      };
      saveData(next);
      return next;
    });
  }, []);

  const deleteCommand = useCallback((id: string) => {
    setData((prev) => {
      const next = { ...prev, commands: prev.commands.filter((c) => c.id !== id) };
      saveData(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setData((prev) => {
      const next = {
        ...prev,
        commands: prev.commands.map((c) => (c.id === id ? { ...c, isFavorite: !c.isFavorite, updatedAt: new Date().toISOString() } : c)),
      };
      saveData(next);
      return next;
    });
  }, []);

  const incrementCopy = useCallback((id: string) => {
    setData((prev) => {
      const next = {
        ...prev,
        commands: prev.commands.map((c) => (c.id === id ? { ...c, copyCount: c.copyCount + 1 } : c)),
      };
      saveData(next);
      return next;
    });
  }, []);

  // Import
  const importData = useCallback((imported: VaultData) => {
    setData((prev) => {
      const existingGroupIds = new Set(prev.groups.map((g) => g.id));
      const existingCmdIds = new Set(prev.commands.map((c) => c.id));
      const newGroups = imported.groups.filter((g) => !existingGroupIds.has(g.id));
      const newCmds = imported.commands.filter((c) => !existingCmdIds.has(c.id));
      const next = {
        groups: [...prev.groups, ...newGroups],
        commands: [...prev.commands, ...newCmds],
      };
      saveData(next);
      return next;
    });
    return { groups: 0, commands: 0 }; // caller will compute
  }, []);

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

  return {
    data,
    addGroup, updateGroup, deleteGroup,
    addCommand, updateCommand, deleteCommand,
    toggleFavorite, incrementCopy,
    importData, exportData, persist,
  };
}
