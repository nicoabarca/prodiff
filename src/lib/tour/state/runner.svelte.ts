import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import type { TourId, TourStep } from "$lib/tour/types";
import { selector } from "$lib/tour/utils/selector";

/** How long a step waits for its element to render before showing without it, in ms. */
const WAIT_FOR_ELEMENT = 3000;

/** The Tour on screen and the step it is on. */
export const tour = $state<{ running: TourId | null; index: number }>({
  running: null,
  index: 0
});

let active: { driver: Driver; stopWatching: () => void } | null = null;

function driveStep(step: TourStep): DriveStep {
  const until = step.until;
  return {
    element: step.target ? selector(step.target) : undefined,
    disableActiveInteraction: !until && !step.interactive,
    popover: {
      title: step.title,
      description: step.body,
      side: step.side,
      align: "start",
      showButtons: until ? ["previous", "close"] : ["next", "previous", "close"],
      // The arrow keys call this too, so an action step cannot be skipped past.
      onNextClick: until
        ? (_element, _step, { driver }) => {
            if (until()) driver.moveNext();
          }
        : undefined
    }
  };
}

/** Starts a Tour, ending whichever one is running. `onEnd` runs however it ends. */
export function startTour(id: TourId, steps: TourStep[], onEnd: () => void) {
  stopTour();
  const instance = driver({
    steps: steps.map(driveStep),
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    popoverClass: "prodiff-tour",
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 0,
    waitForElement: WAIT_FOR_ELEMENT,
    onHighlighted: (_element, _step, { state }) => {
      tour.index = state.activeIndex ?? 0;
    },
    onDestroyed: () => {
      active?.stopWatching();
      active = null;
      tour.running = null;
      onEnd();
    }
  });

  // An action step moves on by itself once what it asked for has happened.
  const stopWatching = $effect.root(() => {
    $effect(() => {
      const step = steps[tour.index];
      if (tour.running === id && step?.until?.()) instance.moveNext();
    });
  });

  active = { driver: instance, stopWatching };
  tour.running = id;
  tour.index = 0;
  instance.drive();
}

export function stopTour() {
  active?.driver.destroy();
}
