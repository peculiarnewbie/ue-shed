import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
	checkCatalogUsage,
	checkSourceBaselines,
	checkWorkbenchBoundaries
} from "./check-effect-architecture.mjs";

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

async function withWorkbenchFixture(relativePath, contents, run) {
	const fixtureRoot = await mkdtemp(join(tmpdir(), "ue-shed-workbench-boundary-"));
	try {
		const absolute = join(fixtureRoot, relativePath);
		await mkdir(join(absolute, ".."), { recursive: true });
		await writeFile(absolute, contents);
		await run(fixtureRoot);
	} finally {
		await rm(fixtureRoot, { force: true, recursive: true });
	}
}

test("rejects Workbench main Effect.runPromise and Effect.runSync", async () => {
	await withWorkbenchFixture(
		"apps/workbench/src/main/services/bad-exit.ts",
		'import { Effect } from "effect";\nEffect.runPromise(Effect.void);\nEffect.runSync(Effect.void);\n',
		async (fixtureRoot) => {
			const failures = await checkWorkbenchBoundaries(fixtureRoot);
			assert.deepEqual(failures, [
				"apps/workbench/src/main/services/bad-exit.ts: Workbench main must not call Effect.runPromise or Effect.runSync"
			]);
		}
	);
});

test("rejects Workbench main process.env outside FixtureProcess", async () => {
	await withWorkbenchFixture(
		"apps/workbench/src/main/services/bad-env.ts",
		"export const value = process.env.UE_SHED_PROJECT_ROOT;\n",
		async (fixtureRoot) => {
			const failures = await checkWorkbenchBoundaries(fixtureRoot);
			assert.deepEqual(failures, [
				"apps/workbench/src/main/services/bad-env.ts: Workbench main must not read process.env outside FixtureProcess"
			]);
		}
	);
});

test("rejects Workbench main raw fetch", async () => {
	await withWorkbenchFixture(
		"apps/workbench/src/main/services/bad-fetch.ts",
		'export const load = () => fetch("http://127.0.0.1:30001");\n',
		async (fixtureRoot) => {
			const failures = await checkWorkbenchBoundaries(fixtureRoot);
			assert.deepEqual(failures, [
				"apps/workbench/src/main/services/bad-fetch.ts: Workbench main must not call raw fetch"
			]);
		}
	);
});

test("rejects ipcMain.handle outside bootstrap or adapters", async () => {
	await withWorkbenchFixture(
		"apps/workbench/src/main/services/bad-ipc.ts",
		'export const register = (ipcMain) => {\n\tipcMain.handle("x", async () => null);\n};\n',
		async (fixtureRoot) => {
			const failures = await checkWorkbenchBoundaries(fixtureRoot);
			assert.deepEqual(failures, [
				"apps/workbench/src/main/services/bad-ipc.ts: ipcMain.handle is only allowed in the Electron bootstrap or adapters"
			]);
		}
	);
});

test("rejects electron/main imports outside bootstrap or adapters", async () => {
	await withWorkbenchFixture(
		"apps/workbench/src/main/services/bad-electron.ts",
		'import { app } from "electron/main";\nexport const ready = app.whenReady;\n',
		async (fixtureRoot) => {
			const failures = await checkWorkbenchBoundaries(fixtureRoot);
			assert.deepEqual(failures, [
				"apps/workbench/src/main/services/bad-electron.ts: electron/main imports are only allowed in the Electron bootstrap or adapters"
			]);
		}
	);
});

test("rejects packages importing apps/workbench", async () => {
	await withWorkbenchFixture(
		"packages/example/src/index.ts",
		'import { WorkbenchLive } from "../../../apps/workbench/src/main/workbench-live.js";\n',
		async (fixtureRoot) => {
			const failures = await checkWorkbenchBoundaries(fixtureRoot);
			assert.deepEqual(failures, [
				"packages/example/src/index.ts: packages must not import apps/workbench"
			]);
		}
	);
});
