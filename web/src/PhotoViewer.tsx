import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import type { Annotation } from './api'
import { AnnotationBoxes, PhotoComponents, useContainedPhoto } from './PhotoAnnotations'

export default function PhotoViewer({ src, annotations, selectedAnnotation, selectAnnotation, close }: { src: string; annotations: Annotation[]; selectedAnnotation: number | null; selectAnnotation: (index: number | null) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { frame, photo, bounds } = useContainedPhoto(src, annotations.length > 0)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  return <dialog ref={dialog} className="photo-viewer" aria-labelledby="photo-viewer-title" onClose={close}>
    <div className="photo-viewer-header"><h2 id="photo-viewer-title">Inspection photo</h2><div className="photo-viewer-controls">
      <button className="icon-button" aria-label="Zoom out" disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value - .5))}><Minus size={19} /></button>
      <span className="photo-viewer-scale" role="status" aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button className="icon-button" aria-label="Zoom in" disabled={zoom === 4} onClick={() => setZoom(value => Math.min(4, value + .5))}><Plus size={19} /></button>
      <button className="icon-button" aria-label="Close photo viewer" onClick={() => dialog.current?.close()}><X size={20} /></button>
    </div></div>
    <div className={`photo-viewer-body ${annotations.length ? 'has-components' : ''}`}>
      <div className="photo-viewer-viewport"><div ref={frame} className="photo-viewer-canvas" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}><img ref={photo} src={src} alt="Enlarged inspection photo" /><AnnotationBoxes annotations={annotations} selectedAnnotation={selectedAnnotation} bounds={bounds} /></div></div>
      {annotations.length > 0 && <PhotoComponents annotations={annotations} selectedAnnotation={selectedAnnotation} selectAnnotation={selectAnnotation} />}
    </div>
    <p className="photo-viewer-hint">Zoom in and scroll to inspect details. Press Escape to close.</p>
  </dialog>
}
