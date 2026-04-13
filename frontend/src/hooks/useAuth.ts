import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, AUTH_EVENT_PASSWORD_CHANGE_REQUIRED, AUTH_EVENT_UNAUTHORIZED } from "@/lib/apiClient";
import { toast } from "@/components/ui/sonner";

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

    const tokenRef = useRef<string | null>(auth.token);
    const mustChangePasswordRef = useRef<boolean>(auth.mustChangePassword);
    const lastToastRef = useRef<{ kind: "unauthorized" | "password-change"; at: number } | null>(null);

    useEffect(() => {
        tokenRef.current = auth.token;
        mustChangePasswordRef.current = auth.mustChangePassword;
    }, [auth.token, auth.mustChangePassword]);

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

    useEffect(() => {
        if (typeof window === "undefined") return;

        const emitToastOnce = (kind: "unauthorized" | "password-change", message: string) => {
            const now = Date.now();
            const last = lastToastRef.current;
            // Avoid toast spam when several requests fail at once.
            if (last && last.kind === kind && now - last.at < 2500) return;
            lastToastRef.current = { kind, at: now };
            toast(message);
        };

        const onUnauthorized = () => {
            if (tokenRef.current) {
                emitToastOnce("unauthorized", "Session expirée. Veuillez vous reconnecter.");
            }
            // Token is no longer valid (or missing) -> force back to login.
            logout();
        };

        const onPasswordChangeRequired = () => {
            // Backend requires changing password before accessing business routes.
            if (tokenRef.current && !mustChangePasswordRef.current) {
                emitToastOnce("password-change", "Changement de mot de passe requis pour continuer.");
            }
            setAuth((prev) => {
                if (!prev.token) return prev;
                if (prev.mustChangePassword) return prev;
                return { ...prev, mustChangePassword: true };
            });
        };

        window.addEventListener(AUTH_EVENT_UNAUTHORIZED, onUnauthorized);
        window.addEventListener(AUTH_EVENT_PASSWORD_CHANGE_REQUIRED, onPasswordChangeRequired);
        return () => {
            window.removeEventListener(AUTH_EVENT_UNAUTHORIZED, onUnauthorized);
            window.removeEventListener(AUTH_EVENT_PASSWORD_CHANGE_REQUIRED, onPasswordChangeRequired);
        };
    }, [logout]);

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
