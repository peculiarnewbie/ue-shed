import { AuthoringTableSnapshot, AuthoringValue } from "@ue-shed/protocol";
import { Schema } from "effect";

export const AuthoringSessionView = Schema.Struct({
	canRedo: Schema.Boolean,
	canUndo: Schema.Boolean,
	commandCount: Schema.NonNegativeInt,
	dirty: Schema.Boolean,
	lifecycle: Schema.Literal("open", "closed"),
	pipeline: Schema.Union(
		Schema.Struct({ canApply: Schema.Boolean, kind: Schema.Literal("draft") }),
		Schema.Struct({ kind: Schema.Literal("applying"), operationId: Schema.String }),
		Schema.Struct({
			kind: Schema.Literal("indeterminate"),
			operation: Schema.Literal("apply", "save"),
			id: Schema.String
		}),
		Schema.Struct({
			kind: Schema.Literal("applied"),
			objectPaths: Schema.Array(Schema.String)
		}),
		Schema.Struct({ kind: Schema.Literal("saving"), requestId: Schema.String }),
		Schema.Struct({ kind: Schema.Literal("saved") })
	),
	sessionId: Schema.String,
	snapshot: AuthoringTableSnapshot,
	updatedAt: Schema.String
}).annotations({ identifier: "AuthoringSessionView" });
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
}).annotations({ identifier: "AuthoringSetCellsIntent" });
export type AuthoringSetCellsIntent = Schema.Schema.Type<typeof AuthoringSetCellsIntent>;

export const AuthoringSessionResult = Schema.Union(
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
).annotations({ identifier: "AuthoringSessionResult" });
export type AuthoringSessionResult = Schema.Schema.Type<typeof AuthoringSessionResult>;

export const decodeAuthoringSessionResult = Schema.decodeUnknownSync(AuthoringSessionResult);
export const decodeAuthoringSetCellsIntent = Schema.decodeUnknownSync(AuthoringSetCellsIntent);
