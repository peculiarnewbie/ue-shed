import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function ensureUassetExecutable(environment = process.env) {
	if (environment.UE_SHED_UASSET_EXECUTABLE) {
		return environment.UE_SHED_UASSET_EXECUTABLE;
	}

	const result = spawnSync("cargo", ["build", "--locked", "-p", "uasset-parser"], {
		cwd: repositoryRoot,
		env: environment,
		stdio: "inherit",
		windowsHide: true
	});
	if (result.error) {
		throw new Error(
			"Could not build the in-repo uasset parser. Install Rust 1.85 or newer, or set " +
				"UE_SHED_UASSET_EXECUTABLE to a compatible executable.",
			{ cause: result.error }
		);
	}
	if (result.status !== 0) {
		throw new Error(
			`Building the in-repo uasset parser failed with exit code ${result.status}.`
		);
	}

	const executable = join(
		repositoryRoot,
		"target",
		"debug",
		process.platform === "win32" ? "uasset.exe" : "uasset"
	);
	if (!existsSync(executable)) {
		throw new Error(
			`Cargo completed without producing the expected executable at ${executable}.`
		);
	}
	return executable;
}

export { repositoryRoot };
