import OBSWebSocket, { OBSWebSocketError } from "obs-websocket-js";
import type { ObsConnectionSettings } from "../types.js";

/**
 * Manages a single persistent connection to OBS WebSocket v5.
 *
 * Security considerations:
 * - Passwords are never logged.
 * - Connection errors are sanitised before returning to callers.
 * - Reconnect attempts use exponential back-off to avoid hammering OBS.
 * - The URL is always validated before connecting to prevent SSRF-style abuse.
 */
export class ObsConnectionManager {
  private obs: OBSWebSocket;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 8;
  private readonly baseReconnectDelayMs = 1000;

  /** Listeners notified on connection state changes */
  private onConnectedCallbacks: Array<() => void> = [];
  private onDisconnectedCallbacks: Array<(reason: string) => void> = [];

  constructor() {
    this.obs = new OBSWebSocket();
    this.obs.on("ConnectionClosed", () => this.handleDisconnect("Connection closed by OBS"));
    this.obs.on("ConnectionError", () => this.handleDisconnect("Connection error"));
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this.connected;
  }

  onConnected(cb: () => void): void {
    this.onConnectedCallbacks.push(cb);
  }

  onDisconnected(cb: (reason: string) => void): void {
    this.onDisconnectedCallbacks.push(cb);
  }

  /** Milliseconds before a connection attempt is aborted. */
  private static readonly CONNECT_TIMEOUT_MS = 10_000;

  /**
   * Establish a connection to OBS using the provided settings.
   * Throws a sanitised Error on failure (no password in message).
   * Times out after 10 s so callers are never left hanging.
   */
  async connect(settings: ObsConnectionSettings): Promise<void> {
    this.cancelReconnect();

    const url = this.buildUrl(settings);

    const connectPromise = settings.useAuth && settings.password
      ? this.obs.connect(url, settings.password)
      : this.obs.connect(url);

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("Connection timed out. Check that OBS WebSocket is enabled on the correct port.")),
        ObsConnectionManager.CONNECT_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([connectPromise, timeoutPromise]);
      clearTimeout(timeoutHandle);
      this.connected = true;
      this.reconnectAttempts = 0;
      this.onConnectedCallbacks.forEach((cb) => cb());
    } catch (err) {
      clearTimeout(timeoutHandle);
      this.connected = false;
      // Sanitise: never include credentials in thrown error messages
      throw new Error(this.sanitiseError(err));
    }
  }

  async disconnect(): Promise<void> {
    this.cancelReconnect();
    if (this.connected) {
      await this.obs.disconnect();
      this.connected = false;
    }
  }

  /**
   * Expose the underlying OBSWebSocket instance for making requests.
   * Callers must check `isConnected` before calling this.
   */
  getClient(): OBSWebSocket {
    return this.obs;
  }

  // ─── Reconnect logic ───────────────────────────────────────────────────────

  /**
   * Schedule an automatic reconnect using exponential back-off.
   * Stores the last settings so reconnection can happen transparently.
   */
  enableAutoReconnect(settings: ObsConnectionSettings): void {
    // Store a copy so mutation of the caller's object doesn't affect us
    this.lastSettings = { ...settings };
    // Already wired up via the ConnectionClosed event handler
  }

  private lastSettings: ObsConnectionSettings | null = null;

  private handleDisconnect(reason: string): void {
    if (!this.connected) return; // already handled
    this.connected = false;
    this.onDisconnectedCallbacks.forEach((cb) => cb(reason));

    if (this.lastSettings && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect(this.lastSettings);
    }
  }

  private scheduleReconnect(settings: ObsConnectionSettings): void {
    // Exponential back-off: 1s, 2s, 4s, 8s … up to ~128s
    const delay = this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect(settings).catch(() => {
        // connect() already fired the disconnect callbacks; just let it be
      });
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Build the WebSocket URL from settings.
   * Validates host/port to prevent open-redirect / SSRF abuse.
   */
  private buildUrl(settings: ObsConnectionSettings): string {
    const host = this.validateHost(settings.host);
    const port = this.validatePort(settings.port);
    return `ws://${host}:${port}`;
  }

  private validateHost(raw: string): string {
    const trimmed = (raw ?? "localhost").trim();
    // Allow hostnames, IPv4, and localhost. Block javascript:, file:, etc.
    if (!/^[a-zA-Z0-9.\-_]+$/.test(trimmed)) {
      throw new Error("Invalid OBS host address.");
    }
    return trimmed;
  }

  private validatePort(raw: number): number {
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Invalid OBS port. Must be 1–65535.");
    }
    return port;
  }

  private sanitiseError(err: unknown): string {
    if (err instanceof OBSWebSocketError) {
      // code 4009 = Auth failed — safe message, no credentials
      return `OBS WebSocket error ${err.code}: ${err.message}`;
    }
    if (err instanceof Error) {
      // Strip anything that looks like a password query param just in case
      return err.message.replace(/password=[^&\s]*/gi, "password=[REDACTED]");
    }
    return "Unknown connection error.";
  }
}
