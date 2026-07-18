using UnrealBuildTool;

public class UEShedObservatoryEditor : ModuleRules
{
	public UEShedObservatoryEditor(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine" });
		PrivateDependencyModuleNames.AddRange(new[] { "Json", "Slate", "SlateCore", "UnrealEd" });
	}
}
