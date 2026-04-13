export type ApiError = {
    status: number;
    message: string;
    details?: unknown;
};

export const AUTH_EVENT_UNAUTHORIZED = "commandkeeper:auth:unauthorized";
export const AUTH_EVENT_PASSWORD_CHANGE_REQUIRED = "commandkeeper:auth:password-change-required";

function emitAuthEvent(name: string, detail: unknown) {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {
        // ignore
    }
}

function extractFastApiErrorMessage(body: unknown, status: number): string {
    if (typeof body !== "object" || !body) return `HTTP ${status}`;

    const detail = (body as any).detail;
    if (typeof detail === "string" && detail.trim()) return detail;

    if (Array.isArray(detail)) {
        const msgs = detail
            .map((item) => (item && typeof item === "object" ? (item as any).msg : null))
            .filter((m): m is string => typeof m === "string" && m.trim().length > 0);

        if (msgs.length > 0) return msgs.join(" · ");
    }

    return `HTTP ${status}`;
}

function getBaseUrl(): string {
    const envUrl = import.meta.env.VITE_API_URL as string | undefined;
    if (envUrl !== undefined && envUrl.trim() === "") {
        return "";
    }
    return (envUrl && envUrl.trim()) || "http://localhost:8000";
}

async function readJsonSafely(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export async function apiRequest<T>(
    path: string,
    options: {
        method?: string;
        token?: string | null;
        json?: unknown;
        query?: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>;
        signal?: AbortSignal;
    } = {}
): Promise<T> {
    const baseUrl = getBaseUrl();
    const url = baseUrl ? new URL(path, baseUrl) : new URL(path, window.location.origin);
    if (options.query) {
        for (const [key, value] of Object.entries(options.query)) {
            if (value === undefined || value === null) continue;
            if (Array.isArray(value)) {
                for (const item of value) {
                    url.searchParams.append(key, String(item));
                }
            } else {
                url.searchParams.set(key, String(value));
            }
        }
    }

    const headers = new Headers();
    headers.set("accept", "application/json");

    if (options.json !== undefined) {
        headers.set("content-type", "application/json");
    }

    if (options.token) {
        headers.set("authorization", `Bearer ${options.token}`);
    }

    const res = await fetch(url.toString(), {
        method: options.method ?? "GET",
        headers,
        body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
        signal: options.signal,
    });

    if (!res.ok) {
        const body = await readJsonSafely(res);
        const message = extractFastApiErrorMessage(body, res.status);

        const err: ApiError = { status: res.status, message, details: body };

        // Interceptors for auth-related failures (only when making an authenticated call)
        if (options.token) {
            if (res.status === 401) {
                emitAuthEvent(AUTH_EVENT_UNAUTHORIZED, err);
            }
            if (res.status === 403) {
                const detail = (body as any)?.detail;
                if (detail === "Password change required") {
                    emitAuthEvent(AUTH_EVENT_PASSWORD_CHANGE_REQUIRED, err);
                }
            }
        }

        throw err;
    }

    return (await readJsonSafely(res)) as T;
}
