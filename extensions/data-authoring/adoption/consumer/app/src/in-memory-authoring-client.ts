import type { AuthoringClientShape } from "@ue-shed/authoring-sdk";
import { Effect } from "effect";

const unused = () => Effect.die("Operation is not used by the adoption conformance view.");

export const authoringClient: AuthoringClientShape = {
	applySession: unused,
	beginSession: unused,
	chooseTable: () => Effect.succeed({ status: "cancelled" as const }),
	discardSession: unused,
	editSession: unused,
	listSessions: () => Effect.succeed({ diagnostics: [], sessions: [], status: "ready" as const }),
	loadConfiguredCatalog: () => Effect.succeed({ status: "not_configured" as const }),
	loadConfiguredTable: () => Effect.succeed({ status: "not_configured" as const }),
	openCatalogTable: unused,
	openSession: unused,
	reconcileSession: unused,
	redoSession: unused,
	reviewSession: unused,
	saveSession: unused,
	undoSession: unused
};
