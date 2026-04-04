import type { Direction, MoveIntent } from "@shared/types.js";

type InputSource = "keyboard" | "touch";
type DirectionActivity = Record<Direction, boolean>;
type DirectionOrder = Record<Direction, number>;

function isPerpendicular(left: Direction, right: Direction): boolean {
  return (
    ((left === "up" || left === "down") && (right === "left" || right === "right")) ||
    ((left === "left" || left === "right") && (right === "up" || right === "down"))
  );
}

class GameInput {
  private readonly keyboardDirections: DirectionActivity = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  private readonly directionOrder: DirectionOrder = {
    up: 0,
    down: 0,
    left: 0,
    right: 0,
  };

  private keyboardActionHeld = false;
  private touchActionHeld = false;
  private touchMoveIntent: MoveIntent | null = null;
  private queuedAction = false;
  private orderCounter = 0;

  public setKeyboardDirectionActive(direction: Direction, active: boolean): void {
    this.keyboardDirections[direction] = active;
    if (active) {
      this.directionOrder[direction] = ++this.orderCounter;
    }
  }

  public setTouchMoveIntent(intent: MoveIntent | null): void {
    this.touchMoveIntent = intent;
  }

  public pressAction(source: InputSource): void {
    if (source === "keyboard") {
      this.keyboardActionHeld = true;
    } else {
      this.touchActionHeld = true;
    }
    this.queuedAction = true;
  }

  public releaseAction(source: InputSource): void {
    if (source === "keyboard") {
      this.keyboardActionHeld = false;
    } else {
      this.touchActionHeld = false;
    }
  }

  public getMoveIntent(): MoveIntent | null {
    if (this.touchMoveIntent) {
      return this.touchMoveIntent;
    }

    const active = (Object.keys(this.keyboardDirections) as Direction[])
      .filter((direction) => this.keyboardDirections[direction])
      .sort((left, right) => this.directionOrder[right] - this.directionOrder[left]);

    if (active.length === 0) {
      return null;
    }

    const primary = active[0];
    const secondary = active.find((direction) => isPerpendicular(primary, direction)) ?? null;
    return {
      primary,
      secondary,
    };
  }

  public isActionHeld(): boolean {
    return this.keyboardActionHeld || this.touchActionHeld;
  }

  public consumeQueuedAction(): boolean {
    const nextValue = this.queuedAction;
    this.queuedAction = false;
    return nextValue;
  }

  public reset(): void {
    for (const direction of Object.keys(this.keyboardDirections) as Direction[]) {
      this.keyboardDirections[direction] = false;
      this.directionOrder[direction] = 0;
    }
    this.touchMoveIntent = null;
    this.keyboardActionHeld = false;
    this.touchActionHeld = false;
    this.queuedAction = false;
    this.orderCounter = 0;
  }
}

export const gameInput = new GameInput();
