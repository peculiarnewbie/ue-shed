import type {
	AuthoringClient,
	AuthoringCatalogResult,
	AuthoringLoadFailure,
	AuthoringLoadResult
} from "@ue-shed/extension-data-authoring";
import { decodeAuthoringTableSnapshot } from "@ue-shed/protocol";
import { Schema } from "effect";

const AuthoringCatalogResultSchema = Schema.Union(
	Schema.Struct({
		diagnostics: Schema.Array(
			Schema.Struct({
				code: Schema.String,
				message: Schema.String,
				path: Schema.optional(Schema.String)
			})
		),
		status: Schema.Literal("ready"),
		tables: Schema.Array(
			Schema.Struct({
				authorities: Schema.Array(Schema.Literal("saved", "live")),
				completeness: Schema.Literal("complete", "partial"),
				divergence: Schema.Array(Schema.String),
				kind: Schema.Literal("data_table", "composite_data_table"),
				objectPath: Schema.String,
				parentTables: Schema.Array(Schema.String),
				rowStruct: Schema.String
			})
		)
	}),
	Schema.Struct({ status: Schema.Literal("not_configured") }),
	Schema.Struct({
		error: Schema.Struct({
			code: Schema.Literal("reader_failure", "contract_failure"),
			message: Schema.String,
			recovery: Schema.String,
			retrySafe: Schema.Boolean
		}),
		status: Schema.Literal("failed")
	})
);

const decodeCatalogResult = Schema.decodeUnknownSync(AuthoringCatalogResultSchema);

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

export function decodeAuthoringCatalogResult(value: unknown): AuthoringCatalogResult {
	try {
		return decodeCatalogResult(value);
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
	loadConfiguredCatalog: async () =>
		decodeAuthoringCatalogResult(await window.ueShed.authoring.loadConfiguredCatalog()),
	loadConfiguredTable: async () =>
		decodeAuthoringLoadResult(await window.ueShed.authoring.loadConfiguredTable()),
	openCatalogTable: async (objectPath) =>
		decodeAuthoringLoadResult(await window.ueShed.authoring.openCatalogTable(objectPath)),
	chooseTable: async () => decodeAuthoringLoadResult(await window.ueShed.authoring.chooseTable())
};
