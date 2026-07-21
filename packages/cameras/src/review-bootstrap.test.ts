import { join } from "node:path";
import { expect, it } from "vitest";
import { bootstrapMapReviewSet } from "./review-bootstrap.js";
import type { ReviewSelectionResponse } from "./review-schema.js";

const selection = {
	actorPath: "/Game/Maps/FirstMap.FirstMap:PersistentLevel.Subject_0",
	bounds: {
		center: { x: 0, y: 0, z: 100 },
		extent: { x: 100, y: 100, z: 100 },
		rotation: { pitch: 0, roll: 0, yaw: 0 }
	},
	contract: { name: "ue-shed-review-selection" as const, version: { major: 1, minor: 0 } },
	displayName: "First subject",
	mapPath: "/Game/Maps/FirstMap",
	status: "selected" as const
} satisfies Extract<ReviewSelectionResponse, { readonly status: "selected" }>;

it("derives a deterministic, map-scoped empty Review Set for first-run authoring", () => {
	const first = bootstrapMapReviewSet({ projectRoot: "C:/Project", selection });
	const second = bootstrapMapReviewSet({ projectRoot: "C:/Project", selection });

	expect(first).toEqual(second);
	expect(first.reviewSet).toMatchObject({
		displayName: "FirstMap Map Review",
		project: { id: "Project", mapPath: selection.mapPath },
		views: []
	});
	expect(first.reviewSet.captureProfiles).toEqual([
		expect.objectContaining({
			id: "default-png-720p",
			resolution: { height: 720, width: 1280 }
		})
	]);
	expect(first.reviewSetPath).toBe(
		join("C:/Project", ".ue-shed", "review", "sets", `${first.reviewSet.id}.json`)
	);
	expect(first.viewId).toBe("initial-view");
});
