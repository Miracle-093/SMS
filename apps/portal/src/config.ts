const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

export const apiBaseUrl = configuredApiUrl || (import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:4000` : "");
