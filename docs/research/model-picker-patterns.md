# Model picker: how products keep it subtle

Research notes for making AdaTwin's model picker (top bar) and first-run model card (capture step) quieter. All sources were read on **2026-10-17**. **Verified** means the statement comes straight from the cited source: an official help page, changelog, design-system doc, or a repo file at `path:line`. **Inference** means my own reasoning, not yet tested. **Secondary** marks a claim that rests on press or third-party coverage because I could not find or open a primary source; each one says so. No code was changed and no server was started.

---

## 1. Recommendation

| Decision            | Recommendation                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger             | A borderless **ghost button**, `h-8`, muted text, showing the Gemini mark, **only the text model's short name** ("3.5 Flash") and a small chevron. No border, no card background, no second model name. Both models stay in the `aria-label`.                                                                                                        |
| Menu                | Keep one Radix `DropdownMenu` with two flat groups, "Text" and "Images". Each option is **one line**, `h-8`: name on the left, a **check mark** on the right for the selected one. No radio circles, no monospace IDs, no chips. The image price shows as quiet trailing text that appears on highlight. The note appears in one fixed footer line for whichever row is highlighted. |
| Selected option     | The check mark plus `font-medium`. No lime fill, no border on the row. Keep lime for the check icon only, or not at all.                                                                                                                                                                                                                                |
| First-run card      | **Remove the card.** Nobody in this survey asks for a model before first use; they all start on a default. Show the picker in the top bar from the start. On capture, add one muted line under the lede, "Uses Gemini 3.5 Flash and Nano Banana 2.1 · Change", where "Change" opens the top-bar menu. Hide the line for good once the menu has been opened or the user picks anything. |
| Coachmark           | Optional and secondary. If you want one, use a single small Radix `Popover` anchored to the trigger, shown once, one sentence, dismissable. Do not stack it with the inline line. The inline line is enough on its own.                                                                                                                                       |

Details and Tailwind specifics are in §7.

---

## 2. What the repo has today

- **Verified.** The trigger is a bordered pill: `h-10 … rounded-full border border-border bg-card px-3 text-[13px] font-semibold … hover:border-ink` (`apps/frontend/src/components/model-picker.tsx:75-78`). It shows the Gemini logo at `size-5`, then both short names joined by a `·` (`model-picker.tsx:80-87`), then a chevron (`model-picker.tsx:88-93`). After confirmation it pulses with a lime ring, `model-glow` (`model-picker.tsx:42-48,77`, `apps/frontend/src/index.css:178-184`).
- **Verified.** The menu is `w-[min(24rem,…)]` with a header ("AI models" plus a sentence) (`model-picker.tsx:95-107`). It has two `Section`s, each with an icon, an uppercase title and a hint (`model-picker.tsx:331-339`). Each `Option` has (`model-picker.tsx:376-415`):
  - a radio circle that turns lime when selected;
  - the label in `font-semibold`, plus a "Default" chip in lime and the catalog `badge` chip;
  - the note on a second line;
  - the model ID in `font-mono text-[10px]` on a third line;
  - the price per image in monospace on the right;
  - a selected state with `border-ink/15 bg-primary/10`.
- **Verified.** The catalog has 5 text options and 4 image options, with badges such as "Newest", "Cheapest" and "Best" (`packages/agent/src/catalog.ts:27-83`). With three lines per row, the menu runs long and gets `max-h-[min(80svh,640px)] overflow-y-auto` (`model-picker.tsx:97`).
- **Verified.** `ModelPrompt` is a card with `border border-ink … shadow-hard-sm` (`model-picker.tsx:186`), a 40px logo tile, a heading and a paragraph (`model-picker.tsx:188-202`), two large dropdown cards (`model-picker.tsx:205-224,280-293`), and a lime "Use these models" button (`model-picker.tsx:244-255`).
- **Verified.** The capture step shows `ModelPrompt` until `confirmModels()` is called (`apps/frontend/src/pages/steps/capture.tsx:480-492`). Until then, the project top bar hides the picker on the capture step (`apps/frontend/src/pages/project-layout.tsx:50-53,83`). Confirmation is stored under `ada-twin:models-confirmed` (`apps/frontend/src/lib/models.ts:51-76`).
- **Verified.** Theme tokens: `--primary: #beff50`, `--muted-foreground: #5f5f55` (light) / `#a3a399` (dark), `--accent: #ebebdf` / `#262626`, and `--shadow-hard-sm: 2px 2px 0 0 var(--ink)` (`index.css:21-28,52-59,112-113`).
- **Verified.** `radix-ui` 1.8.1 is installed (`apps/frontend/package.json:26`). The umbrella package includes `DropdownMenu`, `Popover` and `Tooltip`.

---

## 3. How products show the picker in their chrome

### 3.1 Summary

| Product                 | Where                                                       | What the trigger shows                                         | Menu                                                                                                       | Source quality |
| ----------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------- |
| Claude.ai               | Composer, next to the send button                           | Current model name (and effort level)                          | Short list plus a **"More models"** overflow; an **Effort** section in the same menu, with a "Default" marker | Primary        |
| ChatGPT                 | Model picker (location not stated in the article I could read) | Mode name: Instant / Thinking / Pro                         | Few modes, auto-switching, a **Configure** entry; legacy models only when an admin enables them             | Primary, read through search snippets only (403) |
| Gemini app              | Prompt bar dropdown (web: bottom right of the prompt box)  | Mode name (Fast / Thinking / Pro)                              | 3 to 4 options, each with a **one-line description**; a "Gemini 3" label on top; `@`-menu shortcut on web   | Release notes primary; layout secondary |
| Perplexity              | Search box (secondary)                                      | "Best" (automatic) or the model name                           | Best first; manual choices only on paid plans                                                              | Help article primary; location secondary |
| Cursor                  | Chat / agent panel                                          | Current model, or **Auto**                                     | Auto with a sub-choice: Cost / Balance / Intelligence; `Cmd+/` cycles models                               | Primary        |
| v0                      | Composer toolbar                                            | Current model                                                  | Available models with **token prices**; locked models visible but disabled; "Add models"                   | Primary        |
| Raycast AI              | Chat title bar, or `/` in the composer                      | Current model                                                  | Grouped by provider, collapsible; speed, intelligence and context shown; sort menu; `⇧⌘M`                  | Primary        |
| GitHub Copilot (VS Code)| Chat input field                                            | Current model, or **Auto**                                     | **Pinned** section (pin on hover); `>` opens a **Thinking Effort** submenu; "Manage Models" (gear)         | Primary        |
| GitHub Copilot (other IDEs) | Bottom right of the chat view                           | Current model, or **Auto**                                     | Dropdown; Thinking Effort submenu in JetBrains                                                             | Primary        |
| T3 Chat                 | No official documentation found                             | –                                                              | –                                                                                                          | None           |

### 3.2 Per product

**Claude.ai**

- **Verified.** "The model menu next to the send button controls three settings." The selected model and effort level appear next to the send button. You click the model name to change it, and a **"More models"** option reveals the rest. Effort levels sit under "Effort", and each model's recommended level is marked "Default" ([Claude Help Center: How can I change the model version…](https://support.claude.com/en/articles/8664678-how-can-i-change-the-model-version-that-i-m-chatting-with)).
- **Verified.** Anthropic's own guide calls Sonnet "your versatile default" and says "If you're not sure which model to pick, start here". The Effort setting lives "in the model picker" ([Claude Academy: Choosing the right Claude model](https://academy.claude.com/tutorials/choosing-the-right-claude-model)).
- **Takeaway (Inference).** The trigger is plain text in the composer. Rarely used models sit behind one overflow item, and a second, related setting (effort) shares the same menu as its own section.

**ChatGPT**

- **Verified, with a caveat.** `help.openai.com` returned HTTP 403 to my fetches, so these points come from the search engine's indexed text of the Help Center article "GPT-5.5 in ChatGPT" ([help.openai.com/en/articles/11909943](https://help.openai.com/en/articles/11909943)). Instant is the default for logged-in users and "a single auto-switching system". In the simplified picker, auto-switching "appears as Instant switching to Medium". You "select Configure in the model picker to turn automatic switching on or off". Thinking and Pro can be chosen directly. Re-check against the live page.
- **Verified, same caveat.** Legacy models appear in the picker only while an admin has enabled them. "The list shown in workspace settings and the model picker is the source of truth" ([Legacy model access](https://help.openai.com/en/articles/11954883)).
- **Secondary.** The August 2025 "Auto / Fast / Thinking" picker, with Auto as the default, is reported by [The Broadband Guide](https://www.speedguide.net/news/chatgpts-model-picker-is-back-8643), quoting Sam Altman on X. I did not find an OpenAI page for it.
- **Takeaway (Inference).** The trigger names a *mode*, not a model ID. Fine control hides behind a "Configure" item.

**Gemini app**

- **Verified.** Google's release notes tell users to pick models from "the model drop down". For example, 2026-07-21: choose "3.6 Flash" in the model dropdown. 2025-12-17: Gemini 3 Pro "is also available as 'Pro' in the model picker". Deep Think is chosen "in the prompt bar", separately from the model dropdown (2026-02-12) ([Gemini release notes](https://gemini.google/release-notes/); the page served to me was in Marathi, so wording is translated).
- **Secondary.** The layout comes from 9to5Google:
  - The dropdown is in the bottom right of the prompt box. A web `@`-menu has a "Models" section with `@Fast`, `@Thinking` and `@Pro`, navigable with arrow keys or the first letter ([9to5Google, 2026-01-02](https://9to5google.com/2026/01/02/gemini-model-switch/)).
  - Each option has a one-line description: Fast "Answers quickly", Thinking "Solves complex problems", Pro "Thinks longer for advanced math & code", under a "Gemini 3" label ([9to5Google, 2025-12-17](https://9to5google.com/2025/12/17/gemini-app-3-flash-rollout/)).
  - An earlier clean-up cut the web dropdown to four options and moved tools such as Deep Research and Video to the prompt bar ([Android Headlines, 2025-05](https://www.androidheadlines.com/2025/05/google-gemini-web-cleaner-model-picker.html), via [9to5Google](https://9to5google.com/2025/05/13/gemini-model-picker/)).

  I found no Google help-centre page that describes the picker's layout.
- **Takeaway (Inference).** The trigger says "Fast" or "Pro", and a single short phrase per option does the explaining. No IDs or prices appear in the consumer app.

**Perplexity**

- **Verified.** "Best" is "the automatic model option inside Search", which "picks a suitable model for each query so you do not have to". The advice is to "Start with Best for everyday questions", and Free users cannot choose a model manually ([Perplexity Help Center: What advanced AI models are included in my subscription?](https://www.perplexity.ai/help-center/en/articles/10354919-what-advanced-ai-models-are-included-in-my-subscription)).
- **Secondary.** The selector is an icon in the search input, next to attachments and voice ([First AI Movers](https://www.firstaimovers.com/p/perplexity-choose-ai-model)). I could not find a Perplexity page that states the location.

**Cursor**

- **Verified.** "The active model is shown in the model picker at the top of the chat panel." `Cmd+/` cycles models, and "Your selection persists across conversations until you change it" ([Cursor Help: Available models](https://cursor.com/help/models-and-usage/available-models)).
- **Verified.** Choosing Auto offers Cost, Balance or Intelligence, and "Balance is the default mode for new users" ([Cursor Help: Cursor Router](https://cursor.com/help/models-and-usage/cursor-router)).

**v0**

- **Verified.** "Click the current model in the composer toolbar." You can "Review input and output token prices in the picker". Locked models stay visible but cannot be used. Changing a chat's model does not change the account default ([v0 Docs: Model picker](https://v0.app/docs/model-picker), updated 2026-10-02).

**Raycast AI**

- **Verified.** "Open the model picker from the AI Chat window's title bar or by using `/` in the composer." Models are "grouped by their provider", and each provider is collapsible. Speed, intelligence and context window are shown, with a sort menu. Disabled models "are hidden everywhere AI models can be selected" ([Raycast Manual: AI Chat](https://manual.raycast.com/ai/chat)).
- **Verified.** "`⇧ ⌘ M` / `Ctrl Shift M`: Change AI model" ([Raycast Manual: Keyboard shortcuts](https://manual.raycast.com/keyboard-shortcuts.md)).
- **Takeaway (Inference).** This is the "power user" end: rich rows, but users can switch off models they don't care about, so the default list stays short.

**GitHub Copilot Chat**

- **Verified.** In VS Code, the model picker sits in the chat input field. Hovering a model shows a pin icon that adds it to a **Pinned** section at the top. For reasoning models, a `>` arrow opens a **Thinking Effort** submenu. A gear item, **Manage Language Models**, opens an editor. In an untrusted workspace the picker shows only **Auto** ([VS Code: Language models](https://code.visualstudio.com/docs/copilot/language-models)).
- **Verified.** In Visual Studio, JetBrains, Eclipse and Xcode, the model dropdown is "in the bottom right of the chat view", and every client offers **Auto** ([GitHub Docs: Change the chat model](https://docs.github.com/en/copilot/how-tos/use-ai-models/change-the-chat-model)).
- **Verified.** With Auto, the model that answered is shown on **hover over the response** in Copilot Chat ([GitHub Docs: Auto model selection](https://docs.github.com/en/copilot/concepts/auto-model-selection)).
- **Takeaway (Inference).** Secondary details (pin, effort, which model answered) appear on hover or in a submenu, not in the row by default.

**T3 Chat and similar.** I found no official T3 Chat documentation of its picker. Search returned only third-party and unofficial pages. **No primary source; not used.**

### 3.3 Cross-product patterns (Inference from §3.2)

1. **Placement.** Six of the seven documented products put the picker *in or next to the composer*: Claude, Gemini, Perplexity, v0, Copilot, and Raycast's `/` command. Cursor and Raycast's title bar put it at the top of the panel. None uses a bordered "card" trigger in the global header.
2. **Trigger label.** It is the *current* model's short name or a mode word ("Auto", "Best", "Fast", "Instant"), never two names and never the API ID.
3. **Menu weight.** The default list is short. Extras go behind "More models" (Claude), "Configure" (ChatGPT), hover pins and submenus (Copilot) or settings to hide models (Raycast). Rich metadata (prices, speed bars) appears only in tools for developers (v0, Raycast).
4. **Defaults.** Every product starts on a default or an automatic mode (§4).

---

## 4. First-run: do products ask?

- **Verified.** None of the product docs above describes asking for a model before first use. Each names a default or automatic choice:
  - Claude: Sonnet as "your versatile default" ([Claude Academy](https://academy.claude.com/tutorials/choosing-the-right-claude-model)).
  - ChatGPT: Instant as the default ([OpenAI Help](https://help.openai.com/en/articles/11909943), snippet only).
  - Perplexity: "Start with Best" ([Perplexity Help](https://www.perplexity.ai/help-center/en/articles/10354919-what-advanced-ai-models-are-included-in-my-subscription)).
  - Cursor: Balance by default for new users ([Cursor Router](https://cursor.com/help/models-and-usage/cursor-router)).
  - Copilot: Auto in every client ([GitHub Docs](https://docs.github.com/en/copilot/how-tos/use-ai-models/change-the-chat-model)).
- **Verified.** Apple HIG, Onboarding: "**Postpone nonessential setup flows or customization steps.** Provide reasonable default settings so most people can immediately start interacting with your app … without performing additional configuration." It also says: "Consider providing a collection of context-specific tips instead of a single onboarding flow" ([Apple HIG: Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding)).
- **Verified.** Apple HIG, Pop-up buttons: "if people haven't made a selection yet, it shows the default item you specify. When possible, make the default selection an item that most people are likely to want" ([Apple HIG: Pop-up buttons](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons)).
- **Verified.** NN/g: "Tutorials interrupt users, don't necessarily improve task performance, and are quickly forgotten." Prefer "pull revelations", meaning help triggered when a user would benefit, and "Make it easy to dismiss (and recall) the help content" ([NN/g: Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/)).
- **Verified.** NN/g on coach marks: keep them "as short as possible" and "focus on a single interaction". "Presenting hints one-by-one, at the right moment, makes it a lot easier for users to understand and learn instructions" ([NN/g: Instructional Overlays and Coach Marks](https://www.nngroup.com/articles/mobile-instructional-overlay/)).
- **Verified.** NN/g on defaults: most users never change settings, so optimise the default experience. Do not pick the most expensive option as the default, or "you'll lose credibility" ([NN/g: The Power of Defaults](https://www.nngroup.com/articles/the-power-of-defaults/)).
- **Inference.** AdaTwin's defaults are deliberate: Gemini 3.5 Flash is "what AdaTwin's prompts were written against", and Nano Banana 2.1 is cheap at 2K (`catalog.ts:27-28,62-64`). That is exactly the case for "a default most people want". A blocking card with a primary "Use these models" button asks a question most users cannot answer at step 1. It also hides the top-bar control until it is answered (`project-layout.tsx:53`), which is the opposite of teaching where the control lives.

---

## 5. Two related choices (text and image model)

Options found in the products:

| Pattern                                             | Seen in                                                                                                                                                                                                                       | Fit for AdaTwin (Inference)                                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One trigger, sectioned menu**                     | Claude: model and Effort in one menu ([Claude Help](https://support.claude.com/en/articles/8664678-how-can-i-change-the-model-version-that-i-m-chatting-with)). Apple HIG: "Consider grouping logically related items … use a separator" ([Apple HIG: Menus](https://developer.apple.com/design/human-interface-guidelines/menus)). | **Best fit.** It is what AdaTwin has. Keep it and slim the rows. Nine single-line rows plus two group labels is about 360px tall, so no scrolling (§7.2).                                                           |
| **One trigger, submenus per kind**                  | Copilot's Thinking Effort submenu ([VS Code](https://code.visualstudio.com/docs/copilot/language-models)). Radix `Sub`/`SubTrigger` ([Radix](https://www.radix-ui.com/primitives/docs/components/dropdown-menu)).                | Very compact (two rows: "Text · 3.5 Flash ›", "Images · Banana 2.1 ›"). But Apple says "Use submenus sparingly. Each submenu … hides the items it contains" ([Apple HIG: Menus](https://developer.apple.com/design/human-interface-guidelines/menus)). Keep as a fallback if the list grows. |
| **Two separate small triggers**                     | Gemini keeps Deep Think in the prompt bar, apart from the model dropdown ([Gemini release notes](https://gemini.google/release-notes/)).                                                                                     | Doubles the top-bar weight for a setting the user rarely touches. Not recommended.                                                                                                 |
| **Settings page or popover for the rarely-changed one** | Raycast sets models and visibility in Settings → AI ([Raycast Manual](https://manual.raycast.com/ai/chat)). VS Code: "Manage Language Models" ([VS Code](https://code.visualstudio.com/docs/copilot/language-models)). | A good home later for "hide models" or "show model IDs"; not needed for two choices.                                                                                     |

---

## 6. Visual details that read as subtle

### 6.1 Design-system guidance

- **Ghost trigger, small size.** shadcn/ui's button (new-york-v4): `ghost` = `hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50`, `sm` = `h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5` and `icon-sm` = `size-8` ([shadcn button source](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/button.tsx)). The **Verified** fact is that `ghost` has no border or background at rest.
- **Model-selector components.** assistant-ui's `ModelSelector` offers trigger variants `outline` (default), `ghost` ("no background") and `muted`, at sizes `sm` = `h-8`, default = `h-9` and `lg` = `h-10`. Items have a name with an *optional* description below ([assistant-ui: Model Selector](https://www.assistant-ui.com/docs/ui/model-selector)). Vercel's AI Elements `ModelSelector` is a cmdk command dialog, grouped by provider, with search and logos ([AI Elements: Model Selector](https://elements.ai-sdk.dev/components/model-selector)). Both are libraries, not products, but they confirm that `h-8` ghost is a standard size.
- **Menu rows.** shadcn's `DropdownMenuItem` is `px-2 py-1.5 text-sm` (about 32px tall). `DropdownMenuRadioItem` puts a tiny indicator (`size-2` dot in a `size-3.5` slot) at `left-2`, with `pl-8`. `DropdownMenuLabel` is `px-2 py-1.5 text-sm font-medium`. `DropdownMenuShortcut` is `ml-auto text-xs tracking-widest text-muted-foreground` ([shadcn dropdown-menu source](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/dropdown-menu.tsx)). Today AdaTwin's rows are `px-2.5 py-2` with three lines (`model-picker.tsx:381`), roughly twice as tall.
- **Check mark over radio circles.** Apple HIG, Menus: "Consider using a checkmark to show that an attribute is currently in effect. It's easy for people to scan for checkmarks." Also: "write a label that clearly and succinctly describes it"; "Use menu item icons sparingly"; and "provide icons for all menu items in a group, or none of them" ([Apple HIG: Menus](https://developer.apple.com/design/human-interface-guidelines/menus)).
- **Radix primitives.** `RadioItem` is "An item that can be controlled and rendered like a radio". `ItemIndicator` "Renders when the parent … RadioItem is checked", so it can wrap a `CheckIcon`. `Label` "won't be focusable using arrow keys". Items carry `data-highlighted` and `data-state="checked"`. Arrow keys move focus, and Esc returns focus to the trigger ([Radix: Dropdown Menu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu)). **Inference:** a `group` class on the item plus `group-data-[highlighted]:…` and `group-data-[state=checked]:…` variants is enough to reveal details on hover or keyboard focus without JS.
- **Material 3.** Compose's `SelectableDropdownMenuItem` has `selected`, `selectedLeadingIcon` ("optional leading icon to be displayed when the item is selected"), optional `supportingText` and optional `trailingContent`. These are API docs, read via the [composables.com mirror](https://composables.com/jetpack-compose/androidx.compose.material3/material3/components/SelectableDropdownMenuItem/api.md) of [developer.android.com](https://developer.android.com/reference/kotlin/androidx/compose/material3/SelectableDropdownMenuItem.composable), because the Android page is too large to fetch. Dividers separate groups ([Compose: Menus](https://developer.android.com/develop/ui/compose/components/menu)). **Not found:** I could not read `m3.material.io/components/menus` itself, because it renders client-side. M3 treats supporting text as optional and marks selection with a leading icon, not a filled row.

### 6.2 What products do with secondary details

- **Verified.** Copilot shows the pin action **on hover** and the answering model **on hover over a response** ([VS Code](https://code.visualstudio.com/docs/copilot/language-models), [GitHub Docs](https://docs.github.com/en/copilot/concepts/auto-model-selection)).
- **Verified.** Claude moves extra models behind "More models" ([Claude Help](https://support.claude.com/en/articles/8664678-how-can-i-change-the-model-version-that-i-m-chatting-with)).
- **Secondary.** Gemini gives each option one short phrase ([9to5Google](https://9to5google.com/2025/12/17/gemini-app-3-flash-rollout/)).
- **Verified.** Only developer tools show prices or speed in the row (v0 token prices, Raycast speed and intelligence) ([v0](https://v0.app/docs/model-picker), [Raycast](https://manual.raycast.com/ai/chat)).
- **Not found.** No consumer product I checked shows raw model IDs in the picker.

---

## 7. Recommendation for AdaTwin (detail)

Everything below is **Inference**, built on §3 to §6 and the existing Radix `DropdownMenu` (`apps/frontend/src/components/ui/dropdown-menu.tsx`).

### 7.1 Trigger (top bar)

- **Shape.** Ghost button, `h-8 gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground`, hover `hover:bg-accent hover:text-foreground`, open `data-[state=open]:bg-accent data-[state=open]:text-foreground`, focus `focus-visible:ring-[3px] focus-visible:ring-ring/40`. **Drop** `border border-border bg-card`, `hover:border-ink` and `font-semibold`.
- **Content.**
  - `GeminiLogo` at `size-4`. This is the only colour, and it is the one place blue is allowed.
  - The **text model's short name only**, e.g. "3.5 Flash", `hidden md:inline max-w-32 truncate`.
  - `ChevronDownIcon` at `size-3.5 opacity-60`. Drop the rotate animation, or keep it, as it is cheap.
  - **Drop** the `·` separator and the image model name. Most of the app's calls are text calls. The image model is still one click away, and the `aria-label` keeps both names (`model-picker.tsx:70-74`).
  - Optional: if the user has picked a non-default image model, add a tiny `ImageIcon` (`size-3.5`) after the name as a cue that something is customised. Leave it out by default.
- **Below `md`.** Logo and chevron only (`size-8` hit area), as today.
- **Glow.** Remove `model-glow` (`index.css:178-184`) once the first-run card is gone (§7.3). It existed only to point at where the picker went.

### 7.2 Menu

- **Content box.** `w-64 p-1` (`w-[min(16rem,calc(100vw-2rem))]`). Drop the `max-h`/scroll unless the catalog grows: 9 rows × 32px, 2 labels × 28px, 1 separator and a footer make about 380px.
- **Header.** Drop the "AI models" heading and its sentence (`model-picker.tsx:99-107`). The group labels are enough. Move "Used for every AI call from this browser" into the footer if it is wanted at all.
- **Group label.** `MenuPrimitive.Label`, `px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground`, with the text "Text" or "Images". **Drop** the icon, the uppercase tracking and the hint. Per Apple, icons go on all items in a group or none, and these icons add nothing ([Apple HIG: Menus](https://developer.apple.com/design/human-interface-guidelines/menus)).
- **Option row.** `MenuPrimitive.RadioItem` with `group flex h-8 items-center gap-2 rounded-lg px-2 text-sm outline-none select-none data-highlighted:bg-accent`:
  - **Left.** `option.label` with the "Gemini " prefix stripped inside the Text group ("3.5 Flash", "3.8 Flash", "4 Argon"), since the group label already says it. Use full Nano Banana names in Images. Add `group-data-[state=checked]:font-medium`. There is no leading radio circle.
  - **Middle, optional.** One quiet word for the badge, rendered as plain text, not a chip: `text-xs text-muted-foreground/70`, e.g. "newest". Show at most one, and **drop the "Default" chip**. Instead, list the default first and say "Default" in the footer when it is highlighted.
  - **Right.** In the Images group, the price as trailing text, `ml-auto text-xs tabular-nums text-muted-foreground opacity-0 group-data-[highlighted]:opacity-100 group-data-[state=checked]:opacity-100`, e.g. "$0.05". Using opacity, not `hidden`, keeps the row width steady. Then `MenuPrimitive.ItemIndicator` wrapping `CheckIcon` at `size-4` (`text-foreground`, or `text-primary-foreground` on a lime chip if you want one touch of lime). Reserve a fixed `w-4` slot so unselected rows line up.
  - **Selected highlight.** Only the check and `font-medium`. **Drop** `border-ink/15 bg-primary/10` (`model-picker.tsx:382-383`).
  - **Drop** the monospace ID line (`model-picker.tsx:404-406`) and the note line (`model-picker.tsx:401-403`) from the row.
  - Keep `onSelect={(e) => e.preventDefault()}` so both kinds can be set in one visit (`model-picker.tsx:378-379`).
- **Notes.** Show them in a **single footer line**, not in the rows. Add a footer after the groups: `px-2 pt-1.5 pb-1 text-xs text-muted-foreground min-h-8 line-clamp-2`, showing the highlighted option's `note`. Track it with `onFocus` or `onPointerMove` on each `RadioItem`, or with Radix's highlight via `onFocus`, since items receive focus. When nothing is highlighted, show the checked option's note. This keeps rows one line tall and avoids the layout jump that expanding the highlighted row would cause during arrow-key navigation. A simpler alternative is a `title` attribute with the note and ID, but tooltips on menu items are unreliable on touch.
- **Model IDs.** Gone from the UI. If they are needed for debugging, put them in the footer as `font-mono text-[10px] text-muted-foreground/60` after the note, visible only for the highlighted row.
- **"Use the defaults."** Keep it as a normal `DropdownMenuItem` below a separator, `h-8 text-sm text-muted-foreground`, shown only when something differs (as today, `model-picker.tsx:128-141`).
- **Keyboard.** Radix already provides arrows, Enter and Esc ([Radix](https://www.radix-ui.com/primitives/docs/components/dropdown-menu)). A global shortcut like Cursor's `Cmd+/` or Raycast's `⇧⌘M` is not needed for an app where models change rarely.

Sketch (not applied):

```tsx
<MenuPrimitive.RadioItem
  value={option.id}
  onSelect={(e) => e.preventDefault()}
  onFocus={() => setHint(option)}
  className="group flex h-8 items-center gap-2 rounded-lg px-2 text-sm outline-none select-none data-highlighted:bg-accent"
>
  <span className="truncate group-data-[state=checked]:font-medium">{name}</span>
  {option.badge && <span className="text-xs text-muted-foreground/70">{option.badge.toLowerCase()}</span>}
  {price !== undefined && (
    <span className="ml-auto text-xs tabular-nums text-muted-foreground opacity-0 group-data-[highlighted]:opacity-100 group-data-[state=checked]:opacity-100">
      ${price}
    </span>
  )}
  <span className={cn("grid w-4 place-items-center", price === undefined && "ml-auto")}>
    <MenuPrimitive.ItemIndicator><CheckIcon className="size-4" /></MenuPrimitive.ItemIndicator>
  </span>
</MenuPrimitive.RadioItem>
```

### 7.3 First-run on capture

**Replace `ModelPrompt` with a quiet inline line, and show the top-bar picker from the start.**

1. In `project-layout.tsx:53`, show the picker always (`showPicker = true`). The control should be where it will live from day one ([Apple HIG: Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), "reasonable default settings").
2. In `capture.tsx:480-492`, swap the card for one line under the lede, `mt-2 text-sm text-muted-foreground`:

   > Uses **Gemini 3.5 Flash** for text and **Nano Banana 2.1** for images · <u>Change</u>

   - Model names in `text-foreground font-medium`; no logo, border, shadow or lime.
   - "Change" is a text button (`font-medium text-foreground underline-offset-2 hover:underline`) that opens the top-bar menu. This needs one shared bit of state, e.g. `openModelPicker()` in `lib/models.ts` with a listener the `ModelPicker` subscribes to and then calls `setOpen(true)` on. This is a pull revelation the user triggers, per [NN/g](https://www.nngroup.com/articles/onboarding-tutorials/).
   - Optional: a small `×` icon button (`size-6 text-muted-foreground`) to dismiss it.
3. Reuse `ada-twin:models-confirmed` as "hint seen". Set it when the user opens the menu from anywhere, picks a model, dismisses the line, or starts the first AI step. After that the line never returns. The defaults are used meanwhile; nothing blocks.
4. **Coachmark: not recommended as the main device.** If you want the top-bar control pointed out, use **one** Radix `Popover` anchored to the trigger: `side="bottom" align="end"`, `w-60 p-3 text-sm`, one sentence ("Models live here. The defaults work well."), with a "Got it" text button. Show it once, only on the first visit to capture, and never together with the inline line. NN/g's advice applies: keep it "as short as possible" and on "a single interaction" ([NN/g](https://www.nngroup.com/articles/mobile-instructional-overlay/)). The inline line already does the job with less interruption, so prefer it.
5. **Remove** `ModelDropdown` and the large dropdown cards (`model-picker.tsx:260-310`), along with the `justConfirmed`/glow plumbing (`models.ts:53-76`, `model-picker.tsx:42-48`), once the prompt is gone.

---

## 8. Gaps and unverified points

- **ChatGPT.** `help.openai.com` returned 403. Claims come from search-indexed text of the Help Center articles, plus one secondary report of the 2025 Auto/Fast/Thinking picker. Where the trigger sits in ChatGPT's current UI is **not confirmed** by a primary source.
- **Gemini.** The release notes confirm a "model drop down" / "model picker" and its option names, but the layout, position and per-option descriptions come from 9to5Google and Android Headlines.
- **Perplexity.** The selector's location is from a secondary blog only.
- **T3 Chat.** No primary documentation found. Excluded.
- **Material 3.** The m3.material.io menu guidelines could not be read (client-rendered). Only the Compose API reference was used.
- **Official screenshots.** None of the help pages I could read contained alt text or captions that describe trigger borders or styling. Statements about "no border" or "text-only" triggers in other products are therefore **not verified**. The trigger-style advice in §7 rests on the design-system sources in §6.1.

---

## Sources

**Products (primary)**

- [Claude Help Center: How can I change the model version that I'm chatting with?](https://support.claude.com/en/articles/8664678-how-can-i-change-the-model-version-that-i-m-chatting-with)
- [Claude Academy: Choosing the right Claude model](https://academy.claude.com/tutorials/choosing-the-right-claude-model)
- [OpenAI Help: GPT-5.5 in ChatGPT](https://help.openai.com/en/articles/11909943) (403 to fetch; read via search index)
- [OpenAI Help: Legacy model access](https://help.openai.com/en/articles/11954883) (same)
- [Gemini release notes](https://gemini.google/release-notes/)
- [Perplexity Help Center: What advanced AI models are included in my subscription?](https://www.perplexity.ai/help-center/en/articles/10354919-what-advanced-ai-models-are-included-in-my-subscription)
- Cursor Help:
  - [Available models](https://cursor.com/help/models-and-usage/available-models)
  - [Cursor Router](https://cursor.com/help/models-and-usage/cursor-router)
- [v0 Docs: Model picker](https://v0.app/docs/model-picker)
- Raycast Manual:
  - [AI Chat](https://manual.raycast.com/ai/chat)
  - [Keyboard shortcuts](https://manual.raycast.com/keyboard-shortcuts.md)
- GitHub Docs:
  - [Change the chat model](https://docs.github.com/en/copilot/how-tos/use-ai-models/change-the-chat-model)
  - [Auto model selection](https://docs.github.com/en/copilot/concepts/auto-model-selection)
- [VS Code: Language models](https://code.visualstudio.com/docs/copilot/language-models)

**Design systems and guidance**

- Apple HIG:
  - [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding)
  - [Menus](https://developer.apple.com/design/human-interface-guidelines/menus)
  - [Pop-up buttons](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons)
- [Radix Primitives: Dropdown Menu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu)
- shadcn/ui new-york-v4 source:
  - [dropdown-menu.tsx](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/dropdown-menu.tsx)
  - [button.tsx](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/button.tsx)
- [assistant-ui: Model Selector](https://www.assistant-ui.com/docs/ui/model-selector)
- [AI Elements: Model Selector](https://elements.ai-sdk.dev/components/model-selector)
- Material 3 (Compose):
  - [Menus](https://developer.android.com/develop/ui/compose/components/menu)
  - [SelectableDropdownMenuItem](https://developer.android.com/reference/kotlin/androidx/compose/material3/SelectableDropdownMenuItem.composable) (read via the [composables.com mirror](https://composables.com/jetpack-compose/androidx.compose.material3/material3/components/SelectableDropdownMenuItem/api.md))
- NN/g:
  - [Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/)
  - [Instructional Overlays and Coach Marks](https://www.nngroup.com/articles/mobile-instructional-overlay/)
  - [The Power of Defaults](https://www.nngroup.com/articles/the-power-of-defaults/)

**Secondary (used only where no primary source was found; marked inline)**

- 9to5Google:
  - [2026-01-02, Gemini model switch](https://9to5google.com/2026/01/02/gemini-model-switch/)
  - [2025-12-17, Gemini 3 Flash rollout](https://9to5google.com/2025/12/17/gemini-app-3-flash-rollout/)
  - [2025-05-13, Gemini model picker](https://9to5google.com/2025/05/13/gemini-model-picker/)
- [Android Headlines, 2025-05](https://www.androidheadlines.com/2025/05/google-gemini-web-cleaner-model-picker.html)
- [The Broadband Guide: ChatGPT's model picker is back](https://www.speedguide.net/news/chatgpts-model-picker-is-back-8643)
- [First AI Movers: Perplexity, choose AI model](https://www.firstaimovers.com/p/perplexity-choose-ai-model)

**Repo** (paths cited inline)

- `apps/frontend/src/{components/model-picker.tsx, components/ui/dropdown-menu.tsx, lib/models.ts, pages/steps/capture.tsx, pages/project-layout.tsx, index.css}`
- `apps/frontend/package.json`
- `apps/api/src/routes/models.ts`
- `packages/agent/src/catalog.ts`
