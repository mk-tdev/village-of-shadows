#include "ShadowGameMode.h"
#include "Modules/ModuleManager.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/PointLight.h"
#include "Engine/DirectionalLight.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/TextRenderComponent.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/PlayerController.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/SWeakWidget.h"
#include "Styling/CoreStyle.h"
#include "TextToSpeechEngineSubsystem.h"

IMPLEMENT_PRIMARY_GAME_MODULE(FDefaultGameModuleImpl, VillageOfShadows, TEXT("VillageOfShadows"));

using JObject = TSharedPtr<FJsonObject>;
static FString Str(const JObject& O, const TCHAR* K)
{
    FString V; if (O) O->TryGetStringField(K, V); return V;
}
static FText Txt(const FString& S) { return FText::FromString(S); }
static FString Encode(const JObject& O)
{
    FString S; FJsonSerializer::Serialize(O.ToSharedRef(), TJsonWriterFactory<>::Create(&S)); return S;
}

class SShadowCouncil : public SCompoundWidget
{
public:
    SLATE_BEGIN_ARGS(SShadowCouncil) {} SLATE_END_ARGS()
    void Construct(const FArguments&)
    {
        ChildSlot
        [ SNew(SHorizontalBox)
          + SHorizontalBox::Slot().FillWidth(0.52f).VAlign(VAlign_Top).Padding(35)
          [ SNew(SVerticalBox)
            + SVerticalBox::Slot().AutoHeight()[SNew(STextBlock).Text(Txt(TEXT("VILLAGE OF SHADOWS"))).Font(FCoreStyle::GetDefaultFontStyle(TEXT("Bold"), 28))]
            + SVerticalBox::Slot().AutoHeight().Padding(0,12)[SNew(STextBlock).Text(Txt(TEXT("Seven seats. Six minds. One of them is yours."))).Font(FCoreStyle::GetDefaultFontStyle(TEXT("Regular"), 16))]
            + SVerticalBox::Slot().AutoHeight().Padding(0,16)[SAssignNew(Roster, STextBlock).AutoWrapText(true)]
          ]
          + SHorizontalBox::Slot().FillWidth(0.48f).Padding(20)
          [SNew(SBorder).Padding(20).BorderBackgroundColor(FLinearColor(0.025f,0.035f,0.055f,0.97f))
            [SNew(SVerticalBox)
             + SVerticalBox::Slot().AutoHeight()[SAssignNew(Status, STextBlock).AutoWrapText(true).Text(Txt(TEXT("Gather at the council fire") )).Font(FCoreStyle::GetDefaultFontStyle(TEXT("Bold"), 20))]
             + SVerticalBox::Slot().AutoHeight().Padding(0,10)[SAssignNew(Setup, SVerticalBox)]
             + SVerticalBox::Slot().FillHeight(1).Padding(0,8)[SAssignNew(Transcript, SScrollBox)]
             + SVerticalBox::Slot().AutoHeight().Padding(0,8)[SAssignNew(Prompt, STextBlock).AutoWrapText(true)]
             + SVerticalBox::Slot().AutoHeight()[SAssignNew(Input, SEditableTextBox).HintText(Txt(TEXT("Speak to the village…")))]
             + SVerticalBox::Slot().AutoHeight().Padding(0,8)[SNew(SBox).MaxDesiredHeight(310)[SNew(SScrollBox)+SScrollBox::Slot()[SAssignNew(Actions, SVerticalBox)]]]
             + SVerticalBox::Slot().AutoHeight()[SNew(SButton).Text(Txt(TEXT("Stop narration"))).OnClicked_Lambda([]{ if(auto* Speech=GEngine->GetEngineSubsystem<UTextToSpeechEngineSubsystem>()) Speech->StopSpeakingOnChannel(TEXT("Council")); return FReply::Handled(); })]
            ]
          ]
        ];
        Setup->AddSlot().AutoHeight()[SNew(STextBlock).Text(Txt(TEXT("Backend address")))];
        Setup->AddSlot().AutoHeight()[SAssignNew(Address, SEditableTextBox).Text(Txt(TEXT("http://127.0.0.1:8000")))];
        Setup->AddSlot().AutoHeight().Padding(0,5)[SNew(STextBlock).Text(Txt(TEXT("OpenAI model (uses the server's configured key)")))];
        Setup->AddSlot().AutoHeight()[SAssignNew(Model, SEditableTextBox).Text(Txt(TEXT("gpt-5.4-mini")))];
        Setup->AddSlot().AutoHeight().Padding(0,6)[SNew(STextBlock).AutoWrapText(true).Text(Txt(TEXT("Live AI makes model API calls. Practice uses deterministic mock agents, without model charges.")))];
        Setup->AddSlot().AutoHeight()[Button(TEXT("Play with live AI"), [this]{ Start(false); })];
        Setup->AddSlot().AutoHeight().Padding(0,6)[Button(TEXT("Practice council (no model calls)"), [this]{ Start(true); })];
        Prompt->SetText(Txt(TEXT("You play Mara. Your role is assigned when the game begins. The other villagers keep their roles secret.")));
        Input->SetVisibility(EVisibility::Collapsed);
        RegisterActiveTimer(1.0f, FWidgetActiveTimerDelegate::CreateSP(this, &SShadowCouncil::PollTimer));
    }
private:
    TSharedPtr<STextBlock> Status, Prompt, Roster;
    TSharedPtr<SVerticalBox> Setup, Actions;
    TSharedPtr<SScrollBox> Transcript;
    TSharedPtr<SEditableTextBox> Address, Model, Input;
    FString Base, Session, SeatToken, HostToken, TurnKey, Kind;
    JObject Awaiting;
    int32 LastSeq = 0;
    bool Busy = false, Polling = false, Finished = false, Sending = false;
    FString AcceptedTurn;
    double AcceptedAt = 0;
    TSharedRef<SWidget> Button(const FString& Label, TFunction<void()> Fn)
    {
        return SNew(SButton).ContentPadding(FMargin(12,8)).Text(Txt(Label))
            .OnClicked_Lambda([Fn]{ Fn(); return FReply::Handled(); });
    }
    void Request(const FString& Verb, const FString& Path, const FString& Body, TFunction<void(JObject,FString)> Done)
    {
        auto Req = FHttpModule::Get().CreateRequest();
        Req->SetURL(Base + Path); Req->SetVerb(Verb); Req->SetTimeout(180);
        Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
        if (!Body.IsEmpty()) Req->SetContentAsString(Body);
        TWeakPtr<SShadowCouncil> Weak = SharedThis(this);
        Req->OnProcessRequestComplete().BindLambda([Weak, Done](FHttpRequestPtr, FHttpResponsePtr Response, bool Ok)
        {
            if (!Weak.IsValid()) return;
            JObject Data;
            if (!Ok || !Response.IsValid()) { Done(nullptr, TEXT("Cannot reach the game server. Check the backend address and server.")); return; }
            FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Response->GetContentAsString()), Data);
            if (Response->GetResponseCode() < 200 || Response->GetResponseCode() >= 300)
            { Done(nullptr, FString::Printf(TEXT("Server error %d: %s"), Response->GetResponseCode(), *Response->GetContentAsString().Left(700))); return; }
            if (!Data) { Done(nullptr,TEXT("Invalid server response.")); return; }
            Done(Data, TEXT(""));
        });
        if (!Req->ProcessRequest()) Done(nullptr, TEXT("Could not start network request."));
    }
    void Fail(const FString& Error)
    {
        Status->SetText(Txt(Error)); Busy = false; Setup->SetEnabled(true);
    }
    void Start(bool Mock)
    {
        if (Busy || !Session.IsEmpty()) return;
        Base = Address->GetText().ToString().TrimStartAndEnd(); Base.RemoveFromEnd(TEXT("/"));
        if (!Base.StartsWith(TEXT("http://")) && !Base.StartsWith(TEXT("https://"))) { Fail(TEXT("Enter an http:// or https:// backend address.")); return; }
        Busy = true; Setup->SetEnabled(false); Status->SetText(Txt(TEXT("Checking the six minds…")));
        const TCHAR* Names[] = {TEXT("Mara"),TEXT("Tomas"),TEXT("Elin"),TEXT("Bram"),TEXT("Sable"),TEXT("Corvin"),TEXT("Petra")};
        const TCHAR* Personas[] = {TEXT("Curious investigator"),TEXT("Skeptical blacksmith; demand evidence"),TEXT("Compassionate healer; protect the vulnerable"),TEXT("Bold watchman; speak directly"),TEXT("Observant herbalist; notice contradictions"),TEXT("Persuasive scholar; build alliances"),TEXT("Pragmatic baker; weigh testimony carefully")};
        TArray<TSharedPtr<FJsonValue>> Seats;
        for (int32 I=0; I<7; ++I)
        {
            auto S = MakeShared<FJsonObject>();
            S->SetStringField(TEXT("seat_id"), FString::Printf(TEXT("seat-%d"),I)); S->SetStringField(TEXT("display_name"),Names[I]);
            S->SetStringField(TEXT("personality"),Personas[I]); S->SetStringField(TEXT("controller"),I==0?TEXT("human"):TEXT("ai"));
            if (I>0) { S->SetStringField(TEXT("provider"),Mock?TEXT("mock"):TEXT("openai")); S->SetStringField(TEXT("model_name"),Mock?TEXT("mock-v1"):Model->GetText().ToString()); }
            Seats.Add(MakeShared<FJsonValueObject>(S));
        }
        auto Body = MakeShared<FJsonObject>(); Body->SetArrayField(TEXT("seats"),Seats);
        auto Options = MakeShared<FJsonObject>(); Options->SetStringField(TEXT("scenario"),TEXT("missing-villager"));
        Options->SetStringField(TEXT("room_name"),TEXT("Unreal council")); Body->SetObjectField(TEXT("options"),Options);
        FString ArrayJson; FJsonSerializer::Serialize(Seats,TJsonWriterFactory<>::Create(&ArrayJson));
        Request(TEXT("POST"),TEXT("/games/preflight"),ArrayJson,[this,Body](JObject Check,FString Error)
        {
            if (!Error.IsEmpty()) { Fail(Error); return; }
            bool Ready = false; Check->TryGetBoolField(TEXT("ok"),Ready);
            if (!Ready) { Fail(TEXT("Model readiness failed. Check server configuration, edit the model, or use Practice. ") + Encode(Check).Left(500)); return; }
            Request(TEXT("POST"),TEXT("/games"),Encode(Body),[this](JObject Created,FString CreateError)
            {
                if (!CreateError.IsEmpty()) { Fail(CreateError); return; }
                Session = Str(Created,TEXT("session_id")); HostToken = Str(Created,TEXT("host_token"));
                const TArray<TSharedPtr<FJsonValue>>* Humans = nullptr;
                if (Created->TryGetArrayField(TEXT("human_seats"),Humans) && Humans->Num()) SeatToken=Str((*Humans)[0]->AsObject(),TEXT("access_token"));
                if (Session.IsEmpty() || SeatToken.IsEmpty()) { Session.Empty(); Fail(TEXT("Server did not return seat credentials.")); return; }
                Setup->SetVisibility(EVisibility::Collapsed);
                Status->SetText(Txt(TEXT("The village is waking…")));
                Request(TEXT("POST"),TEXT("/games/")+Session+TEXT("/begin?host_token=")+HostToken,TEXT(""),[this](JObject,FString BeginError)
                {
                    Busy=false;
                    if (!BeginError.IsEmpty()) { Status->SetText(Txt(BeginError)); return; }
                    Poll();
                });
            });
        });
    }
    EActiveTimerReturnType PollTimer(double, float) { Poll(); return EActiveTimerReturnType::Continue; }
    void Poll()
    {
        if (Session.IsEmpty() || Busy || Polling || Finished) return;
        Polling=true;
        Request(TEXT("GET"),TEXT("/games/")+Session+TEXT("/state?seat_id=seat-0&access_token=")+SeatToken,TEXT(""),[this](JObject State,FString Error)
        {
            Polling=false;
            if (!Error.IsEmpty()) { Status->SetText(Txt(Error+TEXT(" Retrying…"))); return; }
            Apply(State);
        });
    }
    void Apply(const JObject& State)
    {
        const TArray<TSharedPtr<FJsonValue>>* Players=nullptr;
        TMap<FString,FString> Names;
        FString RosterText;
        if (State->TryGetArrayField(TEXT("players"),Players)) for (auto& V:*Players)
        {
            auto P=V->AsObject(); Names.Add(Str(P,TEXT("seat_id")),Str(P,TEXT("name")));
            bool Alive=true; P->TryGetBoolField(TEXT("alive"),Alive);
            FString Role=Str(P,TEXT("role"));
            RosterText+=Str(P,TEXT("name"))+(Str(P,TEXT("seat_id"))==TEXT("seat-0")?TEXT(" (you)"):TEXT(""))+TEXT("  ·  ")+(Alive?TEXT("alive"):TEXT("fallen"))+(Role.IsEmpty()?TEXT(""):TEXT("  ·  ")+Role)+TEXT("\n\n");
        }
        Roster->SetText(Txt(RosterText));
        const TArray<TSharedPtr<FJsonValue>>* Logs=nullptr;
        if (State->TryGetArrayField(TEXT("log"),Logs)) for (auto& V:*Logs)
        {
            auto L=V->AsObject(); int32 Seq=0; L->TryGetNumberField(TEXT("seq"),Seq);
            if (Seq<=LastSeq) continue;
            LastSeq=Seq;
            FString Line=Str(L,TEXT("text")); if (Line.IsEmpty()) Line=Str(L,TEXT("type"))+TEXT(" → ")+Str(L,TEXT("target"));
            const FString Name=Names.FindRef(Str(L,TEXT("seat_id")));
            Transcript->AddSlot().Padding(0,7)[SNew(STextBlock).AutoWrapText(true).Text(Txt((Name.IsEmpty()?TEXT(""):Name+TEXT(": "))+Line)).Font(FCoreStyle::GetDefaultFontStyle(TEXT("Regular"),15))];
            if(Str(L,TEXT("type"))==TEXT("statement")) Transcript->AddSlot()[Button(TEXT("Read aloud"),[Line]{ if(auto* Speech=GEngine->GetEngineSubsystem<UTextToSpeechEngineSubsystem>()) Speech->SpeakOnChannel(TEXT("Council"),Line); })];
            Transcript->ScrollToEnd();
        }
        int32 Round=0; State->TryGetNumberField(TEXT("round"),Round);
        Status->SetText(Txt(FString::Printf(TEXT("Round %d  /  %s"),Round,*Str(State,TEXT("phase")))));
        const FString Winner=Str(State,TEXT("winner"));
        if (!Winner.IsEmpty())
        {
            Finished=true; Actions->ClearChildren(); Input->SetVisibility(EVisibility::Collapsed);
            Prompt->SetText(Txt(TEXT("The night is over. Winner: ")+Winner));
            Actions->AddSlot().AutoHeight()[Button(TEXT("Return to setup"),[this]{ Session.Empty(); SeatToken.Empty(); HostToken.Empty(); LastSeq=0; Finished=false; TurnKey.Empty(); Transcript->ClearChildren(); Actions->ClearChildren(); Setup->SetVisibility(EVisibility::Visible); Setup->SetEnabled(true); Status->SetText(Txt(TEXT("Gather again"))); })]; return;
        }
        bool Paused=false; State->TryGetBoolField(TEXT("paused"),Paused);
        if (Paused)
        {
            if(TurnKey!=TEXT("paused"))
            {
                TurnKey=TEXT("paused"); Actions->ClearChildren();
                Prompt->SetText(Txt(TEXT("The agents paused after a recoverable failure. You can retry the turn.")));
                Actions->AddSlot().AutoHeight()[Button(TEXT("Resume council"),[this]{ Request(TEXT("POST"),TEXT("/games/")+Session+TEXT("/continue?host_token=")+HostToken,TEXT(""),[this](JObject,FString Error){ if(!Error.IsEmpty())Status->SetText(Txt(Error)); }); })];
            }
            return;
        }
        const JObject* A=nullptr;
        if (!State->TryGetObjectField(TEXT("awaiting"),A) || !A || !A->IsValid())
        {
            TurnKey.Empty(); Actions->ClearChildren(); Input->SetVisibility(EVisibility::Collapsed);
            Prompt->SetText(Txt(TEXT("The villagers are considering their next move…"))); return;
        }
        const FString Key=Encode(*A)+FString::FromInt(Round);
        if(Key==AcceptedTurn && FPlatformTime::Seconds()-AcceptedAt<3) return;
        if (Key==TurnKey) return;
        TurnKey=Key; Awaiting=*A; Kind=Str(Awaiting,TEXT("kind"));
        Prompt->SetText(Txt(Str(Awaiting,TEXT("prompt")))); Actions->ClearChildren(); Actions->SetEnabled(!Sending);
        const bool NeedsText=Kind==TEXT("statement") || Kind==TEXT("werewolf_negotiation");
        Input->SetVisibility(NeedsText?EVisibility::Visible:EVisibility::Collapsed); Input->SetText(FText::GetEmpty());
        if (Kind==TEXT("statement")) Actions->AddSlot().AutoHeight()[Button(TEXT("Speak"),[this]{ auto V=MakeShared<FJsonObject>(); const FString Line=Input->GetText().ToString().TrimStartAndEnd(); if(Line.IsEmpty())return; V->SetStringField(TEXT("text"),Line); Submit(V); })];
        const TArray<TSharedPtr<FJsonValue>>* Choices=nullptr;
        if (Awaiting->TryGetArrayField(TEXT("options"),Choices)) for (auto& V:*Choices)
        {
            const FString Choice=V->AsString(); FString Label=Choice;
            const JObject* Investigation=nullptr;
            if (Awaiting->TryGetObjectField(TEXT("investigation"),Investigation))
            {
                const TArray<TSharedPtr<FJsonValue>>* Details=nullptr;
                if ((*Investigation)->TryGetArrayField(TEXT("choices"),Details)) for(auto& D:*Details)
                    if(Str(D->AsObject(),TEXT("id"))==Choice) Label=Str(D->AsObject(),TEXT("label"))+TEXT(" — ")+Str(D->AsObject(),TEXT("detail"));
            }
            Actions->AddSlot().AutoHeight().Padding(0,3)[Button(Label,[this,Choice]{ auto Value=MakeShared<FJsonObject>();
                if(Kind==TEXT("investigation")) { Value->SetStringField(TEXT("action"),Choice); Value->SetStringField(TEXT("turn_id"),Str(Awaiting,TEXT("turn_id"))); }
                else { Value->SetStringField(TEXT("target"),Choice); if(Kind==TEXT("werewolf_negotiation")) Value->SetStringField(TEXT("text"),Input->GetText().ToString()); }
                Submit(Value); })];
        }
    }
    void Submit(const JObject& Value)
    {
        if(Sending)return; Sending=true; Actions->SetEnabled(false);
        auto Body=MakeShared<FJsonObject>(); Body->SetStringField(TEXT("seat_id"),TEXT("seat-0")); Body->SetStringField(TEXT("kind"),Kind);
        Body->SetStringField(TEXT("access_token"),SeatToken); Body->SetObjectField(TEXT("value"),Value);
        const FString SubmittedKey=TurnKey;
        Request(TEXT("POST"),TEXT("/games/")+Session+TEXT("/input"),Encode(Body),[this,SubmittedKey](JObject,FString Error)
        {
            Sending=false;
            if(!Error.IsEmpty()) { Status->SetText(Txt(Error)); Actions->SetEnabled(true); return; }
            AcceptedTurn=SubmittedKey; AcceptedAt=FPlatformTime::Seconds();
            Actions->ClearChildren(); TurnKey.Empty(); Prompt->SetText(Txt(TEXT("Your action was accepted."))); Poll();
        });
    }
};

AShadowGameMode::AShadowGameMode() { DefaultPawnClass=nullptr; }
void AShadowGameMode::BeginPlay()
{
    Super::BeginPlay();
    if(auto* Speech=GEngine->GetEngineSubsystem<UTextToSpeechEngineSubsystem>()) { Speech->AddDefaultChannel(TEXT("Council")); Speech->ActivateChannel(TEXT("Council")); }
    auto* World=GetWorld();
    auto SpawnMesh=[World](const TCHAR* Shape,FVector Position,FVector Scale)
    {
        auto* Actor=World->SpawnActor<AStaticMeshActor>(Position,FRotator::ZeroRotator);
        Actor->GetStaticMeshComponent()->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,Shape));
        Actor->SetActorScale3D(Scale); return Actor;
    };
    SpawnMesh(TEXT("/Engine/BasicShapes/Cube.Cube"),FVector(0,0,-40),FVector(35,35,.5));
    const TCHAR* Names[]={TEXT("Mara"),TEXT("Tomas"),TEXT("Elin"),TEXT("Bram"),TEXT("Sable"),TEXT("Corvin"),TEXT("Petra")};
    for(int32 I=0;I<7;++I)
    {
        const float A=2*PI*I/7;
        FVector P(340*FMath::Cos(A),340*FMath::Sin(A),55);
        SpawnMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"),P,FVector(.65,.65,1.5));
        SpawnMesh(TEXT("/Engine/BasicShapes/Sphere.Sphere"),P+FVector(0,0,110),FVector(.55));
        auto* Marker=World->SpawnActor<AActor>(P+FVector(0,0,175),FRotator(0,180,0));
        auto* Text=NewObject<UTextRenderComponent>(Marker); Marker->SetRootComponent(Text); Text->RegisterComponent();
        Text->SetWorldLocation(P+FVector(0,0,175));
        Text->SetWorldRotation(FRotator(0,45,0));
        Text->SetText(Txt(Names[I])); Text->SetWorldSize(24); Text->SetHorizontalAlignment(EHTA_Center);
        Text->SetTextRenderColor(FColor(235,194,128));
    }
    for(int32 I=0;I<16;++I)
    {
        float A=2*PI*I/16; SpawnMesh(TEXT("/Engine/BasicShapes/Sphere.Sphere"),FVector(100*FMath::Cos(A),100*FMath::Sin(A),0),FVector(.32,.32,.22));
    }
    auto* Fire=World->SpawnActor<APointLight>(FVector(0,0,100),FRotator::ZeroRotator);
    Fire->PointLightComponent->SetIntensity(12000); Fire->PointLightComponent->SetLightColor(FLinearColor(1,.3,.07)); Fire->PointLightComponent->SetAttenuationRadius(1700);
    auto* Moon=World->SpawnActor<ADirectionalLight>(FVector(0,0,600),FRotator(-50,-30,0));
    Moon->GetLightComponent()->SetIntensity(1.5f); Moon->GetLightComponent()->SetLightColor(FLinearColor(.25,.4,.8));
    auto* Camera=World->SpawnActor<ACameraActor>(FVector(1000,950,800),FRotator(-30,-135,0)); Camera->GetCameraComponent()->FieldOfView=65;
    auto* PC=World->GetFirstPlayerController(); PC->SetViewTarget(Camera); PC->bShowMouseCursor=true; PC->SetInputMode(FInputModeUIOnly());
    Council=SNew(SShadowCouncil); Root=SNew(SWeakWidget).PossiblyNullContent(Council);
    GEngine->GameViewport->AddViewportWidgetContent(Root.ToSharedRef());
}
void AShadowGameMode::EndPlay(const EEndPlayReason::Type Reason)
{
    if(GEngine && GEngine->GameViewport && Root) GEngine->GameViewport->RemoveViewportWidgetContent(Root.ToSharedRef());
    Root.Reset(); Council.Reset(); Super::EndPlay(Reason);
    if(GEngine) if(auto* Speech=GEngine->GetEngineSubsystem<UTextToSpeechEngineSubsystem>()) Speech->RemoveChannel(TEXT("Council"));
}
