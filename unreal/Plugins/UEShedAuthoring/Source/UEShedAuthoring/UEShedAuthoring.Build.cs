using UnrealBuildTool;

public class UEShedAuthoring : ModuleRules
{
	public UEShedAuthoring(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine" });
		PrivateDependencyModuleNames.AddRange(new[] {
			"AssetRegistry", "Json", "JsonUtilities", "UEShedCore", "UnrealEd"
		});
	}
}
