export type ApiError = {
    status: number;
    message: string;
    details?: unknown;
};

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
        query?: Record<string, string | number | boolean | null | undefined>;
    } = {}
): Promise<T> {
    const baseUrl = getBaseUrl();
    const url = baseUrl ? new URL(path, baseUrl) : new URL(path, window.location.origin);
    if (options.query) {
        for (const [key, value] of Object.entries(options.query)) {
            if (value === undefined || value === null) continue;
            url.searchParams.set(key, String(value));
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
    });

    if (!res.ok) {
        const body = await readJsonSafely(res);
        const message = extractFastApiErrorMessage(body, res.status);

        const err: ApiError = { status: res.status, message, details: body };
        throw err;
    }

    return (await readJsonSafely(res)) as T;
}
