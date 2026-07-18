// @vitest-environment jsdom

import { cleanup, render, screen } from "@solidjs/testing-library";
import { userEvent } from "@testing-library/user-event";
import { ActorId, type ObservedActor } from "@ue-shed/observatory";
import { EffectRuntimeProvider } from "@ue-shed/ui";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { MapReviewClientShape } from "./map-review-client.js";
import { WorldScout } from "./world-scout.js";

const observed: ObservedActor = {
	bounds: {
		center: { x: 120, y: -80, z: 30 },
		extent: { x: 25, y: 25, z: 30 }
	},
	className: "UEShedFixtureMover",
	displayName: "Orbit 07",
	id: ActorId.make("/Game/Fixture.Map:PersistentLevel.Orbit_07"),
	location: { x: 120, y: -80, z: 30 },
	path: "/Game/Fixture.Map:PersistentLevel.Orbit_07",
	rotation: { x: 0, y: 0, z: 90 }
};

const runtime = ManagedRuntime.make(Layer.empty);
afterEach(cleanup);
afterAll(() => runtime.dispose());

describe("WorldScout", () => {
	it("selects a live actor, then focuses or follows it through explicit actions", async () => {
		let focused: string | undefined;
		const foregroundRequests: Array<boolean> = [];
		let framed: ObservedActor | undefined;
		const result = {
			status: "ready" as const,
			snapshot: {
				actors: [observed],
				capturedAt: "2026-07-18T10:00:00.000Z",
				mapPath: "/Game/Fixture/Observatory",
				sequence: 4,
				worldKind: "editor" as const,
				worldSeconds: 12.5
			}
		};
		const client = {
			connectWorld: () => Effect.succeed(result),
			focusActor: (actorId, bringToFront) =>
				Effect.sync(() => {
					focused = actorId;
					foregroundRequests.push(bringToFront);
					return { actorId, status: "focused" as const };
				}),
			worldSnapshots: Stream.make(result)
		} satisfies Pick<MapReviewClientShape, "connectWorld" | "focusActor" | "worldSnapshots">;

		render(() => (
			<EffectRuntimeProvider runtime={runtime}>
				<WorldScout
					client={client}
					onActorFocused={(actor) => {
						framed = actor;
					}}
				/>
			</EffectRuntimeProvider>
		));
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "Select Orbit 07" }));
		expect(focused).toBeUndefined();
		await user.click(screen.getByRole("button", { name: "GO TO ACTOR ↗" }));
		expect(focused).toBe(observed.id);
		expect(foregroundRequests).toEqual([true]);
		expect(framed).toBe(observed);
		expect(screen.getByText("FOCUSED IN UNREAL")).toBeDefined();
		await user.click(screen.getByRole("button", { name: "FOLLOW ACTOR" }));
		expect(foregroundRequests).toEqual([true, true]);
		expect(screen.getByRole("button", { name: "STOP FOLLOWING" })).toBeDefined();
	});
});
