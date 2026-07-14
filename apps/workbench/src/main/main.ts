import {
	configureCameras,
	getCameraStatus,
	openCameraFeedServer,
	type CameraFeedServer,
	type CameraFrame
} from "@ue-shed/cameras";
import {
	readLiveTexturePreview,
	scanTextureAudit,
	type TexturePreviewResult,
	type TextureAuditRunResult,
	type TextureAuditScanError
} from "@ue-shed/asset-audits";
import { decodeCompanionCapabilityManifest, type CameraScheduleConfig } from "@ue-shed/protocol";
import { Effect } from "effect";
import {
	BrowserWindow,
	app,
	dialog,
	ipcMain,
	type BrowserWindow as BrowserWindowInstance
} from "electron/main";
import { clipboard } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { FixtureLaunchResult, ShowcaseContext } from "./preload.js";

const remoteControlEndpoint =
	process.env.UE_SHED_REMOTE_CONTROL_ENDPOINT ?? "http://127.0.0.1:30001";
let feed: CameraFeedServer | undefined;
let window: BrowserWindowInstance | undefined;
const pendingPresentationFrames = new Map<number, CameraFrame>();
let presentationTimer: NodeJS.Timeout | undefined;
let presentationFramesSent = 0;
let presentationReplacements = 0;
let presentationBudgetMbPerSecond = 80;
let nextPresentationAt = 0;
let fixtureLaunch: Promise<FixtureLaunchResult> | undefined;

function unavailablePreview(
	objectPath: string,
	message: string,
	reason: "invalid_request" | "not_connected" = "not_connected"
): TexturePreviewResult {
	return {
		contract: { name: "texture-preview", version: { major: 1, minor: 0 } },
		status: "unavailable",
		objectPath,
		reason,
		message,
		retrySafe: reason === "not_connected"
	};
}

async function remoteControlAvailable(): Promise<boolean> {
	try {
		const response = await fetch(new URL("/remote/object/call", remoteControlEndpoint), {
			body: JSON.stringify({
				generateTransaction: false,
				functionName: "GetCapabilityManifest",
				objectPath: "/Script/UEShedCore.Default__UEShedCoreLibrary",
				parameters: {}
			}),
			headers: { "content-type": "application/json" },
			method: "PUT",
			signal: AbortSignal.timeout(1_500)
		});
		if (!response.ok) return false;
		const envelope: unknown = await response.json();
		if (
			typeof envelope !== "object" ||
			envelope === null ||
			!("ResultJson" in envelope) ||
			typeof envelope.ResultJson !== "string"
		) {
			return false;
		}
		const manifest = decodeCompanionCapabilityManifest(JSON.parse(envelope.ResultJson));
		const expectedProject = process.env.UE_SHED_PROJECT_NAME;
		return (
			manifest.producerKind === "unreal_editor" &&
			(!expectedProject || manifest.projectName === expectedProject)
		);
	} catch {
		return false;
	}
}

async function launchConfiguredFixture(): Promise<FixtureLaunchResult> {
	if (await remoteControlAvailable()) return { status: "ready" };
	const repositoryRoot = process.env.UE_SHED_REPOSITORY_ROOT;
	const launchScript = repositoryRoot
		? join(repositoryRoot, "scripts", "unreal-fixture.mjs")
		: undefined;
	if (!launchScript || !existsSync(launchScript)) {
		return {
			status: "failed",
			message: "This Workbench session has no source-checkout fixture launcher.",
			recovery: "Start Workbench with pnpm showcase from the UE Shed repository."
		};
	}

	const launched = await new Promise<FixtureLaunchResult>((resolveLaunch) => {
		const child = spawn(process.execPath, [launchScript, "launch"], {
			cwd: repositoryRoot,
			env: process.env,
			stdio: ["ignore", "ignore", "pipe"],
			windowsHide: true
		});
		let stderr = "";
		child.stderr?.setEncoding("utf8");
		child.stderr?.on("data", (chunk: string) => {
			stderr = (stderr + chunk).slice(-16_384);
		});
		child.once("error", (cause) =>
			resolveLaunch({
				status: "failed",
				message: `Could not start the fixture launcher: ${String(cause)}`,
				recovery: "Verify the configured Unreal installation and source checkout."
			})
		);
		child.once("exit", (code) => {
			if (code === 0) resolveLaunch({ status: "ready" });
			else {
				resolveLaunch({
					status: "failed",
					message:
						stderr.trim() || `Fixture launcher exited with code ${code ?? "unknown"}.`,
					recovery: "Check the Unreal build output and Saved/Logs/UEShedFixture.log."
				});
			}
		});
	});
	if (launched.status === "failed") return launched;

	const deadline = Date.now() + 180_000;
	while (Date.now() < deadline) {
		if (await remoteControlAvailable()) return { status: "ready" };
		await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
	}
	return {
		status: "failed",
		message: "Unreal launched, but Remote Control did not become ready within three minutes.",
		recovery: "Check the Unreal process and Saved/Logs/UEShedFixture.log."
	};
}

ipcMain.handle("fixture:launch", async (): Promise<FixtureLaunchResult> => {
	fixtureLaunch ??= launchConfiguredFixture().finally(() => {
		fixtureLaunch = undefined;
	});
	return fixtureLaunch;
});

ipcMain.handle("showcase:context", (): ShowcaseContext => {
	const projectRoot = process.env.UE_SHED_PROJECT_ROOT;
	const ruleFile = process.env.UE_SHED_TEXTURE_AUDIT_RULES;
	const readerExecutable = process.env.UE_SHED_UASSET_EXECUTABLE;
	return {
		authoringCommand:
			"pnpm ue-shed authoring inspect fixtures\\unreal-project\\Content\\Fixture\\Authoring\\DT_Scalars.uasset",
		fixtureConfigured: Boolean(
			projectRoot && ruleFile && existsSync(projectRoot) && existsSync(ruleFile)
		),
		...(projectRoot ? { projectRoot } : {}),
		reader: readerExecutable ? "configured" : "path",
		...(ruleFile ? { ruleFile } : {})
	};
});

ipcMain.handle("showcase:copy", (_event, value: unknown): void => {
	if (typeof value !== "string" || value.length > 4_096) {
		throw new TypeError("Copy text must be a string no longer than 4,096 characters");
	}
	clipboard.writeText(value);
});

function schedulePresentationFrame() {
	if (presentationTimer || pendingPresentationFrames.size === 0) return;
	const delay = Math.max(0, nextPresentationAt - performance.now());
	presentationTimer = setTimeout(flushPresentationFrame, delay);
}

function flushPresentationFrame() {
	presentationTimer = undefined;
	const frame = pendingPresentationFrames.values().next().value;
	if (!frame) return;
	pendingPresentationFrames.delete(frame.cameraIndex);
	window?.webContents.send("camera:frame", {
		...frame,
		pixels: frame.pixels,
		sequence: frame.sequence.toString()
	});
	presentationFramesSent += 1;
	const now = performance.now();
	nextPresentationAt =
		Math.max(now, nextPresentationAt) +
		(frame.pixels.byteLength / (presentationBudgetMbPerSecond * 1_000_000)) * 1_000;
	schedulePresentationFrame();
}

async function createWindow() {
	feed = await Effect.runPromise(openCameraFeedServer());
	window = new BrowserWindow({
		backgroundColor: "#0b0d0d",
		height: 940,
		minHeight: 720,
		minWidth: 1120,
		show: false,
		title: "UE Shed Workbench",
		webPreferences: {
			contextIsolation: true,
			preload: join(import.meta.dirname, "preload.cjs"),
			sandbox: true
		},
		width: 1540
	});
	feed.subscribe((frame) => {
		if (pendingPresentationFrames.has(frame.cameraIndex)) presentationReplacements += 1;
		pendingPresentationFrames.set(frame.cameraIndex, frame);
		schedulePresentationFrame();
	});
	window.once("ready-to-show", () => window?.show());
	await window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}

async function runTextureScan(
	projectRoot: string,
	ruleFile: string
): Promise<TextureAuditRunResult> {
	try {
		const report = await Effect.runPromise(scanTextureAudit({ projectRoot, ruleFile }));
		return { status: "completed", report };
	} catch (cause) {
		const error = cause as Partial<TextureAuditScanError>;
		return {
			status: "failed",
			error: {
				code: error.code ?? "scan_failed",
				message: error.message ?? "Texture audit failed.",
				recovery: error.recovery ?? "Check the project, rule file, and saved-asset reader.",
				retrySafe: error.retrySafe ?? true
			}
		};
	}
}

ipcMain.handle(
	"asset-audits:textures:configured-scan",
	async (): Promise<TextureAuditRunResult> => {
		const projectRoot = process.env.UE_SHED_PROJECT_ROOT;
		const ruleFile = process.env.UE_SHED_TEXTURE_AUDIT_RULES;
		if (!projectRoot || !ruleFile) return { status: "not_configured" };
		return runTextureScan(projectRoot, ruleFile);
	}
);

ipcMain.handle(
	"asset-audits:textures:preview",
	async (_event, objectPath: unknown): Promise<TexturePreviewResult> => {
		if (
			typeof objectPath !== "string" ||
			objectPath.length === 0 ||
			objectPath.length > 1_024 ||
			!objectPath.startsWith("/Game/")
		) {
			return unavailablePreview(
				"",
				"Texture preview requires a valid /Game object path.",
				"invalid_request"
			);
		}
		try {
			return await Effect.runPromise(
				readLiveTexturePreview({ endpoint: remoteControlEndpoint, objectPath })
			);
		} catch (cause) {
			return unavailablePreview(
				objectPath,
				`Live Unreal preview unavailable: ${String(cause)}`
			);
		}
	}
);

ipcMain.handle(
	"asset-audits:textures:choose-and-scan",
	async (): Promise<TextureAuditRunResult> => {
		const projectChoice = await dialog.showOpenDialog(window!, {
			properties: ["openDirectory"],
			title: "Choose an Unreal project"
		});
		const projectRoot = projectChoice.filePaths[0];
		if (projectChoice.canceled || !projectRoot) return { status: "cancelled" };
		let ruleFile = process.env.UE_SHED_TEXTURE_AUDIT_RULES;
		if (!ruleFile) {
			const ruleChoice = await dialog.showOpenDialog(window!, {
				filters: [{ name: "JSON rule set", extensions: ["json"] }],
				properties: ["openFile"],
				title: "Choose texture audit rules"
			});
			ruleFile = ruleChoice.filePaths[0];
			if (ruleChoice.canceled || !ruleFile) return { status: "cancelled" };
		}
		return runTextureScan(projectRoot, ruleFile);
	}
);

ipcMain.handle("camera:metrics", () => {
	const metrics = feed?.getMetrics();
	if (!metrics) return undefined;
	const processMetrics = app.getAppMetrics();
	const electronPrivateMemoryMb =
		processMetrics.reduce(
			(sum, metric) => sum + (metric.memory.privateBytes ?? metric.memory.workingSetSize),
			0
		) / 1024;
	const gpuProcessPrivateMemoryMb =
		(() => {
			const memory = processMetrics.find((metric) => metric.type === "GPU")?.memory;
			return memory ? (memory.privateBytes ?? memory.workingSetSize) : 0;
		})() / 1024;
	return {
		...metrics,
		electronPrivateMemoryMb,
		gpuProcessPrivateMemoryMb,
		presentationBudgetMbPerSecond,
		presentationFramesSent,
		presentationReplacements
	};
});
ipcMain.handle("camera:presentation-budget", (_event, value: unknown) => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new TypeError("Presentation budget must be a finite number");
	}
	presentationBudgetMbPerSecond = Math.min(500, Math.max(25, value));
	return presentationBudgetMbPerSecond;
});
ipcMain.handle("camera:status", () => getCameraStatus(remoteControlEndpoint));
ipcMain.handle("camera:configure", (_event, config: CameraScheduleConfig) =>
	configureCameras(remoteControlEndpoint, config)
);

app.whenReady()
	.then(createWindow)
	.catch((error) => {
		console.error(error);
		app.quit();
	});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
	void feed?.close();
});
