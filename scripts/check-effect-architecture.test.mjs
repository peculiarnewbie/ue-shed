import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { checkCatalogUsage, checkSourceBaselines } from "./check-effect-architecture.mjs";

let root;

before(async () => {
	root = await mkdtemp(join(tmpdir(), "ue-shed-effect-architecture-"));
	for (const directory of ["apps/example/src", "packages", "extensions"]) {
		await mkdir(join(root, directory), { recursive: true });
	}
});

after(async () => {
	await rm(root, { force: true, recursive: true });
});

test("rejects a new runtime exit outside the migration baseline", async () => {
	await writeFile(join(root, "apps/example/src/index.ts"), "Effect.runPromise(program);\n");
	const failures = await checkSourceBaselines(root, { "Effect.runPromise": {} });
	assert.deepEqual(failures, [
		"apps/example/src/index.ts: Effect.runPromise count 1 exceeds migration baseline 0"
	]);
});

test("accepts an existing site at or below its migration baseline", async () => {
	const failures = await checkSourceBaselines(root, {
		"Effect.runPromise": { "apps/example/src/index.ts": 1 }
	});
	assert.deepEqual(failures, []);
});

test("requires catalog-owned dependencies to use catalog protocol", async () => {
	await writeFile(
		join(root, "pnpm-workspace.yaml"),
		`catalog:\n  "@effect/vitest": "4.0.0-beta.98"\n  "@stylexjs/rollup-plugin": "^0.19.0"\n  "@stylexjs/stylex": "^0.19.0"\n  effect: "4.0.0-beta.98"\n  solid-js: "^1.9.14"\n  vite-plugin-solid: "^2.11.12"\n`
	);
	await writeFile(
		join(root, "package.json"),
		JSON.stringify({ dependencies: { effect: "^3.22.0" } })
	);
	const failures = await checkCatalogUsage(root);
	assert.deepEqual(failures, ["package.json: dependencies.effect must use catalog:"]);
});
