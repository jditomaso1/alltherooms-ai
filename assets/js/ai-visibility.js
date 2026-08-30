(() => {
  const form = document.querySelector("#ai-source-form");
  const input = document.querySelector("#ai-listing-url");
  const status = document.querySelector("#ai-scan-status");
  const submit = form?.querySelector("button[type='submit']");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!input?.value.trim() || !status || !submit) return;

    submit.disabled = true;
    submit.textContent = "Analyzing…";
    status.querySelector("i")?.classList.add("is-scanning");
    const message = status.querySelector("span");
    if (message) message.textContent = "Reading the listing and connected property profile…";

    window.setTimeout(() => {
      submit.disabled = false;
      submit.textContent = "Analyze URL";
      status.querySelector("i")?.classList.remove("is-scanning");
      if (message) message.textContent = "Analysis refreshed just now · 4 sources checked";
    }, 1100);
  });

  document.querySelectorAll("[data-copy-suggestion]").forEach((button) => {
    button.addEventListener("click", async () => {
      const suggestion = button.previousElementSibling?.textContent
        ?.replace("Suggested improvement", "")
        .trim();
      if (!suggestion) return;

      try {
        await navigator.clipboard.writeText(suggestion);
        button.textContent = "Copied";
        window.setTimeout(() => { button.textContent = "Copy suggestion"; }, 1800);
      } catch {
        button.textContent = "Select and copy";
      }
    });
  });

  document.querySelector("#ai-return-to-url")?.addEventListener("click", () => {
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => input?.focus(), 350);
  });
})();
