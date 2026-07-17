import { Schema } from "effect";
import {
	AuthoringCommand,
	AuthoringRow,
	AuthoringTableSnapshot,
	AuthoringValue
} from "./authoring.js";

export const AuthoringSessionPipeline = Schema.Union([
	Schema.Struct({ canApply: Schema.Boolean, kind: Schema.Literal("draft") }),
	Schema.Struct({ kind: Schema.Literal("applying"), operationId: Schema.String }),
	Schema.Struct({
		id: Schema.String,
		kind: Schema.Literal("indeterminate"),
		operation: Schema.Literals(["apply", "save"])
	}),
	Schema.Struct({ kind: Schema.Literal("applied"), objectPaths: Schema.Array(Schema.String) }),
	Schema.Struct({ kind: Schema.Literal("saving"), requestId: Schema.String }),
	Schema.Struct({ kind: Schema.Literal("saved") })
]).annotate({ identifier: "AuthoringSessionPipeline" });
export type AuthoringSessionPipeline = Schema.Schema.Type<typeof AuthoringSessionPipeline>;

export const AuthoringReviewDiagnostic = Schema.Struct({
	code: Schema.String,
	fieldName: Schema.optionalKey(Schema.String),
	message: Schema.String,
	path: Schema.optionalKey(Schema.String),
	recovery: Schema.String,
	rowId: Schema.optionalKey(Schema.String),
	severity: Schema.Literals(["error", "warning"]),
	tableObjectPath: Schema.String
}).annotate({ identifier: "AuthoringReviewDiagnostic" });
export interface AuthoringReviewDiagnostic extends Schema.Schema.Type<
	typeof AuthoringReviewDiagnostic
> {}

export const AuthoringTableChange = Schema.Union([
	Schema.Struct({ kind: Schema.Literal("row_added"), row: AuthoringRow }),
	Schema.Struct({ kind: Schema.Literal("row_removed"), row: AuthoringRow }),
	Schema.Struct({
		kind: Schema.Literal("row_renamed"),
		newName: Schema.String,
		oldName: Schema.String,
		rowId: Schema.String
	}),
	Schema.Struct({
		fieldName: Schema.String,
		kind: Schema.Literal("cell_changed"),
		newValue: AuthoringValue,
		oldValue: AuthoringValue,
		rowId: Schema.String,
		rowName: Schema.String
	}),
	Schema.Struct({
		kind: Schema.Literal("rows_reordered"),
		newOrder: Schema.Array(Schema.String),
		oldOrder: Schema.Array(Schema.String)
	})
]).annotate({ identifier: "AuthoringTableChange" });
export type AuthoringTableChange = Schema.Schema.Type<typeof AuthoringTableChange>;

export const AuthoringTableReview = Schema.Struct({
	base: AuthoringTableSnapshot,
	changes: Schema.Array(AuthoringTableChange),
	diagnostics: Schema.Array(AuthoringReviewDiagnostic),
	dirtyCells: Schema.Array(Schema.Struct({ fieldName: Schema.String, rowId: Schema.String })),
	dirtyRowIds: Schema.Array(Schema.String),
	objectPath: Schema.String,
	valid: Schema.Boolean,
	working: AuthoringTableSnapshot
}).annotate({ identifier: "AuthoringTableReview" });
export interface AuthoringTableReview extends Schema.Schema.Type<typeof AuthoringTableReview> {}

export const AuthoringCommandGroupReview = Schema.Struct({
	active: Schema.Boolean,
	author: Schema.optionalKey(Schema.String),
	authoredAt: Schema.String,
	commands: Schema.Array(
		Schema.Struct({
			body: AuthoringCommand,
			id: Schema.String,
			tableObjectPath: Schema.String
		})
	),
	groupId: Schema.String,
	tableObjectPaths: Schema.Array(Schema.String)
}).annotate({ identifier: "AuthoringCommandGroupReview" });
export interface AuthoringCommandGroupReview extends Schema.Schema.Type<
	typeof AuthoringCommandGroupReview
> {}

export const AuthoringSessionValidation = Schema.Struct({
	diagnostics: Schema.Array(AuthoringReviewDiagnostic),
	errorCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	valid: Schema.Boolean,
	warningCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
}).annotate({ identifier: "AuthoringSessionValidation" });
export interface AuthoringSessionValidation extends Schema.Schema.Type<
	typeof AuthoringSessionValidation
> {}

export const AuthoringSessionReview = Schema.Struct({
	activeCommandCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	canRedo: Schema.Boolean,
	canUndo: Schema.Boolean,
	commandGroups: Schema.Array(AuthoringCommandGroupReview),
	createdAt: Schema.String,
	lifecycle: Schema.Literals(["open", "closed"]),
	pipeline: AuthoringSessionPipeline,
	project: Schema.Struct({ id: Schema.String, root: Schema.String }),
	sessionId: Schema.String,
	tables: Schema.Array(AuthoringTableReview),
	updatedAt: Schema.String,
	validation: AuthoringSessionValidation
}).annotate({ identifier: "AuthoringSessionReview" });
export interface AuthoringSessionReview extends Schema.Schema.Type<typeof AuthoringSessionReview> {}
