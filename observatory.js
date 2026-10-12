/* Responsive observatory chrome; simulation and scientific content stay unchanged. */
"use strict";
window.addEventListener("DOMContentLoaded", () => {
  const dock = document.getElementById("dock");
  const buttons = [...document.querySelectorAll("[data-tool]")];
  const groups = [...dock.querySelectorAll(".grp")];
  const titles = ["کنترل دوربین", "زمان و سرعت شبیه‌سازی", "تنظیمات نمایش", "آزمایشگاه کیهانی"];
  let active = -1;
  function setTool(index) {
    active = index;
    dock.classList.toggle("tools-open", index >= 0);
    document.body.classList.toggle("tools-open", index >= 0);
    groups.forEach((group, i) => { group.hidden = i !== index; });
    buttons.forEach((button, i) => {
      button.classList.toggle("active", i === index);
      button.setAttribute("aria-expanded", String(i === index));
    });
    if (index >= 0) document.getElementById("toolTitle").textContent = titles[index];
  }
  buttons.forEach((button, i) => button.addEventListener("click", () => setTool(active === i ? -1 : i)));
  document.getElementById("closeTools").onclick = () => {
    const previous = active; setTool(-1); buttons[previous]?.focus();
  };
  document.getElementById("quickHome").onclick = () => { Scene3D.resetView(); setTool(-1); };
  setTool(-1);

  const menu = document.getElementById("menuToggle");
  const header = document.querySelector("header");
  function closeMenu() { header.classList.remove("menu-open"); menu.setAttribute("aria-expanded", "false"); }
  menu.onclick = () => {
    const open = header.classList.toggle("menu-open"); menu.setAttribute("aria-expanded", String(open));
  };
  document.getElementById("headerTools").addEventListener("click", e => { if (e.target.closest("button")) closeMenu(); });
  document.addEventListener("click", e => { if (!header.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { setTool(-1); closeMenu(); document.body.classList.remove("cinema"); }
  });
  document.getElementById("exitCinema").onclick = () => document.body.classList.remove("cinema");
  const panel = document.getElementById("infoPanel");
  new MutationObserver(() => {
    const open = panel.classList.contains("open");
    document.body.classList.toggle("has-selection", open);
    if (open && matchMedia("(max-width: 760px)").matches) setTool(-1);
  }).observe(panel, { attributes: true, attributeFilter: ["class"] });
  document.querySelectorAll(".iconbtn, .hbtns button").forEach(button => {
    if (!button.hasAttribute("aria-label") && button.title) button.setAttribute("aria-label", button.title);
  });
  document.querySelectorAll(".modal").forEach(modal => {
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    const heading = modal.querySelector("h2");
    if (heading) modal.setAttribute("aria-label", heading.textContent);
    let previousFocus;
    new MutationObserver(() => {
      if (modal.classList.contains("open")) {
        previousFocus = document.activeElement;
        modal.querySelector("button, select, input")?.focus();
      } else if (previousFocus?.isConnected) previousFocus.focus();
    }).observe(modal, { attributes: true, attributeFilter: ["class"] });
    modal.addEventListener("keydown", e => {
      if (e.key === "Escape") { modal.classList.remove("open"); return; }
      if (e.key !== "Tab") return;
      const items = [...modal.querySelectorAll("button:not(:disabled), select, input, a[href], [tabindex='0']")].filter(el => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    });
  });
});
