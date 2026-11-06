// Uncontrolled form fields in the app's input style. No hooks, so Server
// Components can render them as children of ActionForm / RecordEditor.

export const inputClass =
  "w-full rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:text-zinc-100";
const labelClass = "flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400";

export function TextField({
  label,
  name,
  defaultValue,
  required,
  maxLength,
  placeholder,
  type = "text",
  mono,
  hint,
  autoFocus,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  type?: "text" | "email";
  mono?: boolean;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`${inputClass} ${mono ? "font-mono text-xs" : ""}`}
      />
      {hint && <span>{hint}</span>}
    </label>
  );
}

export function TextAreaField({
  label,
  name,
  defaultValue,
  required,
  maxLength,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <label className={labelClass}>
      {label}
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        maxLength={maxLength}
        rows={rows}
        className={inputClass}
      />
    </label>
  );
}

export function NumberField({
  label,
  name,
  defaultValue,
  min,
  max,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: number;
  min: number;
  max: number;
  hint?: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={1}
        required
        className={`${inputClass} w-32 tabular-nums`}
      />
      {hint && <span>{hint}</span>}
    </label>
  );
}

export function CheckboxField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
      />
      {label}
    </label>
  );
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
  emptyLabel,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  required?: boolean;
  /** When set, adds an empty first option (for optional links). */
  emptyLabel?: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className={`${inputClass} dark:bg-black`}
      >
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {required && emptyLabel === undefined && (
          <option value="" disabled>
            Choose…
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
