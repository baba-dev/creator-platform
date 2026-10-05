import { hasPlatformPermission } from "@aiwa/authz";
import { getAssistantSettings } from "@aiwa/assistant";
import { requirePlatformPermission } from "@/lib/request-auth";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";
import { AssistantSettingsPanel } from "@/components/admin/assistant-settings-panel";

export default async function AdminAssistantPage() {
  const session = await requirePlatformPermission("models:read");
  const [settings, characterChatDiscovery, chatDiscovery] = await Promise.all([
    getAssistantSettings(),
    getAvailableStudioModels("character-chat"),
    getAvailableStudioModels("chat"),
  ]);

  const seenModelIds = new Set<string>();
  const combinedModels = [];
  for (const model of [
    ...characterChatDiscovery.models,
    ...chatDiscovery.models,
  ]) {
    if (!seenModelIds.has(model.id)) {
      seenModelIds.add(model.id);
      combinedModels.push(model);
    }
  }

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
      availableModels={combinedModels}
      canManage={hasPlatformPermission(
        session.user.platformRole,
        "models:manage",
      )}
    />
  );
}
