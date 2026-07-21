#include "UEShedFixtureMover.h"

#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "UObject/ConstructorHelpers.h"

#include UE_INLINE_GENERATED_CPP_BY_NAME(UEShedFixtureMover)

namespace
{
const TCHAR* MeshPathForMotion(const EUEShedFixtureMotion Motion)
{
	switch (Motion)
	{
	case EUEShedFixtureMotion::Flying:
		return TEXT("/Engine/BasicShapes/Sphere.Sphere");
	case EUEShedFixtureMotion::Intermittent:
		return TEXT("/Engine/BasicShapes/Cylinder.Cylinder");
	case EUEShedFixtureMotion::Stationary:
	default:
		return TEXT("/Engine/BasicShapes/Cube.Cube");
	}
}

FVector MeshScaleForMotion(const EUEShedFixtureMotion Motion)
{
	switch (Motion)
	{
	case EUEShedFixtureMotion::Flying:
		return FVector(1.1, 1.1, 1.1);
	case EUEShedFixtureMotion::Intermittent:
		return FVector(0.85, 0.85, 1.6);
	case EUEShedFixtureMotion::Stationary:
	default:
		return FVector(0.9, 0.9, 1.35);
	}
}

FLinearColor ColorForMotion(const EUEShedFixtureMotion Motion)
{
	switch (Motion)
	{
	case EUEShedFixtureMotion::Flying:
		// Bright cyan — readable against sky.
		return FLinearColor(0.12f, 0.78f, 0.92f, 1.0f);
	case EUEShedFixtureMotion::Intermittent:
		// Amber — stands out when it pops back in.
		return FLinearColor(0.95f, 0.48f, 0.08f, 1.0f);
	case EUEShedFixtureMotion::Stationary:
	default:
		// Slate blue-gray — grounded, architectural.
		return FLinearColor(0.28f, 0.34f, 0.48f, 1.0f);
	}
}
}

AUEShedFixtureMover::AUEShedFixtureMover()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.0f;
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (Cube.Succeeded()) Mesh->SetStaticMesh(Cube.Object);
	Mesh->SetRelativeScale3D(MeshScaleForMotion(EUEShedFixtureMotion::Stationary));
	Mesh->SetMobility(EComponentMobility::Movable);
}

AUEShedFixtureStationary::AUEShedFixtureStationary()
{
	Motion = EUEShedFixtureMotion::Stationary;
}

AUEShedFixtureFlying::AUEShedFixtureFlying()
{
	Motion = EUEShedFixtureMotion::Flying;
}

AUEShedFixtureIntermittent::AUEShedFixtureIntermittent()
{
	Motion = EUEShedFixtureMotion::Intermittent;
}

void AUEShedFixtureMover::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	ApplyVisualIdentity();
}

void AUEShedFixtureMover::ApplyVisualIdentity()
{
	if (Mesh == nullptr) return;

	UStaticMesh* Shape = LoadObject<UStaticMesh>(nullptr, MeshPathForMotion(Motion));
	if (Shape != nullptr) Mesh->SetStaticMesh(Shape);
	Mesh->SetRelativeScale3D(MeshScaleForMotion(Motion));

	UMaterialInterface* Parent = LoadObject<UMaterialInterface>(nullptr,
		TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	if (Parent == nullptr) return;

	UMaterialInstanceDynamic* Mid = UMaterialInstanceDynamic::Create(Parent, Mesh);
	if (Mid == nullptr) return;
	Mid->SetVectorParameterValue(TEXT("Color"), ColorForMotion(Motion));
	Mesh->SetMaterial(0, Mid);
}

void AUEShedFixtureMover::BeginPlay()
{
	Super::BeginPlay();
	Origin = GetActorLocation();
	ApplyVisualIdentity();
	SetIntermittentVisible(true);
	// Stationary actors stay in the Observatory catalog but do not need a per-frame tick.
	if (Motion == EUEShedFixtureMotion::Stationary)
	{
		SetActorTickEnabled(false);
	}
}

void AUEShedFixtureMover::SetIntermittentVisible(bool bVisible)
{
	SetActorHiddenInGame(!bVisible);
	if (Mesh != nullptr)
	{
		Mesh->SetVisibility(bVisible, true);
		Mesh->SetHiddenInGame(!bVisible, true);
	}
}

void AUEShedFixtureMover::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
	const double WorldTime = GetWorld()->GetTimeSeconds();
	const double T = WorldTime * Speed + LogicalIndex * 0.73;

	switch (Motion)
	{
	case EUEShedFixtureMotion::Stationary:
		SetIntermittentVisible(true);
		SetActorLocation(Origin, false, nullptr, ETeleportType::TeleportPhysics);
		SetActorRotation(FRotator::ZeroRotator);
		break;

	case EUEShedFixtureMotion::Flying:
	{
		SetIntermittentVisible(true);
		const FVector Offset(
			FMath::Cos(T) * Radius,
			FMath::Sin(T) * Radius,
			(0.55 + 0.35 * FMath::Sin(T * 1.7)) * Radius);
		SetActorLocation(Origin + Offset, false, nullptr, ETeleportType::TeleportPhysics);
		SetActorRotation(FRotator(
			12.0 * FMath::Sin(T),
			FMath::RadiansToDegrees(T),
			8.0 * FMath::Cos(T * 0.8)));
		break;
	}

	case EUEShedFixtureMotion::Intermittent:
	{
		const double Phase = LogicalIndex * 0.41;
		const double Cycle = FMath::Fmod(WorldTime + Phase, FMath::Max(IntermittentPeriod, 0.5f));
		const bool bVisible = Cycle < (IntermittentPeriod * IntermittentDutyCycle);
		SetIntermittentVisible(bVisible);
		SetActorLocation(Origin, false, nullptr, ETeleportType::TeleportPhysics);
		SetActorRotation(FRotator(0.0, FMath::RadiansToDegrees(T * 0.35), 0.0));
		break;
	}

	default:
		break;
	}
}
