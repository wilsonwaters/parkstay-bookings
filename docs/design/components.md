# WA Stay components

The design-system primitives live in `src/renderer/components/ui/`, one file per component with its test beside it. Import them from the barrel:

```ts
import { Button, Dialog, Field, TextField, useToast } from '../components/ui';
```

Every screen is built from these and the tokens in [design-language.md](design-language.md). If a screen needs something that is not here, add it to `components/ui/` with tests (architecture-notes §12.8); never hand-roll a dialog, menu or date picker inside a feature.

Run `npm run dev` and open `#/__design` to see every primitive with its variants and states, using the real fonts and CSS.

## Rules that apply to all of them

- **Tokens only.** No raw palette classes, hex or emoji in `components/ui` (the token guard test enforces it). Provider brand colours are data and arrive through props.
- **Accessible by construction.** Each primitive sets its own roles, names and keyboard behaviour. Tests query by role and accessible name, never by class name.
- **Focus is always visible.** The D1 `:focus-visible` ring (2 px `focus`) shows on every interactive part. Controls that hide a native input (SegmentedControl, RadioCard) draw the ring on their visible box.
- **Never colour alone.** Status, tone and errors always carry text or an icon as well.
- **Overlays share one stack.** Dialog, Sheet and Popover register with `OverlayStack`: Escape closes only the top one, `#root` and lower overlays are `inert` while a modal is open, and page scroll is locked. Overlays are portalled to `document.body`, outside `#root`.
- **App providers.** `ToastProvider` and `AnnouncerProvider` wrap the app (in `main.tsx` for now; D3 moves them into `app/AppProviders.tsx`). `ToastViewport` renders where it is placed (D3 puts it in the tray). D3 also fills `ProviderManifestsProvider` from `useProviders()`.

## Actions

| Component | Use it for | Do | Don't |
| --- | --- | --- | --- |
| `Button` | Any action. `primary` (coral) is the one main action per view, `secondary` an ink outline, `ghost` a quiet action, `danger` a crimson outline. `as="a"` for a link that looks like a button. | Label it with a verb: "Create watch", "Hold site". Use `loading` while the action runs; the label stays. | Put two primary buttons in one view, or use `danger` for anything that is not destructive. |
| `IconButton` | An action shown only as an icon: close, more actions, previous month. | Give a `label` that says what happens ("Delete watch"); it becomes the name and the tooltip. | Use it when there is room for a text Button; icon-only is for repeated or universally understood actions. |

## Form

| Component | Use it for | Do | Don't |
| --- | --- | --- | --- |
| `Field` | The label, hint and error around one control. It wires `id`, `aria-describedby`, `aria-invalid` and `aria-required` onto the control. | Pass the validation message as `error` (react-hook-form `errors.x?.message`). Mark the few optional fields with `optional`. | Write your own `<label>` and error `<p>` next to an input. |
| `TextField` | Single-line text, numbers, email. | Use `leadingIcon` for a search field. Use `{...register('name')}`: it forwards refs. | Use `placeholder` as the label. |
| `Textarea` | Multi-line notes. | Say in the hint what the text is for. | Use it for one-line values. |
| `Select` | Choosing from a short, fixed list (up to about 7 options). | Keep option labels short and sentence case. | Use it for long or searchable lists; use `Combobox`. |
| `Checkbox` | Independent yes/no choices in a form that is saved later. | Add a `description` when the consequence is not obvious. | Use it for a setting that applies at once; use `Switch`. |
| `Radio` + `RadioGroup` | One choice from a few, with the options visible. | Give the group a `legend` that asks the question. | Use radios for a single on/off choice. |
| `Switch` | A setting that takes effect immediately (desktop notifications). | Label it with the setting, not with "On/Off". | Put it in a form that needs a Save button; use `Checkbox`. |

## Display

| Component | Use it for | Do | Don't |
| --- | --- | --- | --- |
| `Card` | A surface resting on the page: a location, a watch, a settings group. | Render an interactive card `as="a"` or `as="button"` with `interactive`, so it is focusable. | Put a card inside a card, or a card inside a dialog (shadow on shadow). |
| `Badge` | Short static labels: counts, "Soon", categories. | Pick the tone by meaning (`available`, `warning`, `sun` for time cues). | Use a badge as a button, or rely on its colour to carry the meaning. |
| `StatusPill` + `statusPresets` | The status of a watch, snipe or booking. | Spread the preset: `<StatusPill {...statusPresets.snipe[snipe.status]} />`. Add a preset when an enum grows (the test fails until you do). | Invent a one-off status colour in a feature. |
| `ProviderBadge` | Showing whose system something belongs to, on every watch, snipe, booking, notification and location. | Pass only `providerId` inside `ProviderManifestsProvider`; use `compact` in dense rows. | Draw a provider's logo, or hard-code its colour. |
| `Spinner` | A wait longer than about 300 ms with no known shape. | Give a `label` that says what is loading ("Loading watches"). | Show it for quick actions, or full screen; lay it out with the parent. |
| `Skeleton` | Loading content whose shape you know (cards, rows). | Match the size of the real content so nothing jumps. | Use it without a status or `aria-busy` on the region: it is hidden from assistive technology. |
| `EmptyState` | Nothing to show yet, and the next step. | Offer one action ("Create watch") and say plainly what will happen. | Use more than one brushstroke accent in a region, or jokes. |
| `PageHeader` | The top of every page: its one `h1`, a line of description, actions. | Put the page's primary action in `actions`. | Add a second `h1` anywhere on the page. |
| `Notice` | An inline message about the page or section: info, success, warning, danger. | Say what happened and what to do next, with an action if there is one. | Use it for a passing confirmation; use a toast. |
| `VisuallyHidden` | Text only screen readers need, such as ", coming soon" after a nav label. | Use it to complete a name that the visual design shortens. | Hide information sighted people also need. |
| `Brushstroke`, `PhotoPlaceholder` | The D1 atoms. See design-language.md. | Follow the brushstroke placement rules. | Use them as decoration elsewhere. |

## Navigation and choice

| Component | Use it for | Do | Don't |
| --- | --- | --- | --- |
| `Tabs`, `TabList`, `Tab`, `TabPanel` | Switching between sections of one thing (a location's overview, sites, rules). | Name the `TabList` and keep tab labels to one or two words. | Use tabs for steps in a flow or for navigation between pages. |
| `SegmentedControl` | Two to four views of the same content (Map / List). | Keep the options parallel and short. | Use it for settings or for more than four options. |
| `RadioCard` + `RadioCardGroup` | A prominent choice with descriptions, such as the provider step of a create flow. | Put a `ProviderBadge` or "Soon" badge in `trailing`, and disable cards that cannot be chosen yet. | Put links or buttons inside a card; the whole card is the radio. |
| `Disclosure` | Optional detail that most people skip: advanced options, an explanation. | Write the `summary` as what is hidden ("Advanced options"). | Hide required fields or errors in it. |

## Overlays

| Component | Use it for | Do | Don't |
| --- | --- | --- | --- |
| `Dialog` | A focused task or decision that blocks the page: editing a watch, a sign-in prompt. | Give it a `title` (its name) and put actions in `footer`. Let Escape and the overlay close it unless data would be lost. | Open a dialog on page load, or for information a `Notice` could show. |
| `ConfirmDialog` | Confirming a destructive or costly action. | Use `tone="danger"` for deletes (Cancel gets focus) and return the Promise from `onConfirm` so it shows loading. | Ask "Are you sure?" for actions that can be undone; offer Undo in a toast instead. |
| `Sheet` | Long forms, filters or details beside the page, from the right. | Keep the primary action in the footer so it stays visible. | Use it for a quick yes/no; use `ConfirmDialog`. |
| `Menu` + `MenuItem` | A short list of actions on one thing (rename, pause, delete). | Use `href` for items that navigate and `tone="danger"` for destructive ones; group with `MenuSeparator`. | Put form controls in a menu, or use it for site navigation. |
| `Popover` | Small, non-blocking panels anchored to a button: filters, the date and guest pickers. | Return focus with the `close` render prop from a Done button. | Put a whole form or a second popover inside one. |
| `Tooltip` | A short hint on hover or focus for a control that already has a name. | Keep it to a few words; it describes the control. | Put essential information or interactive content in a tooltip. |

## Feedback

| Component | Use it for | Do | Don't |
| --- | --- | --- | --- |
| `useToast` (`ToastProvider`, `ToastViewport`) | Brief confirmation of something the person just did ("Watch saved"), or an error from it. | Use `toast.error` for failures; it stays until dismissed. Add an `action` for Undo. | Use a toast for something the person must act on later; use a notification or a `Notice`. |
| `useAnnounce` (`AnnouncerProvider`) | Telling screen-reader users about a change they cannot see: "24 results", "Map updated". | Announce once the change has happened, politely unless it is urgent. | Announce every keystroke, or repeat what a toast or live output already says. |

## Search fields

All three take `appearance="field"` (forms) or `"segment"` (a segment of E1's search pill, with a small label above the value).

| Component | Use it for | Do | Don't |
| --- | --- | --- | --- |
| `Combobox` | Choosing one option from a long list by typing: campgrounds, places. | Pass `options` (optionally with `group`), and `filter={false}` with `onInputChange` when you filter or search yourself. | Use it for free text that need not match an option. |
| `DateRangeField` + `RangeCalendar` | Check-in and check-out dates. | Pass `minDate`, `maxDate` and `maxNights` from the provider's rules; values are `YYYY-MM-DD` strings. | Convert the values to `Date` or timestamps; time zones would shift days. |
| `Stepper` | A small whole number: vehicles, nights, guests of one age. | Set `min` and `max` from the real limits and give a `hint` for the rule. | Use it for numbers people type faster than they click (postcodes, prices); use `TextField`. |
| `GuestsField` | Who is coming: adults, children, infants. | Override `limits` when a provider allows fewer people. | Add provider rules (concessions, equipment) here; they are provider stay fields (U1/U2). |

## Hooks

| Hook | Use it for |
| --- | --- |
| `useFocusTrap(ref, { active })` | Keeping Tab inside a custom modal surface and returning focus on close. Dialog and Sheet already use it. |
| `usePosition(anchorRef, floatingRef, { open })` | Placing a floating layer below or above its anchor, flipped and clamped to the window. Built on the pure `computePosition`. |
| `useDisclosure()` | The state and ARIA props for a custom show/hide pattern. `Disclosure` uses it. |
| `useOverlay()` / `OverlayStack` | Registering a new kind of overlay so Escape order and `inert` stay correct. |
