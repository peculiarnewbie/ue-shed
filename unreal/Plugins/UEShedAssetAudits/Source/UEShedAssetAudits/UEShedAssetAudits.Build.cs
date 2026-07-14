using UnrealBuildTool;

public class UEShedAssetAudits : ModuleRules
{
	public UEShedAssetAudits(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine" });
		PrivateDependencyModuleNames.AddRange(new[] { "ImageCore", "Json", "UEShedCore" });
	}
}
