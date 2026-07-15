import type {
	AuthoringClient,
	AuthoringCatalogResult,
	AuthoringLoadResult
} from "@ue-shed/extension-data-authoring";
import {
	decodeAuthoringCatalogResult as decodeCatalogResult,
	decodeAuthoringLoadResult as decodeLoadResult,
	decodeAuthoringSessionResult
} from "@ue-shed/authoring-sdk";
import { Effect } from "effect";

function contractFailure(cause: unknown): AuthoringLoadResult {
	return {
		status: "failed",
		error: {
			code: "contract_failure",
			message: `Workbench received an invalid authoring result: ${String(cause)}`,
			recovery: "Restart Workbench. If the problem persists, verify package versions.",
			retrySafe: true
		}
	};
}

export async function decodeAuthoringLoadResult(value: unknown): Promise<AuthoringLoadResult> {
	try {
		return await Effect.runPromise(decodeLoadResult(value));
	} catch (cause) {
		return contractFailure(cause);
	}
}

export async function decodeAuthoringCatalogResult(
	value: unknown
): Promise<AuthoringCatalogResult> {
	try {
		return await Effect.runPromise(decodeCatalogResult(value));
	} catch (cause) {
		return {
			error: {
				code: "contract_failure",
				message: `Workbench received an invalid authoring catalog: ${String(cause)}`,
				recovery: "Restart Workbench. If the problem persists, verify package versions.",
				retrySafe: true
			},
			status: "failed"
		};
	}
}

export const authoringClient: AuthoringClient = {
	beginSession: async (objectPath) =>
		Effect.runPromise(
			decodeAuthoringSessionResult(await window.ueShed.authoring.beginSession(objectPath))
		),
	applySession: async (sessionId) =>
		Effect.runPromise(
			decodeAuthoringSessionResult(await window.ueShed.authoring.applySession(sessionId))
		),
	editSession: async (intent) =>
		Effect.runPromise(
			decodeAuthoringSessionResult(await window.ueShed.authoring.editSession(intent))
		),
	loadConfiguredCatalog: async () =>
		decodeAuthoringCatalogResult(await window.ueShed.authoring.loadConfiguredCatalog()),
	loadConfiguredTable: async () =>
		decodeAuthoringLoadResult(await window.ueShed.authoring.loadConfiguredTable()),
	openCatalogTable: async (objectPath) =>
		decodeAuthoringLoadResult(await window.ueShed.authoring.openCatalogTable(objectPath)),
	redoSession: async (sessionId) =>
		Effect.runPromise(
			decodeAuthoringSessionResult(await window.ueShed.authoring.redoSession(sessionId))
		),
	reconcileSession: async (sessionId) =>
		Effect.runPromise(
			decodeAuthoringSessionResult(await window.ueShed.authoring.reconcileSession(sessionId))
		),
	saveSession: async (sessionId) =>
		Effect.runPromise(
			decodeAuthoringSessionResult(await window.ueShed.authoring.saveSession(sessionId))
		),
	undoSession: async (sessionId) =>
		Effect.runPromise(
			decodeAuthoringSessionResult(await window.ueShed.authoring.undoSession(sessionId))
		),
	chooseTable: async () => decodeAuthoringLoadResult(await window.ueShed.authoring.chooseTable())
};
