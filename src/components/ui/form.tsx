export const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
export const primaryButton =
  "rounded-md bg-neutral-900 px-4 py-2.5 text-sm text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300";
export const secondaryButton =
  "rounded-md border border-neutral-300 px-4 py-2.5 text-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50";

function FieldShell({ label, name, error, children }: { label: string; name: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Uncontrolled by default (defaultValue); pass value + onChange for a controlled input. */
export function Field({
  label,
  name,
  type = "text",
  error,
  defaultValue,
  value,
  onChange,
  autoComplete,
  maxLength,
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
  maxLength?: number;
  inputMode?: "numeric" | "text";
}) {
  const controlled = value !== undefined;
  return (
    <FieldShell label={label} name={name} error={error}>
      <input
        id={name}
        name={name}
        type={type}
        {...(controlled ? { value, onChange: (e) => onChange?.(e.target.value) } : { defaultValue })}
        autoComplete={autoComplete}
        maxLength={maxLength}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        className={inputClass}
      />
    </FieldShell>
  );
}

export function TextAreaField({ label, name, error, defaultValue, rows = 5, maxLength }: {
  label: string; name: string; error?: string; defaultValue?: string; rows?: number; maxLength?: number;
}) {
  return (
    <FieldShell label={label} name={name} error={error}>
      <textarea id={name} name={name} defaultValue={defaultValue} rows={rows} maxLength={maxLength} className={inputClass} />
    </FieldShell>
  );
}

export function SelectField({ label, name, error, defaultValue, options }: {
  label: string; name: string; error?: string; defaultValue?: string; options: { value: string; label: string }[];
}) {
  return (
    <FieldShell label={label} name={name} error={error}>
      <select id={name} name={name} defaultValue={defaultValue} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function FormMessage({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  const color = kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${color}`}>
      {children}
    </p>
  );
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
