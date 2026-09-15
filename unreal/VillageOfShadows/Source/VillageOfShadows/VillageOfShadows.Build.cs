using UnrealBuildTool;
public class VillageOfShadows : ModuleRules
{
    public VillageOfShadows(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] {"Core", "CoreUObject", "Engine", "InputCore", "HTTP", "Json", "Slate", "SlateCore", "TextToSpeech", "AudioCaptureCore"});
    }
}
