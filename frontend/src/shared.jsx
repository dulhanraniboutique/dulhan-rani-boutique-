import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function Field({ label, children, className = "" }) {
  return <div className={`field ${className}`}><span>{label}</span>{children}</div>;
}

const isoToDisplayDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

const displayToIsoDate = (value) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return "";
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return "";
  return `${year}-${month}-${day}`;
};

export function DateInput({ name, value = "", onChange, min, required = false, readOnly = false, ariaLabel }) {
  const [displayValue, setDisplayValue] = useState(() => isoToDisplayDate(value));
  const pickerRef = useRef(null);

  useEffect(() => {
    setDisplayValue(isoToDisplayDate(value));
  }, [value]);

  const updateDisplay = (nextValue) => {
    setDisplayValue(nextValue);
    const isoValue = displayToIsoDate(nextValue);
    if ((isoValue && (!min || isoValue >= min)) || !nextValue) onChange?.(isoValue);
  };
  const openPicker = () => {
    if (typeof pickerRef.current?.showPicker === "function") pickerRef.current.showPicker();
    else pickerRef.current?.click();
  };

  return <div className={`date-input${readOnly ? " date-input-readonly" : ""}`}>
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      placeholder="DD/MM/YYYY"
      aria-label={ariaLabel}
      autoComplete="off"
      pattern="\\d{2}/\\d{2}/\\d{4}"
      title="Enter date as DD/MM/YYYY"
      required={required}
      readOnly={readOnly}
      onClick={!readOnly ? openPicker : undefined}
      onChange={(event) => {
        const nextValue = event.target.value.replace(/[^\d/]/g, "").slice(0, 10);
        updateDisplay(nextValue);
        const isoValue = displayToIsoDate(nextValue);
        const invalidDate = nextValue && (!isoValue || (min && isoValue < min));
        event.target.setCustomValidity(invalidDate ? min && isoValue && isoValue < min ? "Date cannot be earlier than the minimum date." : "Enter a valid date as DD/MM/YYYY." : "");
      }}
      onBlur={(event) => {
        const isoValue = displayToIsoDate(displayValue);
        const invalidDate = displayValue && (!isoValue || (min && isoValue < min));
        event.target.setCustomValidity(invalidDate ? min && isoValue && isoValue < min ? "Date cannot be earlier than the minimum date." : "Enter a valid date as DD/MM/YYYY." : "");
      }}
    />
    {!readOnly && <>
      <button type="button" className="date-picker-button" aria-label="Choose date" onClick={openPicker}><CalendarDays size={18} /></button>
      <input
        ref={pickerRef}
        className="native-date-picker"
        type="date"
        lang="en-GB"
        value={value}
        min={min}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => updateDisplay(isoToDisplayDate(event.target.value))}
      />
    </>}
    {name && <input type="hidden" name={name} value={displayToIsoDate(displayValue)} />}
  </div>;
}
