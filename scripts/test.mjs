import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ensureUassetExecutable, repositoryRoot } from "./native-tools.mjs";

const executable = ensureUassetExecutable();
const vitest = join(repositoryRoot, "node_modules", "vitest", "vitest.mjs");
const result = spawnSync(process.execPath, [vitest, "run", ...process.argv.slice(2)], {
	cwd: repositoryRoot,
	env: {
		...process.env,
		UE_SHED_UASSET_EXECUTABLE: executable
	},
	stdio: "inherit",
	windowsHide: true
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
