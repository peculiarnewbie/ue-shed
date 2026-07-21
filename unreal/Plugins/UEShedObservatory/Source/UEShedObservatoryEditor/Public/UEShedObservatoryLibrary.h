#pragma once

#include "Kismet/BlueprintFunctionLibrary.h"
#include "UEShedObservatoryLibrary.generated.h"

UCLASS()
class UESHEDOBSERVATORYEDITOR_API UUEShedObservatoryLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "UE Shed|Observatory")
	static void GetActorSnapshot(FString& ResultJson);

	UFUNCTION(BlueprintCallable, Category = "UE Shed|Observatory")
	static void StartActorObservation(const FString& RequestJson, FString& ResultJson);

	UFUNCTION(BlueprintCallable, Category = "UE Shed|Observatory")
	static void StopActorObservation(FString& ResultJson);

	/** Changes sampling cadence without replacing the active stream session or named-pipe writer. */
	UFUNCTION(BlueprintCallable, Category = "UE Shed|Observatory")
	static void SetActorObservationCadence(const FString& RequestJson, FString& ResultJson);

	UFUNCTION(BlueprintCallable, Category = "UE Shed|Observatory")
	static void GetActorObservationStatus(FString& ResultJson);

	UFUNCTION(BlueprintCallable, Category = "UE Shed|Observatory")
	static void FocusActor(const FString& ActorId, bool BringToFront, FString& ResultJson);
};
