import type { CameraScheduleConfig, CameraStatus } from "@ue-shed/protocol";
import type {
	RendererCameraFrame,
	FixtureLaunchResult,
	ShowcaseContext,
	WorkbenchCameraMetrics
} from "../main/preload.js";

declare global {
	interface Window {
		readonly ueShed: {
			readonly showcase: {
				readonly context: () => Promise<ShowcaseContext>;
			};
			readonly assetAudits: {
				readonly loadConfiguredProject: () => Promise<unknown>;
				readonly chooseProjectAndScan: () => Promise<unknown>;
				readonly preview: (objectPath: string) => Promise<unknown>;
			};
			readonly authoring: {
				readonly loadConfiguredTable: () => Promise<unknown>;
				readonly chooseTable: () => Promise<unknown>;
			};
			readonly fixture: {
				readonly launch: () => Promise<FixtureLaunchResult>;
			};
			readonly configure: (config: CameraScheduleConfig) => Promise<CameraStatus>;
			readonly getMetrics: () => Promise<WorkbenchCameraMetrics>;
			readonly getStatus: () => Promise<CameraStatus>;
			readonly onFrame: (listener: (frame: RendererCameraFrame) => void) => () => void;
			readonly setPresentationBudget: (megabytesPerSecond: number) => Promise<number>;
		};
	}
}

export {};
