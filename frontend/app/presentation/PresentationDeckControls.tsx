"use client";

import { useEffect, useState } from "react";
import styles from "./presentation.module.css";

type PresentationDeckControlsProps = {
  slides: string[];
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button"
  );
}

function getSlideElements(slideCount: number) {
  return Array.from({ length: slideCount }, (_, index) =>
    document.getElementById(`slide-${index + 1}`),
  ).filter((slide): slide is HTMLElement => Boolean(slide));
}

function getCurrentSlideIndex(slides: HTMLElement[]) {
  if (!slides.length) return 0;

  const viewportMidpoint = window.innerHeight / 2;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  slides.forEach((slide, index) => {
    const rect = slide.getBoundingClientRect();
    const slideMidpoint = rect.top + rect.height / 2;
    const distance = Math.abs(slideMidpoint - viewportMidpoint);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function scrollToSlide(index: number, slideCount: number) {
  const safeIndex = Math.max(0, Math.min(index, slideCount - 1));
  const target = document.getElementById(`slide-${safeIndex + 1}`);

  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState(null, "", `#slide-${safeIndex + 1}`);
}

export default function PresentationDeckControls({ slides }: PresentationDeckControlsProps) {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const slideElements = getSlideElements(slides.length);

    const updateActiveSlide = () => {
      setActiveSlide(getCurrentSlideIndex(slideElements));
    };

    updateActiveSlide();
    window.addEventListener("scroll", updateActiveSlide, { passive: true });
    window.addEventListener("resize", updateActiveSlide);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const currentIndex = getCurrentSlideIndex(slideElements);
      const nextKeys = ["ArrowDown", "ArrowRight", "PageDown"];
      const previousKeys = ["ArrowUp", "ArrowLeft", "PageUp"];

      if (nextKeys.includes(event.key) || (event.key === " " && !event.shiftKey)) {
        event.preventDefault();
        scrollToSlide(currentIndex + 1, slides.length);
        return;
      }

      if (previousKeys.includes(event.key) || (event.key === " " && event.shiftKey)) {
        event.preventDefault();
        scrollToSlide(currentIndex - 1, slides.length);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        scrollToSlide(0, slides.length);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        scrollToSlide(slides.length - 1, slides.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", updateActiveSlide);
      window.removeEventListener("resize", updateActiveSlide);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [slides.length]);

  return (
    <div className={styles.progressRail} aria-label="Presentation slides">
      {slides.map((slide, index) => (
        <a
          key={slide}
          href={`#slide-${index + 1}`}
          aria-current={activeSlide === index ? "true" : undefined}
          aria-label={`Go to slide ${index + 1}: ${slide}`}
          title={`${index + 1}. ${slide}`}
          onClick={(event) => {
            event.preventDefault();
            scrollToSlide(index, slides.length);
          }}
        >
          <span>{index + 1}</span>
        </a>
      ))}
    </div>
  );
}
