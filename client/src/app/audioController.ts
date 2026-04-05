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
  private currentCue: MusicCue = "none";
  private currentAudio: HTMLAudioElement | null = null;
  private currentTrackSource: string | null = null;
  private gameplayTrackIndex = 0;
  private unlocked = false;
  private readonly trackPool = new Map<string, HTMLAudioElement>();
  private applyRequestId = 0;

  public constructor() {
    const handleUserGesture = () => {
      void this.handleUserGesture();
    };

    for (const track of this.getUniqueTracks()) {
      this.getTrackAudio(track);
    }

    window.addEventListener("pointerdown", handleUserGesture, { passive: true });
    window.addEventListener("touchstart", handleUserGesture, { passive: true });
    window.addEventListener("keydown", handleUserGesture);
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  public async unlock(): Promise<void> {
    if (!this.unlocked) {
      this.unlocked = await this.primeTracks();
    }

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
      currentTrackPaused: this.currentAudio ? this.currentAudio.paused : null,
      primedTrackCount: this.trackPool.size,
    };
  }

  private getUniqueTracks(): TrackConfig[] {
    const uniqueTracks = new Map<string, TrackConfig>();
    for (const track of [this.titleTrack, ...this.gameplayTracks]) {
      if (!uniqueTracks.has(track.source)) {
        uniqueTracks.set(track.source, track);
      }
    }
    return [...uniqueTracks.values()];
  }

  private getTrackAudio(track: TrackConfig): HTMLAudioElement {
    const existing = this.trackPool.get(track.source);
    if (existing) {
      return existing;
    }

    const audio = new Audio(track.source);
    audio.loop = true;
    audio.preload = "auto";
    this.trackPool.set(track.source, audio);
    return audio;
  }

  private async handleUserGesture(): Promise<void> {
    if (!this.unlocked) {
      await this.unlock();
      return;
    }

    if (this.currentCue !== "none" && this.currentAudio?.paused) {
      await this.applyCue(this.currentCue);
    }
  }

  private async primeTracks(): Promise<boolean> {
    let primedAnyTrack = false;
    for (const track of this.getUniqueTracks()) {
      const audio = this.getTrackAudio(track);
      const previousMuted = audio.muted;
      const previousVolume = audio.volume;
      try {
        audio.muted = true;
        audio.volume = 0;
        await audio.play();
        primedAnyTrack = true;
      } catch {
        // Mobile browsers may reject individual tracks; we only need one successful user-gesture bless.
      } finally {
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          // Ignore reset failures from browsers that haven't buffered yet.
        }
        audio.muted = previousMuted;
        audio.volume = previousVolume;
      }
    }

    return primedAnyTrack;
  }

  private async applyCue(cue: MusicCue): Promise<void> {
    if (!this.unlocked) {
      return;
    }

    const requestId = ++this.applyRequestId;

    if (cue === "none") {
      this.stopAllTracks();
      return;
    }

    const nextTrack = cue === "title" ? this.titleTrack : this.gameplayTracks[this.gameplayTrackIndex] ?? this.titleTrack;
    const nextAudio = this.getTrackAudio(nextTrack);

    if (this.currentTrackSource === nextTrack.source && this.currentAudio === nextAudio) {
      nextAudio.volume = nextTrack.volume;
      if (nextAudio.paused) {
        try {
          await nextAudio.play();
        } catch {
          this.unlocked = false;
        }
      }
      return;
    }

    this.stopAllTracks(nextAudio);
    nextAudio.volume = nextTrack.volume;
    try {
      nextAudio.currentTime = 0;
    } catch {
      // Ignore reset failures and still attempt playback.
    }
    this.currentAudio = nextAudio;
    this.currentTrackSource = nextTrack.source;

    try {
      await nextAudio.play();
      if (requestId !== this.applyRequestId || this.currentAudio !== nextAudio) {
        nextAudio.pause();
      }
    } catch {
      this.unlocked = false;
      this.currentAudio = null;
      this.currentTrackSource = null;
    }
  }

  private stopAllTracks(except: HTMLAudioElement | null = null): void {
    for (const audio of this.trackPool.values()) {
      if (audio === except) {
        continue;
      }

      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore reset failures for unbuffered tracks.
      }
    }
    if (!except) {
      this.currentAudio = null;
      this.currentTrackSource = null;
    }
  }
}
