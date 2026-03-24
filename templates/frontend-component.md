# Frontend Component

Common pattern for adding a new UI component or page to a frontend application.

## Keywords

component, page, view, UI, frontend, form, modal, dialog, dashboard, widget, React, Vue, Svelte, layout

## Typical Breakdown

| # | Item | Description | Suggested LOC |
|---|------|-------------|---------------|
| 1 | Data Layer | API client, hooks, or store module for data fetching/mutation | 100–200 |
| 2 | Core Component | The main component with props, state, and rendering logic | 150–300 |
| 3 | Subcomponents | Smaller reusable pieces extracted from the core component | 100–200 |
| 4 | Styling/Layout | CSS, responsive layout, theme integration | 50–150 |
| 5 | Tests | Unit tests for logic, component render tests, interaction tests | 100–250 |

## Dependencies

```
1 (Data Layer)
└── 2 (Core Component)
    ├── 3 (Subcomponents)
    └── 4 (Styling/Layout)
5 (Tests) depends on 1 + 2
```

**Batch 1:** Data Layer
**Batch 2:** Core Component
**Batch 3:** Subcomponents, Styling/Layout, Tests (parallel — different files)

## Guidance

- Data layer first so components can be built with real data shapes.
- Core component should be functional before extracting subcomponents.
- If the component needs backend changes (new endpoint, new field), decompose the backend separately using the API Endpoint template and make this depend on it.
- For forms, include validation logic in the data layer item, not the component item.
- If the component has complex state (multi-step wizard, drag-and-drop), add a dedicated state management item between Data Layer and Core Component.
