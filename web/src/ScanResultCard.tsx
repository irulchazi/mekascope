import { ArrowRight, Check, Info } from 'lucide-react'
import type { Annotation, Scan } from './api'

// General functions keep older scans useful without inventing photo observations.
const componentFunctions: [RegExp, string][] = [
  [/cable|housing/i, 'The cable and its housing transmit the shifter or brake control input to the mechanism.'],
  [/pulley|jockey/i, 'These small wheels guide the chain through the rear derailleur and help maintain chain tension.'],
  [/rear derailleur|\brd\b/i, 'Moves the chain between the rear sprockets and maintains chain tension as gears change.'],
  [/front derailleur|\bfd\b/i, 'Guides the chain between the front chainrings to change the front gear.'],
  [/cassette|freewheel|sprocket/i, 'The rear sprockets provide different gear ratios as the chain moves between them.'],
  [/crank/i, 'Connects the pedals to the front chainrings and transfers pedaling force to the chain.'],
  [/chainring/i, 'The front toothed rings engage the chain and transfer pedaling force into the drivetrain.'],
  [/chain/i, 'Transfers pedaling force from the front chainrings to the rear sprockets.'],
  [/brake|rotor|caliper/i, 'Part of the braking system that slows the bicycle by applying friction at the wheel.'],
  [/shifter|shift lever/i, 'Controls gear selection by operating the derailleurs.'],
  [/pedal/i, 'Provides the contact point for the rider’s foot and transfers force to the crank.'],
  [/bottom bracket/i, 'Supports the crank spindle with bearings so the crank can rotate in the frame.'],
  [/hub/i, 'The central part of the wheel supports its rotation around the axle.'],
  [/spoke/i, 'Connects the wheel rim to the hub and helps support the wheel under load.'],
  [/tire|tyre/i, 'Provides contact with the ground, traction, and cushioning around the wheel rim.'],
  [/wheel|rim/i, 'Supports the tire and carries the bicycle as it rolls.'],
  [/fork/i, 'Supports the front wheel and connects it to the steering system.'],
  [/frame|triangle|chainstay|seatstay/i, 'Forms the bicycle’s supporting structure and connects the main assemblies.'],
  [/handlebar|stem/i, 'Part of the steering assembly that supports the rider’s hand position and control.'],
  [/saddle|seatpost/i, 'Part of the seating assembly that supports the rider’s seated position.'],
]

export function describeComponent(annotation: Annotation) {
  return annotation.description?.trim() || componentFunctions.find(([pattern]) => pattern.test(annotation.label))?.[1]
    || 'Identified in the inspection photo. No further component detail was saved with this scan.'
}

export default function ScanResultCard({ scan, explore, restart }: { scan: Scan; explore: () => void; restart: () => void }) {
  const showComponents = scan.recognized && scan.annotations.length > 0
  return <section className="scan-result scan-result--detailed" aria-label={scan.recognized ? 'Components identified' : 'More input needed'}>
    <div className="scan-result-header">
      <div className="result-check">{scan.recognized ? <Check size={21} /> : <Info size={21} />}</div>
      <div className="scan-result-summary">
        <span className="section-kicker">{scan.recognized ? 'COMPONENTS IDENTIFIED' : 'MORE INPUT NEEDED'}</span>
        <h3>{showComponents ? `${scan.annotations.length} detected component${scan.annotations.length === 1 ? '' : 's'}` : scan.component || scan.equipment}</h3>
        <p>{scan.recognized && scan.component ? `Primary focus: ${scan.component} · ` : ''}{scan.model || 'Model unknown'} · {scan.confidence}% estimated match</p>
        <p>{scan.summary}</p>
      </div>
      {scan.recognized ? <button className="primary-button" onClick={explore}>Explore equipment <ArrowRight size={17} /></button> : <button className="secondary-button" onClick={restart}>Start with another photo</button>}
    </div>
    {showComponents && <ol className="identified-components" aria-label="Detected component descriptions">{scan.annotations.map((annotation, index) => <li key={`${annotation.label}-${index}`}>
      <span className="photo-component-number" aria-hidden="true">{index + 1}</span>
      <div><h4>{annotation.label}</h4><p>{describeComponent(annotation)}</p></div>
    </li>)}</ol>}
  </section>
}
