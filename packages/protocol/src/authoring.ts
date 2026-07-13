import { Schema } from "effect";

export const AUTHORING_CONTRACT_VERSION = { major: 1, minor: 0 } as const;

const FloatValue = Schema.Union(Schema.Number, Schema.Literal("nan", "infinity", "-infinity"));

export type AuthoringValue =
	| { readonly kind: "bool"; readonly value: boolean }
	| { readonly kind: "int"; readonly value: string }
	| { readonly kind: "uint"; readonly value: string }
	| { readonly kind: "float"; readonly value: number | "nan" | "infinity" | "-infinity" }
	| { readonly kind: "double"; readonly value: number | "nan" | "infinity" | "-infinity" }
	| {
			readonly kind: "name" | "enum" | "string" | "text" | "guid" | "soft_object_path";
			readonly value: string;
	  }
	| { readonly kind: "object_ref"; readonly value: string | null }
	| { readonly kind: "vector"; readonly x: number; readonly y: number; readonly z: number }
	| { readonly kind: "array" | "set"; readonly values: readonly AuthoringValue[] }
	| {
			readonly kind: "map";
			readonly entries: readonly {
				readonly key: AuthoringValue;
				readonly value: AuthoringValue;
			}[];
	  }
	| { readonly kind: "struct"; readonly fields: readonly AuthoringFieldValue[] }
	| { readonly kind: "unsupported"; readonly reason: string; readonly byteSize: number };

export interface AuthoringFieldValue {
	readonly name: string;
	readonly typeName: string;
	readonly value: AuthoringValue;
}

export const AuthoringValue: Schema.Schema<AuthoringValue> = Schema.suspend(
	() => AuthoringValueUnion
).annotations({ identifier: "AuthoringValue" });

export const AuthoringFieldValue: Schema.Schema<AuthoringFieldValue> = Schema.Struct({
	name: Schema.String,
	typeName: Schema.String,
	value: AuthoringValue
}).annotations({ identifier: "AuthoringFieldValue" });

const textValueKinds = ["name", "enum", "string", "text", "guid", "soft_object_path"] as const;
const textValueSchemas = textValueKinds.map((kind) =>
	Schema.Struct({ kind: Schema.Literal(kind), value: Schema.String })
);

const AuthoringValueUnion: Schema.Schema<AuthoringValue> = Schema.Union(
	Schema.Struct({ kind: Schema.Literal("bool"), value: Schema.Boolean }),
	Schema.Struct({ kind: Schema.Literal("int"), value: Schema.String }),
	Schema.Struct({ kind: Schema.Literal("uint"), value: Schema.String }),
	Schema.Struct({ kind: Schema.Literal("float"), value: FloatValue }),
	Schema.Struct({ kind: Schema.Literal("double"), value: FloatValue }),
	...textValueSchemas,
	Schema.Struct({ kind: Schema.Literal("object_ref"), value: Schema.NullOr(Schema.String) }),
	Schema.Struct({
		kind: Schema.Literal("vector"),
		x: Schema.Number,
		y: Schema.Number,
		z: Schema.Number
	}),
	Schema.Struct({ kind: Schema.Literal("array"), values: Schema.Array(AuthoringValue) }),
	Schema.Struct({ kind: Schema.Literal("set"), values: Schema.Array(AuthoringValue) }),
	Schema.Struct({
		kind: Schema.Literal("map"),
		entries: Schema.Array(Schema.Struct({ key: AuthoringValue, value: AuthoringValue }))
	}),
	Schema.Struct({ kind: Schema.Literal("struct"), fields: Schema.Array(AuthoringFieldValue) }),
	Schema.Struct({
		byteSize: Schema.NonNegativeInt,
		kind: Schema.Literal("unsupported"),
		reason: Schema.String
	})
);

export const AuthoringRow = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	fields: Schema.Array(AuthoringFieldValue)
});
export type AuthoringRow = Schema.Schema.Type<typeof AuthoringRow>;

export const AuthoringTableSnapshot = Schema.Struct({
	contract: Schema.Struct({
		name: Schema.Literal("unreal-authoring"),
		version: Schema.Struct({ major: Schema.Literal(1), minor: Schema.NonNegativeInt })
	}),
	authority: Schema.Union(
		Schema.Struct({ kind: Schema.Literal("project_files"), packageName: Schema.String }),
		Schema.Struct({
			kind: Schema.Literal("live_editor"),
			producerId: Schema.String,
			sessionId: Schema.String
		})
	),
	completeness: Schema.Literal("complete", "partial"),
	table: Schema.Struct({
		kind: Schema.Literal("data_table", "composite_data_table"),
		objectPath: Schema.String,
		rowStruct: Schema.String,
		parentTables: Schema.Array(Schema.String),
		rows: Schema.Array(AuthoringRow)
	}),
	diagnostics: Schema.Array(
		Schema.Struct({
			code: Schema.String,
			message: Schema.String,
			path: Schema.optional(Schema.String)
		})
	)
}).annotations({ identifier: "AuthoringTableSnapshot" });
export type AuthoringTableSnapshot = Schema.Schema.Type<typeof AuthoringTableSnapshot>;

export const decodeAuthoringTableSnapshot = Schema.decodeUnknownSync(AuthoringTableSnapshot);
export const decodeAuthoringValue = Schema.decodeUnknownSync(AuthoringValue);
