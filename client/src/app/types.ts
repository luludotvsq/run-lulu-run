export type DebugWindow = Window & {
  advanceTime?: (ms: number) => Promise<void>;
  render_game_to_text?: () => string;
};

export type MenuScreen = "splash" | "join";
export type PendingAction = "single" | "create" | "join" | null;

export interface UiState {
  screen: MenuScreen;
  joinCode: string;
  notice: string;
  pendingAction: PendingAction;
}
