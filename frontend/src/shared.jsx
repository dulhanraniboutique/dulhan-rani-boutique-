export function Field({ label, children, className = "" }) {
  return <div className={`field ${className}`}><span>{label}</span>{children}</div>;
}
