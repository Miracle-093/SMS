const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

export const apiBaseUrl = configuredApiUrl || (import.meta.env.DEV ? "http://localhost:4000" : "");
