import { useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";

export default function AccessScreen({ adminProfile, adminPin, salespeople, authError, onAdminSetup, onSignIn }) {
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [name, setName] = useState(adminProfile.name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const choose = (next) => {
    setSelected(next);
    setPin("");
    setConfirmPin("");
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!selected) return;
    if (selected.role === "admin" && !adminPin) {
      if (!/^\d{4,6}$/.test(pin)) {
        setError("Create an administrator PIN with 4 to 6 digits.");
        return;
      }
      if (pin !== confirmPin) {
        setError("The PIN entries do not match.");
        return;
      }
      setBusy(true);
      try {
        await onAdminSetup({ name: name.trim(), pin, setupToken });
      } catch (setupError) {
        setError(setupError.message || "Could not set up the administrator. Please try again.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!/^\d{4,6}$/.test(pin)) {
      setError("Enter your 4 to 6 digit PIN.");
      return;
    }
    setBusy(true);
    try {
      const success = await onSignIn(selected, pin);
      if (!success) setError("That PIN is incorrect. Please try again.");
    } catch (signInError) {
      setError(signInError.message || "Could not verify the PIN. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const pinForm = selected?.role === "admin" && !adminPin;

  return <main className="access-page">
    <div className="access-glow access-glow-one" /><div className="access-glow access-glow-two" />
    <div className="access-card">
      <header className="access-brand">
        <div className="access-logo"><span>DR</span><i>✦</i></div>
        <div><strong>Dulhan Rani</strong><span>BOUTIQUE MANAGEMENT</span></div>
      </header>

      {selected ? <>
        <button className="access-back" type="button" onClick={() => choose(null)}><ArrowLeft size={15} />Back to profiles</button>
        <div className="access-title"><span className="access-title-icon">{selected.role === "admin" ? <ShieldCheck size={19} /> : <UserRound size={19} />}</span>
          <div><h1>{pinForm ? "Set up administrator" : `Welcome, ${selected.profile.name.split(" ")[0]}`}</h1>
            <p>{pinForm ? "Create a PIN to protect the administrator profile." : `Enter ${selected.profile.name}'s PIN to continue.`}</p></div></div>
        <form className="pin-form" onSubmit={submit}>
          {pinForm && <>
            <label className="access-field"><span>Administrator name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required /></label>
            <label className="access-field"><span>Initial setup token</span><input type="password" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} autoComplete="off" required /></label>
          </>}
          <label className="access-field"><span>{pinForm ? "Create PIN" : "Your PIN"}</span><input autoFocus type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="● ● ● ●" autoComplete="new-password" required /></label>
          {pinForm && <label className="access-field"><span>Confirm PIN</span><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="● ● ● ●" autoComplete="new-password" required /></label>}
          {error && <p className="access-error" role="alert">{error}</p>}
          {pinForm && <p className="access-security-note"><LockKeyhole size={14} />The PIN is verified and stored securely by the backend.</p>}
          <button className="access-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : pinForm ? "Create admin profile" : "Unlock workspace"}<ArrowRight size={16} /></button>
        </form>
      </> : <>
        <div className="access-title access-title-main"><span className="access-title-icon"><LockKeyhole size={19} /></span>
          <div><h1>Who’s using the system?</h1><p>Choose your profile to sign in to the boutique workspace.</p></div></div>
        {authError && <p className="access-error" role="alert">{authError}</p>}
        <button className="login-profile admin-login-card" onClick={() => choose({ role: "admin", id: "admin", profile: adminProfile })}>
          <span className="login-avatar login-admin"><ShieldCheck size={20} /></span><span className="login-profile-copy"><strong>Administrator</strong><small>{adminPin ? adminProfile.name : "Set up the admin profile"}</small></span><span className="login-lock"><LockKeyhole size={15} />{adminPin ? "PIN" : "Setup"}<ArrowRight size={14} /></span>
        </button>
        <div className="sales-login-heading"><span>SALESPERSON PROFILES</span><span>{salespeople.filter((user) => user.active !== false).length} / 10</span></div>
        <div className="sales-login-grid">{Array.from({ length: 10 }, (_, index) => {
          const user = salespeople.filter((item) => item.active !== false)[index];
          return user ? <button className="login-profile sales-login-card" key={user.id} onClick={() => choose({ role: "sales", id: user.id, profile: user, pinRecord: user.pin })}>
            <span className="login-avatar login-sales"><UserRound size={18} /></span><span className="login-profile-copy"><strong>{user.name}</strong><small>{user.title || "Salesperson"}</small></span><LockKeyhole className="sales-lock" size={14} />
          </button> : <div className="login-profile sales-login-card empty-login-card" key={`empty-${index}`}><span className="login-avatar login-empty"><UserRound size={17} /></span><span className="login-profile-copy"><strong>Profile {index + 1}</strong><small>Ask admin to create</small></span></div>;
        })}</div>
        <p className="access-footer"><LockKeyhole size={12} /> Each team member has their own PIN-protected profile.</p>
      </>}
    </div>
  </main>;
}
