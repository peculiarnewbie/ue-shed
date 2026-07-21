import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Effect, Schema } from "effect";
import {
	decodeReviewCaptureResponse,
	decodeReviewSelectionResponse,
	decodeReviewSubjectInspectionResponse,
	ReviewSubjectProjection
} from "./review-schema.js";

const contractDirectory = fileURLToPath(
	new URL("../../protocol/contracts/cameras/review/v1/", import.meta.url)
);

function json(path: string): unknown {
	return JSON.parse(readFileSync(`${contractDirectory}${path}`, "utf8")) as unknown;
}

const decodeCapture = (input: unknown) => Effect.runSync(decodeReviewCaptureResponse(input));
const decodeSubject = (input: unknown) =>
	Effect.runSync(decodeReviewSubjectInspectionResponse(input));

describe("Map Review language-neutral wire contracts", () => {
	it("keeps capture projection variants strict and requires evidence from capture minor 1", () => {
		const contract = json("capture-response.schema.json") as {
			readonly $defs: {
				readonly subjectProjection: { readonly oneOf: readonly Record<string, unknown>[] };
			};
			readonly oneOf: readonly {
				readonly allOf: readonly {
					readonly then: { readonly required: readonly string[] };
				}[];
				readonly properties: { readonly subjectProjection: { readonly $ref: string } };
			}[];
		};
		const success = contract.oneOf[0]!;
		expect(success.properties.subjectProjection).toEqual({ $ref: "#/$defs/subjectProjection" });
		expect(success.allOf[0]?.then.required).toContain("subjectProjection");
		expect(contract.$defs.subjectProjection.oneOf).toHaveLength(2);
		for (const variant of contract.$defs.subjectProjection.oneOf) {
			expect(variant.additionalProperties).toBe(false);
		}

		const projected = decodeCapture(json("fixtures/capture-projected.json"));
		expect(projected).toMatchObject({
			contract: { version: { minor: 1 } },
			subjectProjection: { status: "projected", viewportStatus: "fully_within_viewport" }
		});
		const unprojectable = decodeCapture(json("fixtures/capture-unprojectable.json"));
		expect(unprojectable).toMatchObject({
			subjectProjection: { code: "near_plane_crossing", status: "unprojectable" }
		});
		expect(decodeCapture(json("fixtures/capture-legacy.json"))).not.toHaveProperty(
			"subjectProjection"
		);

		expect(
			Schema.decodeUnknownResult(ReviewSubjectProjection)({
				status: "projected",
				viewportStatus: "fully_within_viewport",
				normalizedBounds: { minX: 0.2, minY: 0.2, maxX: 0.8, maxY: 0.8 }
			})._tag
		).toBe("Failure");
	});

	it("records InspectReviewSubject failures without broadening ambient selection failures", () => {
		const contract = json("selection-response.schema.json") as {
			readonly oneOf: readonly {
				readonly properties?: { readonly code?: { readonly enum?: readonly string[] } };
			}[];
		};
		const failureCodes = contract.oneOf[1]?.properties?.code?.enum;
		expect(failureCodes).toEqual(expect.arrayContaining(["map_mismatch", "subject_not_found"]));
		const subjectFailure = json("fixtures/selection-subject-not-found.json");
		expect(decodeSubject(subjectFailure)).toMatchObject({
			code: "subject_not_found",
			status: "failed"
		});
		expect(() => Effect.runSync(decodeReviewSelectionResponse(subjectFailure))).toThrow();
	});
});
