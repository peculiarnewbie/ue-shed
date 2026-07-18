import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { MapReviewCaptureIntent, MapReviewCaptureJobState } from "./review-ipc.js";

describe("Map Review capture workflow contracts", () => {
	it("requires at least one selected Review View", () => {
		expect(Schema.decodeUnknownResult(MapReviewCaptureIntent)({ viewIds: [] })._tag).toBe(
			"Failure"
		);
		expect(
			Schema.decodeUnknownResult(MapReviewCaptureIntent)({ viewIds: ["view-1"] })._tag
		).toBe("Success");
	});

	it("represents completed synchronous work with future-safe progress", () => {
		const result = Schema.decodeUnknownResult(MapReviewCaptureJobState)({
			completedAt: "2026-07-18T12:00:00.000Z",
			context: "editor",
			failedViews: 0,
			jobId: "run-1",
			progress: { completedViews: 2, totalViews: 2 },
			runId: "run-1",
			status: "completed",
			successfulViews: 2,
			viewIds: ["view-1", "view-2"]
		});
		expect(result._tag).toBe("Success");
	});
});
