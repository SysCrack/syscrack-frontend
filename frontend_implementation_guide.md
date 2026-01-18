# Frontend Implementation Guide: Executable Whiteboard

## Overview

This guide provides detailed, phased implementation steps for building the Excalidraw-based frontend for the Syscrack Executable Whiteboard. Each phase includes specific AI prompts for development.

---

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.x | React framework with SSR |
| @excalidraw/excalidraw | Latest | Canvas library |
| Zustand | 4.x | State management |
| Tailwind CSS | 3.x | Styling |
| React Query | 5.x | API data fetching |
| Socket.io-client | 4.x | Real-time updates |
| TypeScript | 5.x | Type safety |

---

## Phase 1: Project Setup & Excalidraw Integration (Week 1-2)

### 1.1 Project Initialization

**AI Prompt:**
```
Create a new Next.js 14 project with TypeScript and Tailwind CSS for a systems design whiteboard application.

Requirements:
- Use App Router (not Pages Router)
- Configure TypeScript strict mode
- Set up Tailwind CSS with custom colors for system components
- Create folder structure:
  /app
    /design/[problemId]/page.tsx  (main design canvas)
    /problems/page.tsx            (problem list)
  /components
    /canvas      (Excalidraw wrapper, overlays)
    /palette     (component library)
    /inspector   (config panels)
    /simulation  (results display)
  /lib
    /api         (API client)
    /store       (Zustand stores)
    /types       (TypeScript interfaces)
  /hooks         (custom React hooks)

Install dependencies:
- @excalidraw/excalidraw
- zustand
- @tanstack/react-query
- socket.io-client
- uuid

Output: Working Next.js project with folder structure
```

### 1.2 Excalidraw Canvas Wrapper

**AI Prompt:**
```
Create an Excalidraw canvas wrapper component for the systems design tool.

File: /components/canvas/SystemDesignCanvas.tsx

Requirements:
- Embed @excalidraw/excalidraw as the main canvas
- Store excalidrawAPI ref for programmatic control
- Configure UIOptions to hide unnecessary tools:
  - Hide: loadScene, export, saveAsImage
  - Keep: selection, shapes, arrows, text
- Set initial appState:
  - viewBackgroundColor: "#f8f9fa"
  - currentItemRoughness: 1 (sketchy style)
  - gridMode: false
- Handle onChange to track element updates
- Handle onPointerUpdate to detect element selection
- Make canvas fill the viewport (100vh minus header)

The component should expose:
- getElements(): ExcalidrawElement[]
- updateScene(elements): void
- getSelectedElement(): ExcalidrawElement | null

Output: Working Excalidraw canvas that fills the screen
```

### 1.3 Type Definitions

**AI Prompt:**
```
Create TypeScript type definitions for the systems design application.

File: /lib/types/components.ts

Define these types:

1. ComponentType enum:
   - CLIENT, LOAD_BALANCER, APP_SERVER, WEB_SERVER
   - DATABASE, CACHE, MESSAGE_QUEUE, CDN, OBJECT_STORAGE

2. ComponentConfig interface (union type per component):
   - LoadBalancerConfig: algorithm, max_connections, health_check_interval_sec
   - DatabaseConfig: engine, instance_type, storage_gb, read_replicas, sharding
   - CacheConfig: memory_gb, eviction_policy, persistence, cluster_mode
   - AppServerConfig: instances, cpu_cores, memory_gb, stateless
   - MessageQueueConfig: partitions, replication_factor, retention_hours

3. SystemComponentElement (extends ExcalidrawElement):
   - customData.isSystemComponent: true
   - customData.componentType: ComponentType
   - customData.componentConfig: ComponentConfig

4. SystemConnectionElement (extends ExcalidrawElement):
   - customData.isSystemConnection: true
   - customData.protocol: "http" | "grpc" | "message_queue"
   - customData.throughput_qps: number

5. SystemDesign interface:
   - components: Component[]
   - connections: Connection[]

Output: Complete type definitions with JSDoc comments
```

---

## Phase 2: Component Palette & Drag-Drop (Week 2-3)

### 2.1 Component Palette UI

**AI Prompt:**
```
Create a floating component palette for dragging system components onto the canvas.

File: /components/palette/ComponentPalette.tsx

Requirements:
- Floating panel on left side of screen (absolute positioned)
- Semi-transparent background with blur effect
- Header: "Components"
- List of 8 draggable component buttons:
  | Type | Icon | Label | Color |
  |------|------|-------|-------|
  | client | 🌐 | Client | #868e96 |
  | load_balancer | ⚖️ | Load Balancer | #1971c2 |
  | app_server | 🖥️ | App Server | #7950f2 |
  | database | 💾 | Database | #2f9e44 |
  | cache | ⚡ | Cache | #f59f00 |
  | message_queue | 📮 | Message Queue | #e03131 |
  | cdn | 🌍 | CDN | #1098ad |
  | object_storage | 🗄️ | Object Storage | #5f3dc4 |

- Each button should:
  - Have colored left border matching component color
  - Be draggable (HTML5 drag and drop)
  - Set dataTransfer with componentType on dragStart
  - Show grab cursor

- Footer text: "Drag components onto the canvas"

Styling: Use Tailwind with glassmorphism effect (backdrop-blur-md)

Output: Beautiful floating palette with draggable components
```

### 2.2 Canvas Drop Handler

**AI Prompt:**
```
Implement drag-and-drop handling to add components to Excalidraw canvas.

File: /components/canvas/useCanvasDrop.ts (custom hook)

Requirements:
1. Handle drop events on the canvas container
2. Get componentType from dataTransfer
3. Convert screen coordinates to canvas coordinates using Excalidraw API
4. Create Excalidraw elements for the component:

For each component, create:
- Rectangle element (main shape):
  - width: 140, height: 90
  - strokeColor: component's color
  - backgroundColor: lighter version of color
  - strokeWidth: 2
  - roughness: 1 (hand-drawn)
  - customData: { isSystemComponent: true, componentType, componentConfig: defaults }

- Text element (label):
  - Centered in rectangle
  - Text: "{icon} {label}"
  - fontSize: 14
  - Bound to rectangle using containerId

5. Add elements to Excalidraw scene via updateScene API
6. Select the newly created component

Helper function needed:
- getDefaultConfig(componentType): ComponentConfig
- getLighterColor(hex): string (for background)

Output: Working drag-drop that creates styled components on canvas
```

### 2.3 Component Templates

**AI Prompt:**
```
Create component template definitions with visual styles and default configs.

File: /lib/templates/componentTemplates.ts

For each of the 8 component types, define:

1. Visual template:
   - shape: "rectangle" | "ellipse" | "diamond"
   - width, height
   - strokeColor, backgroundColor
   - icon (emoji)
   - label

2. Default configuration with sensible values:
   
   LoadBalancer:
   - algorithm: "round_robin"
   - max_connections: 10000
   - health_check_interval_sec: 30
   - estimated_cost: 50

   Database:
   - engine: "postgres"
   - instance_type: "db.m5.large"
   - storage_gb: 100
   - read_replicas: 0
   - sharding: false
   - estimated_cost: 500

   Cache:
   - memory_gb: 16
   - eviction_policy: "lru"
   - persistence: false
   - cluster_mode: false
   - estimated_cost: 200

   (similar for other 5 components)

3. Capacity specs (for display in inspector):
   - max_throughput_qps
   - base_latency_ms
   - cost_per_month

Export:
- COMPONENT_TEMPLATES: Record<ComponentType, Template>
- getDefaultConfig(type): ComponentConfig
- getComponentMeta(type): { icon, label, color, capacity }

Output: Complete template system for all 8 components
```

---

## Phase 3: Component Inspector (Week 3-4)

### 3.1 Inspector Panel UI

**AI Prompt:**
```
Create a component inspector panel that appears when a component is selected.

File: /components/inspector/ComponentInspector.tsx

Requirements:
- Floating panel on right side of screen
- Only visible when a system component is selected
- Header with:
  - Component icon + type label
  - Close button (X)

- Dynamic form based on componentType (use switch/case or dynamic component)
- Form fields should match ComponentConfig types:
  
  For Database:
  - Engine: dropdown (postgres, mysql, mongodb)
  - Instance Type: dropdown with descriptions
  - Storage (GB): number input
  - Read Replicas: number input (0-10)
  - Sharding: checkbox
  
  For LoadBalancer:
  - Algorithm: radio buttons (round_robin, least_connections, ip_hash)
  - Max Connections: number input
  - Health Check Interval: number input (seconds)

  (Create sub-components for each type)

- Footer:
  - Estimated Cost display (calculated from config)
  - Save button (primary)
  - Cancel button (secondary)

- On Save: update element's customData.componentConfig

Styling: Tailwind with white background, shadow-xl, rounded corners

Output: Working inspector that shows config for selected component
```

### 3.2 Form Field Components

**AI Prompt:**
```
Create reusable form field components for the inspector panel.

Files:
- /components/inspector/fields/SelectField.tsx
- /components/inspector/fields/NumberField.tsx
- /components/inspector/fields/CheckboxField.tsx
- /components/inspector/fields/RadioField.tsx

Each component should:
- Accept: label, value, onChange, options (where applicable)
- Accept: helpText (optional description)
- Accept: error (optional validation message)
- Use consistent Tailwind styling
- Be accessible (proper labels, aria attributes)

SelectField:
- Full-width dropdown
- Support for option descriptions

NumberField:
- Number input with min/max validation
- Optional unit suffix (e.g., "GB", "ms")

CheckboxField:
- Styled checkbox with label on right
- Support for description text below

RadioField:
- Vertical stack of radio options
- Each option can have name + description

Output: Polished form components matching modern UI standards
```

### 3.3 Cost Calculator

**AI Prompt:**
```
Create a cost calculation utility for component configurations.

File: /lib/utils/costCalculator.ts

Implement calculateComponentCost(type, config) that returns monthly cost in USD.

Cost formulas:

LoadBalancer:
  base: $50/month

Database:
  base: varies by instance_type
    - db.t3.medium: $100
    - db.m5.large: $500
    - db.m5.xlarge: $1000
  + storage: $0.10 per GB
  + replicas: $200 each

Cache:
  base: $12.50 per GB of memory
  + cluster_mode: +50%

AppServer:
  base: $80 per instance
  * cpu_cores multiplier (1x for 2 cores, 1.5x for 4, 2x for 8)

MessageQueue:
  base: $300
  + partitions: $10 each beyond 3

CDN:
  base: $0 (usage-based, show "~$0.08/GB")

ObjectStorage:
  base: $0 (usage-based, show "~$0.023/GB")

Also implement:
- calculateTotalDesignCost(components[]): calculates sum
- formatCost(amount): formats as "$X,XXX/month"

Output: Cost calculator with all component formulas
```

---

## Phase 4: Connection Handling (Week 4-5)

### 4.1 Connection Detection

**AI Prompt:**
```
Detect when arrows are drawn between system components and prompt for configuration.

File: /hooks/useConnectionDetection.ts

Requirements:
1. Listen to Excalidraw onChange events
2. Detect newly created arrow elements
3. Check if arrow connects two system components:
   - arrow.startBinding.elementId → must be a SystemComponent
   - arrow.endBinding.elementId → must be a SystemComponent

4. When valid connection detected:
   - Open ConnectionConfigModal
   - Pass source and target component info
   - On save: add customData to arrow element:
     {
       isSystemConnection: true,
       protocol: selected_protocol,
       throughput_qps: entered_value,
       data_contract: { request: "...", response: "..." }
     }

5. Style the arrow based on protocol:
   - HTTP: solid line, blue
   - gRPC: dashed line, purple
   - Message Queue: dotted line, red

Output: Hook that detects and enhances connections
```

### 4.2 Connection Config Modal

**AI Prompt:**
```
Create a modal for configuring connections between components.

File: /components/inspector/ConnectionConfigModal.tsx

Requirements:
- Modal overlay with centered dialog
- Header: "Configure Connection"
- Show: Source → Target (with icons and names)

Form fields:
1. Protocol: radio buttons
   - HTTP/REST (default)
   - gRPC
   - Message Queue (async)

2. Expected Throughput: number input with "QPS" suffix
   - Default: 1000
   - Helper text: "Queries per second this connection handles"

3. Data Contract (collapsible/optional):
   - Request Format: textarea (JSON schema or description)
   - Response Format: textarea

Footer:
- Cancel button
- Save button

On Save:
- Update arrow element's customData
- Close modal
- Update arrow styling based on protocol

Output: Working modal for connection configuration
```

---

## Phase 5: Scene Parser & API Integration (Week 5-6)

### 5.1 Scene Parser

**AI Prompt:**
```
Create a parser that converts Excalidraw scene to SystemDesign object for API.

File: /lib/parser/sceneParser.ts

Implement parseExcalidrawScene(elements: ExcalidrawElement[]): SystemDesign

Requirements:
1. Filter elements where customData.isSystemComponent === true
2. Extract component data:
   - id: element.id
   - type: customData.componentType
   - name: extract from bound text element
   - config: customData.componentConfig
   - position: { x: element.x, y: element.y }

3. Filter arrows where customData.isSystemConnection === true
4. Extract connection data:
   - id: element.id
   - source_id: startBinding.elementId
   - target_id: endBinding.elementId
   - protocol: customData.protocol
   - throughput_qps: customData.throughput_qps
   - data_contract: customData.data_contract

5. Validation:
   - Check all components are connected (no orphans)
   - Find entry point (node with no incoming edges)
   - Return warnings array for issues

Return: { components, connections, warnings, entryPoint }

Output: Parser that extracts clean data from visual scene
```

### 5.2 API Client

**AI Prompt:**
```
Create an API client for communicating with the backend.

File: /lib/api/designApi.ts

Implement these functions using fetch:

1. saveDesign(problemId, canvasData):
   POST /api/designs
   Body: { problem_id, canvas_data }
   Returns: { id, created_at }

2. updateDesign(designId, canvasData):
   PUT /api/designs/{id}
   Body: { canvas_data }

3. getDesign(designId):
   GET /api/designs/{id}
   Returns: { id, problem_id, canvas_data, created_at }

4. validateDesign(designId):
   POST /api/designs/{id}/validate
   Returns: { valid, errors[], warnings[] }

5. runSimulation(designId, scenarios):
   POST /api/designs/{id}/simulate
   Body: { scenarios: ["normal_load", "peak_load", "db_failure"] }
   Returns: { job_id, status, estimated_time_sec }

6. getSimulationResults(jobId):
   GET /api/simulations/{job_id}
   Returns: { status, results[], total_score }

Use React Query for caching where appropriate.
Handle errors with proper error types.

Output: Complete API client with TypeScript types
```

### 5.3 Zustand Store

**AI Prompt:**
```
Create Zustand stores for managing application state.

Files:
- /lib/store/designStore.ts
- /lib/store/simulationStore.ts

designStore:
- currentDesignId: number | null
- elements: ExcalidrawElement[]
- selectedElementId: string | null
- isDirty: boolean (unsaved changes)
- actions:
  - setElements(elements)
  - selectElement(id)
  - updateElementConfig(id, config)
  - markSaved()

simulationStore:
- isRunning: boolean
- currentJobId: string | null
- progress: number (0-100)
- results: SimulationResult[] | null
- error: string | null
- actions:
  - startSimulation(jobId)
  - updateProgress(progress)
  - setResults(results)
  - setError(error)
  - reset()

Use immer middleware for easier state updates.
Persist designStore to localStorage for auto-save.

Output: Zustand stores with TypeScript types
```

---

## Phase 6: Simulation UI (Week 6-7)

### 6.1 Run Simulation Button

**AI Prompt:**
```
Create the "Run Simulation" button with validation and loading states.

File: /components/simulation/RunSimulationButton.tsx

Requirements:
- Fixed position button (top-right of canvas)
- Primary blue styling with icon (▶ or play icon)
- States:
  - Default: "Run Simulation"
  - Validating: "Validating..." with spinner
  - Running: "Simulating..." with progress indicator
  - Disabled: when design is empty or invalid

On click flow:
1. Parse current scene
2. Check for validation errors locally:
   - No components → error
   - No connections → warning
   - No entry point → error
3. Save design to backend
4. Call validateDesign API
5. If valid, call runSimulation API
6. Open results panel
7. Poll for results or use WebSocket

Show toast notifications for:
- Validation errors
- Simulation started
- Simulation complete

Output: Polished button with full simulation flow
```

### 6.2 Results Panel

**AI Prompt:**
```
Create a slide-up results panel that shows simulation results.

File: /components/simulation/ResultsPanel.tsx

Requirements:
- Slides up from bottom of screen (like a drawer)
- Can be collapsed/expanded
- Header:
  - "Simulation Results"
  - Total Score badge (color-coded: green ≥75, yellow ≥60, red <60)
  - Close button

Content - show for each scenario:
1. Scenario name + status icon (✅ passed, ⚠️ partial, ❌ failed)
2. Score: X/Y points
3. Metrics table:
   - Throughput: X QPS (Y% of requirement)
   - P99 Latency: Xms (target: <Yms)
   - Error Rate: X%
   - Estimated Cost: $X/month

4. Feedback list:
   - ✓ positive feedback (green)
   - ⚠ warnings (yellow)
   - ✗ failures (red)
   - 💡 suggestions (blue)

5. Bottleneck visualization:
   - Highlight overloaded components on canvas
   - Show which component is the bottleneck

Footer:
- "Try Again" button
- "View Optimal Solution" button (premium)
- "Next Problem" button

Output: Beautiful results panel with all metrics
```

### 6.3 WebSocket Integration

**AI Prompt:**
```
Implement WebSocket connection for real-time simulation updates.

File: /lib/api/simulationSocket.ts

Requirements:
1. Connect to WebSocket endpoint: ws://api/simulations/{jobId}/stream
2. Handle events:
   - "progress": { percent, current_scenario }
   - "scenario_complete": { scenario, result }
   - "complete": { results, total_score }
   - "error": { message }

3. Update simulationStore on each event
4. Reconnect logic with exponential backoff
5. Cleanup on component unmount

Create hook: useSimulationStream(jobId)
- Returns: { progress, isConnected, latestEvent }
- Auto-connects when jobId provided
- Auto-disconnects on cleanup

Fallback: If WebSocket fails, fall back to polling GET /simulations/{jobId}

Output: Real-time updates during simulation
```

---

## Phase 7: Estimation Mode (Week 7-8)

### 7.1 Estimation Modal

**AI Prompt:**
```
Create the estimation mode modal that appears before simulation.

File: /components/simulation/EstimationModal.tsx

Requirements:
- Modal appears after clicking "Run Simulation"
- Header: "Estimate Your System's Performance"
- Subtext: "Before we simulate, make your predictions"

Form fields:
1. Max Throughput (QPS)
   - Number input
   - Helper: "How many requests per second can your design handle?"

2. Expected P99 Latency (ms)
   - Number input
   - Helper: "What's the worst-case response time for 99% of requests?"

3. Estimated Monthly Cost ($)
   - Number input
   - Helper: "Total infrastructure cost per month"

Footer:
- "Skip Estimation" link (gray, smaller)
- "Submit & Simulate" button (primary)

Store estimates in simulationStore for comparison later.

Output: Clean modal for collecting user estimates
```

### 7.2 Estimation Comparison

**AI Prompt:**
```
Update the results panel to show estimation vs actual comparison.

File: Update /components/simulation/ResultsPanel.tsx

Add new section: "Your Estimates vs Actual Results"

For each metric, show:
- Your estimate: X
- Actual result: Y
- Accuracy indicator:
  - Within 10%: ✓ "Great estimate!" (green)
  - Within 25%: "Close!" (yellow)
  - Over 25% off: ⚠️ "X% overestimate/underestimate" (orange)

Visual comparison bar:
- Show estimate and actual as overlapping bars
- Color-code accuracy

Overall estimation score:
- Calculate average accuracy across 3 metrics
- Show: "Estimation Accuracy: X%" 
- Bonus points earned (if applicable)

Output: Side-by-side comparison of estimates vs reality
```

---

## Phase 8: Polish & Optimization (Week 8)

### 8.1 Keyboard Shortcuts

**AI Prompt:**
```
Implement keyboard shortcuts for common actions.

File: /hooks/useKeyboardShortcuts.ts

Shortcuts:
- Cmd/Ctrl + S: Save design
- Cmd/Ctrl + Enter: Run simulation
- Escape: Close inspector/modal
- Delete/Backspace: Delete selected component
- Cmd/Ctrl + Z: Undo (Excalidraw handles this)
- Cmd/Ctrl + Shift + Z: Redo

Show keyboard shortcut hints in tooltips.
Create a help modal showing all shortcuts (? key).

Output: Keyboard shortcuts for power users
```

### 8.2 Auto-Save

**AI Prompt:**
```
Implement auto-save functionality with debouncing.

File: /hooks/useAutoSave.ts

Requirements:
- Debounce saves by 2 seconds after last change
- Save to localStorage immediately (for recovery)
- Save to backend every 30 seconds if dirty
- Show save indicator in header:
  - "All changes saved" (gray)
  - "Saving..." (with spinner)
  - "Unsaved changes" (yellow dot)

Handle:
- Beforeunload warning if unsaved
- Recovery prompt on load if localStorage has newer data

Output: Reliable auto-save with visual feedback
```

### 8.3 Mobile Responsive

**AI Prompt:**
```
Make the design canvas mobile-responsive (tablet support).

Requirements:
- Breakpoints: desktop (>1024px), tablet (768-1024px), mobile (<768px)

Tablet:
- Collapse component palette to icon-only sidebar
- Inspector panel becomes bottom sheet
- Touch-friendly drag handles

Mobile (view-only):
- Hide palette entirely
- Show simplified read-only view
- "Open on desktop to edit" message

Test on iPad specifically (primary tablet target).

Output: Responsive layout for tablet users
```

---

## Testing Prompts

### Unit Tests

**AI Prompt:**
```
Create unit tests for the scene parser and cost calculator.

Files:
- /lib/parser/__tests__/sceneParser.test.ts
- /lib/utils/__tests__/costCalculator.test.ts

Test cases for sceneParser:
- Empty scene returns empty arrays
- Filters only system components
- Extracts correct component data
- Detects connections between components
- Identifies orphaned components
- Finds entry point correctly

Test cases for costCalculator:
- Each component type returns correct base cost
- Database replicas add correct cost
- Cache cluster mode multiplier works
- Total design cost sums all components

Use Jest and Testing Library.

Output: Comprehensive unit tests
```

### E2E Tests

**AI Prompt:**
```
Create Playwright E2E tests for the main user flows.

File: /e2e/design-flow.spec.ts

Test flows:
1. Create new design:
   - Navigate to problem page
   - Drag 3 components onto canvas
   - Connect them with arrows
   - Configure one component
   - Save design

2. Run simulation:
   - Load existing design
   - Enter estimates
   - Run simulation
   - Wait for results
   - Verify score displayed

3. Error handling:
   - Try to simulate with no components
   - Verify error message shown

Output: E2E tests covering critical paths
```

---

## File Checklist

| File | Phase | Status |
|------|-------|--------|
| /app/design/[problemId]/page.tsx | 1 | [ ] |
| /components/canvas/SystemDesignCanvas.tsx | 1 | [ ] |
| /lib/types/components.ts | 1 | [ ] |
| /components/palette/ComponentPalette.tsx | 2 | [ ] |
| /hooks/useCanvasDrop.ts | 2 | [ ] |
| /lib/templates/componentTemplates.ts | 2 | [ ] |
| /components/inspector/ComponentInspector.tsx | 3 | [ ] |
| /components/inspector/fields/*.tsx | 3 | [ ] |
| /lib/utils/costCalculator.ts | 3 | [ ] |
| /hooks/useConnectionDetection.ts | 4 | [ ] |
| /components/inspector/ConnectionConfigModal.tsx | 4 | [ ] |
| /lib/parser/sceneParser.ts | 5 | [ ] |
| /lib/api/designApi.ts | 5 | [ ] |
| /lib/store/designStore.ts | 5 | [ ] |
| /components/simulation/RunSimulationButton.tsx | 6 | [ ] |
| /components/simulation/ResultsPanel.tsx | 6 | [ ] |
| /lib/api/simulationSocket.ts | 6 | [ ] |
| /components/simulation/EstimationModal.tsx | 7 | [ ] |
| /hooks/useKeyboardShortcuts.ts | 8 | [ ] |
| /hooks/useAutoSave.ts | 8 | [ ] |
