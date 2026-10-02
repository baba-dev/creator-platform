/**
 * Client-side Web Audio API assembly utilities to concatenate dialogue clips
 * into a single unified master audio track with configurable inter-line pauses.
 */

export interface DialogueAudioClip {
  id: string;
  url: string;
  speaker?: string;
  text?: string;
}

export interface AssembleAudioOptions {
  clips: DialogueAudioClip[];
  pauseDurationSeconds?: number; // Default 1.0s
  sampleRate?: number; // Default 44100
}

export interface AssembledAudioResult {
  blob: Blob;
  objectUrl: string;
  durationSeconds: number;
  totalClipsCount: number;
}

/**
 * Encodes an AudioBuffer into a standard 16-bit PCM WAV Blob.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const numSamples = buffer.length;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // RIFF identifier
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, format, true); // AudioFormat
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels into 16-bit PCM
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c]![i] ?? 0));
      // Convert float [-1.0, 1.0] to 16-bit signed integer [-32768, 32767]
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Downloads audio data for all clips, inserts specified inter-clip pauses,
 * and merges them into a single continuous AudioBuffer.
 */
export async function assembleMasterStoryAudio({
  clips,
  pauseDurationSeconds = 1.0,
  sampleRate = 44100,
}: AssembleAudioOptions): Promise<AssembledAudioResult> {
  if (clips.length === 0) {
    throw new Error("No dialogue clips provided for audio assembly.");
  }
  if (clips.length > 50) {
    throw new Error(
      "Master audio export is limited to 50 dialogue clips per assembly.",
    );
  }
  if (
    !Number.isFinite(pauseDurationSeconds) ||
    pauseDurationSeconds < 0 ||
    pauseDurationSeconds > 5 ||
    !Number.isSafeInteger(sampleRate) ||
    sampleRate < 8_000 ||
    sampleRate > 48_000
  ) {
    throw new Error("Audio assembly settings are outside safe limits.");
  }

  const audioCtx = new (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext
  )({ sampleRate });

  try {
    // 1. Fetch and decode each clip
    const decodedBuffers: AudioBuffer[] = [];
    for (const clip of clips) {
      const res = await fetch(clip.url);
      if (!res.ok) {
        throw new Error(
          `Failed to fetch audio for clip ${clip.speaker || clip.id}`,
        );
      }
      const length = Number(res.headers.get("content-length") ?? 0);
      if (Number.isFinite(length) && length > 25 * 1024 * 1024) {
        throw new Error("A dialogue clip exceeds the 25 MB assembly limit.");
      }
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > 25 * 1024 * 1024) {
        throw new Error("A dialogue clip exceeds the 25 MB assembly limit.");
      }
      const decoded = await audioCtx.decodeAudioData(arrayBuf);
      decodedBuffers.push(decoded);
    }

    // 2. Compute total sample length
    const pauseSamples = Math.floor(pauseDurationSeconds * sampleRate);
    let totalSamples = 0;

    for (let i = 0; i < decodedBuffers.length; i++) {
      totalSamples += decodedBuffers[i]!.length;
      if (i < decodedBuffers.length - 1) {
        totalSamples += pauseSamples;
      }
    }

    const durationSeconds = totalSamples / sampleRate;
    const estimatedWorkingBytes = totalSamples * 2 * 4;
    if (
      durationSeconds > 30 * 60 ||
      estimatedWorkingBytes > 120 * 1024 * 1024
    ) {
      throw new Error(
        "Master audio is too large for safe in-browser assembly. Export a smaller scene or fewer clips.",
      );
    }

    // 3. Create merged buffer (Stereo 2-channel)
    const mergedBuffer = audioCtx.createBuffer(2, totalSamples, sampleRate);
    const leftChannel = mergedBuffer.getChannelData(0);
    const rightChannel = mergedBuffer.getChannelData(1);

    let writeOffset = 0;
    for (let i = 0; i < decodedBuffers.length; i++) {
      const current = decodedBuffers[i]!;
      const currentLeft = current.getChannelData(0);
      const currentRight =
        current.numberOfChannels > 1 ? current.getChannelData(1) : currentLeft;

      // Copy audio data
      leftChannel.set(currentLeft, writeOffset);
      rightChannel.set(currentRight, writeOffset);
      writeOffset += current.length;

      // Add inter-clip pause
      if (i < decodedBuffers.length - 1) {
        writeOffset += pauseSamples;
      }
    }

    // 4. Encode to standard WAV
    const blob = audioBufferToWav(mergedBuffer);
    const objectUrl = URL.createObjectURL(blob);

    return {
      blob,
      objectUrl,
      durationSeconds,
      totalClipsCount: clips.length,
    };
  } finally {
    void audioCtx.close();
  }
}
