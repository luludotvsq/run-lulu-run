import type { Direction, MoveIntent } from "@shared/types.js";
import { CLIENT_CONFIG } from "../game/clientConfig.js";
import { gameInput } from "../game/gameInput.js";
import type { TouchControlsElements } from "./createAppLayout.js";

function getTouchOverride(): boolean {
  return new URLSearchParams(window.location.search).get("touchControls") === "1";
}

function supportsTouchControls(): boolean {
  if (getTouchOverride()) {
    return true;
  }

  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

function resolveDirection(sign: number, negative: Direction, positive: Direction): Direction {
  return sign < 0 ? negative : positive;
}

function clampMagnitude(value: number, max: number): number {
  return Math.min(Math.max(value, -max), max);
}

export class TouchControlsController {
  private readonly elements: TouchControlsElements;
  private readonly available: boolean;
  private padPointerId: number | null = null;
  private actionPointerId: number | null = null;
  private visible = false;

  public constructor(elements: TouchControlsElements) {
    this.elements = elements;
    this.available = supportsTouchControls();
    this.elements.actionButton.textContent = CLIENT_CONFIG.touchControls.actionLabel;
    this.elements.actionHint.textContent = CLIENT_CONFIG.touchControls.actionHint;
    this.attachListeners();
  }

  public setGameplayActive(active: boolean): boolean {
    const shouldShow = this.available && active;
    this.visible = shouldShow;
    this.elements.root.classList.toggle("hidden", !shouldShow);
    this.elements.root.setAttribute("aria-hidden", String(!shouldShow));

    if (!shouldShow) {
      this.reset();
    }

    return shouldShow;
  }

  public reset(): void {
    this.padPointerId = null;
    this.actionPointerId = null;
    this.elements.root.classList.remove("touch-action-button-active");
    this.elements.actionButton.classList.remove("touch-action-button-active");
    this.elements.pad.classList.remove("touch-pad-active");
    this.elements.thumb.style.transform = "translate(-50%, -50%)";
    gameInput.setTouchMoveIntent(null);
    gameInput.releaseAction("touch");
  }

  private attachListeners(): void {
    this.elements.pad.addEventListener("pointerdown", (event) => {
      if (!this.visible || this.padPointerId !== null) {
        return;
      }

      event.preventDefault();
      this.padPointerId = event.pointerId;
      this.elements.pad.setPointerCapture(event.pointerId);
      this.elements.pad.classList.add("touch-pad-active");
      this.updatePadIntent(event);
    });

    this.elements.pad.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.padPointerId) {
        return;
      }

      event.preventDefault();
      this.updatePadIntent(event);
    });

    const releasePad = (event: PointerEvent) => {
      if (event.pointerId !== this.padPointerId) {
        return;
      }

      if (this.elements.pad.hasPointerCapture(event.pointerId)) {
        this.elements.pad.releasePointerCapture(event.pointerId);
      }
      this.padPointerId = null;
      this.elements.pad.classList.remove("touch-pad-active");
      this.elements.thumb.style.transform = "translate(-50%, -50%)";
      gameInput.setTouchMoveIntent(null);
    };

    this.elements.pad.addEventListener("pointerup", releasePad);
    this.elements.pad.addEventListener("pointercancel", releasePad);

    this.elements.actionButton.addEventListener("pointerdown", (event) => {
      if (!this.visible || this.actionPointerId !== null) {
        return;
      }

      event.preventDefault();
      this.actionPointerId = event.pointerId;
      this.elements.actionButton.setPointerCapture(event.pointerId);
      this.elements.actionButton.classList.add("touch-action-button-active");
      gameInput.pressAction("touch");
    });

    const releaseAction = (event: PointerEvent) => {
      if (event.pointerId !== this.actionPointerId) {
        return;
      }

      if (this.elements.actionButton.hasPointerCapture(event.pointerId)) {
        this.elements.actionButton.releasePointerCapture(event.pointerId);
      }
      this.actionPointerId = null;
      this.elements.actionButton.classList.remove("touch-action-button-active");
      gameInput.releaseAction("touch");
    };

    this.elements.actionButton.addEventListener("pointerup", releaseAction);
    this.elements.actionButton.addEventListener("pointercancel", releaseAction);
  }

  private updatePadIntent(event: PointerEvent): void {
    const rect = this.elements.pad.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const rawDx = event.clientX - centerX;
    const rawDy = event.clientY - centerY;
    const radius = CLIENT_CONFIG.touchControls.padMaxRadiusPx;
    const magnitude = Math.hypot(rawDx, rawDy);

    if (magnitude <= CLIENT_CONFIG.touchControls.padDeadzonePx) {
      this.elements.thumb.style.transform = "translate(-50%, -50%)";
      gameInput.setTouchMoveIntent(null);
      return;
    }

    const scale = magnitude > radius ? radius / magnitude : 1;
    const dx = clampMagnitude(rawDx * scale, radius);
    const dy = clampMagnitude(rawDy * scale, radius);
    this.elements.thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    gameInput.setTouchMoveIntent(this.resolveMoveIntent(dx, dy));
  }

  private resolveMoveIntent(dx: number, dy: number): MoveIntent {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const diagonalBias = CLIENT_CONFIG.touchControls.diagonalBias;

    if (absX >= absY) {
      return {
        primary: resolveDirection(dx, "left", "right"),
        secondary: absY >= absX * diagonalBias ? resolveDirection(dy, "up", "down") : null,
      };
    }

    return {
      primary: resolveDirection(dy, "up", "down"),
      secondary: absX >= absY * diagonalBias ? resolveDirection(dx, "left", "right") : null,
    };
  }
}
