import assert from "node:assert/strict";
import test from "node:test";
import { resolveRemoteControlEndpoint } from "./workbench-tools.mjs";

test("honors an explicit Remote Control endpoint", async () => {
	const endpoint = await resolveRemoteControlEndpoint({
		UE_SHED_REMOTE_CONTROL_ENDPOINT: "http://127.0.0.1:30017"
	});
	assert.equal(endpoint, "http://127.0.0.1:30017");
});

test("prefers a live Remote Control server over the next free port", async () => {
	const endpoint = await resolveRemoteControlEndpoint(
		{},
		{
			fetch: async (url) => {
				if (String(url) === "http://127.0.0.1:30001/remote/info") {
					return { ok: true };
				}
				return { ok: false };
			}
		}
	);
	assert.equal(endpoint, "http://127.0.0.1:30001");
});

test("falls back to a free port pair when nothing answers", async () => {
	const endpoint = await resolveRemoteControlEndpoint(
		{},
		{
			fetch: async () => ({ ok: false })
		}
	);
	assert.match(endpoint, /^http:\/\/127\.0\.0\.1:300\d\d$/);
});
