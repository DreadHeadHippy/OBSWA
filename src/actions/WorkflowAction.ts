import streamDeck, {
  action,
  KeyDownEvent,
  PropertyInspectorDidAppearEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
  DidReceiveSettingsEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { ObsConnectionManager } from "../obs/ObsConnectionManager.js";
import { WorkflowExecutor } from "../obs/WorkflowExecutor.js";
import type {
  WorkflowActionSettings,
  GlobalSettings,
} from "../types.js";

// ─── Shared OBS connection ──────────────────────────────────────────────────
// One connection is shared across all buttons. Individual buttons may override.
const sharedObs = new ObsConnectionManager();
const executor = new WorkflowExecutor();

// Bootstrap global settings → shared connection at startup
void streamDeck.settings.getGlobalSettings<GlobalSettings>().then((globals) => {
  if (globals?.connection?.host) {
    sharedObs.enableAutoReconnect(globals.connection);
    sharedObs.connect(globals.connection).catch((err: Error) => {
      streamDeck.logger.error(`[OBS Automation] Initial connection failed: ${err.message}`);
    });
  }
});

// ─── Workflow Action ─────────────────────────────────────────────────────────

@action({ UUID: "com.dreadheadhippy.obswa.workflow" })
export class WorkflowAction extends SingletonAction<WorkflowActionSettings> {
  /**
   * Track which actions are currently executing so we can prevent
   * double-triggering the same button while a workflow is running.
   */
  private runningActions = new Set<string>();

  // Called when the button appears on the deck (app launch, profile switch)
  async onWillAppear(ev: WillAppearEvent<WorkflowActionSettings>): Promise<void> {
    const label = ev.payload.settings?.workflow?.label;
    if (label) {
      await ev.action.setTitle(label);
    }
  }

  // Called when the button is removed/hidden — reserved for future cleanup
  onWillDisappear(_ev: WillDisappearEvent<WorkflowActionSettings>): void {
    // reserved
  }

  // Synchronise button title when PI settings change
  async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<WorkflowActionSettings>
  ): Promise<void> {
    const label = ev.payload.settings?.workflow?.label;
    if (label) {
      await ev.action.setTitle(label);
    }
  }

  // Push current connection status to PI when it opens, plus OBS data if live
  async onPropertyInspectorDidAppear(
    _ev: PropertyInspectorDidAppearEvent<WorkflowActionSettings>
  ): Promise<void> {
    await streamDeck.ui.sendToPropertyInspector(this.buildStatusPayload());
    if (sharedObs.isConnected) {
      await this.handleGetObsData();
    }
  }

  // Handle messages sent from the Property Inspector
  async onSendToPlugin(
    ev: SendToPluginEvent<JsonValue, WorkflowActionSettings>
  ): Promise<void> {
    const payload = ev.payload;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return;
    const event = (payload as Record<string, JsonValue>)["event"];
    const record = payload as Record<string, JsonValue>;
    switch (event) {
      case "testConnection":
        await this.handleTestConnection(record);
        break;
      case "getObsData":
        await this.handleGetObsData();
        break;
    }
  }

  // ─── Button press ──────────────────────────────────────────────────────────
  async onKeyDown(ev: KeyDownEvent<WorkflowActionSettings>): Promise<void> {
    const actionId = ev.action.id;

    // Prevent re-triggering while already running
    if (this.runningActions.has(actionId)) {
      streamDeck.logger.warn(`[OBS Automation] Workflow already running for action ${actionId}`);
      return;
    }

    const workflow = ev.payload.settings?.workflow;

    if (!workflow || workflow.actions.length === 0) {
      await ev.action.showAlert();
      streamDeck.logger.warn(`[OBS Automation] No workflow configured for action ${actionId}`);
      return;
    }

    const connection = await this.resolveConnection();

    if (!connection) {
      await ev.action.showAlert();
      streamDeck.logger.error(`[OBS Automation] No OBS connection configured for action ${actionId}`);
      return;
    }

    // Ensure we have an active connection
    const obs = await this.ensureConnected(connection, ev);
    if (!obs) return;

    this.runningActions.add(actionId);

    try {
      const result = await executor.execute(workflow, obs);

      if (result.success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
        result.actionResults
          .filter((r) => !r.success)
          .forEach((r) =>
            streamDeck.logger.error(`[OBS Automation] Action "${r.type}" failed: ${r.error}`)
          );
      }
    } finally {
      this.runningActions.delete(actionId);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Always read OBS credentials from the shared global settings. */
  private async resolveConnection() {
    const globals = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    return globals?.connection ?? null;
  }

  private async ensureConnected(
    connection: GlobalSettings["connection"],
    ev: KeyDownEvent<WorkflowActionSettings>
  ): Promise<ReturnType<ObsConnectionManager["getClient"]> | null> {
    if (!sharedObs.isConnected) {
      try {
        await sharedObs.connect(connection);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        streamDeck.logger.error(`[OBS Automation] Could not connect to OBS: ${msg}`);
        await ev.action.showAlert();
        return null;
      }
    }
    return sharedObs.getClient();
  }

  /** Tests the connection using settings supplied by the PI (avoids getGlobalSettings race). */
  private async handleTestConnection(record: Record<string, JsonValue>): Promise<void> {
    // Prefer the connection sent directly in the payload — this eliminates the
    // race condition where setGlobalSettings hasn't been persisted yet when we
    // call getGlobalSettings here.
    const fromPayload = record["connection"];
    const connection: import("../types.js").ObsConnectionSettings | null =
      fromPayload && typeof fromPayload === "object" && !Array.isArray(fromPayload)
        ? (fromPayload as import("../types.js").ObsConnectionSettings)
        : await this.resolveConnection();

    if (!connection?.host) {
      await streamDeck.ui.sendToPropertyInspector({
        event: "connectionStatus",
        status: "error",
        message: "No connection settings saved yet.",
      });
      return;
    }

    try {
      if (sharedObs.isConnected) await sharedObs.disconnect();
      await sharedObs.connect(connection);
      sharedObs.enableAutoReconnect(connection);

      // Get OBS version for richer feedback
      const { obsVersion } = await sharedObs.getClient().call("GetVersion");
      await streamDeck.ui.sendToPropertyInspector({
        event: "connectionStatus",
        status: "connected",
        message: `Connected — OBS ${obsVersion}`,
      });
      // Immediately provide OBS data so dropdowns populate without a manual refresh
      await this.handleGetObsData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      streamDeck.logger.error(`[OBS Automation] Test connection failed: ${message}`);
      await streamDeck.ui.sendToPropertyInspector({
        event: "connectionStatus",
        status: "error",
        message,
      });
    }
  }

  private buildStatusPayload(): Record<string, JsonValue> {
    return sharedObs.isConnected
      ? { event: "connectionStatus", status: "connected", message: "Connected to OBS" }
      : { event: "connectionStatus", status: "idle",      message: "" };
  }

  /** Fetches scene, input, and hotkey lists from OBS and sends them to the PI. */
  private async handleGetObsData(): Promise<void> {
    if (!sharedObs.isConnected) {
      await streamDeck.ui.sendToPropertyInspector({
        event: "obsData",
        error: "Not connected to OBS.",
      });
      return;
    }

    try {
      const obs = sharedObs.getClient();
      const [scenesResp, inputsResp, hotkeysResp] = await Promise.all([
        obs.call("GetSceneList"),
        obs.call("GetInputList"),
        obs.call("GetHotkeyList"),
      ]);

      // OBS returns scenes bottom→top; reverse so the top scene appears first
      const scenes = [...scenesResp.scenes].reverse().map((s) => s.sceneName);
      const inputs = inputsResp.inputs.map((i) => i.inputName);
      const hotkeys: string[] = hotkeysResp.hotkeys;

      // Cast via unknown — string[] satisfies JsonValue at runtime but TS's
      // recursive JsonValue type can't always verify the chain statically.
      const payload: Record<string, JsonValue> = {
        event: "obsData",
        scenes: scenes as unknown as JsonValue,
        inputs: inputs as unknown as JsonValue,
        hotkeys: hotkeys as unknown as JsonValue,
      };
      await streamDeck.ui.sendToPropertyInspector(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch OBS data";
      streamDeck.logger.error(`[OBS Automation] getObsData failed: ${message}`);
      await streamDeck.ui.sendToPropertyInspector({ event: "obsData", error: message });
    }
  }
}
