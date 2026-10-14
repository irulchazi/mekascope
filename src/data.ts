export const stages = [
  { id: 'observe', number: '01', label: 'Observe', description: 'Capture the machine' },
  { id: 'understand', number: '02', label: 'Understand', description: 'Map its components' },
  { id: 'investigate', number: '03', label: 'Investigate', description: 'Follow the evidence' },
  { id: 'verify', number: '04', label: 'Verify', description: 'Test the leading cause' },
  { id: 'act', number: '05', label: 'Act', description: 'Approve maintenance' },
] as const

export type BikeStage = (typeof stages)[number]['id']
export type Stage = BikeStage | 'factory'

export const bike = {
  id: 'BL-001',
  name: 'Element FRC 50 CRD',
  category: 'Road bicycle',
  image: '/images/bicycle-drivetrain.jpg',
  component: 'Rear derailleur',
  model: 'Shimano 105 RD-R7100',
  confidence: 96,
  configuration: [
    ['Crankset', '105 FC-R7100'],
    ['Cassette', '11–34T'],
    ['Chain', 'CN-M7100'],
    ['Drivetrain', '12-speed'],
  ],
  compatibility: [
    { status: 'good', label: 'Compatible drivetrain' },
    { status: 'good', label: 'Cassette within derailleur capacity' },
    { status: 'warn', label: 'Chain wear measurement recommended' },
  ],
  service: [
    ['Last drivetrain service', '3,400 km ago'],
    ['Inspection interval', '~3,000–5,000 km'],
  ],
  symptom: 'I hear clicking whenever I use the fourth and fifth gears.',
  observations: [
    'Clicking is isolated to the middle cassette gears.',
    'No skipping was reported under load.',
    'Chain mileage is approximately 1,200 km.',
    'Rear derailleur was recently removed.',
  ],
  hypotheses: [
    { name: 'Derailleur indexing', probability: 73, primary: true },
    { name: 'Hanger alignment', probability: 18, primary: false },
    { name: 'Chain wear', probability: 6, primary: false },
    { name: 'Cassette damage', probability: 3, primary: false },
  ],
  diagnosis: 'Rear derailleur indexing misalignment',
  action: 'Adjust the barrel adjuster about ¼ turn clockwise.',
  verification: 'Shift repeatedly through gears 3–6.',
  expected: 'The clicking stops and the chain shifts cleanly.',
  taskId: '1048',
} as const

export const factory = {
  id: 'P-204',
  name: 'Centrifugal pump',
  location: 'Packaging line 04',
  image: '/images/industrial-pump.jpg',
  component: 'Motor bearing B',
  symptom: 'Abnormal vibration during operation',
  diagnosis: 'Bearing degradation',
  confidence: 91,
  severity: 'High',
  action: 'Inspect bearing B before the next production cycle.',
  inventory: '4 spare units available',
  duration: '45 min estimated intervention',
} as const
