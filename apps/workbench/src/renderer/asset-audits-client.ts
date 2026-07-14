import {
	decodeTexturePreviewResult,
	decodeTextureAuditRunResult,
	type TexturePreviewResult,
	type TextureAuditRunResult
} from "@ue-shed/asset-audits/browser";
import type { TextureAuditClient } from "@ue-shed/extension-asset-audits";

function decodeResult(value: unknown): TextureAuditRunResult {
	try {
		return decodeTextureAuditRunResult(value);
	} catch (cause) {
		return {
			status: "failed",
			error: {
				code: "contract_failure",
				message: `Workbench received an invalid texture audit result: ${String(cause)}`,
				recovery: "Restart Workbench. If the problem persists, verify package versions.",
				retrySafe: true
			}
		};
	}
}

function decodePreview(value: unknown): TexturePreviewResult {
	return decodeTexturePreviewResult(value);
}

export const assetAuditsClient: TextureAuditClient = {
	loadConfiguredProject: async () =>
		decodeResult(await window.ueShed.assetAudits.loadConfiguredProject()),
	chooseProjectAndScan: async () =>
		decodeResult(await window.ueShed.assetAudits.chooseProjectAndScan()),
	loadPreview: async (objectPath) =>
		decodePreview(await window.ueShed.assetAudits.preview(objectPath)),
	launchUnreal: () => window.ueShed.fixture.launch()
};
