// @vitest-environment jsdom

import { cleanup, render, screen } from "@solidjs/testing-library";
import { userEvent } from "@testing-library/user-event";
import { EffectRuntimeProvider } from "@ue-shed/ui";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { TextureAuditClientShape } from "./texture-audit-client.js";
import { TextureAuditRoute } from "./texture-audit-route.js";

const runtime = ManagedRuntime.make(Layer.empty);
afterEach(cleanup);
afterAll(() => runtime.dispose());

describe("TextureAuditRoute", () => {
	it("runs project selection through the Effect client", async () => {
		let selections = 0;
		const client: TextureAuditClientShape = {
			chooseProjectAndScan: () =>
				Effect.sync(() => {
					selections += 1;
					return { status: "cancelled" as const };
				}),
			launchUnreal: () => Effect.die("unused"),
			loadConfiguredProject: () => Effect.succeed({ status: "not_configured" as const }),
			loadPreview: () => Effect.die("unused")
		};
		render(() => (
			<EffectRuntimeProvider runtime={runtime}>
				<TextureAuditRoute client={client} />
			</EffectRuntimeProvider>
		));
		expect(await screen.findByText("No project configured.")).toBeDefined();
		await userEvent.setup().click(screen.getByRole("button", { name: "Choose project" }));
		expect(await screen.findByText("Selection cancelled. No scan was started.")).toBeDefined();
		expect(selections).toBe(1);
	});
});
