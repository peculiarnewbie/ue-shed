#pragma once

#include "Kismet/BlueprintFunctionLibrary.h"
#include "UEShedCoreLibrary.generated.h"

UCLASS()
class UESHEDCORE_API UUEShedCoreLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "UE Shed")
	static void GetCapabilityManifest(FString& ResultJson);
};
