import type { CameraFeedMetrics, CameraFrame } from "@ue-shed/cameras";
import type { CameraScheduleConfig, CameraStatus } from "@ue-shed/protocol";
import { contextBridge, ipcRenderer } from "electron";

export interface RendererCameraFrame extends Omit<CameraFrame, "pixels" | "sequence"> {
	readonly pixels: Uint8Array;
	readonly sequence: string;
}

export interface WorkbenchCameraMetrics extends CameraFeedMetrics {
	readonly electronPrivateMemoryMb: number;
	readonly gpuProcessPrivateMemoryMb: number;
	readonly presentationBudgetMbPerSecond: number;
	readonly presentationFramesSent: number;
	readonly presentationReplacements: number;
}

export interface ShowcaseContext {
	readonly fixtureConfigured: boolean;
	readonly projectRoot?: string;
	readonly reader: "configured" | "path";
	readonly ruleFile?: string;
}

export type FixtureLaunchResult =
	| { readonly status: "ready" }
	| {
			readonly status: "failed";
			readonly message: string;
			readonly recovery: string;
	  };

contextBridge.exposeInMainWorld("ueShed", {
	showcase: {
		context: (): Promise<ShowcaseContext> => ipcRenderer.invoke("showcase:context")
	},
	assetAudits: {
		loadConfiguredProject: (): Promise<unknown> =>
			ipcRenderer.invoke("asset-audits:textures:configured-scan"),
		chooseProjectAndScan: (): Promise<unknown> =>
			ipcRenderer.invoke("asset-audits:textures:choose-and-scan"),
		preview: (objectPath: string): Promise<unknown> =>
			ipcRenderer.invoke("asset-audits:textures:preview", objectPath)
	},
	authoring: {
		loadConfiguredTable: (): Promise<unknown> =>
			ipcRenderer.invoke("authoring:configured-table"),
		chooseTable: (): Promise<unknown> => ipcRenderer.invoke("authoring:choose-table")
	},
	fixture: {
		launch: (): Promise<FixtureLaunchResult> => ipcRenderer.invoke("fixture:launch")
	},
	configure: (config: CameraScheduleConfig): Promise<CameraStatus> =>
		ipcRenderer.invoke("camera:configure", config),
	getMetrics: (): Promise<WorkbenchCameraMetrics> => ipcRenderer.invoke("camera:metrics"),
	getStatus: (): Promise<CameraStatus> => ipcRenderer.invoke("camera:status"),
	setPresentationBudget: (megabytesPerSecond: number): Promise<number> =>
		ipcRenderer.invoke("camera:presentation-budget", megabytesPerSecond),
	onFrame: (listener: (frame: RendererCameraFrame) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, frame: RendererCameraFrame) =>
			listener(frame);
		ipcRenderer.on("camera:frame", handler);
		return () => ipcRenderer.removeListener("camera:frame", handler);
	}
});
