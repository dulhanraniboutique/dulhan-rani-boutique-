import { useState } from "react";
import { ImagePlus, Pencil } from "lucide-react";
import { Field } from "./shared.jsx";

export default function PhotoUpload({ value = "", onChange }) {
  const [error, setError] = useState("");

  const pickPhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose an image smaller than 10 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError("This image could not be opened.");
        return;
      }
      onChange(reader.result);
    };
    reader.onerror = () => setError("This image could not be opened.");
    reader.readAsDataURL(file);
  };

  return <div className="article-photo-field">
    <Field label="Article photo" className="field-full">
      <button className={`photo-upload ${value ? "has-photo" : ""}`} type="button" onClick={() => document.getElementById("article-photo-input")?.click()}>
        {value ? <><img src={value} alt="Selected article preview" /><span><Pencil size={14} /> Change photo</span></>
          : <><span className="upload-icon"><ImagePlus size={22} /></span><strong>Upload article photo</strong><small>Original image is kept · all image formats</small><span className="upload-browse">Choose image</span></>}
      </button>
      <input id="article-photo-input" className="photo-file-input" type="file" accept="image/*" onChange={pickPhoto} />
      {error && <small className="photo-error" role="alert">{error}</small>}
    </Field>
  </div>;
}
