using UnrealBuildTool;
using System.Collections.Generic;
public class VillageOfShadowsEditorTarget : TargetRules
{
    public VillageOfShadowsEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.Latest;
        ExtraModuleNames.Add("VillageOfShadows");
    }
}
