#include "Editor/EditorPerformanceSettings.h"
#include "Modules/ModuleManager.h"

/**
 * Keeps PIE ticking while a companion tool has foreground focus. The camera-load fixture is a
 * live-observation workload, so Unreal's default background throttle would otherwise stop its
 * mover actors and make the bridge look slow when it has no packets to present.
 */
class FUEShedFixtureEditorModule final : public IModuleInterface
{
public:
	virtual void StartupModule() override
	{
		GetMutableDefault<UEditorPerformanceSettings>()->bThrottleCPUWhenNotForeground = false;
	}
};

IMPLEMENT_MODULE(FUEShedFixtureEditorModule, UEShedFixtureEditor);
