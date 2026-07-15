import { createWorkbenchEnvironment, runPnpm } from "./workbench-tools.mjs";

const buildOnly = process.argv.includes("--build-only");
const environment = await createWorkbenchEnvironment();

runPnpm(["--filter", "@ue-shed/workbench", "build"], environment);
if (!buildOnly) runPnpm(["--filter", "@ue-shed/workbench", "start"], environment);
