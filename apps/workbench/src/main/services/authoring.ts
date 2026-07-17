import {
	AuthoringFilePicker,
	AuthoringFilePickerError,
	AuthoringClientLive,
	ShedAuthoring,
	ShedAuthoringLive,
	ShedAuthoringSessionsLive,
	ShedHostConfiguration,
	makeShedHostConfiguration,
	makeShedAuthoringTestLayer,
	type ShedAuthoringShape
} from "@ue-shed/host";
import { AuthoringClient } from "@ue-shed/authoring-sdk";
import { Effect, Layer } from "effect";
import { ElectronDialog } from "../adapters/electron-dialog.js";
import { WorkbenchConfiguration } from "../workbench-config.js";

export { sessionView } from "@ue-shed/host";
export { ShedAuthoring as WorkbenchAuthoring } from "@ue-shed/host";
export type WorkbenchAuthoringShape = ShedAuthoringShape;

const WorkbenchShedHostConfigurationLive = Layer.effect(
	ShedHostConfiguration,
	Effect.map(WorkbenchConfiguration, (configuration) =>
		makeShedHostConfiguration({
			authoringAsset: configuration.authoringAsset,
			project: configuration.project,
			remoteControlEndpoint: configuration.remoteControlEndpoint
		})
	)
);

const WorkbenchAuthoringFilePickerLive = Layer.effect(
	AuthoringFilePicker,
	Effect.map(ElectronDialog, (dialog) =>
		AuthoringFilePicker.of({
			chooseFile: Effect.fn("Workbench.AuthoringFilePicker.chooseFile")((options) =>
				dialog
					.chooseFile({
						filters: [{ extensions: options.extensions, name: "Unreal saved assets" }],
						title: options.title
					})
					.pipe(
						Effect.mapError(
							(cause) =>
								new AuthoringFilePickerError({
									cause,
									message: cause.message,
									recovery: cause.recovery
								})
						)
					)
			)
		})
	)
);

export const WorkbenchAuthoringSessionsLive = ShedAuthoringSessionsLive.pipe(
	Layer.provide(WorkbenchShedHostConfigurationLive)
);

export const WorkbenchAuthoringLive = ShedAuthoringLive.pipe(
	Layer.provide(WorkbenchShedHostConfigurationLive),
	Layer.provide(WorkbenchAuthoringFilePickerLive)
);

export function makeWorkbenchAuthoringTestLayer(
	service: WorkbenchAuthoringShape
): Layer.Layer<ShedAuthoring | AuthoringClient> {
	const shedAuthoring = makeShedAuthoringTestLayer(service);
	return Layer.merge(shedAuthoring, AuthoringClientLive.pipe(Layer.provide(shedAuthoring)));
}
