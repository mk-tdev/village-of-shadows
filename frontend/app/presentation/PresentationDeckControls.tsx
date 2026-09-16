"use client";

import { useEffect, useState } from "react";
import styles from "./presentation.module.css";

type PresentationDeckControlsProps = {
  slides: string[];
  language: "en" | "zh";
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
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

function ArrowIcon({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={direction === "previous" ? "M14.5 5 7.5 12l7 7" : "m9.5 5 7 7-7 7"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export default function PresentationDeckControls({ slides, language }: PresentationDeckControlsProps) {
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
  }, [slides]);

  const previousLabel = language === "zh" ? "上一页" : "Previous slide";
  const nextLabel = language === "zh" ? "下一页" : "Next slide";

  return (
    <>
      <div className={styles.progressRail} aria-label={language === "zh" ? "演示文稿页面" : "Presentation slides"}>
        {slides.map((slide, index) => (
          <a
            key={slide}
            href={`#slide-${index + 1}`}
            aria-current={activeSlide === index ? "true" : undefined}
            aria-label={language === "zh" ? `前往第 ${index + 1} 页：${slide}` : `Go to slide ${index + 1}: ${slide}`}
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
      <div className={styles.deckArrows} aria-label={language === "zh" ? "演示文稿翻页控制" : "Presentation navigation controls"}>
        <button
          type="button"
          onClick={() => scrollToSlide(activeSlide - 1, slides.length)}
          disabled={activeSlide === 0}
          aria-label={previousLabel}
          title={previousLabel}
        >
          <ArrowIcon direction="previous" />
        </button>
        <span aria-live="polite">{String(activeSlide + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
        <button
          type="button"
          onClick={() => scrollToSlide(activeSlide + 1, slides.length)}
          disabled={activeSlide === slides.length - 1}
          aria-label={nextLabel}
          title={nextLabel}
        >
          <ArrowIcon direction="next" />
        </button>
      </div>
    </>
  );
}
