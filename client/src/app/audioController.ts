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
  currentTrackPaused: boolean | null;
  primedTrackCount: number;
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
  private readonly audio = new Audio();
  private currentCue: MusicCue = "none";
  private currentTrackSource: string | null = null;
  private gameplayTrackIndex = 0;
  private unlocked = false;
  private applyRequestId = 0;

  public constructor() {
    this.audio.loop = true;
    this.audio.preload = "auto";

    const handleUserGesture = () => {
      void this.handleUserGesture();
    };

    window.addEventListener("pointerdown", handleUserGesture, { passive: true });
    window.addEventListener("touchstart", handleUserGesture, { passive: true });
    window.addEventListener("keydown", handleUserGesture);
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  public async unlock(): Promise<void> {
    if (!this.unlocked) {
      this.unlocked = true;
    }

    await this.applyCue(this.currentCue);
  }

  public setCue(cue: MusicCue): void {
    if (cue === this.currentCue) {
      if (cue !== "none" && this.unlocked && this.audio.paused) {
        void this.applyCue(cue);
      }
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
      currentTrackPaused: this.currentTrackSource ? this.audio.paused : null,
      primedTrackCount: 1,
    };
  }

  private async handleUserGesture(): Promise<void> {
    await this.unlock();
  }

  private getTrackForCue(cue: MusicCue): TrackConfig | null {
    if (cue === "none") {
      return null;
    }

    if (cue === "title") {
      return this.titleTrack;
    }

    return this.gameplayTracks[this.gameplayTrackIndex] ?? this.titleTrack;
  }

  private async applyCue(cue: MusicCue): Promise<void> {
    if (!this.unlocked) {
      return;
    }

    const requestId = ++this.applyRequestId;
    const nextTrack = this.getTrackForCue(cue);

    if (!nextTrack) {
      this.stopCurrent();
      return;
    }

    this.audio.volume = nextTrack.volume;
    if (this.currentTrackSource !== nextTrack.source) {
      this.audio.pause();
      this.audio.src = nextTrack.source;
      this.audio.load();
      this.currentTrackSource = nextTrack.source;
    }

    try {
      await this.audio.play();
      if (requestId !== this.applyRequestId) {
        this.audio.pause();
      }
    } catch {
      this.unlocked = false;
    }
  }

  private stopCurrent(): void {
    this.audio.pause();
    try {
      this.audio.currentTime = 0;
    } catch {
      // Ignore reset failures from browsers that have not loaded the media yet.
    }
    this.currentTrackSource = null;
  }
}
