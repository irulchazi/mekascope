# MekaScope

An interactive equipment diagnosis workflow. The bicycle drivetrain case runs from a prepared scan through evidence review, guided verification, and a simulated service task. A pump preview shows how the same workflow could apply in manufacturing.

## Run locally

```bash
npm install --registry=https://registry.npmjs.org
npm run dev
```

## Verify

```bash
npm run typecheck
npm run build
```

All equipment data and analysis results are prepared local fixtures. Scan, investigation, approval, and task creation are simulated in the browser; there is no camera access, AI call, backend, or external service. The two equipment photographs were generated for this prototype and bundled under `public/images/`.
