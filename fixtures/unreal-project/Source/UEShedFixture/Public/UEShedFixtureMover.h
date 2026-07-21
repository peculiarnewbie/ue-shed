#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "UEShedFixtureMover.generated.h"

UENUM()
enum class EUEShedFixtureMotion : uint8
{
	/** Grounded cube — stays put. Matte slate material. */
	Stationary = 0,
	Orbit = 0 UMETA(Hidden, DisplayName = "Stationary (legacy)"),
	/** Airborne sphere — continuous flight path. Bright cyan material. */
	Flying = 1,
	PingPong = 1 UMETA(Hidden, DisplayName = "Flying (legacy)"),
	/** Mid-height cylinder — periodically hides and reappears. Amber material. */
	Intermittent = 2,
	FigureEight = 2 UMETA(Hidden, DisplayName = "Intermittent (legacy)")
};

UCLASS()
class UESHEDFIXTURE_API AUEShedFixtureMover : public AActor
{
	GENERATED_BODY()

public:
	AUEShedFixtureMover();
	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;

	/** Apply mesh + material that encode Motion. Call after changing Motion in tooling. */
	void ApplyVisualIdentity();

	UPROPERTY(EditAnywhere, Category = "Fixture")
	int32 LogicalIndex = 0;

	UPROPERTY(EditAnywhere, Category = "Fixture")
	EUEShedFixtureMotion Motion = EUEShedFixtureMotion::Stationary;

	UPROPERTY(EditAnywhere, Category = "Fixture")
	float Radius = 400.0f;

	UPROPERTY(EditAnywhere, Category = "Fixture")
	float Speed = 0.6f;

	/** Visible fraction of each intermittent cycle (0–1). */
	UPROPERTY(EditAnywhere, Category = "Fixture", meta = (ClampMin = "0.05", ClampMax = "0.95"))
	float IntermittentDutyCycle = 0.55f;

	/** Seconds for one full intermittent visible+hidden cycle. */
	UPROPERTY(EditAnywhere, Category = "Fixture", meta = (ClampMin = "0.5"))
	float IntermittentPeriod = 3.2f;

private:
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<class UStaticMeshComponent> Mesh;

	FVector Origin = FVector::ZeroVector;

	void SetIntermittentVisible(bool bVisible);
};

UCLASS()
class UESHEDFIXTURE_API AUEShedFixtureStationary final : public AUEShedFixtureMover
{
	GENERATED_BODY()

public:
	AUEShedFixtureStationary();
};

UCLASS()
class UESHEDFIXTURE_API AUEShedFixtureFlying final : public AUEShedFixtureMover
{
	GENERATED_BODY()

public:
	AUEShedFixtureFlying();
};

UCLASS()
class UESHEDFIXTURE_API AUEShedFixtureIntermittent final : public AUEShedFixtureMover
{
	GENERATED_BODY()

public:
	AUEShedFixtureIntermittent();
};
