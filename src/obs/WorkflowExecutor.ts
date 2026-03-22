import type OBSWebSocket from "obs-websocket-js";
import type {
  WorkflowAction,
  Workflow,
  SwitchSceneAction,
  ToggleSourceAction,
  MuteAction,
  TriggerHotkeyAction,
  SetTextAction,
} from "../types.js";

/**
 * Executes a Workflow action-by-action against a live OBS WebSocket connection.
 *
 * Reliability guarantees:
 * - Each action is awaited before the next begins (sequential, deterministic).
 * - Delays/waits are capped to prevent runaway waits.
 * - Individual action failures are caught and reported without aborting the chain
 *   unless the user has set stopOnError (future option).
 */
export class WorkflowExecutor {
  private readonly maxWaitMs = 30_000; // 30 second cap on any wait/delay

  async execute(workflow: Workflow, obs: OBSWebSocket): Promise<ExecutionResult> {
    const results: ActionResult[] = [];

    for (const action of workflow.actions) {
      // Optional per-action delay (runs BEFORE the action)
      if (action.delayMs && action.delayMs > 0) {
        await this.wait(Math.min(action.delayMs, this.maxWaitMs));
      }

      const result = await this.runAction(action, obs);
      results.push(result);
    }

    const failed = results.filter((r) => !r.success);
    return {
      success: failed.length === 0,
      actionResults: results,
      failureCount: failed.length,
    };
  }

  // ─── Action dispatch ───────────────────────────────────────────────────────

  private async runAction(action: WorkflowAction, obs: OBSWebSocket): Promise<ActionResult> {
    try {
      switch (action.type) {
        case "switchScene":
          await this.switchScene(action, obs);
          break;
        case "toggleSource":
        case "setSourceVisibility":
          await this.setSourceVisibility(action, obs);
          break;
        case "muteSource":
        case "unmuteSource":
        case "toggleMute":
          await this.handleMute(action, obs);
          break;
        case "startStream":
          await obs.call("StartStream");
          break;
        case "stopStream":
          await obs.call("StopStream");
          break;
        case "startRecord":
          await obs.call("StartRecord");
          break;
        case "stopRecord":
          await obs.call("StopRecord");
          break;
        case "toggleRecord":
          await obs.call("ToggleRecord");
          break;
        case "triggerHotkey":
          await this.triggerHotkey(action, obs);
          break;
        case "setTextContent":
          await this.setTextContent(action, obs);
          break;
        case "wait":
          await this.wait(Math.min(action.durationMs, this.maxWaitMs));
          break;
        default:
          // TypeScript exhaustiveness check
          throw new Error(`Unknown action type: ${(action as WorkflowAction).type}`);
      }
      return { actionId: action.id, type: action.type, success: true };
    } catch (err) {
      return {
        actionId: action.id,
        type: action.type,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ─── Individual action handlers ────────────────────────────────────────────

  private async switchScene(action: SwitchSceneAction, obs: OBSWebSocket): Promise<void> {
    await obs.call("SetCurrentProgramScene", { sceneName: action.sceneName });
  }

  private async setSourceVisibility(action: ToggleSourceAction, obs: OBSWebSocket): Promise<void> {
    if (action.type === "setSourceVisibility" && action.visible !== undefined) {
      // Get the scene item ID first (required by OBS v5 API)
      const { sceneItemId } = await obs.call("GetSceneItemId", {
        sceneName: action.sceneName,
        sourceName: action.sourceName,
      });
      await obs.call("SetSceneItemEnabled", {
        sceneName: action.sceneName,
        sceneItemId,
        sceneItemEnabled: action.visible,
      });
    } else {
      // Toggle: get current state then invert
      const { sceneItemId } = await obs.call("GetSceneItemId", {
        sceneName: action.sceneName,
        sourceName: action.sourceName,
      });
      const { sceneItemEnabled } = await obs.call("GetSceneItemEnabled", {
        sceneName: action.sceneName,
        sceneItemId,
      });
      await obs.call("SetSceneItemEnabled", {
        sceneName: action.sceneName,
        sceneItemId,
        sceneItemEnabled: !sceneItemEnabled,
      });
    }
  }

  private async handleMute(action: MuteAction, obs: OBSWebSocket): Promise<void> {
    switch (action.type) {
      case "muteSource":
        await obs.call("SetInputMute", { inputName: action.sourceName, inputMuted: true });
        break;
      case "unmuteSource":
        await obs.call("SetInputMute", { inputName: action.sourceName, inputMuted: false });
        break;
      case "toggleMute":
        await obs.call("ToggleInputMute", { inputName: action.sourceName });
        break;
    }
  }

  private async triggerHotkey(action: TriggerHotkeyAction, obs: OBSWebSocket): Promise<void> {
    await obs.call("TriggerHotkeyByName", { hotkeyName: action.hotkeyName });
  }

  private async setTextContent(action: SetTextAction, obs: OBSWebSocket): Promise<void> {
    // Works with GDI+ and FreeType2 text sources
    await obs.call("SetInputSettings", {
      inputName: action.sourceName,
      inputSettings: { text: action.text },
      overlay: true,
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Result types ──────────────────────────────────────────────────────────────

export interface ActionResult {
  actionId: string;
  type: string;
  success: boolean;
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  failureCount: number;
  actionResults: ActionResult[];
}
