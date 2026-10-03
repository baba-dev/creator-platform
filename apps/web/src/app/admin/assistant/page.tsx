import { hasPlatformPermission } from "@aiwa/authz";
import { getAssistantSettings } from "@aiwa/assistant";
import { requirePlatformPermission } from "@/lib/request-auth";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";
import { AssistantSettingsPanel } from "@/components/admin/assistant-settings-panel";

export default async function AdminAssistantPage() {
  const session = await requirePlatformPermission("models:read");
  const [settings, discovery] = await Promise.all([
    getAssistantSettings(),
    getAvailableStudioModels("character-chat"),
  ]);

  return (
    <AssistantSettingsPanel
      initialSettings={{
        id: settings.id,
        providerModelRecordId: settings.providerModelRecordId,
        modelDisplayName: settings.providerModel?.displayName ?? null,
        pricingMode: settings.pricingMode,
        systemPromptOverride: settings.systemPromptOverride,
        enabled: settings.enabled,
      }}
      availableModels={discovery.models}
      canManage={hasPlatformPermission(
        session.user.platformRole,
        "models:manage",
      )}
    />
  );
}
