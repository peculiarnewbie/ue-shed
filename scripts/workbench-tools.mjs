import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureUassetExecutable } from "./native-tools.mjs";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const workbenchRoot = join(repositoryRoot, "apps", "workbench");

const fixtureRoot = join(repositoryRoot, "fixtures", "unreal-project");
const textureRules = join(fixtureRoot, "FixtureSource", "Audits", "texture-rules.json");
const authoringAsset = join(fixtureRoot, "Content", "Fixture", "Authoring", "DT_Scalars.uasset");

async function portAvailable(port) {
	return new Promise((resolveAvailable) => {
		const server = createServer();
		server.unref();
		server.once("error", () => resolveAvailable(false));
		server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailable(true)));
	});
}

async function remoteControlEndpoint(environment) {
	if (environment.UE_SHED_REMOTE_CONTROL_ENDPOINT) {
		return environment.UE_SHED_REMOTE_CONTROL_ENDPOINT;
	}
	for (let port = 30_001; port <= 30_019; port += 2) {
		if ((await portAvailable(port)) && (await portAvailable(port + 1))) {
			return `http://127.0.0.1:${port}`;
		}
	}
	throw new Error("Could not reserve a Remote Control port between 30001 and 30020.");
}

export async function createWorkbenchEnvironment(environment = process.env) {
	return {
		...environment,
		UE_SHED_PROJECT_NAME: environment.UE_SHED_PROJECT_NAME ?? "UEShedFixture",
		UE_SHED_PROJECT_ROOT: environment.UE_SHED_PROJECT_ROOT ?? fixtureRoot,
		UE_SHED_AUTHORING_ASSET: environment.UE_SHED_AUTHORING_ASSET ?? authoringAsset,
		UE_SHED_REMOTE_CONTROL_ENDPOINT: await remoteControlEndpoint(environment),
		UE_SHED_REPOSITORY_ROOT: repositoryRoot,
		UE_SHED_TEXTURE_AUDIT_RULES: environment.UE_SHED_TEXTURE_AUDIT_RULES ?? textureRules,
		UE_SHED_UASSET_EXECUTABLE: ensureUassetExecutable(environment)
	};
}

export function runPnpm(args, environment) {
	const pnpmScript = environment.npm_execpath;
	const pnpmScriptIsJavaScript = pnpmScript ? /\.(?:c|m)?js$/i.test(pnpmScript) : false;
	const command = pnpmScriptIsJavaScript
		? process.execPath
		: (pnpmScript ?? (process.platform === "win32" ? "pnpm.cmd" : "pnpm"));
	const commandPrefix = pnpmScriptIsJavaScript && pnpmScript ? [pnpmScript] : [];
	const commandNeedsShell =
		process.platform === "win32" && (!pnpmScript || /\.(?:cmd|bat)$/i.test(pnpmScript));
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
