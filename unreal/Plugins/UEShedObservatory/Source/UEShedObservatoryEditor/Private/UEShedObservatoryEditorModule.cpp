#include "Modules/ModuleInterface.h"
#include "Modules/ModuleManager.h"
#include "UEShedObservatoryStream.h"

class FUEShedObservatoryEditorModule final : public IModuleInterface
{
public:
	virtual void StartupModule() override
	{
		StreamService = MakeUnique<FUEShedObservatoryStreamService>();
	}

	virtual void ShutdownModule() override
	{
		StreamService.Reset();
	}

private:
	TUniquePtr<FUEShedObservatoryStreamService> StreamService;
};

IMPLEMENT_MODULE(FUEShedObservatoryEditorModule, UEShedObservatoryEditor)
