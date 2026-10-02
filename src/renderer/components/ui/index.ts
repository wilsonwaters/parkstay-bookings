/**
 * WA Stay design-system primitives. Build every screen from these and the design tokens.
 * Usage notes and do/don't: docs/design/components.md.
 */

// Atoms (D1)
export {
  Brushstroke,
  type BrushstrokeProps,
  type BrushstrokeTone,
  type BrushstrokeVariant,
} from './Brushstroke';
export { PhotoPlaceholder, type PhotoPlaceholderProps } from './PhotoPlaceholder';
export { KIND_ICONS, kindIcon, type LocationKindName } from './kindIcons';

// Actions
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export { IconButton, type IconButtonProps } from './IconButton';

// Form
export { Field, type FieldProps } from './Field';
export { TextField, type TextFieldProps } from './TextField';
export { Textarea, type TextareaProps } from './Textarea';
export { Select, type SelectProps } from './Select';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { Radio, RadioGroup, type RadioGroupProps, type RadioProps } from './Radio';
export { Switch, type SwitchProps } from './Switch';

// Display
export { Card, type CardPadding, type CardProps } from './Card';
export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { StatusPill, type StatusPillProps } from './StatusPill';
export { statusPresets, type StatusPreset } from './statusPresets';
export { Spinner, type SpinnerProps, type SpinnerSize } from './Spinner';
export { Skeleton, type SkeletonProps } from './Skeleton';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { PageHeader, type PageHeaderProps } from './PageHeader';
export { Notice, type NoticeProps, type NoticeTone } from './Notice';
export { VisuallyHidden, type VisuallyHiddenProps } from './VisuallyHidden';

// Overlays
export { Tooltip, type TooltipProps } from './Tooltip';

// Feedback
export {
  ToastProvider,
  ToastViewport,
  useToast,
  type ToastAction,
  type ToastApi,
  type ToastOptions,
  type ToastTone,
} from './Toast';

// Hooks
export { AnnouncerProvider, useAnnounce, type Announce, type Politeness } from './useAnnounce';
export { usePosition, type UsePositionOptions } from './usePosition';
export {
  computePosition,
  type Align,
  type Position,
  type PositionInput,
  type Side,
} from './position';
