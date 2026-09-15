#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "ShadowGameMode.generated.h"

UCLASS()
class VILLAGEOFSHADOWS_API AShadowGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    AShadowGameMode();
    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type Reason) override;
private:
    TSharedPtr<class SShadowCouncil> Council;
    TSharedPtr<class SWidget> Root;
};
