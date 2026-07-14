import { spawnSync } from "node:child_process";
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
const workbenchOnly = process.argv.includes("--workbench-only");
const remoteControlEndpoint =
	process.env.UE_SHED_REMOTE_CONTROL_ENDPOINT ?? "http://127.0.0.1:30001";
const commandNeedsShell =
	process.platform === "win32" && (!pnpmScript || /\.(?:cmd|bat)$/i.test(pnpmScript));
const environment = {
	...process.env,
	UE_SHED_PROJECT_ROOT: process.env.UE_SHED_PROJECT_ROOT ?? fixtureRoot,
	UE_SHED_TEXTURE_AUDIT_RULES: process.env.UE_SHED_TEXTURE_AUDIT_RULES ?? rules,
	UE_SHED_UASSET_EXECUTABLE: ensureUassetExecutable(process.env)
};

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

async function remoteControlAvailable() {
	try {
		const response = await fetch(new URL("/remote/info", remoteControlEndpoint), {
			signal: AbortSignal.timeout(750)
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function waitForRemoteControl() {
	const deadline = Date.now() + 180_000;
	while (Date.now() < deadline) {
		if (await remoteControlAvailable()) return;
		await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
	}
	throw new Error(
		`The fixture launched, but Remote Control did not become ready at ${remoteControlEndpoint} ` +
			"within three minutes. " +
			"Check the Unreal process and Saved/Logs/UEShedFixture.log."
	);
}

run(["--filter", "@ue-shed/workbench", "build"]);
if (!buildOnly && !workbenchOnly) {
	if (!(await remoteControlAvailable())) {
		console.log("[showcase] Preparing and launching the Unreal fixture…");
		run(["run", "fixture:launch"]);
		console.log(`[showcase] Waiting for fixture Remote Control at ${remoteControlEndpoint}…`);
		await waitForRemoteControl();
	}
	console.log("[showcase] Unreal fixture is ready.");
}
if (!buildOnly) run(["--filter", "@ue-shed/workbench", "start"]);
