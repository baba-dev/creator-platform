import type { VideoRequestV2 } from "./video-contract";

export interface TalkingAvatarAssetSnapshot {
  id: string;
  mediaKind: string;
  mimeType: string;
  byteSize: bigint;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

export interface TalkingAvatarSourceFacts {
  avatarAssetId: string;
  drivingAudioAssetId: string;
  drivingAudioDurationMs: number;
  billableDurationSeconds: number;
}

const MAX_AVATAR_IMAGE_BYTES = 5n * 1024n * 1024n;
const MAX_DRIVING_AUDIO_BYTES = 25n * 1024n * 1024n;

export function inspectTalkingAvatarSources(
  request: VideoRequestV2,
  assets: ReadonlyMap<string, TalkingAvatarAssetSnapshot>,
): TalkingAvatarSourceFacts {
  if (request.workflow !== "TALKING_AVATAR") {
    throw new RangeError("Talking-avatar source inspection requires its workflow.");
  }

  const avatarSource = request.sources.find(
    (source) => source.role === "AVATAR_IMAGE",
  );
  const audioSource = request.sources.find(
    (source) => source.role === "DRIVING_AUDIO",
  );
  if (!avatarSource || !audioSource || request.sources.length !== 2) {
    throw new RangeError(
      "Talking-avatar generation requires one avatar image and one driving audio source.",
    );
  }

  const avatar = assets.get(avatarSource.assetId);
  const audio = assets.get(audioSource.assetId);
  if (!avatar || !audio) {
    throw new RangeError("Talking-avatar source media is unavailable.");
  }

  if (
    avatar.mediaKind !== "IMAGE" ||
    !["image/jpeg", "image/png", "image/jfif", "image/pjpeg"].includes(
      avatar.mimeType,
    ) ||
    avatar.byteSize <= 0n ||
    avatar.byteSize >= MAX_AVATAR_IMAGE_BYTES ||
    avatar.width === null ||
    avatar.height === null ||
    avatar.width <= 0 ||
    avatar.height <= 0 ||
    avatar.width >= 4096 ||
    avatar.height >= 4096
  ) {
    throw new RangeError(
      "Avatar image must be JPEG/PNG/JFIF, under 5 MB, and smaller than 4096×4096.",
    );
  }

  if (
    audio.mediaKind !== "AUDIO" ||
    !audio.mimeType.startsWith("audio/") ||
    audio.byteSize <= 0n ||
    audio.byteSize > MAX_DRIVING_AUDIO_BYTES ||
    audio.durationMs === null ||
    !Number.isSafeInteger(audio.durationMs) ||
    audio.durationMs <= 0 ||
    audio.durationMs >= 60_000
  ) {
    throw new RangeError(
      "Driving audio must be a valid audio asset shorter than 60 seconds.",
    );
  }

  return {
    avatarAssetId: avatar.id,
    drivingAudioAssetId: audio.id,
    drivingAudioDurationMs: audio.durationMs,
    billableDurationSeconds: Math.ceil(audio.durationMs / 1000),
  };
}
