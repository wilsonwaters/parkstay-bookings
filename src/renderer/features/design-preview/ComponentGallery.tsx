/**
 * The component half of the dev-only design preview (#/__design): one section per
 * components/ui primitive, showing its variants and states with the real CSS and fonts.
 * Runtime checks (axe, keyboard passes, screenshots) run against this page.
 */
import { useState, type ReactNode } from 'react';
import {
  BellRing,
  CalendarCheck,
  ExternalLink,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trash,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Notice,
  PageHeader,
  Radio,
  RadioGroup,
  Select,
  Skeleton,
  Spinner,
  StatusPill,
  Switch,
  TextField,
  Textarea,
  Tooltip,
  VisuallyHidden,
  statusPresets,
  useAnnounce,
  useToast,
  type BadgeTone,
} from '../../components/ui';
import { Section } from './Section';

/** Section titles, in page order. The preview test checks each one renders. */
export const COMPONENT_SECTIONS = [
  'Button',
  'IconButton',
  'Field',
  'TextField',
  'Textarea',
  'Select',
  'Checkbox',
  'Radio and RadioGroup',
  'Switch',
  'Card',
  'Badge',
  'StatusPill',
  'Spinner',
  'Skeleton',
  'EmptyState',
  'PageHeader',
  'Notice',
  'VisuallyHidden',
  'Tooltip',
  'Toast',
  'useAnnounce',
] as const;

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold text-fg-secondary">{label}</h3>
      <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-6 md:grid-cols-2">{children}</div>;
}

function ButtonSection() {
  const [saving, setSaving] = useState(false);
  const save = () => {
    setSaving(true);
    setTimeout(() => setSaving(false), 2000);
  };
  return (
    <Section
      title="Button"
      intro="Primary is the coral call to action, one per view. Secondary is an ink outline, ghost is quiet, danger is a crimson outline. Loading keeps the label."
    >
      <Grid>
        <Specimen label="Variants">
          <Button>Search</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="ghost">Clear</Button>
          <Button variant="danger">Delete watch</Button>
        </Specimen>
        <Specimen label="Sizes: sm 32, md 40, lg 48">
          <Button size="sm" variant="secondary">
            Small
          </Button>
          <Button size="md" variant="secondary">
            Medium
          </Button>
          <Button size="lg" variant="secondary">
            Large
          </Button>
        </Specimen>
        <Specimen label="Icons and links">
          <Button variant="secondary" leadingIcon={<Plus size={18} />}>
            Create watch
          </Button>
          <Button
            as="a"
            href="#/__design"
            variant="ghost"
            trailingIcon={<ExternalLink size={18} />}
          >
            Open ParkStay
          </Button>
        </Specimen>
        <Specimen label="States">
          <Button variant="secondary" loading={saving} onClick={save}>
            Save changes
          </Button>
          <Button variant="secondary" loading>
            Holding site
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </Specimen>
      </Grid>
    </Section>
  );
}

function IconButtonSection() {
  return (
    <Section
      title="IconButton"
      intro="Icon-only buttons always carry a label: it is the accessible name and the tooltip. Hover or focus one to see it."
    >
      <Grid>
        <Specimen label="Variants">
          <IconButton label="Close" icon={<X />} />
          <IconButton label="Settings" icon={<Settings />} variant="secondary" />
          <IconButton label="Create watch" icon={<Plus />} variant="primary" />
          <IconButton label="Delete watch" icon={<Trash />} variant="danger" />
        </Specimen>
        <Specimen label="Sizes and states">
          <IconButton label="Filters, small" icon={<SlidersHorizontal size={16} />} size="sm" />
          <IconButton label="Filters, medium" icon={<SlidersHorizontal />} size="md" />
          <IconButton label="Filters, large" icon={<SlidersHorizontal size={24} />} size="lg" />
          <IconButton label="Search, unavailable" icon={<Search />} disabled />
        </Specimen>
      </Grid>
    </Section>
  );
}

function FieldSection() {
  return (
    <Section
      title="Field"
      intro="Label, hint and error around one control. The control is described by the hint and error and marked invalid; the error has an icon, not just colour."
    >
      <Grid>
        <Specimen label="Hint">
          <Field label="Watch name" hint="Only you see this" className="w-full">
            <TextField placeholder="Lucky Bay long weekend" />
          </Field>
        </Specimen>
        <Specimen label="Error">
          <Field
            label="Email"
            error="Enter an email address like name@example.com"
            required
            className="w-full"
          >
            <TextField type="email" defaultValue="lucky@" />
          </Field>
        </Specimen>
        <Specimen label="Optional">
          <Field label="Phone" optional className="w-full">
            <TextField type="tel" />
          </Field>
        </Specimen>
        <Specimen label="Disabled">
          <Field label="Provider" hint="Set when the watch was created" className="w-full">
            <TextField defaultValue="ParkStay" disabled />
          </Field>
        </Specimen>
      </Grid>
    </Section>
  );
}

function TextFieldSection() {
  return (
    <Section
      title="TextField"
      intro="Single-line text. 40 px high, border-strong edge, crimson edge when invalid."
    >
      <Grid>
        <Specimen label="Default and with a leading icon">
          <Field label="Where to" className="w-full">
            <TextField leadingIcon={<Search size={18} />} placeholder="Places, parks or towns" />
          </Field>
        </Specimen>
        <Specimen label="Invalid">
          <Field label="Postcode" error="Enter a 4-digit postcode" className="w-full">
            <TextField inputMode="numeric" defaultValue="60" />
          </Field>
        </Specimen>
      </Grid>
    </Section>
  );
}

function TextareaSection() {
  return (
    <Section title="Textarea" intro="Multi-line text, at least 80 px high.">
      <Grid>
        <Specimen label="Default">
          <Field label="Notes" hint="Private to you" className="w-full">
            <Textarea placeholder="Gear, who is coming, anything to remember" />
          </Field>
        </Specimen>
        <Specimen label="Disabled">
          <Field label="Provider notes" className="w-full">
            <Textarea defaultValue="Imported from ParkStay." disabled />
          </Field>
        </Specimen>
      </Grid>
    </Section>
  );
}

function SelectSection() {
  return (
    <Section title="Select" intro="The native select, styled. Use it for short, known lists.">
      <Grid>
        <Specimen label="Default">
          <Field
            label="Check every"
            hint="How often WA Stay checks for openings"
            className="w-full"
          >
            <Select defaultValue="60">
              <option value="15">15 minutes</option>
              <option value="60">Hour</option>
              <option value="240">4 hours</option>
            </Select>
          </Field>
        </Specimen>
        <Specimen label="Invalid">
          <Field label="Site type" error="Choose a site type" className="w-full">
            <Select defaultValue="">
              <option value="" disabled>
                Choose one
              </option>
              <option value="tent">Tent</option>
              <option value="caravan">Caravan</option>
            </Select>
          </Field>
        </Specimen>
      </Grid>
    </Section>
  );
}

function CheckboxSection() {
  return (
    <Section title="Checkbox" intro="Native checkboxes with their own label and description.">
      <Grid>
        <Specimen label="States">
          <div className="flex flex-col gap-4">
            <Checkbox label="Email me when a site is found" />
            <Checkbox label="Allow partial matches" defaultChecked />
            <Checkbox
              label="Hold a site automatically when found"
              description="Places a 30-minute hold on ParkStay. You complete payment."
            />
            <Checkbox label="Unavailable for this provider" disabled />
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}

function RadioSection() {
  const [release, setRelease] = useState('daily');
  return (
    <Section
      title="Radio and RadioGroup"
      intro="A fieldset of native radios. Arrow keys move the selection."
    >
      <Grid>
        <Specimen label="Vertical, with descriptions">
          <RadioGroup legend="When does the site open?" value={release} onValueChange={setRelease}>
            <Radio value="daily" label="Daily rollover" description="180 days ahead at midnight" />
            <Radio value="scheduled" label="Scheduled" description="A set date and time" />
            <Radio value="cancellation" label="Cancellations" description="Whenever one frees up" />
          </RadioGroup>
        </Specimen>
        <Specimen label="Horizontal, with an error">
          <RadioGroup
            legend="Site type"
            orientation="horizontal"
            error="Choose a site type"
            name="gallery-site-type"
          >
            <Radio value="tent" label="Tent" />
            <Radio value="caravan" label="Caravan" />
            <Radio value="cabin" label="Cabin" disabled />
          </RadioGroup>
        </Specimen>
      </Grid>
    </Section>
  );
}

function SwitchSection() {
  return (
    <Section
      title="Switch"
      intro="On/off settings that apply at once. The thumb's position shows the state."
    >
      <Grid>
        <Specimen label="States">
          <div className="flex w-full flex-col gap-4">
            <Switch
              label="Desktop notifications"
              description="Shown when a watch finds a site"
              defaultChecked
            />
            <Switch label="Play a sound" />
            <Switch label="Start minimised" disabled />
          </div>
        </Specimen>
      </Grid>
    </Section>
  );
}

function CardSection() {
  return (
    <Section
      title="Card"
      intro="A surface on the page: hairline, card shadow, 12 px radius. Interactive cards are links or buttons and lift on hover."
    >
      <div className="grid gap-6 md:grid-cols-3">
        <Card padding="sm">
          <p className="font-semibold">Padding sm</p>
          <p className="text-sm text-fg-secondary">16 px</p>
        </Card>
        <Card as="article" padding="lg" aria-label="Lucky Bay">
          <p className="font-semibold">Padding lg, as article</p>
          <p className="text-sm text-fg-secondary">24 px</p>
        </Card>
        <Card as="a" href="#/__design" interactive>
          <p className="font-semibold">Interactive link</p>
          <p className="text-sm text-fg-secondary">Hover or focus it</p>
        </Card>
      </div>
    </Section>
  );
}

const BADGE_TONES: { tone: BadgeTone; label: string }[] = [
  { tone: 'neutral', label: 'Neutral' },
  { tone: 'brand', label: 'Brand' },
  { tone: 'accent', label: 'Accent' },
  { tone: 'available', label: '12 sites' },
  { tone: 'warning', label: 'Hold expiring' },
  { tone: 'danger', label: 'Failed' },
  { tone: 'sun', label: 'Soon' },
];

function BadgeSection() {
  return (
    <Section
      title="Badge"
      intro="Small text labels in seven tones. Always text, never colour alone."
    >
      <Grid>
        <Specimen label="Tones">
          {BADGE_TONES.map(({ tone, label }) => (
            <Badge key={tone} tone={tone}>
              {label}
            </Badge>
          ))}
        </Specimen>
        <Specimen label="With an icon">
          <Badge tone="brand" icon={<CalendarCheck size={14} />}>
            Booked
          </Badge>
          <Badge tone="sun" icon={<BellRing size={14} />}>
            Opens at midnight
          </Badge>
        </Specimen>
      </Grid>
    </Section>
  );
}

const PRESET_GROUPS: {
  label: string;
  presets: Record<string, Parameters<typeof StatusPill>[0]>;
}[] = [
  { label: 'Watch', presets: statusPresets.watch },
  { label: 'Watch result', presets: statusPresets.watchResult },
  { label: 'Snipe', presets: statusPresets.snipe },
  { label: 'Snipe result', presets: statusPresets.snipeResult },
  { label: 'Booking', presets: statusPresets.booking },
];

function StatusPillSection() {
  return (
    <Section
      title="StatusPill"
      intro="Icon, label and tone for every watch, snipe and booking status. Live states pulse, and hold still under reduced motion."
    >
      <div className="space-y-6">
        {PRESET_GROUPS.map((group) => (
          <Specimen key={group.label} label={group.label}>
            {Object.entries(group.presets).map(([key, preset]) => (
              <StatusPill key={key} {...preset} />
            ))}
          </Specimen>
        ))}
      </div>
    </Section>
  );
}

function SpinnerSection() {
  return (
    <Section
      title="Spinner"
      intro="For waits over about 300 ms. A status with a hidden label. Prefer a skeleton when you know the shape."
    >
      <Specimen label="Sizes">
        <Spinner size="sm" label="Loading, small" />
        <Spinner size="md" label="Loading, medium" />
        <Spinner size="lg" label="Loading, large" />
      </Specimen>
    </Section>
  );
}

function SkeletonSection() {
  return (
    <Section
      title="Skeleton"
      intro="Placeholders the size of the content. Hidden from assistive technology; static under reduced motion."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-4">
            <Skeleton className="aspect-[4/3] w-full rounded-lg" />
            <Skeleton shape="text" className="mt-4 w-3/4" />
            <Skeleton shape="text" className="mt-2 w-1/2" />
            <div className="mt-4 flex items-center gap-2">
              <Skeleton shape="circle" className="h-6 w-6" />
              <Skeleton shape="text" className="w-24" />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function EmptyStateSection() {
  return (
    <Section
      title="EmptyState"
      intro="What to show when there is nothing yet, and the next step. A Fraunces title and, at most, one brushstroke."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <EmptyState
            headingLevel={3}
            icon={<BellRing size={24} />}
            accent="sun"
            title="No watches yet"
            description="Pick a place and dates, and WA Stay checks for openings every few minutes."
            actions={<Button leadingIcon={<Plus size={18} />}>Create watch</Button>}
          />
        </Card>
        <Card>
          <EmptyState
            headingLevel={3}
            icon={<Search size={24} />}
            title="No places match"
            description="Try a wider area or fewer filters."
            actions={<Button variant="secondary">Clear filters</Button>}
          />
        </Card>
      </div>
    </Section>
  );
}

function PageHeaderSection() {
  return (
    <Section
      title="PageHeader"
      intro="The top of every page: its one h1, a description, actions and an optional back link. Shown here as an h3 because this page already has its h1."
    >
      <Card padding="lg">
        <PageHeader
          headingLevel={3}
          title="Lucky Bay long weekend"
          description="Watching 3 sites at Lucky Bay for Fri 3 Oct – Sun 5 Oct."
          back={{ label: 'Watches', href: '#/__design' }}
          actions={
            <>
              <Button variant="secondary">Edit</Button>
              <Button>Check now</Button>
            </>
          }
        />
      </Card>
    </Section>
  );
}

function NoticeSection() {
  const [shown, setShown] = useState(true);
  return (
    <Section
      title="Notice"
      intro="Inline banners. Info, success and warning are statuses; danger is an alert. Each has an icon and words, not just a tint."
    >
      <div className="grid gap-4">
        <Notice tone="info" title="Book responsibly">
          One DBCA account per person, one booking per night, and only for a stay you mean to take.
        </Notice>
        <Notice tone="success">Your email notifier is working.</Notice>
        <Notice tone="warning" title="Hold expires in 12 minutes">
          Complete payment on ParkStay to keep the site.
        </Notice>
        <Notice
          tone="danger"
          title="ParkStay didn't respond"
          actions={
            <Button size="sm" variant="secondary">
              Try again
            </Button>
          }
        >
          Try again in a minute.
        </Notice>
        {shown ? (
          <Notice tone="info" onDismiss={() => setShown(false)}>
            Dismissible: the close button has a name and a tooltip.
          </Notice>
        ) : (
          <Button variant="ghost" onClick={() => setShown(true)}>
            Show the dismissible notice again
          </Button>
        )}
      </div>
    </Section>
  );
}

function VisuallyHiddenSection() {
  return (
    <Section
      title="VisuallyHidden"
      intro="Text for screen readers only. The nav link below reads as 'Bookings, coming soon'."
    >
      <Specimen label="In a name">
        <a
          href="#/__design"
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-fg hover:bg-surface-subtle"
        >
          Bookings
          <Badge tone="sun">Soon</Badge>
          <VisuallyHidden>, coming soon</VisuallyHidden>
        </a>
      </Specimen>
    </Section>
  );
}

function TooltipSection() {
  return (
    <Section
      title="Tooltip"
      intro="Short help on hover (after 400 ms) or focus (at once). Escape, blur or leaving closes it. It describes its trigger."
    >
      <Specimen label="Describing a button">
        <Tooltip content="Checks every 5 minutes">
          <Button variant="secondary">Check now</Button>
        </Tooltip>
        <Tooltip content="Opens in your browser" side="bottom">
          <Button variant="ghost" trailingIcon={<ExternalLink size={18} />}>
            ParkStay
          </Button>
        </Tooltip>
      </Specimen>
    </Section>
  );
}

function ToastSection() {
  const toast = useToast();
  return (
    <Section
      title="Toast"
      intro="Brief confirmations in the Notifications region. Success and info close after 5 s, warnings after 8 s, errors stay. At most three show; the rest queue. Hover or focus pauses a toast."
    >
      <Specimen label="Show one">
        <Button variant="secondary" onClick={() => toast.success('Watch saved')}>
          Success
        </Button>
        <Button variant="secondary" onClick={() => toast.info('Catalogue refreshed: 169 places')}>
          Info
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.warning('ParkStay is slow to respond today')}
        >
          Warning
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.error("ParkStay didn't respond. Try again in a minute.")}
        >
          Error
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.info('Watch deleted', {
              action: { label: 'Undo', onClick: () => toast.success('Watch restored') },
            })
          }
        >
          With an action
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            toast.error('First of four');
            toast.error('Second of four');
            toast.error('Third of four');
            toast.success('Fourth of four: queued until one closes');
          }}
        >
          Queue four
        </Button>
      </Specimen>
    </Section>
  );
}

function AnnounceSection() {
  const announce = useAnnounce();
  const [count, setCount] = useState(3);
  return (
    <Section
      title="useAnnounce"
      intro="Speaks a message through a hidden live region outside #root, so it still works while a dialog is open. Polite by default."
    >
      <Specimen label="Announce">
        <Button
          variant="secondary"
          onClick={() => {
            announce(`${count} results`);
            setCount((n) => (n === 3 ? 12 : 3));
          }}
        >
          Announce a result count
        </Button>
        <Button variant="ghost" onClick={() => announce('Hold expires in 1 minute', 'assertive')}>
          Announce assertively
        </Button>
      </Specimen>
    </Section>
  );
}

export function ComponentGallery() {
  return (
    <>
      <ButtonSection />
      <IconButtonSection />
      <FieldSection />
      <TextFieldSection />
      <TextareaSection />
      <SelectSection />
      <CheckboxSection />
      <RadioSection />
      <SwitchSection />
      <CardSection />
      <BadgeSection />
      <StatusPillSection />
      <SpinnerSection />
      <SkeletonSection />
      <EmptyStateSection />
      <PageHeaderSection />
      <NoticeSection />
      <VisuallyHiddenSection />
      <TooltipSection />
      <ToastSection />
      <AnnounceSection />
    </>
  );
}

export default ComponentGallery;
