import type {
	AuthoringClient,
	AuthoringLoadFailure,
	AuthoringLoadResult
} from "@ue-shed/extension-data-authoring";
import { decodeAuthoringTableSnapshot } from "@ue-shed/protocol";

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

function isFailure(value: unknown): value is AuthoringLoadFailure {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Readonly<Record<string, unknown>>;
	return (
		(record.code === "reader_failure" || record.code === "contract_failure") &&
		typeof record.message === "string" &&
		typeof record.recovery === "string" &&
		typeof record.retrySafe === "boolean"
	);
}

export function decodeAuthoringLoadResult(value: unknown): AuthoringLoadResult {
	try {
		if (typeof value !== "object" || value === null || !("status" in value)) {
			return contractFailure("result is not a status object");
		}
		const record = value as Readonly<Record<string, unknown>>;
		switch (record.status) {
			case "ready":
				return { status: "ready", snapshot: decodeAuthoringTableSnapshot(record.snapshot) };
			case "not_configured":
			case "cancelled":
				return { status: record.status };
			case "failed":
				return isFailure(record.error)
					? { status: "failed", error: record.error }
					: contractFailure("failure result has no valid error");
			default:
				return contractFailure(`unknown status ${String(record.status)}`);
		}
	} catch (cause) {
		return contractFailure(cause);
	}
}

export const authoringClient: AuthoringClient = {
	loadConfiguredTable: async () =>
		decodeAuthoringLoadResult(await window.ueShed.authoring.loadConfiguredTable()),
	chooseTable: async () => decodeAuthoringLoadResult(await window.ueShed.authoring.chooseTable())
};
