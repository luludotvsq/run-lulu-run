import { GAME_ASSET_MANIFEST } from "../game/assets/manifest.js";
import { CLIENT_CONFIG } from "../game/clientConfig.js";

export type MusicCue = "title" | "gameplay" | "none";
type MusicTrackKey = keyof typeof GAME_ASSET_MANIFEST.audio.music;

interface TrackConfig {
  source: string;
  volume: number;
}

export interface AudioDebugState {
  cue: MusicCue;
  unlocked: boolean;
  gameplayTrackIndex: number;
  gameplayTrackCount: number;
  currentTrackSource: string | null;
}

export class AudioController {
  private readonly titleTrack: TrackConfig = {
    source: GAME_ASSET_MANIFEST.audio.music[CLIENT_CONFIG.audio.titleTrack as MusicTrackKey],
    volume: CLIENT_CONFIG.audio.titleVolume,
  };
  private readonly gameplayTracks: TrackConfig[] = CLIENT_CONFIG.audio.gameplayTracks.map((key) => ({
    source: GAME_ASSET_MANIFEST.audio.music[key as MusicTrackKey],
    volume: CLIENT_CONFIG.audio.gameplayVolume,
  }));
  private currentCue: MusicCue = "none";
  private currentAudio: HTMLAudioElement | null = null;
  private currentTrackSource: string | null = null;
  private gameplayTrackIndex = 0;
  private unlocked = false;

  public constructor() {
    const unlock = () => {
      void this.unlock();
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  public async unlock(): Promise<void> {
    if (this.unlocked) {
      return;
    }

    this.unlocked = true;
    await this.applyCue(this.currentCue);
  }

  public setCue(cue: MusicCue): void {
    if (cue === this.currentCue) {
      return;
    }

    this.currentCue = cue;
    void this.applyCue(cue);
  }

  public setGameplayTrackIndex(index: number): void {
    if (this.gameplayTracks.length === 0) {
      this.gameplayTrackIndex = 0;
      return;
    }

    const normalized = ((index % this.gameplayTracks.length) + this.gameplayTracks.length) % this.gameplayTracks.length;
    if (normalized === this.gameplayTrackIndex) {
      return;
    }

    this.gameplayTrackIndex = normalized;
  }

  public getDebugState(): AudioDebugState {
    return {
      cue: this.currentCue,
      unlocked: this.unlocked,
      gameplayTrackIndex: this.gameplayTrackIndex,
      gameplayTrackCount: this.gameplayTracks.length,
      currentTrackSource: this.currentTrackSource,
    };
  }

  private async applyCue(cue: MusicCue): Promise<void> {
    if (!this.unlocked) {
      return;
    }

    if (cue === "none") {
      this.stopCurrent();
      return;
    }

    const nextTrack = cue === "title" ? this.titleTrack : this.gameplayTracks[this.gameplayTrackIndex] ?? this.titleTrack;
    if (!this.currentAudio) {
      await this.startTrack(nextTrack);
      return;
    }

    if (this.currentTrackSource === nextTrack.source) {
      this.currentAudio.volume = nextTrack.volume;
      if (this.currentAudio.paused) {
        try {
          await this.currentAudio.play();
        } catch {
          this.unlocked = false;
        }
      }
      return;
    }

    this.stopCurrent();
    await this.startTrack(nextTrack);
  }

  private async startTrack(track: TrackConfig): Promise<void> {
    const audio = new Audio(track.source);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = track.volume;
    this.currentAudio = audio;
    this.currentTrackSource = track.source;

    try {
      await audio.play();
    } catch {
      this.unlocked = false;
      this.currentAudio = null;
      this.currentTrackSource = null;
    }
  }

  private stopCurrent(): void {
    if (!this.currentAudio) {
      return;
    }

    this.currentAudio.pause();
    this.currentAudio.currentTime = 0;
    this.currentAudio = null;
    this.currentTrackSource = null;
  }
}
