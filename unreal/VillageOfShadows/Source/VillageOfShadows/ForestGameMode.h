#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/Character.h"
#include "GameFramework/HUD.h"
#include "AudioCaptureCore.h"
#include "ForestGameMode.generated.h"

UCLASS()
class VILLAGEOFSHADOWS_API AForestPlayer : public ACharacter
{
    GENERATED_BODY()
public:
    AForestPlayer();
    virtual void Tick(float Delta) override;
    virtual void SetupPlayerInputComponent(UInputComponent* Input) override;
    UPROPERTY() class UCameraComponent* Eyes;
    UPROPERTY() class USpotLightComponent* Lantern;
    void Interact();
    void ToggleLantern();
    void Leave();
    void ToggleAutoWalk();
    bool AutoWalk = false;
    int32 AutoWalkIgnoreSpirit=-1;
    float LookX=0, LookY=0;
};

UCLASS()
class VILLAGEOFSHADOWS_API AForestHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
};

UCLASS()
class VILLAGEOFSHADOWS_API AForestGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    AForestGameMode();
    virtual void RestartPlayer(AController* NewPlayer) override;
    virtual void BeginPlay() override;
    virtual void Tick(float Delta) override;
    virtual void EndPlay(const EEndPlayReason::Type Reason) override;
    void Interact();
    void CloseDialogue();
    void SendLine();
    void StartSession();
    void ShowEnding();
    void NewWalk();
    void ToggleRecording();
    void PlayVoice(const FString& RequestID, int32 Speaker);
    bool DialogueOpen = false;
    bool Busy = false;
    bool Escaped = false;
    int32 Nearest = -1;
    int32 Talking = -1;
    int32 Seals = 0;
    FString Notice = TEXT("Follow the lanterns. Three spirits hold the way out.");
private:
    void BuildForest();
    UPROPERTY() TArray<class AStaticMeshActor*> Spirits;
    TArray<FVector> SpiritHomes;
    TArray<float> SpiritFear;
    UPROPERTY() class USoundWaveProcedural* Wind;
    UPROPERTY() class UAudioComponent* WindPlayer;
    float WindSample = 0;
    float WindFilter = 0;
    FString Token;
    FString PendingID;
    FString PendingText;
    FString PendingSpirit;
    TSharedPtr<class SWidget> Dialogue;
    TSharedPtr<class SEditableTextBox> Entry;
    TSharedPtr<class STextBlock> Response;
    TUniquePtr<Audio::FAudioCapture> Microphone;
    TSharedPtr<struct FForestMic, ESPMode::ThreadSafe> MicData;
    bool Recording=false;
    float RecordingStarted=0;
    int32 VoiceGeneration=0;
    UPROPERTY() USoundWaveProcedural* SpeechWave;
    UPROPERTY() UAudioComponent* SpeechPlayer;
};
