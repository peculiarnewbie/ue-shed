// @vitest-environment jsdom

import { cleanup, render, screen } from "@solidjs/testing-library";
import { userEvent } from "@testing-library/user-event";
import type { AuthoringClientShape } from "@ue-shed/authoring-sdk";
import { EffectRuntimeProvider } from "@ue-shed/ui";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { AuthoringRoute } from "./authoring-route.js";

const runtime = ManagedRuntime.make(Layer.empty);
afterEach(cleanup);
afterAll(() => runtime.dispose());

describe("AuthoringRoute", () => {
	it("keeps the expandable route responsive when table selection is cancelled", async () => {
		let selections = 0;
		const client: AuthoringClientShape = {
			applySession: () => Effect.die("unused"),
			beginSession: () => Effect.die("unused"),
			chooseTable: () =>
				Effect.sync(() => {
					selections += 1;
					return { status: "cancelled" as const };
				}),
			editSession: () => Effect.die("unused"),
			loadConfiguredCatalog: () => Effect.succeed({ status: "not_configured" as const }),
			loadConfiguredTable: () => Effect.succeed({ status: "not_configured" as const }),
			openCatalogTable: () => Effect.die("unused"),
			reconcileSession: () => Effect.die("unused"),
			redoSession: () => Effect.die("unused"),
			saveSession: () => Effect.die("unused"),
			undoSession: () => Effect.die("unused")
		};
		render(() => (
			<EffectRuntimeProvider runtime={runtime}>
				<AuthoringRoute client={client} />
			</EffectRuntimeProvider>
		));
		expect(await screen.findByText("Select a project DataTable.")).toBeDefined();
		await userEvent.setup().click(screen.getByRole("button", { name: "Choose .uasset" }));
		expect(
			await screen.findByText("Selection cancelled. The current table was not replaced.")
		).toBeDefined();
		expect(selections).toBe(1);
	});
});
