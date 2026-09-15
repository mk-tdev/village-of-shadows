#include "ForestGameMode.h"
#include "Engine/Engine.h"
#include "Engine/Canvas.h"
#include "Engine/GameViewportClient.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PointLight.h"
#include "Components/StaticMeshComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/CapsuleComponent.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"
#include "TextToSpeechEngineSubsystem.h"
#include "Sound/SoundWaveProcedural.h"
#include "Components/AudioComponent.h"
#include "Misc/ScopeLock.h"

struct FForestMic {
    FCriticalSection Mutex;
    TArray<int16> Samples;
    int32 Rate=48000;
};

namespace {
const TCHAR* Names[] = {TEXT("Sable — the abandoned watch"), TEXT("Elin — mother of the well"), TEXT("Corvin — the bell keeper")};
const TCHAR* IDs[] = {TEXT("sable"), TEXT("elin"), TEXT("corvin")};
const TCHAR* Greetings[] = {TEXT("I heard her crying when the bell rang. I ran. Tell me, stranger — would you have stayed?"), TEXT("The well remembers my daughter. Mara. Say her name softly; the village has almost forgotten it."), TEXT("I kept the chapel door locked. I called it protection. Why have you come to disturb the bell?")};
FText T(const FString& S) { return FText::FromString(S); }
UMaterialInterface* Mat(const TCHAR* Name) { return LoadObject<UMaterialInterface>(nullptr, *(FString(TEXT("/Game/Forest/Materials/"))+Name)); }
UStaticMesh* Mesh(const TCHAR* Name) { return LoadObject<UStaticMesh>(nullptr, Name); }
FString JSON(const TSharedPtr<FJsonObject>& O) { FString S; FJsonSerializer::Serialize(O.ToSharedRef(),TJsonWriterFactory<>::Create(&S)); return S; }
}

AForestPlayer::AForestPlayer()
{
    PrimaryActorTick.bCanEverTick = true;
    GetCapsuleComponent()->InitCapsuleSize(30,88);
    Eyes = CreateDefaultSubobject<UCameraComponent>(TEXT("Eyes"));
    Eyes->SetupAttachment(GetCapsuleComponent()); Eyes->SetRelativeLocation(FVector(0,0,64)); Eyes->bUsePawnControlRotation = true; Eyes->FieldOfView=88;
    Lantern = CreateDefaultSubobject<USpotLightComponent>(TEXT("Lantern"));
    Lantern->SetupAttachment(Eyes); Lantern->SetRelativeLocation(FVector(20,12,-16));
    Lantern->SetIntensity(18000); Lantern->SetAttenuationRadius(2200); Lantern->SetInnerConeAngle(24); Lantern->SetOuterConeAngle(48);
    Lantern->SetLightColor(FLinearColor(1,.68,.32)); Lantern->SetMobility(EComponentMobility::Movable);
    GetCharacterMovement()->MaxWalkSpeed=330; GetCharacterMovement()->BrakingDecelerationWalking=1500;
    bUseControllerRotationYaw=true;
}
void AForestPlayer::SetupPlayerInputComponent(UInputComponent* Input)
{
    Super::SetupPlayerInputComponent(Input);
    Input->BindKey(EKeys::E,IE_Pressed,this,&AForestPlayer::Interact);
    Input->BindKey(EKeys::F,IE_Pressed,this,&AForestPlayer::ToggleLantern);
    Input->BindKey(EKeys::Escape,IE_Pressed,this,&AForestPlayer::Leave);
    Input->BindKey(EKeys::R,IE_Pressed,this,&AForestPlayer::ToggleAutoWalk);
}
void AForestPlayer::Tick(float Delta)
{
    Super::Tick(Delta);
    auto* PC=Cast<APlayerController>(GetController()); auto* GM=GetWorld()->GetAuthGameMode<AForestGameMode>();
    if (!PC || !GM || GM->DialogueOpen || GM->Escaped) return;
    if(AutoWalk && GM->Nearest>=0 && GM->Nearest!=AutoWalkIgnoreSpirit) AutoWalk=false;
    if(GM->Nearest<0) AutoWalkIgnoreSpirit=-1;
    float X=0,Y=0; PC->GetInputMouseDelta(X,Y);
    // Reject cursor warps on focus and use a gentle, frame-rate-independent filter.
    if(FMath::Abs(X)>100 || FMath::Abs(Y)>100) {X=0; Y=0;}
    LookX=FMath::FInterpTo(LookX,X,Delta,25); LookY=FMath::FInterpTo(LookY,Y,Delta,25);
    if(!AutoWalk) {AddControllerYawInput(LookX*.065f); AddControllerPitchInput(-LookY*.065f);}
    GetCharacterMovement()->MaxWalkSpeed=PC->IsInputKeyDown(EKeys::LeftShift)?540:330;
    if(PC->IsInputKeyDown(EKeys::S)) AutoWalk=false;
    AddMovementInput(GetActorForwardVector(),(PC->IsInputKeyDown(EKeys::W)||AutoWalk?1.f:0.f)-(PC->IsInputKeyDown(EKeys::S)?1.f:0.f));
    AddMovementInput(GetActorRightVector(),(PC->IsInputKeyDown(EKeys::D)?1.f:0.f)-(PC->IsInputKeyDown(EKeys::A)?1.f:0.f));
    const float Speed=GetVelocity().Size2D();
    Eyes->SetRelativeLocation(FVector(0,0,64+FMath::Sin(GetWorld()->GetTimeSeconds()*9)*FMath::Min(Speed/130,3.f)));
}
void AForestPlayer::Interact() { if(auto* GM=GetWorld()->GetAuthGameMode<AForestGameMode>()) GM->Interact(); }
void AForestPlayer::ToggleLantern() { Lantern->ToggleVisibility(); }
void AForestPlayer::Leave() { if(auto* GM=GetWorld()->GetAuthGameMode<AForestGameMode>()) GM->CloseDialogue(); }
void AForestPlayer::ToggleAutoWalk() {
    AutoWalk=!AutoWalk;
    if(auto* GM=GetWorld()->GetAuthGameMode<AForestGameMode>()) AutoWalkIgnoreSpirit=GM->Nearest;
    if(AutoWalk && GetController()) {GetController()->SetControlRotation(FRotator::ZeroRotator); SetActorRotation(FRotator::ZeroRotator); LookX=0; LookY=0;}
}

void AForestHUD::DrawHUD()
{
    Super::DrawHUD(); auto* GM=GetWorld()->GetAuthGameMode<AForestGameMode>(); if(!GM || !Canvas) return;
    DrawText(TEXT("V I L L A G E   O F   S H A D O W S"),FLinearColor(.7,.78,.74),34,28,nullptr,1.2f);
    DrawText(GM->Escaped?TEXT("DAWN REMEMBERS YOU"):FString::Printf(TEXT("Break the binding  •  %d / 3 seals"),GM->Seals),FLinearColor(.9,.8,.57),34,60,nullptr,1.1f);
    if(!GM->DialogueOpen) {
        DrawRect(FLinearColor(.8,.9,.85,.7),Canvas->ClipX/2-1,Canvas->ClipY/2-1,3,3);
        FString Hint=GM->Nearest>=0?FString::Printf(TEXT("[ E ]  Speak to %s"),Names[GM->Nearest]):GM->Notice;
        DrawText(Hint,FLinearColor(.83,.9,.85),Canvas->ClipX*.28f,Canvas->ClipY-110,nullptr,1.1f);
        DrawText(TEXT("WASD  Walk     Mouse  Look     Shift  Run     F  Lantern     E  Speak     R  Auto-walk"),FLinearColor(.55,.63,.59),34,Canvas->ClipY-38);
    }
}

AForestGameMode::AForestGameMode()
{
    DefaultPawnClass=AForestPlayer::StaticClass(); HUDClass=AForestHUD::StaticClass(); PrimaryActorTick.bCanEverTick=true;
}
void AForestGameMode::RestartPlayer(AController* NewPlayer)
{
    Super::RestartPlayer(NewPlayer);
    if(NewPlayer && NewPlayer->GetPawn()) {
        NewPlayer->GetPawn()->SetActorLocation(FVector(-3700,0,100));
        NewPlayer->SetControlRotation(FRotator(0,0,0));
    }
}
void AForestGameMode::BeginPlay()
{
    Super::BeginPlay(); BuildForest();
    auto* PC=GetWorld()->GetFirstPlayerController();
    if(PC) { if(PC->GetPawn()) PC->GetPawn()->SetActorLocation(FVector(-3700,0,100)); PC->SetControlRotation(FRotator(0,0,0)); PC->SetInputMode(FInputModeGameOnly()); PC->bShowMouseCursor=false; }
    if(auto* Speech=GEngine->GetEngineSubsystem<UTextToSpeechEngineSubsystem>()) { Speech->AddDefaultChannel(TEXT("Forest")); Speech->ActivateChannel(TEXT("Forest")); }
    StartSession();
    Wind=NewObject<USoundWaveProcedural>(this); Wind->SetSampleRate(22050); Wind->NumChannels=1; Wind->Duration=INDEFINITELY_LOOPING_DURATION;
    WindPlayer=NewObject<UAudioComponent>(this); WindPlayer->bAutoActivate=false; WindPlayer->SetSound(Wind); WindPlayer->RegisterComponent(); WindPlayer->SetVolumeMultiplier(.3); WindPlayer->Play();
}
void AForestGameMode::BuildForest()
{
    UStaticMesh* Cube=Mesh(TEXT("/Engine/BasicShapes/Cube.Cube"));
    auto Block=[&](FVector P,FVector S,const TCHAR* Material,FRotator R=FRotator::ZeroRotator) {
        auto* A=GetWorld()->SpawnActor<AStaticMeshActor>(P,R); A->GetStaticMeshComponent()->SetMobility(EComponentMobility::Movable);
        A->GetStaticMeshComponent()->SetStaticMesh(Cube); A->SetActorScale3D(S); A->GetStaticMeshComponent()->SetMaterial(0,Mat(Material)); return A;
    };
    Block(FVector(0,0,-60),FVector(180,150,1),TEXT("Earth"));
    for(int i=0;i<29;i++) Block(FVector(-4200+i*340,35*FMath::Sin(i*.6),-5),FVector(3.5,2.4,.12),TEXT("Path"),FRotator(0,FMath::Sin(i*.6)*4,0));
    auto Light=[&](FVector P,FLinearColor C,float Power,float Radius) {
        auto* A=GetWorld()->SpawnActor<APointLight>(P,FRotator::ZeroRotator); auto* L=Cast<UPointLightComponent>(A->GetLightComponent());
        L->SetMobility(EComponentMobility::Movable); L->SetLightColor(C); L->SetIntensity(Power); L->SetAttenuationRadius(Radius); return A;
    };
    auto* Moon=GetWorld()->SpawnActor<ADirectionalLight>(FVector(0,0,2000),FRotator(-35,-55,0));
    Moon->GetLightComponent()->SetMobility(EComponentMobility::Movable); Moon->GetLightComponent()->SetIntensity(.65); Moon->GetLightComponent()->SetLightColor(FLinearColor(.36,.53,.72));
    auto* Sky=GetWorld()->SpawnActor<ASkyLight>(); Sky->GetLightComponent()->SetMobility(EComponentMobility::Movable); Sky->GetLightComponent()->SetIntensity(.55);
    Sky->GetLightComponent()->SetLightColor(FLinearColor(.22,.35,.5));
    auto* Fog=GetWorld()->SpawnActor<AExponentialHeightFog>(); Fog->GetComponent()->SetFogDensity(.027); Fog->GetComponent()->SetFogHeightFalloff(.12);
    Fog->GetComponent()->SetFogInscatteringColor(FLinearColor(.025,.052,.065)); Fog->GetComponent()->SetStartDistance(150);
    // Imported PBR meshes, rendered as instances to share geometry and draw calls.
    FRandomStream Random(8319);
    auto Scatter=[&](const TCHAR* Path,int Count,float Size,bool Trees) {
        auto* M=Mesh(Path); if(!M) { UE_LOG(LogTemp,Error,TEXT("Forest asset missing: %s"),Path); return; }
        auto* Owner=GetWorld()->SpawnActor<AActor>(); auto* I=NewObject<UHierarchicalInstancedStaticMeshComponent>(Owner);
        Owner->SetRootComponent(I); I->SetStaticMesh(M); I->SetMobility(EComponentMobility::Movable); I->SetCollisionEnabled(ECollisionEnabled::NoCollision); I->RegisterComponent();
        const auto Bounds=M->GetBoundingBox(); const float Height=FMath::Max(Bounds.GetSize().Z,1.f);
        for(int j=0;j<Count;j++) {
            float X=Random.FRandRange(-4800,6500),Y=Random.FRandRange(-3400,3400);
            if(FMath::Abs(Y)<(Trees?430:180)) Y+=(Y<0?-1:1)*(Trees?580:230);
            if(X>0 && FMath::Abs(Y)<1700) Y+=(Y<0?-1:1)*1700;
            float S=Size/Height*Random.FRandRange(.7,1.25);
            I->AddInstance(FTransform(FRotator(0,Random.FRandRange(0,360),0),FVector(X,Y,-Bounds.Min.Z*S),FVector(S)));
        }
    };
    Scatter(TEXT("/Game/Forest/island_tree_01/island_tree_01_1k/StaticMeshes/island_tree_01_1k.island_tree_01_1k"),85,1900,true);
    Scatter(TEXT("/Game/Forest/fern_02/fern_02_1k/StaticMeshes/fern_02_a.fern_02_a"),240,110,false);
    Scatter(TEXT("/Game/Forest/boulder_01/boulder_01_1k/StaticMeshes/boulder_01_1k.boulder_01_1k"),50,170,false);
    // Timber houses have open doors, interior floors, rafters, and pitched roofs.
    auto House=[&](FVector P,float Yaw,bool Chapel) {
        FRotationMatrix Rot{FRotator(0,Yaw,0)};
        auto Piece=[&](FVector Offset,FVector Scale,const TCHAR* Material,FRotator R=FRotator::ZeroRotator) { Block(P+Rot.TransformVector(Offset),Scale,Material,FRotator(R.Pitch,R.Yaw+Yaw,R.Roll)); };
        float H=Chapel?520:320;
        Piece(FVector(0,0,0),FVector(7,7,.2),TEXT("Timber"));
        Piece(FVector(-345,0,H/2),FVector(.18,7,H/100),TEXT("Timber"));
        Piece(FVector(0,-345,H/2),FVector(7,.18,H/100),TEXT("Timber"));
        Piece(FVector(0,345,H/2),FVector(7,.18,H/100),TEXT("Timber"));
        Piece(FVector(345,-250,H/2),FVector(.18,2,H/100),TEXT("Timber"));
        Piece(FVector(345,250,H/2),FVector(.18,2,H/100),TEXT("Timber"));
        Piece(FVector(345,0,H-45),FVector(.18,3, .9),TEXT("Timber"));
        for(int k=-1;k<=1;k+=2) Piece(FVector(0,k*205,H+95),FVector(8,4.6,.18),TEXT("Roof"),FRotator(0,0,k*28));
        for(int x=-1;x<=1;x+=2) for(int y=-1;y<=1;y+=2) Piece(FVector(x*345,y*345,H/2),FVector(.3,.3,H/100+.3),TEXT("Roof"));
        Light(P+FVector(0,0,170),FLinearColor(1,.3,.065),1200,700);
    };
    House(FVector(400,-1000,12),90,false); House(FVector(1700,1000,12),-90,false); House(FVector(2900,-1100,12),90,false);
    House(FVector(4300,1000,12),-90,true);
    // Well: individual stones create a visible open ring, not a solid cylinder.
    for(int i=0;i<16;i++) { float A=i*2*PI/16; Block(FVector(1700+180*FMath::Cos(A),-350+180*FMath::Sin(A),50),FVector(.8,.7,1),TEXT("Path"),FRotator(0,FMath::RadiansToDegrees(A),0)); }
    for(int i=0;i<10;i++) {
        FVector P(-3100+i*850,(i%2?1:-1)*230,0);
        Block(P+FVector(0,0,65),FVector(.12,.12,1.3),TEXT("Timber"));
        Block(P+FVector(0,0,145),FVector(.22,.22,.35),TEXT("Flame")); Light(P+FVector(0,0,165),FLinearColor(1,.43,.11),1100,900);
    }
    UStaticMesh* Ghost=Mesh(TEXT("/Game/Forest/gothic_statue/gothic_statue_1k/StaticMeshes/gothic_statue_1k.gothic_statue_1k"));
    SpiritHomes={FVector(-2450,220,15),FVector(1780,-60,15),FVector(4100,280,15)};
    SpiritFear.Init(0,3);
    for(int i=0;i<3;i++) {
        auto* A=GetWorld()->SpawnActor<AStaticMeshActor>(SpiritHomes[i],FRotator(0,180,0));
        A->GetStaticMeshComponent()->SetMobility(EComponentMobility::Movable); A->GetStaticMeshComponent()->SetStaticMesh(Ghost);
        A->GetStaticMeshComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        if(Ghost) { float S=240/FMath::Max(Ghost->GetBoundingBox().GetSize().Z,1.f); A->SetActorScale3D(FVector(S)); SpiritHomes[i].Z-=Ghost->GetBoundingBox().Min.Z*S; A->SetActorLocation(SpiritHomes[i]); }
        for(int m=0;m<A->GetStaticMeshComponent()->GetNumMaterials();m++) A->GetStaticMeshComponent()->SetMaterial(m,Mat(TEXT("GhostVeil")));
        Spirits.Add(A); Light(SpiritHomes[i]+FVector(0,0,130),FLinearColor(.15,.75,.62),500,450);
    }
    for(int s=-1;s<=1;s+=2) Block(FVector(5450,s*230,200),FVector(.6,.6,4),TEXT("Timber"));
    Block(FVector(5450,0,420),FVector(.7,5.3,.5),TEXT("Timber"));
}

void AForestGameMode::Tick(float Delta)
{
    Super::Tick(Delta); auto* PC=GetWorld()->GetFirstPlayerController(); if(!PC || !PC->GetPawn()) return;
    FVector P=PC->GetPawn()->GetActorLocation(); float Closest=420; Nearest=-1;
    if(Recording && GetWorld()->GetTimeSeconds()-RecordingStarted>=20) ToggleRecording();
    if(Wind && Wind->GetAvailableAudioByteCount()<22050) {
        TArray<int16> Samples; Samples.SetNumUninitialized(22050);
        for(int i=0;i<Samples.Num();i++) { WindSample+=1.f/22050; WindFilter=WindFilter*.985f+FMath::FRandRange(-1.f,1.f)*.015f;
            float Gust=.4f+.3f*FMath::Sin(WindSample*.43f); float Drone=FMath::Sin(WindSample*2*PI*48)*.025f;
            Samples[i]=static_cast<int16>((WindFilter*Gust+Drone)*15000); }
        Wind->QueueAudio(reinterpret_cast<uint8*>(Samples.GetData()),Samples.Num()*sizeof(int16));
    }
    for(int i=0;i<Spirits.Num();i++) {
        SpiritFear[i]=FMath::Max(0.f,SpiritFear[i]-Delta);
        FVector Retreat=(SpiritHomes[i]-P).GetSafeNormal2D()*FMath::Min(SpiritFear[i]*30,120.f);
        Spirits[i]->SetActorLocation(SpiritHomes[i]+Retreat+FVector(0,0,FMath::Sin(GetWorld()->GetTimeSeconds()*1.3+i)*10));
        float D=FVector::Dist2D(P,SpiritHomes[i]); if(D<Closest) { Closest=D; Nearest=i; }
        if(D<850) { FRotator R=(P-SpiritHomes[i]).Rotation(); R.Pitch=0; R.Roll=0; Spirits[i]->SetActorRotation(R); }
    }
    if(P.Z < -200 || FMath::Abs(P.Y)>4000 || P.X < -4700 || P.X>6400) {PC->GetPawn()->SetActorLocation(FVector(-3700,0,100)); Notice=TEXT("The forest folds back on itself. Stay on the lantern path.");}
    if(!Escaped && P.X>5400 && FMath::Abs(P.Y)<300) {
        if(Seals==3 && !Escaped) { Escaped=true; Notice=TEXT("You carried their names beyond the trees. The village releases you."); ShowEnding(); }
        else { PC->GetPawn()->SetActorLocation(FVector(5200,P.Y,P.Z)); Notice=TEXT("The gate refuses you. Mercy. Memory. Truth. Speak to all three spirits."); }
    }
}
void AForestGameMode::StartSession()
{
    Busy=true; auto Request=FHttpModule::Get().CreateRequest(); Request->SetURL(TEXT("http://127.0.0.1:8000/forest")); Request->SetVerb(TEXT("POST")); Request->SetTimeout(15);
    TWeakObjectPtr<AForestGameMode> Weak(this);
    Request->OnProcessRequestComplete().BindLambda([Weak](FHttpRequestPtr,FHttpResponsePtr Res,bool OK) {
        if(!Weak.IsValid()) return; auto* Self=Weak.Get(); Self->Busy=false; TSharedPtr<FJsonObject> O;
        if(OK && Res.IsValid() && Res->GetResponseCode()==200 && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Res->GetContentAsString()),O) && O->TryGetStringField(TEXT("token"),Self->Token)) Self->Notice=TEXT("Find Sable on the lantern path. Approach and press E.");
        else Self->Notice=TEXT("Live AI is unavailable. Press E near a spirit to reconnect.");
    }); Request->ProcessRequest();
}
void AForestGameMode::Interact()
{
    if(DialogueOpen || Nearest<0) return;
    if(Token.IsEmpty()) { if(!Busy) StartSession(); return; }
    Talking=Nearest; DialogueOpen=true;
    auto* Viewer=GetWorld()->GetFirstPlayerController();
    Viewer->SetControlRotation((SpiritHomes[Talking]+FVector(0,0,175)-(Viewer->GetPawn()->GetActorLocation()+FVector(0,0,64))).Rotation());
    if(auto* Player=Cast<AForestPlayer>(GetWorld()->GetFirstPlayerController()->GetPawn())) {Player->AutoWalk=false; Player->GetCharacterMovement()->StopMovementImmediately();}
    Dialogue=SNew(SVerticalBox)
    +SVerticalBox::Slot().FillHeight(1)
    +SVerticalBox::Slot().AutoHeight().Padding(170,0,170,55)
    [SNew(SBorder).Padding(24).BorderBackgroundColor(FLinearColor(.015,.028,.025,.95))
      [SNew(SVerticalBox)
      +SVerticalBox::Slot().AutoHeight()[SNew(STextBlock).Text(T(Names[Talking])).ColorAndOpacity(FLinearColor(.5,.9,.77)).Font(FCoreStyle::GetDefaultFontStyle(TEXT("Bold"),21))]
      +SVerticalBox::Slot().AutoHeight().Padding(0,14)[SAssignNew(Response,STextBlock).Text(T(Greetings[Talking])).AutoWrapText(true).Font(FCoreStyle::GetDefaultFontStyle(TEXT("Regular"),19))]
      +SVerticalBox::Slot().AutoHeight()[SAssignNew(Entry,SEditableTextBox).HintText(T(TEXT("Speak to the spirit…"))).IsEnabled_Lambda([this]{return !Busy;}).OnTextCommitted_Lambda([this](const FText&,ETextCommit::Type How){if(How==ETextCommit::OnEnter) SendLine();})]
      +SVerticalBox::Slot().AutoHeight().Padding(0,12)[SNew(SHorizontalBox)
        +SHorizontalBox::Slot().AutoWidth().Padding(0,0,15,0)[SNew(SButton).Text_Lambda([this]{return T(Recording?TEXT("Stop recording & send"):TEXT("Talk with microphone"));}).IsEnabled_Lambda([this]{return !Busy;}).OnClicked_Lambda([this]{ToggleRecording(); return FReply::Handled();})]
        +SHorizontalBox::Slot().AutoWidth()[SNew(SButton).Text(T(TEXT("Speak"))).IsEnabled_Lambda([this]{return !Busy;}).OnClicked_Lambda([this]{SendLine(); return FReply::Handled();})]
        +SHorizontalBox::Slot().AutoWidth().Padding(15,0)[SNew(SButton).Text(T(TEXT("Return to the forest"))).OnClicked_Lambda([this]{CloseDialogue(); return FReply::Handled();})]
      ]
      +SVerticalBox::Slot().AutoHeight()[SNew(STextBlock).Text(T(TEXT("AI-generated character voices • Microphone records only after you click Talk (20s max); audio is sent to OpenAI."))).AutoWrapText(true).ColorAndOpacity(FLinearColor(.55,.65,.6))]
      ]];
    GEngine->GameViewport->AddViewportWidgetContent(Dialogue.ToSharedRef(),20);
    auto* PC=GetWorld()->GetFirstPlayerController(); FInputModeGameAndUI Mode; Mode.SetWidgetToFocus(Entry); Mode.SetHideCursorDuringCapture(false); PC->SetInputMode(Mode); PC->bShowMouseCursor=true;
}
void AForestGameMode::CloseDialogue()
{
    ++VoiceGeneration;
    if(SpeechPlayer) SpeechPlayer->Stop();
    Recording=false; if(Microphone) {Microphone->AbortStream(); Microphone.Reset();} MicData.Reset();
    if(Dialogue.IsValid()) GEngine->GameViewport->RemoveViewportWidgetContent(Dialogue.ToSharedRef());
    Dialogue.Reset(); Entry.Reset(); Response.Reset(); DialogueOpen=false;
    auto* PC=GetWorld()->GetFirstPlayerController(); if(PC) {PC->SetInputMode(FInputModeGameOnly()); PC->bShowMouseCursor=false;}
}
void AForestGameMode::SendLine()
{
    if(Busy || Recording || !Entry.IsValid() || Talking<0) return;
    ++VoiceGeneration; if(SpeechPlayer) SpeechPlayer->Stop();
    FString Line=Entry->GetText().ToString().TrimStartAndEnd(); if(Line.IsEmpty()) return;
    Line=Line.Left(1200);
    if(PendingText!=Line || PendingSpirit!=IDs[Talking] || PendingID.IsEmpty()) {PendingID=FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphens); PendingText=Line; PendingSpirit=IDs[Talking];}
    auto Body=MakeShared<FJsonObject>(); Body->SetStringField(TEXT("spirit"),IDs[Talking]); Body->SetStringField(TEXT("text"),Line); Body->SetStringField(TEXT("request_id"),PendingID);
    Busy=true; Response->SetText(T(TEXT("The spirit listens…"))); int32 Speaker=Talking;
    auto Request=FHttpModule::Get().CreateRequest(); Request->SetURL(TEXT("http://127.0.0.1:8000/forest/talk")); Request->SetVerb(TEXT("POST")); Request->SetHeader(TEXT("Content-Type"),TEXT("application/json")); Request->SetHeader(TEXT("Authorization"),TEXT("Bearer ")+Token); Request->SetContentAsString(JSON(Body)); Request->SetTimeout(50);
    TWeakObjectPtr<AForestGameMode> Weak(this);
    Request->OnProcessRequestComplete().BindLambda([Weak,Speaker](FHttpRequestPtr,FHttpResponsePtr Res,bool OK) {
        if(!Weak.IsValid()) return; auto* Self=Weak.Get(); Self->Busy=false;
        TSharedPtr<FJsonObject> O; FString Reply;
        if(OK && Res.IsValid() && Res->GetResponseCode()==200 && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Res->GetContentAsString()),O) && O->TryGetStringField(TEXT("reply"),Reply)) {
            const TArray<TSharedPtr<FJsonValue>>* Seals=nullptr; if(O->TryGetArrayField(TEXT("seals"),Seals)) Self->Seals=Seals->Num();
            FString Action; O->TryGetStringField(TEXT("action"),Action); if(Action==TEXT("recoil")) Self->SpiritFear[Speaker]=6;
            FString CompletedID=Self->PendingID; Self->PendingID.Empty(); Self->Notice=Self->Seals==3?TEXT("The three seals are yours. Follow the path through the far gate."):TEXT("The other spirits wait at the well and the chapel.");
            if(Self->Response.IsValid() && Self->Talking==Speaker) {Self->Response->SetText(T(Reply)); Self->Entry->SetText(FText::GetEmpty());}
            if(Self->DialogueOpen && Self->Talking==Speaker) Self->PlayVoice(CompletedID,Speaker);
        } else if(Self->Response.IsValid()) Self->Response->SetText(T(TEXT("The connection faded. Your line is kept; press Speak to retry.")));
    }); Request->ProcessRequest();
}
void AForestGameMode::PlayVoice(const FString& RequestID,int32 Speaker)
{
    int32 Generation=++VoiceGeneration;
    auto Request=FHttpModule::Get().CreateRequest(); Request->SetURL(TEXT("http://127.0.0.1:8000/forest/voice/")+RequestID); Request->SetVerb(TEXT("GET")); Request->SetHeader(TEXT("Authorization"),TEXT("Bearer ")+Token); Request->SetTimeout(40);
    TWeakObjectPtr<AForestGameMode> Weak(this);
    Request->OnProcessRequestComplete().BindLambda([Weak,Generation,Speaker](FHttpRequestPtr,FHttpResponsePtr Res,bool OK) {
        if(!Weak.IsValid() || Weak->VoiceGeneration!=Generation || !Weak->DialogueOpen || Weak->Talking!=Speaker) return;
        if(!OK || !Res.IsValid() || Res->GetResponseCode()!=200) {Weak->Notice=TEXT("Character audio unavailable; the reply is shown as subtitles."); return;}
        auto* Self=Weak.Get(); if(Self->SpeechPlayer) Self->SpeechPlayer->DestroyComponent();
        Self->SpeechWave=NewObject<USoundWaveProcedural>(Self); Self->SpeechWave->SetSampleRate(24000); Self->SpeechWave->NumChannels=1;
        const auto& Bytes=Res->GetContent(); Self->SpeechWave->Duration=Bytes.Num()/48000.f; Self->SpeechWave->QueueAudio(Bytes.GetData(),Bytes.Num());
        Self->SpeechPlayer=NewObject<UAudioComponent>(Self); Self->SpeechPlayer->bAutoActivate=false; Self->SpeechPlayer->SetSound(Self->SpeechWave); Self->SpeechPlayer->RegisterComponent(); Self->SpeechPlayer->SetVolumeMultiplier(.85); Self->SpeechPlayer->Play();
    }); Request->ProcessRequest();
}
void AForestGameMode::ToggleRecording()
{
    if(Busy || !DialogueOpen || !Response.IsValid()) return;
    if(!Recording) {
        ++VoiceGeneration; if(SpeechPlayer) SpeechPlayer->Stop();
        MicData=MakeShared<FForestMic,ESPMode::ThreadSafe>(); auto Buffer=MicData;
        Microphone=MakeUnique<Audio::FAudioCapture>(); Audio::FAudioCaptureDeviceParams Params;
        Params.PCMAudioEncoding=Audio::EPCMAudioEncoding::FLOATING_POINT_32; Params.bUseHardwareAEC=true;
        bool Opened=Microphone->OpenAudioCaptureStream(Params,[Buffer](const void* Data,int32 Frames,int32 Channels,int32 Rate,double,bool) {
            FScopeLock Lock(&Buffer->Mutex); Buffer->Rate=Rate; const float* Samples=static_cast<const float*>(Data);
            for(int i=0;i<Frames && Buffer->Samples.Num()<Rate*20;i++) { float Mono=0; for(int c=0;c<Channels;c++) Mono+=Samples[i*Channels+c]; Mono/=FMath::Max(Channels,1); Buffer->Samples.Add(static_cast<int16>(FMath::Clamp(Mono,-1.f,1.f)*32767)); }
        },1024);
        if(!Opened || !Microphone->StartStream()) {Microphone.Reset(); MicData.Reset(); Response->SetText(T(TEXT("Microphone is unavailable. Allow UnrealEditor microphone access in macOS, then try again. You can still type."))); return;}
        Recording=true; RecordingStarted=GetWorld()->GetTimeSeconds(); Response->SetText(T(TEXT("Listening… click Stop recording & send when you finish. Leaving cancels without sending."))); return;
    }
    Recording=false; Microphone->StopStream(); Microphone->CloseStream(); Microphone.Reset();
    TArray<uint8> Wav; int32 Rate; TArray<int16> PCM;
    {FScopeLock Lock(&MicData->Mutex); Rate=MicData->Rate; PCM=MoveTemp(MicData->Samples);} MicData.Reset();
    if(PCM.Num()<Rate/4) {Response->SetText(T(TEXT("That recording was too short. Click Talk and speak for a moment."))); return;}
    auto Tag=[&](const ANSICHAR* S){Wav.Append(reinterpret_cast<const uint8*>(S),4);};
    auto N32=[&](uint32 N){for(int i=0;i<4;i++) Wav.Add((N>>(8*i))&255);};
    auto N16=[&](uint16 N){Wav.Add(N&255); Wav.Add(N>>8);};
    Tag("RIFF"); N32(36+PCM.Num()*2); Tag("WAVE"); Tag("fmt "); N32(16); N16(1); N16(1); N32(Rate); N32(Rate*2); N16(2); N16(16); Tag("data"); N32(PCM.Num()*2); Wav.Append(reinterpret_cast<uint8*>(PCM.GetData()),PCM.Num()*2);
    Busy=true; Response->SetText(T(TEXT("Hearing your words…"))); int32 Speaker=Talking;
    auto Request=FHttpModule::Get().CreateRequest(); Request->SetURL(TEXT("http://127.0.0.1:8000/forest/transcribe")); Request->SetVerb(TEXT("POST")); Request->SetHeader(TEXT("Authorization"),TEXT("Bearer ")+Token); Request->SetHeader(TEXT("Content-Type"),TEXT("audio/wav")); Request->SetContent(Wav); Request->SetTimeout(40);
    TWeakObjectPtr<AForestGameMode> Weak(this);
    Request->OnProcessRequestComplete().BindLambda([Weak,Speaker](FHttpRequestPtr,FHttpResponsePtr Res,bool OK) {
        if(!Weak.IsValid()) return; Weak->Busy=false; if(!Weak->DialogueOpen || Weak->Talking!=Speaker || !Weak->Entry.IsValid()) return;
        TSharedPtr<FJsonObject> O; FString Line;
        if(OK && Res.IsValid() && Res->GetResponseCode()==200 && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Res->GetContentAsString()),O) && O->TryGetStringField(TEXT("text"),Line) && !Line.TrimStartAndEnd().IsEmpty()) {Weak->Entry->SetText(T(Line)); Weak->SendLine();}
        else Weak->Response->SetText(T(TEXT("I couldn't hear that clearly. Please try Talk again, or type your line.")));
    }); Request->ProcessRequest();
}
void AForestGameMode::EndPlay(const EEndPlayReason::Type Reason)
{
    CloseDialogue(); if(auto* Speech=GEngine->GetEngineSubsystem<UTextToSpeechEngineSubsystem>()) Speech->RemoveChannel(TEXT("Forest")); Super::EndPlay(Reason);
}
void AForestGameMode::ShowEnding()
{
    CloseDialogue(); DialogueOpen=true;
    Dialogue=SNew(SVerticalBox)
    +SVerticalBox::Slot().FillHeight(1)
    +SVerticalBox::Slot().AutoHeight().Padding(220,40)
    [SNew(SBorder).Padding(35).BorderBackgroundColor(FLinearColor(.015,.028,.025,.96))
      [SNew(SVerticalBox)
       +SVerticalBox::Slot().AutoHeight()[SNew(STextBlock).Text(T(TEXT("THE VILLAGE RELEASES YOU"))).Font(FCoreStyle::GetDefaultFontStyle(TEXT("Bold"),26))]
       +SVerticalBox::Slot().AutoHeight().Padding(0,18)[SNew(STextBlock).Text(T(TEXT("Mercy for Sable. Memory for Elin. Truth for Corvin.\nYou carried their names beyond the trees. For the first time, the bell is silent."))).AutoWrapText(true)]
       +SVerticalBox::Slot().AutoHeight()[SNew(SButton).Text(T(TEXT("Begin another walk"))).OnClicked_Lambda([this]{NewWalk(); return FReply::Handled();})]
      ]]
    +SVerticalBox::Slot().FillHeight(1);
    GEngine->GameViewport->AddViewportWidgetContent(Dialogue.ToSharedRef(),20);
    auto* PC=GetWorld()->GetFirstPlayerController(); FInputModeGameAndUI Mode; Mode.SetWidgetToFocus(Dialogue); PC->SetInputMode(Mode); PC->bShowMouseCursor=true;
}
void AForestGameMode::NewWalk()
{
    CloseDialogue(); Escaped=false; Seals=0; Talking=-1; Token.Empty(); PendingID.Empty(); PendingText.Empty(); PendingSpirit.Empty();
    if(auto* PC=GetWorld()->GetFirstPlayerController()) {
        if(auto* Player=Cast<AForestPlayer>(PC->GetPawn())) {Player->AutoWalk=false; Player->GetCharacterMovement()->StopMovementImmediately(); Player->SetActorLocation(FVector(-3700,0,100));}
        PC->SetControlRotation(FRotator::ZeroRotator);
    }
    StartSession();
}
