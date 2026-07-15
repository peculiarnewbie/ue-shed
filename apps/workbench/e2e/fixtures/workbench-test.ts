import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, type ElectronApplication } from "@playwright/test";
import { _electron as electron } from "playwright";
import { WorkbenchPage } from "../pages/workbench-page.js";

interface WorkbenchFixtures {
	readonly workbench: WorkbenchPage;
}

const require = createRequire(import.meta.url);
const electronExecutable: unknown = require("electron");
const workbenchRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

if (typeof electronExecutable !== "string") {
	throw new TypeError("The Electron package did not resolve to an executable path");
}

async function closeApplication(application: ElectronApplication): Promise<void> {
	await application.close().catch(() => undefined);
}

export const test = base.extend<WorkbenchFixtures>({
	workbench: async ({ browserName: _browserName }, use, testInfo) => {
		if (!process.env.UE_SHED_UASSET_EXECUTABLE) {
			throw new Error("Launch Workbench E2E through pnpm test:e2e:workbench");
		}
		const environment = { ...process.env };
		delete environment.ELECTRON_RUN_AS_NODE;
		const application = await electron.launch({
			args: [workbenchRoot],
			cwd: workbenchRoot,
			env: {
				...environment,
				ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
			},
			executablePath: electronExecutable
		});
		const page = await application.firstWindow();
		const workbench = new WorkbenchPage(page);
		await application
			.context()
			.tracing.start({ screenshots: true, snapshots: true, sources: true });

		try {
			await use(workbench);
		} finally {
			const failed = testInfo.status !== testInfo.expectedStatus;
			if (failed) {
				await page.screenshot({
					fullPage: true,
					path: testInfo.outputPath("workbench.png")
				});
				await application
					.context()
					.tracing.stop({ path: testInfo.outputPath("trace.zip") });
			} else {
				await application.context().tracing.stop();
			}
			await closeApplication(application);
		}
	}
});

export { expect } from "@playwright/test";
