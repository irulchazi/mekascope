export const stages = [
  { id: 'observe', number: '01', label: 'Observe', description: 'Capture the machine' },
  { id: 'understand', number: '02', label: 'Understand', description: 'Map its components' },
  { id: 'investigate', number: '03', label: 'Investigate', description: 'Follow the evidence' },
  { id: 'verify', number: '04', label: 'Verify', description: 'Test the leading cause' },
  { id: 'act', number: '05', label: 'Act', description: 'Approve maintenance' },
] as const

export type BikeStage = (typeof stages)[number]['id']
export type Stage = BikeStage | 'factory'
