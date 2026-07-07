const USAGE_LIMIT_STORAGE_KEY = "capybara:sdkUsageLimit";
const REQUEST_LOG_STORAGE_KEY = "capybara:sdkRequestLog";
const DEFAULT_REQUEST_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 24;
const DEFAULT_USAGE_LIMIT_COOLDOWN_MS = 60_000;

export type GuardedServiceName = "ai" | "tts" | "save" | "storage" | "multiplayer" | "auth";

export interface ServiceUsageLimitRecord {
  service: GuardedServiceName | string;
  status: 429;
  message: string;
  at: number;
  retryAfterMs?: number;
  blockedUntil: number;
}

interface RequestLogEntry {
  service: string;
  at: number;
}

function safeWindow(): (Window & typeof globalThis) | null {
  return typeof window === "undefined" ? null : window;
}

function isProdEnv(): boolean {
  const win = safeWindow() as (Window & typeof globalThis & { env?: string }) | null;
  return win?.env === "prod";
}

function readJson<T>(key: string, fallback: T): T {
  const win = safeWindow();
  if (!win?.localStorage) return fallback;
  try {
    const raw = win.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  const win = safeWindow();
  if (!win?.localStorage) return;
  try {
    win.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

export function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;

  const direct = Number(record.status ?? record.statusCode ?? record.code);
  if (Number.isFinite(direct)) return direct;

  const response = record.response as Record<string, unknown> | undefined;
  const responseStatus = Number(response?.status ?? response?.statusCode);
  if (Number.isFinite(responseStatus)) return responseStatus;

  const cause = record.cause as Record<string, unknown> | undefined;
  const causeStatus = Number(cause?.status ?? cause?.statusCode ?? cause?.code);
  if (Number.isFinite(causeStatus)) return causeStatus;

  const message = String(record.message ?? "");
  if (/\b429\b/.test(message)) return 429;
  return null;
}

export function isUsageLimitError(error: unknown): boolean {
  return getErrorStatus(error) === 429 || error instanceof ServiceUsageLimitError;
}

function getHeaderValue(error: unknown, name: string): string | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const response = record.response as Record<string, unknown> | undefined;
  const headers = (record.headers ?? response?.headers) as
    | Headers
    | Record<string, unknown>
    | undefined;

  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? (headers as Headers).get(name.toLowerCase());
  }

  const direct = (headers as Record<string, unknown>)[name] ??
    (headers as Record<string, unknown>)[name.toLowerCase()];
  return typeof direct === "string" || typeof direct === "number"
    ? String(direct)
    : null;
}

function parseRetryAfterMs(error: unknown): number | null {
  const retryAfter = getHeaderValue(error, "Retry-After");
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());

  return null;
}

function getUsageLimitCooldownMs(error?: unknown): number {
  const win = safeWindow() as (Window & typeof globalThis & {
    sdkUsageLimitCooldownMs?: number;
  }) | null;
  const configured = Number(win?.sdkUsageLimitCooldownMs);
  const retryAfterMs = parseRetryAfterMs(error);
  return Math.max(
    1_000,
    retryAfterMs ?? (Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_USAGE_LIMIT_COOLDOWN_MS),
  );
}

function formatRetryMessage(message: string, blockedUntil?: number): string {
  if (!blockedUntil) return message;
  const remainingSeconds = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));
  return `${message} Retrying is paused for ${remainingSeconds}s.`;
}

export function getPlayerSafeServiceErrorMessage(error: unknown, serviceName = "Service"): string {
  if (isUsageLimitError(error)) return `${serviceName} usage limit reached. Try again later.`;
  return `${serviceName} failed. Try again.`;
}

export class ServiceUsageLimitError extends Error {
  status = 429 as const;
  service: string;

  constructor(service: string, message?: string) {
    super(message ?? `${service} usage limit reached. Try again later.`);
    this.name = "ServiceUsageLimitError";
    this.service = service;
  }
}

export function getStoredUsageLimit(): ServiceUsageLimitRecord | null {
  return readJson<ServiceUsageLimitRecord | null>(USAGE_LIMIT_STORAGE_KEY, null);
}

export function clearStoredUsageLimit(): void {
  const win = safeWindow();
  if (!win?.localStorage) return;
  try {
    win.localStorage.removeItem(USAGE_LIMIT_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  hideDevServiceError();
}

export function recordUsageLimit(service: GuardedServiceName | string, error?: unknown): ServiceUsageLimitRecord {
  const now = Date.now();
  const retryAfterMs = getUsageLimitCooldownMs(error);
  const blockedUntil = now + retryAfterMs;
  const message = getPlayerSafeServiceErrorMessage(error ?? new ServiceUsageLimitError(service), `${service.toUpperCase()} service`);
  const record: ServiceUsageLimitRecord = {
    service,
    status: 429,
    message,
    at: now,
    retryAfterMs,
    blockedUntil,
  };
  writeJson(USAGE_LIMIT_STORAGE_KEY, record);
  showDevServiceError(formatRetryMessage(record.message, record.blockedUntil));
  return record;
}

export function assertServiceAvailable(service: GuardedServiceName | string): void {
  const record = getStoredUsageLimit();
  if (!record) return;
  if (record.service !== service) return;

  const now = Date.now();
  if (!record.blockedUntil || now >= record.blockedUntil) {
    clearStoredUsageLimit();
    return;
  }

  const message = formatRetryMessage(record.message, record.blockedUntil);
  showDevServiceError(message);
  throw new ServiceUsageLimitError(service, message);
}

function getRequestLimit(): { windowMs: number; maxRequests: number } {
  const win = safeWindow() as (Window & typeof globalThis & {
    sdkRequestWindowMs?: number;
    sdkMaxRequestsPerWindow?: number;
  }) | null;
  const windowMs = Number(win?.sdkRequestWindowMs) || DEFAULT_REQUEST_WINDOW_MS;
  const maxRequests = Number(win?.sdkMaxRequestsPerWindow) || DEFAULT_MAX_REQUESTS_PER_WINDOW;
  return { windowMs, maxRequests };
}

export function recordSdkRequest(service: GuardedServiceName | string): void {
  const { windowMs, maxRequests } = getRequestLimit();
  const now = Date.now();
  const current = readJson<RequestLogEntry[]>(REQUEST_LOG_STORAGE_KEY, []);
  const recent = current.filter((entry) => now - entry.at <= windowMs);
  recent.push({ service, at: now });
  writeJson(REQUEST_LOG_STORAGE_KEY, recent.slice(-200));

  const countForService = recent.filter((entry) => entry.service === service).length;
  if (countForService > maxRequests) {
    const record = recordUsageLimit(
      service,
      new ServiceUsageLimitError(
        service,
        `${service.toUpperCase()} request guard stopped a possible loop (${countForService}/${maxRequests} in ${Math.round(windowMs / 1000)}s).`,
      ),
    );
    throw new ServiceUsageLimitError(service, record.message);
  }
}

export async function withServiceGuard<T>(
  service: GuardedServiceName | string,
  operation: () => Promise<T> | T,
): Promise<T> {
  assertServiceAvailable(service);
  recordSdkRequest(service);
  try {
    return await operation();
  } catch (error) {
    if (isUsageLimitError(error)) {
      recordUsageLimit(service, error);
    }
    throw error;
  }
}

function ensureDevErrorElement(): HTMLDivElement | null {
  if (isProdEnv()) return null;
  const win = safeWindow();
  const doc = win?.document;
  if (!doc?.body) return null;

  let el = doc.getElementById("sdk-dev-service-error") as HTMLDivElement | null;
  if (el) return el;

  el = doc.createElement("div");
  el.id = "sdk-dev-service-error";
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.bottom = "20px";
  el.style.transform = "translateX(-50%)";
  el.style.zIndex = "99999";
  el.style.maxWidth = "min(720px, calc(100vw - 32px))";
  el.style.padding = "12px 16px";
  el.style.border = "1px solid rgba(255,255,255,0.24)";
  el.style.borderRadius = "16px";
  el.style.background = "rgba(0,0,0,0.58)";
  el.style.backdropFilter = "blur(18px) saturate(1.4)";
  el.style.color = "white";
  el.style.font = "600 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  el.style.boxShadow = "0 16px 44px rgba(0,0,0,0.35)";
  el.style.pointerEvents = "none";
  el.hidden = true;
  doc.body.appendChild(el);
  return el;
}

export function showDevServiceError(message: string): void {
  const el = ensureDevErrorElement();
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

export function hideDevServiceError(): void {
  const win = safeWindow();
  const el = win?.document?.getElementById("sdk-dev-service-error") as HTMLDivElement | null;
  if (el) el.hidden = true;
}
