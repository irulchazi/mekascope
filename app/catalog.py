"""Prepared input context only: live diagnosis never reads prepared results."""

from app.config import ROOT

SAMPLE_IMAGE = ROOT / "web/public/images/bicycle-drivetrain.jpg"
SAMPLE_SYMPTOM = "I hear clicking whenever I use the fourth and fifth gears."
SAMPLE_CONTEXT = {
    "source": "sample",
    "asset_id": "BL-001",
    "name": "Element FRC 50 CRD",
    "configuration": "Road bicycle; 12-speed drivetrain; Shimano 105 RD-R7100 rear derailleur; 105 FC-R7100 crankset; 11–34T cassette; CN-M7100 chain.",
    "service": "Prepared history: last drivetrain service 3,400 km ago; chain mileage approximately 1,200 km; rear derailleur recently removed.",
}
CATALOG = {
    "bicycle": {
        "id": "BL-001",
        "image": "/images/bicycle-drivetrain.jpg",
        "symptom": SAMPLE_SYMPTOM,
        "context": SAMPLE_CONTEXT,
    },
    "pump": {
        "id": "P-204",
        "name": "Centrifugal pump",
        "location": "Packaging line 04",
        "image": "/images/industrial-pump.jpg",
        "component": "Motor bearing B",
        "symptom": "Abnormal vibration during operation",
        "diagnosis": "Bearing degradation",
        "confidence": 91,
        "severity": "High",
        "action": "Inspect bearing B before the next production cycle.",
        "inventory": "4 spare units available",
        "duration": "45 min estimated intervention",
    },
}
