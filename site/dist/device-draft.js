/* On-device drafts use scoped evidence and a dedicated WebAssembly worker. */
(() => {
  "use strict";

  const runtimeUrl = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
  const model = "Xenova/flan-t5-small";
  const revision = "311454e83bc784267fd7eef5940ee854144abbec";

  if (typeof document === "undefined") {
    let generator;
    let active = false;
    self.addEventListener("message", async ({data}) => {
      if (data.kind !== "generate" || active) return;
      active = true;
      try {
        if (!generator) {
          self.postMessage({kind: "status", detail: "Loading the browser runtime…"});
          const {env, pipeline} = await import(runtimeUrl);
          env.allowLocalModels = false;
          env.useBrowserCache = true;
          env.backends.onnx.wasm.numThreads = 1;
          env.backends.onnx.wasm.proxy = false;
          generator = await pipeline("text2text-generation", model, {
            device: "wasm",
            dtype: "q8",
            revision,
            progress_callback: progress => {
              if (progress.status === "progress") {
                self.postMessage({kind: "progress", file: progress.file, percent: progress.progress});
              } else if (progress.status === "initiate") {
                self.postMessage({kind: "status", detail: "Loading model files…"});
              }
            },
          });
        }
        self.postMessage({kind: "status", detail: "Writing a draft on this device…"});
        const [result] = await generator(data.prompt, {
          max_new_tokens: 96,
          do_sample: false,
          truncation: true,
        });
        const output = result?.generated_text?.trim();
        self.postMessage(output ? {kind: "result", output} : {kind: "empty"});
      } catch {
        self.postMessage({kind: "error"});
      } finally {
        active = false;
      }
    });
    return;
  }

  const workerUrl = document.currentScript.src;

  function mount(host, readEvidence) {
    host.className = "panel";
    host.style.marginTop = "14px";
    host.innerHTML = `<section aria-labelledby="device-draft-heading">
      <h2 id="device-draft-heading">On-device AI draft</h2>
      <p class="muted">Generate an editable reply using the selected order, model and role. The first run downloads about 110 MB of model and runtime files from Hugging Face and jsDelivr. Your question and evidence stay in this browser.</p>
      <div class="actions">
        <button class="button primary" type="button" data-draft-start>Download model and generate</button>
        <button class="button" type="button" data-draft-cancel hidden>Cancel</button>
      </div>
      <p class="muted" data-draft-status role="status" aria-live="polite" style="margin:10px 0 0"></p>
      <progress data-draft-progress max="100" aria-label="Current model file download" hidden></progress>
      <div data-draft-result hidden style="margin-top:13px">
        <label for="device-draft-output"><strong>AI draft for review</strong></label>
        <p class="muted">Review all facts in the draft against the source passages before using it.</p>
        <textarea id="device-draft-output" rows="5" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;resize:vertical"></textarea>
        <p class="muted" data-draft-sources></p>
      </div>
    </section>`;

    const start = host.querySelector("[data-draft-start]");
    const cancel = host.querySelector("[data-draft-cancel]");
    const status = host.querySelector("[data-draft-status]");
    const progress = host.querySelector("[data-draft-progress]");
    const result = host.querySelector("[data-draft-result]");
    const output = host.querySelector("textarea");
    const sources = host.querySelector("[data-draft-sources]");
    let worker;
    let timer;
    let sourceIds = [];
    let fallback = "";

    function resetWorker() {
      worker?.terminate();
      worker = undefined;
      start.textContent = "Download model and generate";
    }

    function finish(message) {
      clearTimeout(timer);
      status.textContent = message;
      start.disabled = false;
      cancel.hidden = true;
      progress.hidden = true;
    }

    function fail() {
      resetWorker();
      finish("The on-device model could not run. You can retry or use the evidence draft above.");
    }

    function watchForTimeout() {
      clearTimeout(timer);
      timer = setTimeout(fail, 120000);
    }

    function handleMessage({data}) {
      watchForTimeout();
      if (data.kind === "status") {
        progress.hidden = true;
        status.textContent = data.detail;
      }
      if (data.kind === "progress" && Number.isFinite(data.percent)) {
        progress.hidden = false;
        progress.value = data.percent;
        const message = `Downloading ${data.file}…`;
        if (status.textContent !== message) status.textContent = message;
      }
      if (data.kind === "result") {
        const substantive = data.output.replace(/\[[^\]]*\]/g, "").trim();
        const useful = substantive.length >= 40 && substantive.split(/\s+/).length >= 8;
        output.value = useful ? data.output : fallback;
        sources.textContent = `Source records provided to the model: ${sourceIds.join(", ")}.`;
        result.hidden = false;
        start.textContent = "Generate another draft";
        finish(useful ? "On-device draft is ready for review." : "The model returned an incomplete reply. A source-based fallback is ready for review.");
      }
      if (data.kind === "empty") finish("The model returned an empty draft. Try a more specific question or use the evidence draft above.");
      if (data.kind === "error") fail();
    }

    start.addEventListener("click", () => {
      const {question, evidence} = readEvidence();
      if (!question || !evidence.length) {
        finish("Enter a question that matches evidence for the selected order, model and role.");
        return;
      }
      if (!globalThis.Worker || !globalThis.WebAssembly || location.protocol === "file:") {
        finish("On-device drafting needs a supported browser and a hosted page. The evidence draft above is available.");
        return;
      }
      const selected = evidence.slice(0, 4);
      sourceIds = selected.map(source => source.id);
      const facts = selected.map(source => `[${source.id}] ${source.text}`).join("\n");
      fallback = `Source-based fallback for review:\n\n${selected.map(source => `${source.text} [${source.id}]`).join("\n")}\n\nPlease confirm any outstanding details before making a commitment.`;
      const prompt = `Answer the business question in complete sentences using only the records below. State what is confirmed and what needs confirmation. Do not promise delivery.\nRecords:\n${facts}\nQuestion: ${question.slice(0, 600)}\nAnswer:`;
      start.disabled = true;
      cancel.hidden = false;
      result.hidden = true;
      status.textContent = "Starting the on-device model…";
      watchForTimeout();
      try {
        if (!worker) {
          worker = new Worker(workerUrl, {type: "module"});
          worker.addEventListener("message", handleMessage);
          worker.addEventListener("error", fail);
          worker.addEventListener("messageerror", fail);
        }
        worker.postMessage({kind: "generate", prompt});
      } catch {
        fail();
      }
    });

    cancel.addEventListener("click", () => {
      resetWorker();
      finish("On-device drafting cancelled.");
      start.focus();
    });

    return () => {
      clearTimeout(timer);
      resetWorker();
    };
  }

  window.PPDeviceDraft = {mount};
})();
