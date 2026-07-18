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
	static void FocusActor(const FString& ActorId, bool BringToFront, FString& ResultJson);
};
