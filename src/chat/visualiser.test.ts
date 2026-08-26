/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { CHAT_PERSONALITIES } from "./personalities";
import {
  enterChatVisualiser,
  mockChatWorkplace,
  renderChatVisualiser,
  type ChatVisualiserHost,
} from "./visualiser";

const portrait = CHAT_PERSONALITIES[0]!.avatarSrc;

function makeHost(): ChatVisualiserHost {
  const app = document.createElement("main");
  document.body.append(app);
  const host: ChatVisualiserHost = {
    app,
    shell(main) {
      app.innerHTML = main;
    },
    render() {
      renderChatVisualiser(host);
    },
    pageHeader: (eyebrow, title, extra = "") => `<header><p>${eyebrow}</p><h1>${title}</h1>${extra}</header>`,
    onBackToChat() {},
  };
  return host;
}

describe("chat portrait visualiser", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    enterChatVisualiser("header");
  });

  it("keeps Now faceless and puts her portrait in the other four ideas", () => {
    expect(mockChatWorkplace("now")).not.toContain(portrait);
    expect(mockChatWorkplace("header")).toContain("chat-presence__portrait");
    expect(mockChatWorkplace("header")).not.toContain("coach-msg--with-portrait");
    expect(mockChatWorkplace("thread")).toContain("coach-msg--with-portrait");
    expect(mockChatWorkplace("thread")).not.toContain("chat-presence__portrait");
    expect(mockChatWorkplace("thread")).not.toContain("chat-presence-strip");
    expect(mockChatWorkplace("composer")).toContain("chat-presence-strip");
    expect(mockChatWorkplace("composer")).not.toContain("coach-msg--with-portrait");
    expect(mockChatWorkplace("together")).toContain("chat-presence__portrait");
    expect(mockChatWorkplace("together")).toContain("coach-msg--with-portrait");
    expect(mockChatWorkplace("header")).toContain(portrait);
    expect(mockChatWorkplace("thread")).toContain(portrait);
    expect(mockChatWorkplace("composer")).toContain(portrait);
    expect(mockChatWorkplace("together")).toContain(portrait);
  });

  it("switches ideas from the picker and can return to Chat", () => {
    const back: string[] = [];
    const host = makeHost();
    host.onBackToChat = () => back.push("chat");
    host.render();
    expect(host.app.querySelector("[data-portrait-idea='header']")?.classList.contains("is-active")).toBe(true);
    expect(host.app.querySelector(".chat-presence__portrait")).toBeTruthy();
    host.app.querySelector<HTMLButtonElement>("[data-portrait-idea='thread']")!.click();
    expect(host.app.querySelector("[data-portrait-idea='thread']")?.classList.contains("is-active")).toBe(true);
    expect(host.app.querySelector(".coach-msg--with-portrait")).toBeTruthy();
    host.app.querySelector<HTMLButtonElement>("[data-back-to-chat]")!.click();
    expect(back).toEqual(["chat"]);
  });
});
