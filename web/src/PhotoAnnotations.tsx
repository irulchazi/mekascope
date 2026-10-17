import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Annotation } from './api'

export function useContainedPhoto(src: string, enabled: boolean) {
  const frame = useRef<HTMLDivElement>(null)
  const photo = useRef<HTMLImageElement>(null)
  const [bounds, setBounds] = useState<CSSProperties>()

  useEffect(() => {
    const container = frame.current
    const image = photo.current
    if (!enabled || !container || !image) return
    function measure() {
      if (!container || !image?.naturalWidth || !image.naturalHeight) return
      const scale = Math.min(container.clientWidth / image.naturalWidth, container.clientHeight / image.naturalHeight)
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      setBounds({ left: (container.clientWidth - width) / 2, top: (container.clientHeight - height) / 2, width, height, right: 'auto', bottom: 'auto' })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    image.addEventListener('load', measure)
    measure()
    return () => { observer.disconnect(); image.removeEventListener('load', measure) }
  }, [src, enabled])

  return { frame, photo, bounds: enabled ? bounds : undefined }
}

type SelectionProps = {
  annotations: Annotation[]
  selectedAnnotation: number | null
}

export function AnnotationBoxes({ annotations, selectedAnnotation, bounds }: SelectionProps & { bounds?: CSSProperties }) {
  return <div className="frame-annotations" aria-hidden="true" style={bounds}>{annotations.map((annotation, index) => <div key={`${annotation.label}-${index}`} className="detection-box" hidden={selectedAnnotation !== null && index !== selectedAnnotation} style={{ top: `${annotation.box[0] / 10}%`, left: `${annotation.box[1] / 10}%`, height: `${(annotation.box[2] - annotation.box[0]) / 10}%`, width: `${(annotation.box[3] - annotation.box[1]) / 10}%` }}><span>{index + 1}</span></div>)}</div>
}

export function PhotoComponents({ annotations, selectedAnnotation, selectAnnotation }: SelectionProps & { selectAnnotation: (index: number | null) => void }) {
  return <div className="photo-components"><div className="photo-components-heading"><strong>Detected components</strong><div className="photo-components-actions"><button type="button" className="photo-components-all" aria-pressed={selectedAnnotation === null} onClick={() => selectAnnotation(null)}>Show all</button></div></div><ol>{annotations.map((annotation, index) => <li key={`${annotation.label}-${index}`}><button type="button" aria-label={`Highlight ${annotation.label}`} aria-pressed={selectedAnnotation === null || index === selectedAnnotation} onClick={() => selectAnnotation(index)}><span className="photo-component-number" aria-hidden="true">{index + 1}</span><span>{annotation.label}</span></button></li>)}</ol></div>
}
