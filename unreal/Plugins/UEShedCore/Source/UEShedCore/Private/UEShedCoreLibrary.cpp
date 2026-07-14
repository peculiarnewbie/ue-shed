#include "UEShedCoreLibrary.h"

#include "Dom/JsonObject.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

void UUEShedCoreLibrary::GetCapabilityManifest(FString& ResultJson)
{
	const TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetNumberField(TEXT("schemaVersion"), 1);
	Root->SetStringField(TEXT("producerKind"), TEXT("unreal_editor"));
	Root->SetStringField(
		TEXT("authoringObjectPath"),
		TEXT("/Script/UEShedAuthoring.Default__UEShedAuthoringLibrary"));
	Root->SetArrayField(TEXT("capabilities"), {
		MakeShared<FJsonValueString>(TEXT("authoring.snapshot.v1")),
		MakeShared<FJsonValueString>(TEXT("authoring.apply.v1")),
		MakeShared<FJsonValueString>(TEXT("authoring.apply-result.v1")),
		MakeShared<FJsonValueString>(TEXT("authoring.save.v1"))
	});
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&ResultJson);
	FJsonSerializer::Serialize(Root, Writer);
}
