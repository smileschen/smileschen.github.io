(() => {
  "use strict";

  const {alphabet, randomKey, translate} = window.CipherEngine;
  const {passages, defaultKey} = window.CipherExamples;
  const byId = id => document.getElementById(id);
  const input = byId("plaintext");
  const output = byId("ciphertext");
  const notice = byId("encoder-notice");
  const copyButton = byId("copy");
  const decoderButton = byId("open-decoder");
  const samples = [...document.querySelectorAll("[data-passage]")];
  let key = defaultKey;
  let copyTimeout;

  function drawWheel() {
    const canvas = byId("key-wheel");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(2, 0, 0, 2, 270, 270);
    ctx.clearRect(-135, -135, 270, 270);
    function circle(radius, color, dashed = false) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.75;
      ctx.setLineDash(dashed ? [1, 4] : []);
      ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    circle(131, "#77958b", true);
    [126, 123, 101, 80, 76].forEach(r => circle(r, "#75928a"));
    circle(69, "#647c73", true);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < alphabet.length; i++) {
      ctx.save();
      ctx.rotate(2 * Math.PI * i / 26);
      ctx.beginPath();
      ctx.moveTo(0, -123);
      ctx.lineTo(0, -119);
      ctx.strokeStyle = "#94a99a";
      ctx.stroke();
      ctx.fillStyle = i ? "#d4ddc7" : "#ffdc8f";
      ctx.font = "11px monospace";
      ctx.fillText(alphabet[i], 0, -110);
      ctx.fillStyle = i ? "#d7bc80" : "#ffeab9";
      ctx.fillText(key[i], 0, -90);
      ctx.restore();
    }
    ctx.fillStyle = "#e7d39e";
    ctx.font = "italic 39px Georgia, serif";
    ctx.fillText("A", -30, -2);
    ctx.fillText(key[0], 30, -2);
    ctx.font = "19px Georgia, serif";
    ctx.fillText("→", 0, -3);
    ctx.fillStyle = "#b2c4b8";
    ctx.font = "8px monospace";
    ctx.fillText("PLAIN     CIPHER", 0, 24);
  }

  function showKey() {
    const groups = document.createDocumentFragment();
    for (let start = 0; start < alphabet.length; start += 13) {
      const table = document.createElement("table");
      const caption = table.createCaption();
      caption.className = "sr-only";
      caption.textContent = "Substitution key from " + alphabet[start] + " to " + alphabet[start + 12];
      for (const [label, letters] of [["Plain", alphabet], ["Cipher", key]]) {
        const row = table.insertRow();
        const heading = document.createElement("th");
        heading.scope = "row";
        heading.textContent = label;
        row.append(heading);
        for (const letter of letters.slice(start, start + 13)) row.insertCell().textContent = letter;
      }
      groups.append(table);
    }
    byId("encoding-key").replaceChildren(groups);
    drawWheel();
  }

  function updateInput() {
    const sample = Object.keys(passages).find(id => passages[id].text === input.value);
    for (const button of samples) button.setAttribute("aria-pressed", String(button.dataset.passage === sample));
    byId("passage-source").textContent = sample ? passages[sample].source : "Your message";
    const count = Array.from(input.value).length;
    byId("char-count").textContent = count.toLocaleString() + (count === 1 ? " character" : " characters");
    byId("encipher").disabled = !/[a-z]/i.test(input.value);
  }

  function showOutput(encoded) {
    const ready = encoded !== null;
    output.textContent = ready ? encoded : "Click Cipher message to apply the current key.";
    output.classList.toggle("pending", !ready);
    byId("output-state").textContent = ready ? "Encoded" : "Awaiting cipher";
    copyButton.disabled = !ready;
    decoderButton.disabled = !ready;
    clearTimeout(copyTimeout);
    copyButton.textContent = "Copy ciphertext";
  }

  input.addEventListener("input", () => { updateInput(); showOutput(null); });
  for (const button of samples) {
    button.addEventListener("click", () => {
      input.value = passages[button.dataset.passage].text;
      updateInput();
      showOutput(null);
      notice.textContent = button.textContent + " loaded.";
    });
  }
  byId("shuffle").addEventListener("click", () => {
    key = randomKey();
    showKey();
    showOutput(null);
    notice.textContent = "New substitution key. Click Cipher message to encode.";
  });
  byId("encipher").addEventListener("click", () => {
    showOutput(translate(input.value, key));
    notice.textContent = "Ciphertext ready to copy or open in the decoder.";
  });
  copyButton.addEventListener("click", async () => {
    const text = output.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(output);
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand("copy")) {
        output.focus();
        copyButton.textContent = "Use system copy";
        notice.textContent = "Ciphertext selected. Use the system Copy command.";
        return;
      }
      selection.removeAllRanges();
    }
    if (copyButton.disabled || output.textContent !== text) return;
    copyButton.textContent = "Copied";
    notice.textContent = "Ciphertext copied.";
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => { copyButton.textContent = "Copy ciphertext"; }, 1800);
  });
  decoderButton.addEventListener("click", () => {
    const text = output.textContent;
    if (location.protocol !== "file:") {
      try {
        sessionStorage.setItem("stats102c-cipher-transfer", text);
        location.href = "decipher.html#message";
        return;
      } catch { /* Use the fragment when browser storage is unavailable. */ }
    }
    location.href = "decipher.html#" + new URLSearchParams({text});
  });

  input.value = passages.hamlet.text;
  updateInput();
  showKey();
  showOutput(translate(input.value, key));
})();
