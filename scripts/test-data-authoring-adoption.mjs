import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(repositoryRoot, "extensions", "data-authoring", "adoption.manifest.json");
const targetRoot = join(repositoryRoot, "test-results", "data-authoring-adoption");

function fail(message) {
	throw new Error(`Data Authoring adoption conformance failed: ${message}`);
}

function runPnpm(args) {
	const pnpmScript = process.env.npm_execpath;
	const pnpmScriptIsJavaScript = pnpmScript ? /\.(?:c|m)?js$/i.test(pnpmScript) : false;
	const command = pnpmScriptIsJavaScript
		? process.execPath
		: (pnpmScript ?? (process.platform === "win32" ? "pnpm.cmd" : "pnpm"));
	const commandPrefix = pnpmScriptIsJavaScript && pnpmScript ? [pnpmScript] : [];
	const result = spawnSync(command, [...commandPrefix, ...args], {
		cwd: targetRoot,
		env: { ...process.env, CI: "1" },
		shell: process.platform === "win32" && (!pnpmScript || /\.(?:cmd|bat)$/i.test(pnpmScript)),
		stdio: "inherit",
		windowsHide: true
	});
	if (result.error) throw result.error;
	if (result.status !== 0) fail(`pnpm ${args.join(" ")} exited with ${result.status ?? 1}`);
}

async function copyEntry(entry) {
	const source = resolve(repositoryRoot, entry);
	const relativeSource = relative(repositoryRoot, source);
	if (relativeSource.startsWith("..")) fail(`copy entry escapes the repository: ${entry}`);
	const destination = join(targetRoot, entry);
	await mkdir(dirname(destination), { recursive: true });
	await cp(source, destination, { recursive: (await stat(source)).isDirectory() });
}

async function sourceFiles(root) {
	const entries = await readdir(root, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (["node_modules", "dist"].includes(entry.name)) continue;
		const path = join(root, entry.name);
		if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
		else if (/\.(?:json|ts|tsx|js|mjs|css|html|yaml)$/i.test(entry.name)) files.push(path);
	}
	return files;
}

function digest(value) {
	return createHash("sha256").update(value).digest("hex");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1 || manifest.slice !== "data-authoring") {
	fail("manifest identity or schema version is invalid");
}
if (!Array.isArray(manifest.copy?.kernel) || !Array.isArray(manifest.copy?.owned)) {
	fail("manifest copy closure is missing");
}

await rm(targetRoot, { force: true, recursive: true });
await mkdir(targetRoot, { recursive: true });
await cp(resolve(repositoryRoot, manifest.consumerTemplate), targetRoot, { recursive: true });
for (const entry of [...manifest.copy.kernel, ...manifest.copy.owned]) await copyEntry(entry);

await writeFile(
	join(targetRoot, "ue-shed-provenance.json"),
	`${JSON.stringify({ manifest: "data-authoring@1", source: "ue-shed" }, null, 2)}\n`
);

const copiedSources = await sourceFiles(targetRoot);
for (const path of copiedSources) {
	const content = await readFile(path, "utf8");
	if (/apps[\\/]workbench|window\.ueShed|from ["']electron/.test(content)) {
		fail(`Workbench or Electron authority leaked into ${relative(targetRoot, path)}`);
	}
}

runPnpm(["install", "--offline", "--ignore-scripts", "--frozen-lockfile=false"]);
runPnpm(["--filter", "foreign-authoring-host", "build"]);

const cssPath = join(targetRoot, "app", "dist", "stylex.css");
const initialCss = await readFile(cssPath, "utf8");
if (initialCss.length === 0) fail("production stylex.css is empty");

const themePath = join(targetRoot, "packages", "ui-theme", "src", "themes.stylex.ts");
const initialTheme = await readFile(themePath, "utf8");
const divergentTheme = initialTheme.replace('colorAccent: "#b7e26d"', 'colorAccent: "#ff9f43"');
if (divergentTheme === initialTheme) fail("could not find the copied accent token to diverge");
await writeFile(themePath, divergentTheme);

runPnpm(["--filter", "foreign-authoring-host", "build"]);
const divergentCss = await readFile(cssPath, "utf8");
if (!divergentCss.includes("#ff9f43")) fail("divergent accent is absent from production CSS");
if (digest(divergentCss) === digest(initialCss))
	fail("token divergence did not change production CSS");

console.log(
	`Data Authoring adoption conformance passed: ${copiedSources.length} source files, ` +
		`${initialCss.length} bytes of StyleX CSS, token divergence verified.`
);
