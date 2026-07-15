import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoots = ["apps", "packages", "extensions"];
const catalogOwned = new Set([
	"@effect/vitest",
	"@stylexjs/rollup-plugin",
	"@stylexjs/stylex",
	"effect",
	"solid-js",
	"vite-plugin-solid"
]);

const legacyBaselines = {
	"Effect.runPromise": {
		"apps/cli/src/index.ts": 68,
		"apps/workbench/src/main/main.ts": 42,
		"apps/workbench/src/renderer/asset-audits-client.ts": 2,
		"apps/workbench/src/renderer/authoring-client.ts": 9,
		"apps/workbench/src/renderer/game-text-client.ts": 1,
		"apps/workbench/src/renderer/map-review-client.ts": 5,
		"packages/cameras/src/index.ts": 4,
		"packages/cameras/src/review-authoring-live.ts": 1
	},
	"Effect.runSync": {
		"apps/cli/src/index.ts": 1,
		"apps/workbench/src/main/main.ts": 1
	},
	"Promise<": {
		"apps/cli/src/index.ts": 5,
		"apps/workbench/src/main/main.ts": 32,
		"apps/workbench/src/main/preload.ts": 28,
		"apps/workbench/src/renderer/global.d.ts": 28,
		"apps/workbench/src/renderer/asset-audits-client.ts": 2,
		"apps/workbench/src/renderer/authoring-client.ts": 2,
		"apps/workbench/src/renderer/game-text-client.ts": 1,
		"extensions/asset-audits/src/texture-audit-route.tsx": 4,
		"extensions/camera-review/src/map-review-authoring.tsx": 1,
		"extensions/camera-review/src/map-review-client.ts": 5,
		"extensions/data-authoring/src/authoring-route.tsx": 11,
		"extensions/data-authoring/src/authoring-table-grid.tsx": 1,
		"extensions/game-text/src/game-text-route.tsx": 2,
		"packages/cameras/src/index.ts": 5,
		"packages/cameras/src/review-authoring-live.ts": 1,
		"packages/cameras/src/review-capture.ts": 1,
		"packages/cameras/src/review-repository.ts": 1,
		"packages/unreal-assets/src/index.ts": 1
	},
	"process.env": {
		"apps/workbench/src/main/main.ts": 20,
		"packages/unreal-assets/src/index.ts": 1
	},
	"fetch(": {
		"apps/workbench/src/main/main.ts": 2,
		"packages/asset-audits/src/live.ts": 1,
		"packages/cameras/src/index.ts": 1,
		"packages/cameras/src/review-authoring-live.ts": 1,
		"packages/cameras/src/review-live.ts": 1,
		"packages/unreal-connection/src/index.ts": 1
	}
};

async function filesUnder(root, directory) {
	const absolute = join(root, directory);
	const entries = await readdir(absolute, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === "e2e") continue;
		const path = join(absolute, entry.name);
		if (entry.isDirectory()) files.push(...(await filesUnder(root, relative(root, path))));
		else files.push(path);
	}
	return files;
}

function count(text, needle) {
	let total = 0;
	let offset = 0;
	while ((offset = text.indexOf(needle, offset)) !== -1) {
		total += 1;
		offset += needle.length;
	}
	return total;
}

export async function checkSourceBaselines(root, baselines = legacyBaselines) {
	const failures = [];
	const sourceFiles = (
		await Promise.all(sourceRoots.map((directory) => filesUnder(root, directory)))
	).flat();
	for (const absolute of sourceFiles) {
		if (!/\.tsx?$/.test(absolute) || /\.(?:integration\.)?test\.tsx?$/.test(absolute)) continue;
		const path = relative(root, absolute).replaceAll("\\", "/");
		const text = await readFile(absolute, "utf8");
		for (const [needle, allowedByPath] of Object.entries(baselines)) {
			const actual = count(text, needle);
			const allowed = allowedByPath[path] ?? 0;
			if (actual > allowed) {
				failures.push(
					`${path}: ${needle} count ${actual} exceeds migration baseline ${allowed}`
				);
			}
		}
	}
	return failures;
}

export async function checkCatalogUsage(root) {
	const failures = [];
	const workspace = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
	for (const dependency of catalogOwned) {
		const escaped = dependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (!new RegExp(`^[ \\t]+["']?${escaped}["']?:`, "m").test(workspace)) {
			failures.push(`pnpm-workspace.yaml: missing catalog entry for ${dependency}`);
		}
	}
	if (!/^\s*["']?effect["']?:\s*["']?4\./m.test(workspace)) {
		failures.push("pnpm-workspace.yaml: Effect catalog entry must select v4");
	}

	const manifests = [join(root, "package.json")];
	for (const sourceRoot of sourceRoots) {
		for (const file of await filesUnder(root, sourceRoot)) {
			if (file.endsWith("package.json")) manifests.push(file);
		}
	}
	for (const manifestPath of manifests) {
		const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
		for (const section of [
			"dependencies",
			"devDependencies",
			"peerDependencies",
			"optionalDependencies"
		]) {
			for (const [dependency, version] of Object.entries(manifest[section] ?? {})) {
				if (catalogOwned.has(dependency) && version !== "catalog:") {
					failures.push(
						`${relative(root, manifestPath)}: ${section}.${dependency} must use catalog:`
					);
				}
			}
		}
	}
	return failures;
}

export async function checkArchitecture(root = repositoryRoot) {
	return [...(await checkCatalogUsage(root)), ...(await checkSourceBaselines(root))];
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	const failures = await checkArchitecture();
	if (failures.length > 0) {
		process.stderr.write(
			`Effect architecture check failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`
		);
		process.exitCode = 1;
	} else {
		process.stdout.write("Effect architecture check passed.\n");
	}
}
