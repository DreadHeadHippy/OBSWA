/**
 * Core type definitions for OBS Automation workflows.
 * These types align with what the Property Inspector sends/receives.
 *
 * All settings types must satisfy @elgato/utils JsonObject:
 *   { [key: string]: JsonValue }
 * We accomplish this via the index signature on each interface.
 */

import type { JsonValue } from "@elgato/utils";

// ─── OBS Connection ──────────────────────────────────────────────────────────

export interface ObsConnectionSettings {  [key: string]: JsonValue;  /** WebSocket host, default "localhost" */
  host: string;
  /** WebSocket port, default 4455 */
  port: number;
  /** Whether authentication is enabled in OBS */
  useAuth: boolean;
  /** Raw password — stored encrypted by StreamDeck's settings store */
  password: string;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ObsActionType =
  | "switchScene"
  | "toggleSource"
  | "setSourceVisibility"
  | "muteSource"
  | "unmuteSource"
  | "toggleMute"
  | "startStream"
  | "stopStream"
  | "startRecord"
  | "stopRecord"
  | "toggleRecord"
  | "triggerHotkey"
  | "setTextContent"
  | "wait";

export interface BaseAction {
  [key: string]: JsonValue;
  id: string;
  type: ObsActionType;
  /** Optional delay in milliseconds before executing this action */
  delayMs?: number;
}

export interface SwitchSceneAction extends BaseAction {
  type: "switchScene";
  sceneName: string;
}

export interface ToggleSourceAction extends BaseAction {
  type: "toggleSource" | "setSourceVisibility";
  sceneName: string;
  sourceName: string;
  /** Only used for setSourceVisibility */
  visible?: boolean;
}

export interface MuteAction extends BaseAction {
  type: "muteSource" | "unmuteSource" | "toggleMute";
  sourceName: string;
}

export interface StreamRecordAction extends BaseAction {
  type: "startStream" | "stopStream" | "startRecord" | "stopRecord" | "toggleRecord";
}

export interface TriggerHotkeyAction extends BaseAction {
  type: "triggerHotkey";
  hotkeyName: string;
}

export interface SetTextAction extends BaseAction {
  type: "setTextContent";
  sourceName: string;
  text: string;
}

export interface WaitAction extends BaseAction {
  type: "wait";
  /** Duration in milliseconds to wait */
  durationMs: number;
}

export type WorkflowAction =
  | SwitchSceneAction
  | ToggleSourceAction
  | MuteAction
  | StreamRecordAction
  | TriggerHotkeyAction
  | SetTextAction
  | WaitAction;

// ─── Workflow ─────────────────────────────────────────────────────────────────

export interface Workflow {
  [key: string]: JsonValue;
  /** User-defined label shown on the StreamDeck button */
  label: string;
  /** Ordered list of actions to execute */
  actions: WorkflowAction[];
}

// ─── Settings stored per button ───────────────────────────────────────────────

export interface WorkflowActionSettings {
  [key: string]: JsonValue;
  /** The workflow to execute */
  workflow: Workflow;
}

// ─── Global plugin settings ───────────────────────────────────────────────────────

export interface GlobalSettings {
  [key: string]: JsonValue;
  /** Shared OBS connection used by all buttons unless overridden */
  connection: ObsConnectionSettings;
}
