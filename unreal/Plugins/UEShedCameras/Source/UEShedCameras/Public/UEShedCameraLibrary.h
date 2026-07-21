#pragma once

#include "Kismet/BlueprintFunctionLibrary.h"
#include "UEShedCameraLibrary.generated.h"

UCLASS()
class UESHEDCAMERAS_API UUEShedCameraLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "UE Shed|Cameras")
	static void GetStatus(FString& ResultJson);

	UFUNCTION(BlueprintCallable, Category = "UE Shed|Cameras")
	static void Configure(const FString& ConfigJson, FString& ResultJson);

	/** Spawn or replace the transient Map Review preview camera bank in the running PIE/Game world. */
	UFUNCTION(BlueprintCallable, Category = "UE Shed|Cameras")
	static void EnsureReviewPreviewSources(const FString& RequestJson, FString& ResultJson);

	/** Destroy transient review preview sources and rediscover placed cameras on the next tick. */
	UFUNCTION(BlueprintCallable, Category = "UE Shed|Cameras")
	static void ClearReviewPreviewSources(FString& ResultJson);
};
