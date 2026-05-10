import "./pet.css";
import { getCurrentWindow, cursorPosition } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { exit } from "@tauri-apps/plugin-process";
import { Solar } from "lunar-javascript";

// ── Codex Pet Standard Types ──

interface FrameAnimation {
  row: number;
  frames: number;
  frameDurations: number[]; // ms per frame
}

interface PetAtlas {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  animations: Record<string, FrameAnimation>;
}

interface PetManifest {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
  kind?: string;
  version?: string;
}

// ── Codex Pet Standard Atlas (8x9, 192x208 per cell) ──

const CODEX_ATLAS: PetAtlas = {
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
  animations: {
    idle:            { row: 0, frames: 6, frameDurations: [280, 110, 110, 140, 140, 320] },
    "running-right": { row: 1, frames: 8, frameDurations: [120, 120, 120, 120, 120, 120, 120, 220] },
    "running-left":  { row: 2, frames: 8, frameDurations: [120, 120, 120, 120, 120, 120, 120, 220] },
    waving:          { row: 3, frames: 4, frameDurations: [140, 140, 140, 280] },
    jumping:         { row: 4, frames: 5, frameDurations: [140, 140, 140, 140, 280] },
    failed:          { row: 5, frames: 8, frameDurations: [140, 140, 140, 140, 140, 140, 140, 240] },
    waiting:         { row: 6, frames: 6, frameDurations: [150, 150, 150, 150, 150, 260] },
    running:         { row: 7, frames: 6, frameDurations: [120, 120, 120, 120, 120, 220] },
    review:          { row: 8, frames: 6, frameDurations: [150, 150, 150, 150, 150, 280] },
  },
};

// ── Audio SFX (HTML5 Audio, no external libs) ──

const sfx = {
  pop: new Audio(new URL("../assets/audio/pop.mp3", import.meta.url).href),
  boing: new Audio(new URL("../assets/audio/boing.mp3", import.meta.url).href),
  bubble: new Audio(new URL("../assets/audio/bubble.mp3", import.meta.url).href),
  bell: new Audio(new URL("../assets/audio/bell.mp3", import.meta.url).href),
};

Object.values(sfx).forEach((audio) => {
  audio.volume = 0.6;
});

function playSound(type: keyof typeof sfx): void {
  const audio = sfx[type];
  audio.currentTime = 0;
  audio.play().catch((e) => console.warn("Audio play failed:", e));
}

// ── PetEngine ──

class PetEngine {
  private spriteEl: HTMLElement;
  private atlas: PetAtlas;
  public currentState: string = "idle";
  private currentFrame: number = 0;
  private timerHandle: number | null = null;

  constructor(spriteEl: HTMLElement, atlas: PetAtlas, spritesheetUrl: string) {
    this.spriteEl = spriteEl;
    this.atlas = atlas;

    this.spriteEl.style.width = `${atlas.cellWidth}px`;
    this.spriteEl.style.height = `${atlas.cellHeight}px`;
    this.spriteEl.style.backgroundImage = `url("${spritesheetUrl}")`;
    this.spriteEl.style.backgroundRepeat = "no-repeat";

    this.applyState("idle");
  }

  applyState(state: string): void {
    const anim = this.atlas.animations[state];
    if (!anim) {
      console.warn(`Unknown state: ${state}, falling back to idle`);
      this.applyState("idle");
      return;
    }

    this.stop();
    this.currentState = state;
    this.currentFrame = 0;
    this.showFrame(0);
    this.startLoop();
  }

  private showFrame(index: number): void {
    const anim = this.atlas.animations[this.currentState];
    const x = index * this.atlas.cellWidth;
    const y = anim.row * this.atlas.cellHeight;
    this.spriteEl.style.backgroundPosition = `-${x}px -${y}px`;
  }

  private startLoop(): void {
    const anim = this.atlas.animations[this.currentState];
    const advance = () => {
      this.currentFrame = (this.currentFrame + 1) % anim.frames;
      this.showFrame(this.currentFrame);
      const delay = anim.frameDurations[this.currentFrame];
      this.timerHandle = window.setTimeout(advance, delay);
    };
    const firstDelay = anim.frameDurations[0];
    this.timerHandle = window.setTimeout(advance, firstDelay);
  }

  private stop(): void {
    if (this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  setSpritesheet(url: string): void {
    this.spriteEl.style.backgroundImage = `url("${url}")`;
    this.applyState("idle");
  }

  destroy(): void {
    this.stop();
  }
}

// ── Block native context menu globally ──

document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// ── SVG Particles (safe, no emoji) ──

const PARTICLE_SVGS = [
  // Heart
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3E%3Cpath%20d='M12%2021.35l-1.45-1.32C5.4%2015.36%202%2012.28%202%208.5%202%205.42%204.42%203%207.5%203c1.74%200%203.41.81%204.5%202.09C13.09%203.81%2014.76%203%2016.5%203%2019.58%203%2022%205.42%2022%208.5c0%203.78-3.4%206.86-8.55%2011.54L12%2021.35z'%20fill='%23EE6363'/%3E%3C/svg%3E",
  // Smile face
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3E%3Ccircle%20cx='12'%20cy='12'%20r='10'%20fill='%23FFD93D'/%3E%3Ccircle%20cx='8'%20cy='10'%20r='1.5'%20fill='%23333'/%3E%3Ccircle%20cx='16'%20cy='10'%20r='1.5'%20fill='%23333'/%3E%3Cpath%20d='M8%2014s1.5%203%204%203%204-3%204-3'%20stroke='%23333'%20stroke-width='1.5'%20stroke-linecap='round'%20fill='none'/%3E%3C/svg%3E",
  // Dog face
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3E%3Ccircle%20cx='12'%20cy='13'%20r='9'%20fill='%23C4A46E'/%3E%3Cellipse%20cx='7'%20cy='6'%20rx='3'%20ry='4'%20fill='%238B6E4E'/%3E%3Cellipse%20cx='17'%20cy='6'%20rx='3'%20ry='4'%20fill='%238B6E4E'/%3E%3Ccircle%20cx='9'%20cy='12'%20r='1.5'%20fill='%23333'/%3E%3Ccircle%20cx='15'%20cy='12'%20r='1.5'%20fill='%23333'/%3E%3Cellipse%20cx='12'%20cy='15'%20rx='2'%20ry='1.5'%20fill='%23333'/%3E%3C/svg%3E",
  // Wink face
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3E%3Ccircle%20cx='12'%20cy='12'%20r='10'%20fill='%23FFD93D'/%3E%3Ccircle%20cx='8'%20cy='10'%20r='1.5'%20fill='%23333'/%3E%3Cpath%20d='M14%2010h4'%20stroke='%23333'%20stroke-width='2'%20stroke-linecap='round'/%3E%3Cpath%20d='M8%2014s1.5%203%204%203%204-3%204-3'%20stroke='%23333'%20stroke-width='1.5'%20stroke-linecap='round'%20fill='none'/%3E%3C/svg%3E",
  // Heart eyes
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3E%3Ccircle%20cx='12'%20cy='12'%20r='10'%20fill='%23FFD93D'/%3E%3Cpath%20d='M6%209.5C6%208%207.5%207%208.5%208.5L9%209l-.5.5L8%209C7%208%206%208.5%206%209.5z'%20fill='%23EE6363'/%3E%3Cpath%20d='M15%209.5C15%208%2016.5%207%2017.5%208.5L18%209l-.5.5L17%209c-1-1-2-.5-2%20.5z'%20fill='%23EE6363'/%3E%3Cpath%20d='M8%2014s1.5%203%204%203%204-3%204-3'%20stroke='%23333'%20stroke-width='1.5'%20stroke-linecap='round'%20fill='none'/%3E%3C/svg%3E",
  // Star
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3E%3Cpath%20d='M12%202l3%206%206%201-4.5%204.5L18%2020l-6-3-6%203%201.5-6.5L3%209l6-1z'%20fill='%23FFD93D'%20stroke='%23F9A825'%20stroke-width='0.5'/%3E%3C/svg%3E",
];

function spawnParticles(x: number, y: number): void {
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const particle = document.createElement("div");
    particle.className = "particle";
    const offsetX = (Math.random() - 0.5) * 20;
    const offsetY = (Math.random() - 0.5) * 20;
    particle.style.left = `${x + offsetX}px`;
    particle.style.top = `${y + offsetY}px`;
    particle.style.backgroundImage = `url("${PARTICLE_SVGS[Math.floor(Math.random() * PARTICLE_SVGS.length)]}")`;
    particle.addEventListener("animationend", () => particle.remove());
    document.body.appendChild(particle);
  }
}

// ── Drag & Physics (State Machine) ──

let isMouseDown = false;
let hasStartedDragging = false;
let dragThreshold = 5;
let mouseDownX = 0;
let mouseDownY = 0;

// ── Bio-Clock State ──
let isExiting = false;
let lastActivityTime = Date.now();

// ── Always-on-Top State (persisted) ──
let isAlwaysOnTop = localStorage.getItem("pet-always-on-top") !== "false";
// ── Focus Mode State ──
let isFocusMode = false;
let focusEndTime = 0;
let focusIntervalId: ReturnType<typeof setInterval> | null = null;
let cachedAlwaysOnTop = true;
let isBubbleLocked = false;

// ── API Settings & Chat Mode ──

const LS_API_ENDPOINT = "pet_api_endpoint";
const LS_API_KEY = "pet_api_key";
const LS_API_MODEL = "pet_api_model";
const LS_CHAT_MODE = "pet_chat_mode";
const LS_PERSONA_MODE = "pet_persona_mode";
const LS_CUSTOM_PERSONA = "pet_custom_persona_text";
const LS_GITHUB_USERNAME = "pet_github_username";
const LS_GITHUB_LAST_PUSH = "pet_github_last_push_time";

let lastSmartSpeechTimestamp = 0;
const SMART_COOLDOWN = 10 * 60 * 1000;

function showApiSettingsPanel(): void {
  const panel = document.getElementById("api-settings-panel");
  if (!panel) return;
  const epInput = document.getElementById("api-endpoint") as HTMLInputElement | null;
  const keyInput = document.getElementById("api-key") as HTMLInputElement | null;
  const modelInput = document.getElementById("api-model") as HTMLInputElement | null;
  if (epInput) epInput.value = localStorage.getItem(LS_API_ENDPOINT) || "";
  if (keyInput) keyInput.value = localStorage.getItem(LS_API_KEY) || "";
  if (modelInput) modelInput.value = localStorage.getItem(LS_API_MODEL) || "gpt-3.5-turbo";
  panel.style.display = "block";
}

function setupApiSettingsPanel(): void {
  const panel = document.getElementById("api-settings-panel");
  const saveBtn = document.getElementById("api-settings-save") as HTMLButtonElement | null;
  const cancelBtn = document.getElementById("api-settings-cancel");
  if (!panel || !saveBtn || !cancelBtn) return;

  saveBtn.addEventListener("click", async () => {
    const epInput = document.getElementById("api-endpoint") as HTMLInputElement | null;
    const keyInput = document.getElementById("api-key") as HTMLInputElement | null;
    const modelInput = document.getElementById("api-model") as HTMLInputElement | null;
    if (!epInput || !keyInput) return;

    let endpoint = epInput.value.trim().replace(/\/+$/, "");
    if (!/\/v1(\/|$)/.test(endpoint)) {
      endpoint += "/v1";
    }
    if (!endpoint.endsWith("/chat/completions")) {
      endpoint += "/chat/completions";
    }
    epInput.value = endpoint;

    const key = keyInput.value.trim();
    const userModel = modelInput?.value.trim() || "gpt-3.5-turbo";
    if (!endpoint || !key) return;

    saveBtn.disabled = true;
    saveBtn.textContent = "测试中...";
    saveBtn.classList.remove("success", "error");

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: userModel,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        }),
      });

      if (resp.ok) {
        saveBtn.classList.add("success");
        saveBtn.textContent = "连接成功";
        localStorage.setItem(LS_API_ENDPOINT, endpoint);
        localStorage.setItem(LS_API_KEY, key);
        localStorage.setItem(LS_API_MODEL, userModel);
        setTimeout(() => {
          panel.style.display = "none";
          saveBtn.classList.remove("success");
          saveBtn.textContent = "保存";
          saveBtn.disabled = false;
        }, 1000);
      } else {
        saveBtn.classList.add("error");
        saveBtn.textContent = "配置有误";
        setTimeout(() => {
          saveBtn.classList.remove("error");
          saveBtn.textContent = "保存";
          saveBtn.disabled = false;
        }, 1500);
      }
    } catch {
      saveBtn.classList.add("error");
      saveBtn.textContent = "配置有误";
      setTimeout(() => {
        saveBtn.classList.remove("error");
        saveBtn.textContent = "保存";
        saveBtn.disabled = false;
      }, 1500);
    }
  });

  cancelBtn.addEventListener("click", () => {
    panel.style.display = "none";
  });
}

function showCustomPersonaPanel(): void {
  const panel = document.getElementById("custom-persona-panel");
  if (!panel) return;
  const textarea = document.getElementById("custom-persona-text") as HTMLTextAreaElement | null;
  if (textarea) textarea.value = localStorage.getItem(LS_CUSTOM_PERSONA) || "";
  panel.style.display = "block";
}

function setupCustomPersonaPanel(): void {
  const panel = document.getElementById("custom-persona-panel");
  const saveBtn = document.getElementById("persona-settings-save");
  const cancelBtn = document.getElementById("persona-settings-cancel");
  if (!panel || !saveBtn || !cancelBtn) return;

  saveBtn.addEventListener("click", () => {
    const textarea = document.getElementById("custom-persona-text") as HTMLTextAreaElement | null;
    if (textarea) localStorage.setItem(LS_CUSTOM_PERSONA, textarea.value.trim());
    panel.style.display = "none";
  });

  cancelBtn.addEventListener("click", () => {
    panel.style.display = "none";
  });
}

function showGitHubSettingsPanel(): void {
  const panel = document.getElementById("github-settings-panel");
  if (!panel) return;
  const input = document.getElementById("github-username-input") as HTMLInputElement | null;
  if (input) input.value = localStorage.getItem(LS_GITHUB_USERNAME) || "";
  panel.style.display = "block";
}

function setupGitHubSettingsPanel(): void {
  const panel = document.getElementById("github-settings-panel");
  const saveBtn = document.getElementById("github-settings-save");
  const cancelBtn = document.getElementById("github-settings-cancel");
  const testBtn = document.getElementById("github-settings-test");
  if (!panel || !saveBtn || !cancelBtn || !testBtn) return;

  const usernameInput = document.getElementById("github-username-input") as HTMLInputElement | null;

  if (usernameInput) {
    usernameInput.addEventListener("input", () => {
      usernameInput.classList.remove("success-status");
    });
  }

  testBtn.addEventListener("click", async () => {
    const username = usernameInput?.value.trim();
    if (!username) {
      showSpeech("请先输入用户名", 3000);
      usernameInput?.classList.remove("success-status");
      return;
    }
    try {
      const resp = await fetch(`https://api.github.com/users/${username}`);
      if (resp.ok) {
        showSpeech("关联成功！已锁定账号。", 3000);
        usernameInput?.classList.add("success-status");
      } else if (resp.status === 404) {
        showSpeech("查无此人，请检查拼写。", 3000);
        usernameInput?.classList.remove("success-status");
      } else {
        showSpeech("网络异常，无法连接 GitHub。", 3000);
        usernameInput?.classList.remove("success-status");
      }
    } catch {
      showSpeech("网络异常，无法连接 GitHub。", 3000);
      usernameInput?.classList.remove("success-status");
    }
  });

  saveBtn.addEventListener("click", () => {
    const input = document.getElementById("github-username-input") as HTMLInputElement | null;
    if (input) {
      const username = input.value.trim();
      if (username) {
        localStorage.setItem(LS_GITHUB_USERNAME, username);
        localStorage.removeItem(LS_GITHUB_LAST_PUSH);
      }
    }
    panel.style.display = "none";
  });

  cancelBtn.addEventListener("click", () => {
    panel.style.display = "none";
  });
}

async function checkGitHubStatus(): Promise<void> {
  const username = localStorage.getItem(LS_GITHUB_USERNAME);
  if (!username) return;

  try {
    const resp = await fetch(`https://api.github.com/users/${username}/events/public`);
    if (!resp.ok) return;
    const events = await resp.json();

    const pushEvent = events.find((e: any) => e.type === "PushEvent");
    if (!pushEvent) return;

    const pushTime = pushEvent.created_at as string;
    const lastPush = localStorage.getItem(LS_GITHUB_LAST_PUSH);

    if (!lastPush || pushTime > lastPush) {
      localStorage.setItem(LS_GITHUB_LAST_PUSH, pushTime);
      if (lastPush) {
        showSpeech("捕捉到新 Commit！主人的绿点保住了！", 4000);
      }
    }
  } catch {
    // 静默失败，不干扰用户
  }
}

async function triggerSmartSpeech(): Promise<void> {
  const mode = localStorage.getItem(LS_CHAT_MODE) || "basic";
  const nowTs = Date.now();

  if (mode === "basic" || nowTs - lastSmartSpeechTimestamp <= SMART_COOLDOWN) {
    fetchHitokoto();
    return;
  }

  let endpoint = localStorage.getItem(LS_API_ENDPOINT);
  const apiKey = localStorage.getItem(LS_API_KEY);

  if (!endpoint || !apiKey) {
    localStorage.setItem(LS_CHAT_MODE, "basic");
    showSpeech("请先配置 API 节点", 3000);
    return;
  }

  // 地址自动修正：去除空格，补全 /chat/completions
  endpoint = endpoint.trim();
  if (!endpoint.endsWith("/chat/completions")) {
    endpoint = endpoint.replace(/\/+$/, "") + "/chat/completions";
  }

  const now = new Date();
  const timeString = now.toLocaleString('zh-CN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const personaMode = localStorage.getItem(LS_PERSONA_MODE) || "tsundere";
  const PERSONA_MAP: Record<string, string> = {
    sunny: "你是一个阳光开朗、元气满满的桌宠。永远积极向上，喜欢分享趣事，语气活泼可爱。",
    gentle: "你是一个安静内敛、温柔体贴的桌宠。话不多但句句暖心，会耐心倾听，共情力强。",
    ice: "你是一个高冷冰山的桌宠。话少精辟，惜字如金但一针见血，外冷内热。",
    tsundere: "你是一个傲娇粘人的桌宠。口是心非，占有欲强，嘴上嫌弃其实很关心主人。",
    toxic: '你是一个犀利毒舌的桌宠。开头必须用"哼"字。吐槽精准不留情面，很有梗。',
    joker: "你是一个腹黑沙雕的桌宠。喜欢黑色幽默和阴阳怪气，戏精附体，非常搞笑。",
  };
  const basePersona = personaMode === "custom"
    ? (localStorage.getItem(LS_CUSTOM_PERSONA) || PERSONA_MAP["tsundere"])
    : (PERSONA_MAP[personaMode] || PERSONA_MAP["tsundere"]);

  const systemPrompt = `设定：${basePersona}\n当前系统时间：${timeString}。\n要求：请结合当前真实时间与你的设定，用不超过20个字回复或吐槽。严禁包含任何表情符号、颜文字或多余的解释。`;

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: localStorage.getItem(LS_API_MODEL) || "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "现在请跟我打招呼或者吐槽我。" },
        ],
        max_tokens: 80,
        temperature: 0.9,
      }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (text) {
      showSpeech(text, 3000);
      lastSmartSpeechTimestamp = nowTs;
    } else {
      throw new Error("Empty response");
    }
  } catch (err) {
    console.error("LLM request failed:", err);
    showSpeech("API 连不上，还是聊聊天吧", 3000);
    fetchHitokoto();
  }
}

function fetchHitokoto(): void {
  fetch("https://v1.hitokoto.cn")
    .then((r) => r.json())
    .then((data) => {
      const text = data.hitokoto as string | undefined;
      if (text) showSpeech(text, 5000);
    })
    .catch(() => {});
}

function forceEndDrag(engine: PetEngine, container: HTMLElement): void {
  if (hasStartedDragging) {
    engine.applyState("idle");
    container.classList.remove("is-lifting");
    container.classList.add("is-dropping");
    if (!isFocusMode) playSound("boing");
    setTimeout(() => {
      container.classList.remove("is-dropping");
    }, 200);
  }
  isMouseDown = false;
  hasStartedDragging = false;
  lastActivityTime = Date.now();
}

async function setupDrag(engine: PetEngine): Promise<void> {
  const hitbox = document.getElementById("pet-hitbox");
  const container = document.getElementById("pet-container");
  if (!hitbox || !container) return;

  const appWindow = getCurrentWindow();

  // mousedown - 潜伏阶段
  hitbox.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || isExiting) return;

    isMouseDown = true;
    hasStartedDragging = false;
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    lastActivityTime = Date.now();

    container.classList.remove("is-dropping");
    container.classList.add("is-lifting");
  });

  // mousemove - 拖拽判定 + 系统中断兜底
  window.addEventListener("mousemove", async (e) => {
    // 兜底检测：系统吞噬 mouseup 后的状态复位
    if (isMouseDown && e.buttons === 0) {
      forceEndDrag(engine, container);
      return;
    }

    if (!isMouseDown || hasStartedDragging || isExiting) return;

    const dx = e.clientX - mouseDownX;
    const dy = e.clientY - mouseDownY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > dragThreshold) {
      hasStartedDragging = true;
      // 切换到奔跑动画
      engine.applyState("running");
      // 交出拖拽权
      await appWindow.startDragging();
    }
  });

  // mouseup - 最终交互判定
  window.addEventListener("mouseup", (e) => {
    if (!isMouseDown) return;

    if (hasStartedDragging) {
      forceEndDrag(engine, container);
    } else {
      container.classList.remove("is-lifting");
      if (isFocusMode) {
        isBubbleLocked = true;
        showSpeech("嘘，专心工作...", 2000);
        setTimeout(() => { isBubbleLocked = false; }, 2000);
      } else {
        spawnParticles(e.clientX, e.clientY);
        playSound("pop");
        triggerSmartSpeech();
      }
    }

    isMouseDown = false;
    hasStartedDragging = false;
    lastActivityTime = Date.now();
  });
}

// ── Pet Loading ──

async function loadSpritesheetUrl(): Promise<string> {
  try {
    const pets = await invoke<PetManifest[]>("list_pets");
    if (pets.length > 0) {
      const pet = pets[0];
      const petDir = await invoke<string>("get_pet_dir", { petId: pet.id });
      const spritesheetPath = `${petDir}/${pet.spritesheetPath}`;
      const url = convertFileSrc(spritesheetPath);
      console.log(`Loading pet: ${pet.displayName} from ${url}`);
      return url;
    }
  } catch (e) {
    console.warn("No imported pets found, using fallback:", e);
  }

  // Fallback: local test spritesheet
  return new URL("./spritesheet.webp", import.meta.url).href;
}

// ── Context Menu (Custom DOM) ──

async function openImportDialog(engine: PetEngine): Promise<void> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const file = await open({
      multiple: false,
      filters: [{ name: "宠物包", extensions: ["zip"] }],
    });
    if (!file) return;

    const manifest = await invoke<PetManifest>("import_pet_zip", { zipPath: file });
    console.log(`Imported: ${manifest.displayName}`);

    const petDir = await invoke<string>("get_pet_dir", { petId: manifest.id });
    const url = convertFileSrc(`${petDir}/${manifest.spritesheetPath}`);
    engine.setSpritesheet(url);
  } catch (e) {
    console.error("Import failed:", e);
  }
}

async function startFocusMode(minutes: number, engine: PetEngine): Promise<void> {
  if (focusIntervalId) {
    clearInterval(focusIntervalId);
    focusIntervalId = null;
  }
  const appWindow = getCurrentWindow();
  cachedAlwaysOnTop = isAlwaysOnTop;
  await appWindow.setAlwaysOnTop(false);

  isFocusMode = true;
  engine.applyState("waiting");
  focusEndTime = Date.now() + minutes * 60000;

  // 显示开始提示并锁定气泡，防止倒计时覆盖
  isBubbleLocked = true;
  showSpeech(`专注 ${minutes} 分钟，开始！`, 3000);
  setTimeout(() => { isBubbleLocked = false; }, 3000);

  // 延迟 3 秒后再启动倒计时轮询，避免覆盖开始提示
  setTimeout(() => {
    // 先用极大时长显示气泡，使其进入稳定显示状态
    showSpeech("专注中...", 9999999);

    focusIntervalId = setInterval(async () => {
      const remaining = Math.max(0, focusEndTime - Date.now());
      if (remaining <= 0) {
        await endFocusMode(true, engine);
        return;
      }
      const min = Math.floor(remaining / 60000);
      const sec = Math.floor((remaining % 60000) / 1000);
      if (!isBubbleLocked) {
        // 直接刷新文字内容，不重新触发 CSS 气泡动画，避免闪烁
        const bubbleText = document.querySelector("#pet-speech-bubble .bubble-text") as HTMLElement | null;
        if (bubbleText) {
          bubbleText.textContent = `专注中 ${min}:${sec.toString().padStart(2, "0")}`;
        }
      }
    }, 1000);
  }, 3000);
}

async function endFocusMode(_isAuto: boolean, engine: PetEngine): Promise<void> {
  if (focusIntervalId) {
    clearInterval(focusIntervalId);
    focusIntervalId = null;
  }
  if (_isAuto) playSound("bell");
  isFocusMode = false;
  isBubbleLocked = false;

  const appWindow = getCurrentWindow();
  await appWindow.setAlwaysOnTop(true);
  engine.applyState("jumping");
  showSpeech("专注结束，辛苦啦！", 4000);

  setTimeout(async () => {
    if (!isExiting) {
      engine.applyState("idle");
      await appWindow.setAlwaysOnTop(cachedAlwaysOnTop);
    }
  }, 4000);
}

async function setupContextMenu(engine: PetEngine): Promise<void> {
  const { Menu, Submenu, CheckMenuItem } = await import("@tauri-apps/api/menu");
  const appWindow = getCurrentWindow();
  const hitbox = document.getElementById("pet-hitbox");
  if (!hitbox) return;

  // Apply persisted always-on-top state on startup
  await appWindow.setAlwaysOnTop(isAlwaysOnTop);

  hitbox.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    if (isExiting) return;

    engine.applyState("idle");
    lastActivityTime = Date.now();

    // Eye icon: open (◉) when pinned, closed (◎) when unpinned
    const topLabel = isAlwaysOnTop ? "◉ 取消置顶" : "◎ 开启置顶";

    const menu = await Menu.new({
      items: [
        { id: "import", text: "导入宠物 (.zip)", action: () => openImportDialog(engine) },
        { item: "Separator" },
        await Submenu.new({
          text: "动作演示",
          items: [
            { id: "idle", text: "待机", action: () => engine.applyState("idle") },
            { id: "waving", text: "打招呼", action: () => engine.applyState("waving") },
            { id: "jumping", text: "跳跃", action: () => engine.applyState("jumping") },
            { id: "running", text: "奔跑", action: () => engine.applyState("running") },
            { id: "failed", text: "失败", action: () => engine.applyState("failed") },
            { id: "waiting", text: "等待", action: () => engine.applyState("waiting") },
            { id: "review", text: "思考", action: () => engine.applyState("review") },
          ],
        }),
        { id: "volume", text: "调节音量", action: () => {
          const panel = document.getElementById("volume-panel");
          if (panel) {
            panel.style.display = "flex";
            panel.style.bottom = "20px";
          }
        }},
        await (async () => {
          const currentMode = localStorage.getItem(LS_CHAT_MODE) || "basic";
          const currentPersona = localStorage.getItem(LS_PERSONA_MODE) || "tsundere";
          const personaAction = (key: string) => () => {
            localStorage.setItem(LS_CHAT_MODE, "awaken");
            localStorage.setItem(LS_PERSONA_MODE, key);
          };
          return Submenu.new({
            text: "对话模式",
            items: [
              await CheckMenuItem.new({
                id: "mode-basic",
                text: "基础闲聊 (Hitokoto)",
                checked: currentMode === "basic",
                action: () => {
                  localStorage.setItem(LS_CHAT_MODE, "basic");
                },
              }),
              await Submenu.new({
                text: "全面觉醒 (大模型)",
                items: [
                  await CheckMenuItem.new({ id: "persona-sunny", text: "阳光开朗型", checked: currentMode === "awaken" && currentPersona === "sunny", action: personaAction("sunny") }),
                  await CheckMenuItem.new({ id: "persona-gentle", text: "温柔体贴型", checked: currentMode === "awaken" && currentPersona === "gentle", action: personaAction("gentle") }),
                  await CheckMenuItem.new({ id: "persona-ice", text: "高冷冰山型", checked: currentMode === "awaken" && currentPersona === "ice", action: personaAction("ice") }),
                  await CheckMenuItem.new({ id: "persona-tsundere", text: "傲娇粘人型", checked: currentMode === "awaken" && currentPersona === "tsundere", action: personaAction("tsundere") }),
                  await CheckMenuItem.new({ id: "persona-toxic", text: "犀利毒舌型", checked: currentMode === "awaken" && currentPersona === "toxic", action: personaAction("toxic") }),
                  await CheckMenuItem.new({ id: "persona-joker", text: "腹黑沙雕型", checked: currentMode === "awaken" && currentPersona === "joker", action: personaAction("joker") }),
                  { item: "Separator" as const },
                  { id: "persona-custom", text: "自定义性格...", action: () => {
                    localStorage.setItem(LS_CHAT_MODE, "awaken");
                    localStorage.setItem(LS_PERSONA_MODE, "custom");
                    showCustomPersonaPanel();
                  }},
                ],
              }),
              { item: "Separator" as const },
              { id: "api-connect", text: "接入 API...", action: () => showApiSettingsPanel() },
              { id: "github-connect", text: "关联 GitHub...", action: () => showGitHubSettingsPanel() },
            ],
          });
        })(),
        { item: "Separator" },
        { id: "toggle-top", text: topLabel, action: async () => {
          isAlwaysOnTop = !isAlwaysOnTop;
          localStorage.setItem("pet-always-on-top", String(isAlwaysOnTop));
          await appWindow.setAlwaysOnTop(isAlwaysOnTop);
        }},
        await Submenu.new({
          text: "定时专注",
          items: [
            { id: "focus-5", text: "5 分钟", action: () => startFocusMode(5, engine) },
            { id: "focus-15", text: "15 分钟", action: () => startFocusMode(15, engine) },
            { id: "focus-30", text: "30 分钟", action: () => startFocusMode(30, engine) },
            { id: "focus-45", text: "45 分钟", action: () => startFocusMode(45, engine) },
            { id: "focus-60", text: "60 分钟", action: () => startFocusMode(60, engine) },
            { item: "Separator" as const },
            { id: "focus-cancel", text: "退出专注", action: () => endFocusMode(false, engine) },
          ],
        }),
        { item: "Separator" },
        { id: "quit", text: "退出", action: () => {
          isExiting = true;
          engine.applyState("failed");
          setTimeout(() => exit(0), 3000);
        }},
      ],
    });

    await menu.popup();
  });
}

// ── Hitbox Utilities ──

function setHitboxVars(vars: {
  width?: string;
  height?: string;
  offsetY?: string;
  radius?: string;
}): void {
  const root = document.documentElement;
  if (vars.width) root.style.setProperty("--hitbox-width", vars.width);
  if (vars.height) root.style.setProperty("--hitbox-height", vars.height);
  if (vars.offsetY) root.style.setProperty("--hitbox-offset-y", vars.offsetY);
  if (vars.radius) root.style.setProperty("--hitbox-radius", vars.radius);
}

function toggleDebugHitbox(enable?: boolean): void {
  const container = document.getElementById("pet-container");
  if (!container) return;
  const shouldDebug = enable ?? !container.classList.contains("debug-hitbox");
  container.classList.toggle("debug-hitbox", shouldDebug);
}

// Expose for console调试
(window as any).setHitboxVars = setHitboxVars;
(window as any).toggleDebugHitbox = toggleDebugHitbox;

// ── Eye Tracking ──

function setupEyeTracking(): void {
  const spriteEl = document.getElementById("pet-sprite");
  if (!spriteEl) return;

  window.addEventListener("mousemove", (e) => {
    if (isExiting) return;
    const centerX = window.innerWidth / 2;
    spriteEl.style.transform = e.clientX < centerX ? "scaleX(-1)" : "scaleX(1)";
  });
}

// ── Bio-Clock Idle Mechanism ──

function setupBioClock(engine: PetEngine): void {
  let lastCursorX = -1;
  let lastCursorY = -1;
  let lastNightHour = -1;

  // Poll global cursor position via Tauri API
  setInterval(async () => {
    try {
      const pos = await cursorPosition();
      if (pos.x !== lastCursorX || pos.y !== lastCursorY) {
        lastCursorX = pos.x;
        lastCursorY = pos.y;
        lastActivityTime = Date.now();
      }
    } catch {
      // cursor_position may not be available, ignore
    }

    if (isExiting || isMouseDown || hasStartedDragging || isFocusMode) return;

    // 23:00 late night trigger
    const now = new Date();
    if (now.getHours() === 23 && lastNightHour !== 23) {
      lastNightHour = 23;
      engine.applyState("review");
      showSpeech("已经是晚上 23:00 啦，夜深了，早点休息，明天也要元气满满哦！", 8000);
    }
    if (now.getHours() !== 23) {
      lastNightHour = -1;
    }

    const elapsed = Date.now() - lastActivityTime;
    const state = engine.currentState;

    if (state === "idle" && elapsed > 600_000) {
      engine.applyState("waiting");
    } else if (state === "idle" && elapsed > 300_000) {
      engine.applyState("review");
      setTimeout(() => {
        if (!isExiting && engine.currentState === "review") {
          engine.applyState("idle");
          lastActivityTime = Date.now();
        }
      }, 3000);
    }
  }, 1000);
}

// ── Sudden Wake-up ──

function setupWakeUp(engine: PetEngine): void {
  const hitbox = document.getElementById("pet-hitbox");
  if (!hitbox) return;

  hitbox.addEventListener("mouseenter", () => {
    if (isExiting || isFocusMode) return;
    const state = engine.currentState;
    if (state === "waiting" || state === "review") {
      engine.applyState("jumping");
      lastActivityTime = Date.now();
      setTimeout(() => {
        if (!isExiting && engine.currentState === "jumping") {
          engine.applyState("idle");
        }
      }, 2000);
    }
  });
}

// ── Warm Quotes Engine ──

function checkSpecialDayAndTime(): string {
  const now = new Date();
  const solar = Solar.fromDate(now);
  const lunar = solar.getLunar();

  // 24 solar terms
  const jieQi = lunar.getJieQi();
  if (jieQi === "冬至") {
    return "今天是冬至哦，记得吃热腾腾的饺子或者汤圆，暖暖身子！";
  }
  if (jieQi === "立春") {
    return "立春啦，万物复苏，又是充满希望的一个节气呢。";
  }

  // Solar holidays
  const month = solar.getMonth();
  const day = solar.getDay();

  if (month === 12 && day === 13) {
    return "今天是南京大屠杀死难者国家公祭日，我们一起铭记历史，缅怀逝者。";
  }

  // Mother's Day: second Sunday in May
  if (month === 5) {
    const may1Weekday = new Date(solar.getYear(), 4, 1).getDay(); // 0=Sun
    const daysToFirstSunday = may1Weekday === 0 ? 0 : 7 - may1Weekday;
    const secondSunday = 1 + daysToFirstSunday + 7;
    if (day === secondSunday) {
      return "今天是母亲节，别忘了给妈妈打个电话，祝她节日快乐呀！";
    }
  }

  // Lunar holidays
  const lunarMonth = lunar.getMonth();
  const lunarDay = lunar.getDay();

  if (lunarMonth === 1 && lunarDay === 1) {
    return "春节快乐！新的一年祝你万事胜意，平安喜乐！";
  }
  if (lunarMonth === 8 && lunarDay === 15) {
    return "中秋节快乐！记得吃甜甜的月饼，和家人团聚哦。";
  }

  // Late night care
  const hour = now.getHours();
  if (hour === 23) {
    return "已经是晚上 23:00 啦，夜深了，早点休息，明天也要元气满满哦！";
  }

  return "今天也要开心哦！";
}

function showSpeech(text: string, durationMs: number): void {
  const bubble = document.getElementById("pet-speech-bubble");
  const bubbleText = bubble?.querySelector(".bubble-text") as HTMLElement | null;
  if (!bubble || !bubbleText || !text) return;

  bubbleText.textContent = text;
  bubble.classList.add("show-bubble");
  playSound("bubble");

  setTimeout(() => {
    bubble.classList.remove("show-bubble");
  }, durationMs);
}

// ── Volume Panel ──

function setupVolumePanel(): void {
  const panel = document.getElementById("volume-panel");
  const slider = document.getElementById("volume-slider") as HTMLInputElement | null;
  const text = document.getElementById("volume-text");
  if (!panel || !slider || !text) return;

  // 初始化轨道进度背景
  const initPct = slider.value + "%";
  slider.style.background =
    `linear-gradient(to right, #00BFFF ${initPct}, rgba(255,255,255,0.2) ${initPct})`;

  slider.addEventListener("input", () => {
    const value = parseInt(slider.value, 10);
    text.textContent = String(value);
    const level = value / 100;
    Object.values(sfx).forEach((audio) => { audio.volume = level; });

    // 动态轨道进度：天蓝色填充左侧，灰色填充右侧
    const pct = value + "%";
    slider.style.background =
      `linear-gradient(to right, #00BFFF ${pct}, rgba(255,255,255,0.2) ${pct})`;
  });

  slider.addEventListener("change", () => {
    playSound("pop");
  });

  panel.addEventListener("mouseleave", () => {
    panel.style.display = "none";
    panel.style.bottom = "-50px";
  });
}

// ── Init ──

async function main(): Promise<void> {
  const spriteEl = document.getElementById("pet-sprite");
  if (!spriteEl) {
    console.error("Pet sprite element not found");
    return;
  }

  const spritesheetUrl = await loadSpritesheetUrl();
  const engine = new PetEngine(spriteEl, CODEX_ATLAS, spritesheetUrl);
  (window as any).__petEngine = engine;

  // Boot ceremony: wave then idle, with speech bubble
  engine.applyState("waving");
  showSpeech(checkSpecialDayAndTime(), 5000);
  setTimeout(() => {
    if (!isExiting) engine.applyState("idle");
  }, 5000);

  setupDrag(engine);
  setupContextMenu(engine);
  setupEyeTracking();
  setupBioClock(engine);
  setupWakeUp(engine);
  setupVolumePanel();
  setupApiSettingsPanel();
  setupCustomPersonaPanel();
  setupGitHubSettingsPanel();

  // GitHub 贡献度监控：启动 3 秒后初检，之后每 5 分钟轮询
  setTimeout(() => checkGitHubStatus(), 3000);
  setInterval(() => checkGitHubStatus(), 5 * 60 * 1000);
  console.log("VibePet engine initialized");
}

main();
