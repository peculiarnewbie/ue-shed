import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureUassetExecutable } from "./native-tools.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = join(repositoryRoot, "fixtures", "unreal-project");
const rules = join(fixtureRoot, "FixtureSource", "Audits", "texture-rules.json");
const pnpmScript = process.env.npm_execpath;
const pnpmScriptIsJavaScript = pnpmScript ? /\.(?:c|m)?js$/i.test(pnpmScript) : false;
const command = pnpmScriptIsJavaScript
	? process.execPath
	: (pnpmScript ?? (process.platform === "win32" ? "pnpm.cmd" : "pnpm"));
const commandPrefix = pnpmScriptIsJavaScript && pnpmScript ? [pnpmScript] : [];
const buildOnly = process.argv.includes("--build-only");
const commandNeedsShell =
	process.platform === "win32" && (!pnpmScript || /\.(?:cmd|bat)$/i.test(pnpmScript));
const environment = {
	...process.env,
	UE_SHED_PROJECT_NAME: process.env.UE_SHED_PROJECT_NAME ?? "UEShedFixture",
	UE_SHED_PROJECT_ROOT: process.env.UE_SHED_PROJECT_ROOT ?? fixtureRoot,
	UE_SHED_REPOSITORY_ROOT: repositoryRoot,
	UE_SHED_TEXTURE_AUDIT_RULES: process.env.UE_SHED_TEXTURE_AUDIT_RULES ?? rules,
	UE_SHED_UASSET_EXECUTABLE: ensureUassetExecutable(process.env)
};

async function firstAvailableRemoteControlEndpoint() {
	if (process.env.UE_SHED_REMOTE_CONTROL_ENDPOINT) {
		return process.env.UE_SHED_REMOTE_CONTROL_ENDPOINT;
	}
	const portAvailable = (port) =>
		new Promise((resolveAvailable) => {
			const server = createServer();
			server.unref();
			server.once("error", () => resolveAvailable(false));
			server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailable(true)));
		});
	for (let port = 30_001; port <= 30_019; port += 2) {
		if ((await portAvailable(port)) && (await portAvailable(port + 1))) {
			return `http://127.0.0.1:${port}`;
		}
	}
	throw new Error("Could not reserve a Remote Control port between 30001 and 30020.");
}

environment.UE_SHED_REMOTE_CONTROL_ENDPOINT = await firstAvailableRemoteControlEndpoint();

function run(args) {
	const result = spawnSync(command, [...commandPrefix, ...args], {
		cwd: repositoryRoot,
		env: environment,
		shell: commandNeedsShell,
		stdio: "inherit",
		windowsHide: true
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["--filter", "@ue-shed/workbench", "build"]);
if (!buildOnly) run(["--filter", "@ue-shed/workbench", "start"]);
