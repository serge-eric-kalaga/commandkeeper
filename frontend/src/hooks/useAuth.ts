import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

type AuthStorage = {
    token: string | null;
    mustChangePassword: boolean;
    username: string | null;
};

const STORAGE_KEY = "commandkeeper-auth";

function loadAuth(): AuthStorage {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as AuthStorage;
    } catch {
        // ignore 
    }
    return { token: null, mustChangePassword: false, username: null };
}

function saveAuth(value: AuthStorage) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function useAuth() {
    const [auth, setAuth] = useState<AuthStorage>(loadAuth);

    useEffect(() => {
        saveAuth(auth);
    }, [auth]);

    const isAuthenticated = !!auth.token;

    const login = useCallback(async (username: string, password: string) => {
        const res = await apiRequest<{ access_token: string; must_change_password: boolean }>("/auth/login", {
            method: "POST",
            json: { username, password },
        });

        setAuth({
            token: res.access_token,
            mustChangePassword: res.must_change_password,
            username,
        });

        return res;
    }, []);

    const logout = useCallback(() => {
        setAuth({ token: null, mustChangePassword: false, username: null });
    }, []);

    const changePassword = useCallback(
        async (oldPassword: string, newPassword: string) => {
            if (!auth.token) throw new Error("Not authenticated");

            await apiRequest("/auth/change-password", {
                method: "POST",
                token: auth.token,
                json: { old_password: oldPassword, new_password: newPassword },
            });

            setAuth((prev) => ({ ...prev, mustChangePassword: false }));
        },
        [auth.token]
    );

    return useMemo(
        () => ({
            token: auth.token,
            username: auth.username,
            mustChangePassword: auth.mustChangePassword,
            isAuthenticated,
            login,
            logout,
            changePassword,
        }),
        [auth.token, auth.username, auth.mustChangePassword, isAuthenticated, login, logout, changePassword]
    );
}
