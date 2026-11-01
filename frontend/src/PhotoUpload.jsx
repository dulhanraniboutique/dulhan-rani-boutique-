import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { ImagePlus, Pencil, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Field } from "./shared.jsx";
import "react-easy-crop/react-easy-crop.css";

function createCroppedPhoto(source, area) {
  return fetch(source).then((response) => response.blob()).then((blob) => createImageBitmap(blob)).then((bitmap) => {
    const scale = Math.min(1, 1200 / area.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(area.width * scale);
    canvas.height = Math.round(area.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the image crop.");
    context.drawImage(bitmap, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.88);
  });
}

export default function PhotoUpload({ value = "", onChange }) {
  const [source, setSource] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const onCropComplete = useCallback((_area, pixels) => setArea(pixels), []);

  const pickPhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose an image smaller than 10 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSource(String(reader.result));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.onerror = () => setError("This image could not be opened.");
    reader.readAsDataURL(file);
  };

  const applyCrop = async () => {
    if (!source || !area) {
      setError("Adjust the crop before applying it.");
      return;
    }
    setProcessing(true);
    try {
      onChange(await createCroppedPhoto(source, area));
      setError("");
      setSource("");
    } catch (cropError) {
      console.error("Article photo crop failed", cropError);
      setError(cropError instanceof Error ? `Could not crop this image: ${cropError.message}` : "Could not crop this image. Please try another photo.");
    } finally {
      setProcessing(false);
    }
  };

  return <div className="article-photo-field">
    <Field label="Article photo" className="field-full">
      <button className={`photo-upload ${value ? "has-photo" : ""}`} type="button" onClick={() => document.getElementById("article-photo-input")?.click()}>
        {value ? <><img src={value} alt="Selected article preview" /><span><Pencil size={14} /> Change / crop photo</span></>
          : <><span className="upload-icon"><ImagePlus size={22} /></span><strong>Upload article photo</strong><small>Crop to landscape · JPG, PNG, WEBP</small><span className="upload-browse">Choose image</span></>}
      </button>
      <input id="article-photo-input" className="photo-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={pickPhoto} />
      {error && !source && <small className="photo-error" role="alert">{error}</small>}
    </Field>
    {source && <div className="crop-backdrop">
      <section className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title">
        <header className="crop-heading"><div><h3 id="crop-title">Crop article photo</h3><p>Move the photo and zoom to frame the outfit.</p></div>
          <button className="crop-close" type="button" aria-label="Cancel crop" onClick={() => { setSource(""); setError(""); }}>×</button></header>
        <div className="crop-stage"><Cropper image={source} crop={crop} zoom={zoom} aspect={4 / 3} minZoom={1} maxZoom={3} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} objectFit="contain" /></div>
        <div className="crop-controls"><ZoomOut size={15} /><input type="range" min="1" max="3" step="0.01" value={zoom} aria-label="Zoom photo" onChange={(event) => setZoom(Number(event.target.value))} /><ZoomIn size={15} /><button type="button" className="crop-reset" onClick={() => { setZoom(1); setCrop({ x: 0, y: 0 }); }}><RotateCcw size={13} />Reset</button></div>
        {error && <p className="photo-error" role="alert">{error}</p>}
        <div className="crop-actions"><button type="button" className="button button-outline" onClick={() => setSource("")}>Cancel</button><button type="button" className="button button-primary" disabled={processing} onClick={applyCrop}>{processing ? "Applying…" : "Use this crop"}</button></div>
      </section>
    </div>}
  </div>;
}
