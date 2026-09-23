// Only imported on large, fine-pointer screens with motion enabled.
export function attachDesktopMotion(root: HTMLElement) {
  const hero = root.querySelector<HTMLElement>(".df-hero");
  let frame = 0;
  let x = 0;
  let y = 0;
  let visible = !document.hidden;
  const paint = () => {
    frame = 0;
    if (!hero || !visible) return;
    hero.style.setProperty("--pointer-x", `${x}px`);
    hero.style.setProperty("--pointer-y", `${y}px`);
    hero.style.setProperty("--scroll-y", `${Math.min(window.scrollY, 900) * 0.17}px`);
  };
  const schedule = () => { if (!frame && visible) frame = requestAnimationFrame(paint); };
  const pointer = (event: PointerEvent) => {
    x = (event.clientX / window.innerWidth - 0.5) * 22;
    y = (event.clientY / window.innerHeight - 0.5) * 12;
    schedule();
  };
  const leave = () => { x = 0; y = 0; schedule(); };
  const visibility = () => {
    visible = !document.hidden;
    root.dataset.visible = String(visible);
    if (!visible) { cancelAnimationFrame(frame); frame = 0; } else schedule();
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("df-revealed");
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.1 });
  root.querySelectorAll(".df-reveal").forEach((element) => observer.observe(element));
  window.addEventListener("scroll", schedule, { passive: true });
  hero?.addEventListener("pointermove", pointer, { passive: true });
  hero?.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", visibility);
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("scroll", schedule);
    hero?.removeEventListener("pointermove", pointer);
    hero?.removeEventListener("pointerleave", leave);
    document.removeEventListener("visibilitychange", visibility);
    for (const key of ["--pointer-x", "--pointer-y", "--scroll-y"]) hero?.style.removeProperty(key);
  };
}
