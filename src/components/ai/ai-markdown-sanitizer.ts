import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * Tags DOMPurify allows by default but that assistant markdown must never
 * render. None of them can come from legitimate markdown, and an interactive
 * form inside the chat pane is a credential-phishing surface: chat content is
 * model-generated and can be steered by data read out of a connected database.
 */
const FORBIDDEN_TAGS = [
  "form",
  "input",
  "button",
  "select",
  "option",
  "optgroup",
  "textarea",
  "fieldset",
  "legend",
  "label",
  "datalist",
  "output",
];

/**
 * Render assistant (model-generated) markdown to HTML that is safe to hand to
 * `dangerouslySetInnerHTML`.
 *
 * This is the single sanitization point for AI output. Markdown is parsed by
 * `marked` — which passes raw HTML in the model's response straight through —
 * and the result is sanitized by DOMPurify, so script, event-handler and
 * dangerous-URI vectors never reach the DOM.
 *
 * Keep the call site here rather than inline in the component: the
 * configuration is security-relevant and is covered by
 * `ai-markdown-sanitizer.test.ts`.
 */
export function renderSanitizedMarkdown(markdown: string): string {
  return DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string, {
    FORBID_TAGS: FORBIDDEN_TAGS,
    // `style` is dropped as well: inline positioning in chat content could
    // overlay the surrounding app UI. Nothing legitimate is lost — `marked`
    // emits table column alignment as an `align` attribute, not as a style.
    FORBID_ATTR: ["formaction", "form", "style"],
  });
}
