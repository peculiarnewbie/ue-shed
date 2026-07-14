import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { connectUnrealAuthoring, UnrealConnectionError } from "./index.js";

let server: Server | undefined;

afterEach(async () => {
	if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
	server = undefined;
});

async function listen(
	handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<string> {
	server = createServer(handler);
	await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("test server has no TCP address");
	return `http://127.0.0.1:${address.port}`;
}

function resultJson(value: unknown): string {
	return JSON.stringify({ ResultJson: JSON.stringify(value) });
}

describe("Remote Control authoring adapter", () => {
	it("negotiates the companion and validates a live snapshot over HTTP", async () => {
		const endpoint = await listen((request, response) => {
			let body = "";
			request.setEncoding("utf8");
			request.on("data", (chunk: string) => (body += chunk));
			request.on("end", () => {
				const call = JSON.parse(body) as { functionName: string };
				response.setHeader("content-type", "application/json");
				response.end(
					call.functionName === "GetCapabilityManifest"
						? resultJson({
								authoringObjectPath:
									"/Script/UEShedAuthoring.Default__UEShedAuthoringLibrary",
								capabilities: [
									"authoring.snapshot.v1",
									"authoring.apply.v1",
									"authoring.apply-result.v1",
									"authoring.save.v1"
								],
								producerKind: "unreal_editor",
								schemaVersion: 1
							})
						: resultJson({
								authority: {
									kind: "live_editor",
									producerId: "producer",
									sessionId: "session"
								},
								completeness: "complete",
								contract: {
									name: "unreal-authoring",
									version: { major: 1, minor: 0 }
								},
								diagnostics: [],
								table: {
									kind: "data_table",
									objectPath: "/Game/Fixture/DT_Test.DT_Test",
									parentTables: [],
									rows: [],
									rowStruct: "/Script/Fixture.Row"
								}
							})
				);
			});
		});

		const connection = await Effect.runPromise(connectUnrealAuthoring(endpoint));
		const snapshot = await Effect.runPromise(
			connection.getTableSnapshot("/Game/Fixture/DT_Test.DT_Test")
		);
		expect(snapshot.authority.kind).toBe("live_editor");
	});

	it("returns a typed retryable error for an unavailable Remote Control server", async () => {
		const endpoint = await listen((_request, response) => {
			response.statusCode = 503;
			response.end("unavailable");
		});
		const error = await Effect.runPromise(Effect.flip(connectUnrealAuthoring(endpoint)));
		expect(error).toBeInstanceOf(UnrealConnectionError);
		if (error instanceof UnrealConnectionError) {
			expect(error.retrySafe).toBe(true);
			expect(error.status).toBe(503);
		}
	});
});
