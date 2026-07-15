import { Schema } from "effect";

export const TextureObjectPath = Schema.String.pipe(Schema.brand("TextureObjectPath"));
export type TextureObjectPath = Schema.Schema.Type<typeof TextureObjectPath>;

export const AuditRuleId = Schema.String.pipe(Schema.brand("AuditRuleId"));
export type AuditRuleId = Schema.Schema.Type<typeof AuditRuleId>;

export const EvidenceUnavailableReason = Schema.Literals([
	"not_serialized",
	"wrong_value_kind",
	"missing_source",
	"not_a_texture"
]);

export const Evidence = <S extends Schema.Top>(value: S) =>
	Schema.Union([
		Schema.Struct({
			status: Schema.Literal("available"),
			source: Schema.Literals(["serialized", "file"]),
			value
		}),
		Schema.Struct({
			status: Schema.Literal("unavailable"),
			reason: EvidenceUnavailableReason
		})
	]);

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

export const Dimensions = Schema.Struct({ width: PositiveInt, height: PositiveInt });
export type Dimensions = Schema.Schema.Type<typeof Dimensions>;

export const StringEvidence = Evidence(Schema.String);
export const BooleanEvidence = Evidence(Schema.Boolean);
export const NumberEvidence = Evidence(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)));
export const DimensionsEvidence = Evidence(Dimensions);

export const TextureRecord = Schema.Struct({
	objectPath: TextureObjectPath,
	filePath: Schema.String,
	packageFileBytes: NumberEvidence,
	dimensions: DimensionsEvidence,
	sourceFormat: StringEvidence,
	sourceMips: NumberEvidence,
	compression: StringEvidence,
	sRGB: BooleanEvidence,
	textureGroup: StringEvidence,
	mipGeneration: StringEvidence
});
export type TextureRecord = Schema.Schema.Type<typeof TextureRecord>;

const TexturePreviewContract = Schema.Struct({
	name: Schema.Literal("texture-preview"),
	version: Schema.Struct({ major: Schema.Literal(1), minor: Schema.Literal(0) })
});

export const TexturePreviewUnavailableReason = Schema.Literals([
	"not_connected",
	"capability_missing",
	"invalid_request",
	"texture_not_found",
	"source_unavailable",
	"source_too_large",
	"decode_failed",
	"encode_failed",
	"preview_too_large",
	"editor_data_unavailable"
]);

export const TexturePreviewResult = Schema.Union([
	Schema.Struct({
		contract: TexturePreviewContract,
		status: Schema.Literal("available"),
		authority: Schema.Literal("live_editor"),
		objectPath: TextureObjectPath,
		mimeType: Schema.Literal("image/png"),
		width: PositiveInt.check(Schema.isLessThanOrEqualTo(512)),
		height: PositiveInt.check(Schema.isLessThanOrEqualTo(512)),
		dataBase64: Schema.String.check(Schema.isMaxLength(5_592_408))
	}),
	Schema.Struct({
		contract: TexturePreviewContract,
		status: Schema.Literal("unavailable"),
		objectPath: Schema.String,
		reason: TexturePreviewUnavailableReason,
		message: Schema.NonEmptyString,
		retrySafe: Schema.Boolean
	})
]);
export type TexturePreviewResult = Schema.Schema.Type<typeof TexturePreviewResult>;
export const decodeTexturePreviewResult = Schema.decodeUnknownEffect(TexturePreviewResult);

export const DimensionsPowerOfTwoRule = Schema.Struct({
	id: AuditRuleId,
	kind: Schema.Literal("dimensions_power_of_two"),
	severity: Schema.Literals(["warning", "error"])
});
export const MaxDimensionForTextureGroupRule = Schema.Struct({
	id: AuditRuleId,
	kind: Schema.Literal("max_dimension_for_texture_group"),
	textureGroup: Schema.String,
	maximum: PositiveInt,
	severity: Schema.Literals(["warning", "error"])
});
export const TextureAuditRule = Schema.Union([
	DimensionsPowerOfTwoRule,
	MaxDimensionForTextureGroupRule
]);
export type TextureAuditRule = Schema.Schema.Type<typeof TextureAuditRule>;

export const TextureAuditRuleSet = Schema.Struct({
	schemaVersion: Schema.Literal(1),
	name: Schema.String,
	rules: Schema.Array(TextureAuditRule)
});
export type TextureAuditRuleSet = Schema.Schema.Type<typeof TextureAuditRuleSet>;

export const FindingEvidence = Schema.Struct({
	label: Schema.String,
	value: Schema.String
});
export const TextureAuditFinding = Schema.Struct({
	ruleId: AuditRuleId,
	severity: Schema.Literals(["warning", "error"]),
	objectPath: TextureObjectPath,
	explanation: Schema.String,
	actual: Schema.Array(FindingEvidence),
	expected: Schema.Array(FindingEvidence)
});
export type TextureAuditFinding = Schema.Schema.Type<typeof TextureAuditFinding>;

export const ScanDiagnostic = Schema.Struct({
	code: Schema.String,
	message: Schema.String,
	filePath: Schema.optional(Schema.String)
});
export type ScanDiagnostic = Schema.Schema.Type<typeof ScanDiagnostic>;

export const ScanCoverage = Schema.Struct({
	discoveredPackages: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	inspectedPackages: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	textureAssets: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	partialPackages: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	failedPackages: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
});

export const DistributionBucket = Schema.Struct({
	key: Schema.String,
	label: Schema.String,
	count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
});
export type DistributionBucket = Schema.Schema.Type<typeof DistributionBucket>;

export const TextureDistributions = Schema.Struct({
	maximumDimension: Schema.Array(DistributionBucket),
	textureGroup: Schema.Array(DistributionBucket),
	compression: Schema.Array(DistributionBucket),
	sRGB: Schema.Array(DistributionBucket)
});
export type TextureDistributions = Schema.Schema.Type<typeof TextureDistributions>;

export const TextureAuditReport = Schema.Struct({
	schemaVersion: Schema.Literal(1),
	status: Schema.Literals(["complete", "partial"]),
	ruleSetName: Schema.String,
	coverage: ScanCoverage,
	records: Schema.Array(TextureRecord),
	findings: Schema.Array(TextureAuditFinding),
	distributions: TextureDistributions,
	diagnostics: Schema.Array(ScanDiagnostic)
});
export type TextureAuditReport = Schema.Schema.Type<typeof TextureAuditReport>;

export const TextureAuditPublicError = Schema.Struct({
	code: Schema.Literals(["invalid_project", "invalid_rules", "scan_failed", "contract_failure"]),
	message: Schema.String,
	recovery: Schema.String,
	retrySafe: Schema.Boolean
});
export type TextureAuditPublicError = Schema.Schema.Type<typeof TextureAuditPublicError>;

export const TextureAuditRunResult = Schema.Union([
	Schema.Struct({ status: Schema.Literal("completed"), report: TextureAuditReport }),
	Schema.Struct({ status: Schema.Literal("not_configured") }),
	Schema.Struct({ status: Schema.Literal("cancelled") }),
	Schema.Struct({ status: Schema.Literal("failed"), error: TextureAuditPublicError })
]);
export type TextureAuditRunResult = Schema.Schema.Type<typeof TextureAuditRunResult>;

export const decodeTextureAuditRuleSet = Schema.decodeUnknownEffect(TextureAuditRuleSet);
export const decodeTextureAuditRunResult = Schema.decodeUnknownEffect(TextureAuditRunResult);
