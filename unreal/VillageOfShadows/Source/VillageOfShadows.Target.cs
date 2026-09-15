using UnrealBuildTool;
using System.Collections.Generic;
public class VillageOfShadowsTarget : TargetRules
{
    public VillageOfShadowsTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.Latest;
        ExtraModuleNames.Add("VillageOfShadows");
    }
}
