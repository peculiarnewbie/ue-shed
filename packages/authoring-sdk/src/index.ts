import { AuthoringTableSnapshot, AuthoringValue } from "@ue-shed/protocol";
import { Schema } from "effect";

export const AuthoringSessionView = Schema.Struct({
	canRedo: Schema.Boolean,
	canUndo: Schema.Boolean,
	commandCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	dirty: Schema.Boolean,
	lifecycle: Schema.Literals(["open", "closed"]),
	pipeline: Schema.Union([
		Schema.Struct({ canApply: Schema.Boolean, kind: Schema.Literal("draft") }),
		Schema.Struct({ kind: Schema.Literal("applying"), operationId: Schema.String }),
		Schema.Struct({
			kind: Schema.Literal("indeterminate"),
			operation: Schema.Literals(["apply", "save"]),
			id: Schema.String
		}),
		Schema.Struct({
			kind: Schema.Literal("applied"),
			objectPaths: Schema.Array(Schema.String)
		}),
		Schema.Struct({ kind: Schema.Literal("saving"), requestId: Schema.String }),
		Schema.Struct({ kind: Schema.Literal("saved") })
	]),
	sessionId: Schema.String,
	snapshot: AuthoringTableSnapshot,
	updatedAt: Schema.String
}).annotate({ identifier: "AuthoringSessionView" });
export type AuthoringSessionView = Schema.Schema.Type<typeof AuthoringSessionView>;

export const AuthoringSetCellsIntent = Schema.Struct({
	edits: Schema.Array(
		Schema.Struct({
			fieldName: Schema.String,
			rowId: Schema.String,
			value: AuthoringValue
		})
	),
	kind: Schema.Literal("set_cells"),
	sessionId: Schema.String,
	tableObjectPath: Schema.String
}).annotate({ identifier: "AuthoringSetCellsIntent" });
export type AuthoringSetCellsIntent = Schema.Schema.Type<typeof AuthoringSetCellsIntent>;

export const AuthoringSessionResult = Schema.Union([
	Schema.Struct({ status: Schema.Literal("ready"), view: AuthoringSessionView }),
	Schema.Struct({
		error: Schema.Struct({
			code: Schema.String,
			message: Schema.String,
			recovery: Schema.String,
			retrySafe: Schema.Boolean
		}),
		status: Schema.Literal("failed")
	})
]).annotate({ identifier: "AuthoringSessionResult" });
export type AuthoringSessionResult = Schema.Schema.Type<typeof AuthoringSessionResult>;

export const AuthoringLoadFailure = Schema.Struct({
	code: Schema.Literals(["reader_failure", "contract_failure"]),
	message: Schema.String,
	recovery: Schema.String,
	retrySafe: Schema.Boolean
});
export type AuthoringLoadFailure = Schema.Schema.Type<typeof AuthoringLoadFailure>;

export const AuthoringLoadResult = Schema.Union([
	Schema.Struct({ status: Schema.Literal("ready"), snapshot: AuthoringTableSnapshot }),
	Schema.Struct({ status: Schema.Literal("not_configured") }),
	Schema.Struct({ status: Schema.Literal("cancelled") }),
	Schema.Struct({ status: Schema.Literal("failed"), error: AuthoringLoadFailure })
]).annotate({ identifier: "AuthoringLoadResult" });
export type AuthoringLoadResult = Schema.Schema.Type<typeof AuthoringLoadResult>;

export const AuthoringTableCatalogEntry = Schema.Struct({
	authorities: Schema.Array(Schema.Literals(["saved", "live"])),
	completeness: Schema.Literals(["complete", "partial"]),
	divergence: Schema.Array(Schema.String),
	kind: Schema.Literals(["data_table", "composite_data_table"]),
	objectPath: Schema.String,
	parentTables: Schema.Array(Schema.String),
	rowStruct: Schema.String
});
export type AuthoringTableCatalogEntry = Schema.Schema.Type<typeof AuthoringTableCatalogEntry>;

export const AuthoringCatalogResult = Schema.Union([
	Schema.Struct({
		diagnostics: Schema.Array(
			Schema.Struct({
				code: Schema.String,
				message: Schema.String,
				path: Schema.optional(Schema.String)
			})
		),
		status: Schema.Literal("ready"),
		tables: Schema.Array(AuthoringTableCatalogEntry)
	}),
	Schema.Struct({ status: Schema.Literal("not_configured") }),
	Schema.Struct({ status: Schema.Literal("failed"), error: AuthoringLoadFailure })
]).annotate({ identifier: "AuthoringCatalogResult" });
export type AuthoringCatalogResult = Schema.Schema.Type<typeof AuthoringCatalogResult>;

export const decodeAuthoringSessionResult = Schema.decodeUnknownEffect(AuthoringSessionResult);
export const decodeAuthoringSetCellsIntent = Schema.decodeUnknownEffect(AuthoringSetCellsIntent);
export const decodeAuthoringLoadResult = Schema.decodeUnknownEffect(AuthoringLoadResult);
export const decodeAuthoringCatalogResult = Schema.decodeUnknownEffect(AuthoringCatalogResult);
