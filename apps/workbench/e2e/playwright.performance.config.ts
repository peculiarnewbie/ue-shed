import { defineConfig } from "@playwright/test";

/** Timing-sensitive Observatory Canvas bench; invoked by `pnpm benchmark:observatory`. */
export default defineConfig({
	expect: { timeout: 10_000 },
	forbidOnly: true,
	fullyParallel: false,
	outputDir: "../../../test-results/workbench-observatory-performance",
	reporter: "list",
	testDir: ".",
	testMatch: "observatory-performance.e2e.ts",
	timeout: 300_000,
	workers: 1,
	use: {
		browserName: "chromium"
	}
});
