export const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-4 focus:ring-black/10";
export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function FieldShell({ label, name, error, children }: { label: string; name: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
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
  const color = kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-800";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-xl border px-3.5 py-2.5 text-sm ${color}`}>
      {children}
    </p>
  );
}

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
