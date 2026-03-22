import streamDeck from "@elgato/streamdeck";
import { WorkflowAction } from "./actions/WorkflowAction.js";

/**
 * Plugin entry point.
 * Registers all actions then connects to the Stream Deck application.
 */
streamDeck.actions.registerAction(new WorkflowAction());
streamDeck.connect();
