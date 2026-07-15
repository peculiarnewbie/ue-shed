import { Schema } from "effect";

export const CompanionCapabilityManifest = Schema.Struct({
	assetAuditsObjectPath: Schema.optional(Schema.String),
	authoringObjectPath: Schema.optional(Schema.String),
	camerasObjectPath: Schema.optional(Schema.String),
	capabilities: Schema.Array(Schema.String),
	producerKind: Schema.Literal("unreal_editor"),
	projectName: Schema.optional(Schema.String),
	schemaVersion: Schema.Literal(1)
}).annotations({ identifier: "CompanionCapabilityManifest" });
export type CompanionCapabilityManifest = Schema.Schema.Type<typeof CompanionCapabilityManifest>;

export const decodeCompanionCapabilityManifest = Schema.decodeUnknownSync(
	CompanionCapabilityManifest
);
