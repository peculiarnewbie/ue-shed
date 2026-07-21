#include "UEShedCameraLibrary.h"

#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "UEShedCameraSubsystem.h"

namespace
{
UUEShedCameraSubsystem* FindCameraSubsystem()
{
	if (GEngine == nullptr) return nullptr;
	for (const FWorldContext& Context : GEngine->GetWorldContexts())
	{
		UWorld* World = Context.World();
		if (World != nullptr && World->IsGameWorld())
		{
			return World->GetSubsystem<UUEShedCameraSubsystem>();
		}
	}
	return nullptr;
}

FString ErrorJson(const TCHAR* Code)
{
	return FString::Printf(TEXT("{\"schemaVersion\":1,\"status\":\"failed\",\"error\":\"%s\"}"), Code);
}
}

void UUEShedCameraLibrary::GetStatus(FString& ResultJson)
{
	if (UUEShedCameraSubsystem* Subsystem = FindCameraSubsystem())
	{
		ResultJson = Subsystem->StatusJson();
		return;
	}
	ResultJson = TEXT("{\"schemaVersion\":1,\"error\":\"no-running-game-world\"}");
}

void UUEShedCameraLibrary::Configure(const FString& ConfigJson, FString& ResultJson)
{
	if (UUEShedCameraSubsystem* Subsystem = FindCameraSubsystem())
	{
		FString Error;
		if (Subsystem->ApplyConfigJson(ConfigJson, Error))
		{
			ResultJson = Subsystem->StatusJson();
			return;
		}
		ResultJson = FString::Printf(TEXT("{\"schemaVersion\":1,\"error\":\"%s\"}"), *Error);
		return;
	}
	ResultJson = TEXT("{\"schemaVersion\":1,\"error\":\"no-running-game-world\"}");
}

void UUEShedCameraLibrary::EnsureReviewPreviewSources(
	const FString& RequestJson,
	FString& ResultJson)
{
	UUEShedCameraSubsystem* Subsystem = FindCameraSubsystem();
	if (Subsystem == nullptr)
	{
		ResultJson = ErrorJson(TEXT("no-running-game-world"));
		return;
	}
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(RequestJson);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		ResultJson = ErrorJson(TEXT("invalid-json"));
		return;
	}
	const TArray<TSharedPtr<FJsonValue>>* SourcesJson = nullptr;
	if (!Root->TryGetArrayField(TEXT("sources"), SourcesJson) || SourcesJson == nullptr)
	{
		ResultJson = ErrorJson(TEXT("missing-sources"));
		return;
	}
	TArray<FUEShedReviewPreviewSourceSpec> Specs;
	Specs.Reserve(SourcesJson->Num());
	for (const TSharedPtr<FJsonValue>& Entry : *SourcesJson)
	{
		const TSharedPtr<FJsonObject> Object = Entry->AsObject();
		if (!Object.IsValid())
		{
			ResultJson = ErrorJson(TEXT("invalid-source"));
			return;
		}
		FUEShedReviewPreviewSourceSpec Spec;
		if (!Object->TryGetStringField(TEXT("candidateId"), Spec.CandidateId)
			|| Spec.CandidateId.IsEmpty())
		{
			ResultJson = ErrorJson(TEXT("invalid-candidate-id"));
			return;
		}
		const TSharedPtr<FJsonObject>* LocationObject = nullptr;
		const TSharedPtr<FJsonObject>* RotationObject = nullptr;
		double X = 0;
		double Y = 0;
		double Z = 0;
		double Pitch = 0;
		double Yaw = 0;
		double Roll = 0;
		double Fov = 60;
		double Width = 320;
		double Height = 180;
		if (!Object->TryGetObjectField(TEXT("location"), LocationObject)
			|| !(*LocationObject)->TryGetNumberField(TEXT("x"), X)
			|| !(*LocationObject)->TryGetNumberField(TEXT("y"), Y)
			|| !(*LocationObject)->TryGetNumberField(TEXT("z"), Z)
			|| !Object->TryGetObjectField(TEXT("rotation"), RotationObject)
			|| !(*RotationObject)->TryGetNumberField(TEXT("pitch"), Pitch)
			|| !(*RotationObject)->TryGetNumberField(TEXT("yaw"), Yaw))
		{
			ResultJson = ErrorJson(TEXT("invalid-pose"));
			return;
		}
		(*RotationObject)->TryGetNumberField(TEXT("roll"), Roll);
		Object->TryGetNumberField(TEXT("fieldOfViewDegrees"), Fov);
		Object->TryGetNumberField(TEXT("width"), Width);
		Object->TryGetNumberField(TEXT("height"), Height);
		Spec.Location = FVector(X, Y, Z);
		Spec.Rotation = FRotator(Pitch, Yaw, Roll);
		Spec.FieldOfViewDegrees = static_cast<float>(Fov);
		Spec.Width = FMath::RoundToInt(Width);
		Spec.Height = FMath::RoundToInt(Height);
		Specs.Add(Spec);
	}
	FString Error;
	if (!Subsystem->EnsureReviewPreviewSources(Specs, Error))
	{
		ResultJson = ErrorJson(*Error);
		return;
	}
	double PreviewFps = 10.0;
	Root->TryGetNumberField(TEXT("previewFps"), PreviewFps);
	const int32 ClampedFps = FMath::Clamp(FMath::RoundToInt(PreviewFps), 1, 10);
	FString ConfigureError;
	const FString ConfigJson = FString::Printf(
		TEXT("{\"activeCameraCount\":%d,\"backgroundFps\":%d,\"captureBudgetPerTick\":%d,")
		TEXT("\"focusedCameraIndex\":0,\"focusedFps\":%d,\"paused\":false,")
		TEXT("\"pipelineMode\":\"full_pipeline\",\"renderProfile\":\"observation\",")
		TEXT("\"resolution\":\"%dx%d\",\"viewMode\":\"posed\"}"),
		Specs.Num(),
		ClampedFps,
		FMath::Clamp(Specs.Num(), 1, 8),
		ClampedFps,
		Specs[0].Width,
		Specs[0].Height);
	if (!Subsystem->ApplyConfigJson(ConfigJson, ConfigureError))
	{
		Subsystem->ClearReviewPreviewSources();
		ResultJson = ErrorJson(*ConfigureError);
		return;
	}
	ResultJson = Subsystem->StatusJson();
}

void UUEShedCameraLibrary::ClearReviewPreviewSources(FString& ResultJson)
{
	UUEShedCameraSubsystem* Subsystem = FindCameraSubsystem();
	if (Subsystem == nullptr)
	{
		ResultJson = ErrorJson(TEXT("no-running-game-world"));
		return;
	}
	Subsystem->ClearReviewPreviewSources();
	ResultJson = Subsystem->StatusJson();
}
