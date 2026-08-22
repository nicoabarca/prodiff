# Graph Report - kiara-local  (2026-08-22)

## Corpus Check
- 386 files · ~86,925 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1410 nodes · 3053 edges · 92 communities (63 shown, 29 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 126 edges (avg confidence: 0.85)
- Token cost: 172,961 input · 0 output

## Community Hubs (Navigation)
- Column Mapping Vocabulary
- Distribution Binning Engine
- Upload Wizard Screens
- Attribute Filter Engine
- Directed Tree Builder
- shadcn-svelte Skill Docs
- Event Log Import Commands
- Endpoint And Follower Filters
- Distribution Charts
- Filter Kind Vocabulary
- Calendar And Date Picker
- Slice State And Chains
- Architecture Conventions
- Package Dependencies
- Tree Node Visuals
- Event Log Settings UI
- Distributions Panel State
- Filter Editor Controls
- Tree State And Variants
- SQLite Schema And Invokers
- Sidebar Context And Constants
- Tree Canvas And Detail Panel
- Event Log Statistics
- Timeframe And Case Load
- Tauri Bundle Config
- Chart Container Primitives
- Project Records And Cards
- TypeScript Config
- Summary Comparison View
- shadcn Components Config
- Tauri Capability Permissions
- Sheet Overlay
- App Icons And Branding
- Virtual List
- Dev Dependencies
- Release Pipeline Workflows
- Database Client Bootstrap
- SvelteKit Config
- clsx Dependency
- Inter Font Dependency
- Internationalized Date Dependency
- jsdom Dependency
- Lucide Icons Dependency
- LayerChart Dependency
- Prettier Dependency
- Prettier Svelte Plugin
- Prettier Tailwind Plugin
- shadcn-svelte Dependency
- Svelte Dependency
- svelte-check Dependency
- Adapter Static Dependency
- SvelteKit Dependency
- Vite Plugin Svelte Dependency
- tailwind-merge Dependency
- tailwind-variants Dependency
- Tailwind Vite Plugin
- Tauri CLI Dependency
- jest-dom Dependency
- d3-scale Types Dependency
- TypeScript Dependency
- Vite Dependency
- Vitest Dependency
- Compare Route

## God Nodes (most connected - your core abstractions)
1. `ColumnMapping` - 35 edges
2. `summarize()` - 19 edges
3. `build()` - 18 edges
4. `Project` - 18 edges
5. `Filter` - 17 edges
6. `create_event_log()` - 15 edges
7. `distributions()` - 15 edges
8. `read_group()` - 15 edges
9. `case_level_blocks()` - 15 edges
10. `log()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `node_distributions Command` --semantically_similar_to--> `Slice Two Measurement Caches`  [INFERRED] [semantically similar]
  docs/adr/0003-query-distributions-on-demand.md → CLAUDE.md
- `shadcn-svelte Brand Mark` --semantically_similar_to--> `Svelte Logo SVG`  [INFERRED] [semantically similar]
  .agents/skills/shadcn-svelte/assets/shadcn-svelte.png → static/svelte.svg
- `Kiara Desktop App Icon` --conceptually_related_to--> `Tauri Logo SVG`  [INFERRED]
  src-tauri/icons/icon.png → static/tauri.svg
- `delta` --calls--> `format`  [INFERRED]
  src/lib/tree/components/summary-compare.svelte → package.json
- `Domain-Oriented Frontend Architecture` --cites--> `ADR 0004: Domain-Oriented Frontend Architecture`  [EXTRACTED]
  CLAUDE.md → docs/adr/0004-domain-oriented-frontend-architecture.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **shadcn-svelte Critical Rule Set** — _agents_skills_shadcn_svelte_rules_styling_styling_rules, _agents_skills_shadcn_svelte_rules_forms_forms_rules, _agents_skills_shadcn_svelte_rules_composition_composition_rules, _agents_skills_shadcn_svelte_rules_icons_icons_rules, _agents_skills_shadcn_svelte_skill_shadcn_svelte_skill [EXTRACTED 1.00]
- **CSS Variable to Component Theming Pipeline** — _agents_skills_shadcn_svelte_customization_css_variable_token_system, _agents_skills_shadcn_svelte_customization_oklch_colors, _agents_skills_shadcn_svelte_customization_dark_mode, _agents_skills_shadcn_svelte_rules_styling_semantic_colors, _agents_skills_shadcn_svelte_customization_custom_colors [EXTRACTED 1.00]
- **Tauri Version Bump to Multi-Platform Release Pipeline** — _github_workflows_release_bump_and_tag, _github_workflows_release_version_sync, _github_workflows_release_stable_branch, _github_workflows_release_draft_release, _github_workflows_build_release_published_trigger, _github_workflows_build_build_tauri, _github_workflows_build_tauri_action [INFERRED 0.95]
- **Filtering and Comparison Vocabulary** — context_filter, context_slice, context_base, context_population, claude_two_measurement_caches [EXTRACTED 1.00]
- **Project Creation and Persistence Flow** — context_project_draft, context_column_mapping, context_event_log, context_project, docs_adr_0002_persist_parsed_parquet_keep_raw_original_decision [EXTRACTED 1.00]
- **Domain Architecture Conventions and Exceptions** — docs_adr_0004_domain_oriented_frontend_architecture_decision, claude_one_way_dependency_rule, claude_invoker_pattern, claude_no_barrel_files, docs_adr_0004_domain_oriented_frontend_architecture_schema_exception, docs_adr_0004_domain_oriented_frontend_architecture_statistics_exception, docs_adr_0004_domain_oriented_frontend_architecture_event_log_one_domain [EXTRACTED 1.00]
- **Tauri Bundle Icon Family (One Mark, Many Platform Sizes)** — src_tauri_icons_icon, src_tauri_icons_128x128, src_tauri_icons_32x32, src_tauri_icons_square150x150logo, src_tauri_icons_storelogo [INFERRED 0.95]
- **Scaffold Stack Logo Trio Served From static/** — static_svelte, static_tauri, static_vite, static_favicon [INFERRED 0.85]

## Communities (92 total, 29 thin omitted)

### Community 0 - "Column Mapping Vocabulary"
Cohesion: 0.08
Nodes (64): Column, Scope, ColumnGranularity, ColumnMapping, ColumnRole, ColumnType, find_role(), require_role() (+56 more)

### Community 1 - "Distribution Binning Engine"
Cohesion: 0.07
Nodes (59): HashSet, Range, a_constant_attribute_still_bins(), a_flat_middle_falls_back_to_percentiles_instead_of_calling_everything_an_outlier(), a_long_range_coarsens_the_ladder_rather_than_inventing_edges(), a_sample_inside_its_fences_whiskers_to_its_own_extremes(), a_truly_constant_sample_still_has_no_spread_and_no_outliers(), accumulate() (+51 more)

### Community 2 - "Upload Wizard Screens"
Cohesion: 0.05
Nodes (27): isCustomized(), createEventLog(), COLUMN_GRANULARITIES, COLUMN_ROLES, COLUMN_TYPES, ColumnGranularity, ColumnRole, ColumnType (+19 more)

### Community 3 - "Attribute Filter Engine"
Cohesion: 0.06
Nodes (54): AttributeMode, Expr, a_chain_can_empty_the_log(), apply(), attribute_filter_matches_a_boolean_column(), forbidden_drops_matching_cases_whole(), keep_selected_trims_events_and_leaves_partial_cases(), mandatory_keeps_matching_cases_whole() (+46 more)

### Community 4 - "Directed Tree Builder"
Cohesion: 0.14
Nodes (51): Self, a_node_only_one_group_reaches_carries_no_test(), a_prefix_variant_gets_its_own_terminal_node(), a_selected_variant_that_no_longer_exists_is_ignored(), a_selection_larger_than_the_ceiling_is_truncated(), Acc, an_explicit_selection_can_pick_the_rare_variants_alone(), an_unlimited_build_opens_on_the_default_coverage() (+43 more)

### Community 5 - "shadcn-svelte Skill Docs"
Cohesion: 0.05
Nodes (54): shadcn-svelte OpenAI Agent Interface Manifest, add command, apply command, shadcn-svelte CLI Reference, init command, No Invented CLI Flags, Design-System Preset String, Registry Proxy Fetching (+46 more)

### Community 6 - "Event Log Import Commands"
Cohesion: 0.08
Nodes (47): ColumnType, Path, PathBuf, PolarsResult, a_column_already_in_its_declared_type_is_left_alone(), a_column_that_cannot_be_read_as_its_declared_type_fails_the_import(), a_parsed_timestamp_keeps_the_precision_the_csv_reader_gave_it(), cast_to_declared() (+39 more)

### Community 7 - "Endpoint And Follower Filters"
Cohesion: 0.07
Nodes (42): EndpointMode, FollowerMode, apply(), endpoint_filter_reads_a_numeric_activity_column_as_text(), endpoint_matches_the_cases_first_and_last_activity(), DataFrame, LazyFrame, Result (+34 more)

### Community 8 - "Distribution Charts"
Cohesion: 0.07
Nodes (35): BoxStats, CategoryCount, Distribution, DurationShape, ResponseNodeDistributions, Bar, CurveRow, ENCODING_HINT (+27 more)

### Community 9 - "Filter Kind Vocabulary"
Cohesion: 0.08
Nodes (37): ATTRIBUTE_MODE_INFO, ATTRIBUTE_MODES, AttributeFilter, AttributeMode, describeAttribute(), isAttributeComplete(), describeDuration(), DurationFilter (+29 more)

### Community 10 - "Calendar And Date Picker"
Cohesion: 0.08
Nodes (3): WithElementRef, WithoutChild, WithoutChildren

### Community 12 - "Slice State And Chains"
Cohesion: 0.10
Nodes (37): chainImpact(), fetchSharedCases(), baseSlice(), byPosition(), canCreateSlice(), chainKey(), computeStats(), createSlice() (+29 more)

### Community 13 - "Architecture Conventions"
Cohesion: 0.09
Nodes (37): Domain-Oriented Frontend Architecture, Filter Kind Extension Point, CLI-Managed shadcn UI Directory, One Invoker File Per Tauri Command, Deep Imports, No Barrel Files, One-Way Domain Dependency Rule, SPA Mode (no SSR), Thin Routes Convention (+29 more)

### Community 14 - "Package Dependencies"
Cohesion: 0.05
Nodes (36): @dagrejs/dagre, drizzle-orm, dependencies, d3-scale, @dagrejs/dagre, drizzle-orm, tailwindcss, @tauri-apps/api (+28 more)

### Community 15 - "Tree Node Visuals"
Cohesion: 0.11
Nodes (26): TreeNode, Direction, EffectBand, GroupFocus, Secondary, Standing, Visible, effectBand() (+18 more)

### Community 17 - "Distributions Panel State"
Cohesion: 0.11
Nodes (23): nodeDistributions(), charts, key(), loadDistributions(), loaded, Encoding, Scope, show() (+15 more)

### Community 18 - "Filter Editor Controls"
Cohesion: 0.12
Nodes (17): endActivities, endChosen, startChosen, distinctValues(), ENDPOINT_MODE_INFO, ENDPOINT_MODES, ENDPOINT_POSITIONS, EndpointFilter (+9 more)

### Community 19 - "Tree State And Variants"
Cohesion: 0.13
Nodes (26): directedTree(), listVariants(), ResponseVariantRow, build(), clear(), currentKey(), forgetOtherProject(), groupChains() (+18 more)

### Community 20 - "SQLite Schema And Invokers"
Cohesion: 0.13
Nodes (11): projects, slices, treeSettings, ResponseChainStep, ResponseEventLogStats, ResponsePreviewTable, Population, Slice (+3 more)

### Community 21 - "Sidebar Context And Constants"
Cohesion: 0.10
Nodes (11): SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME, SIDEBAR_KEYBOARD_SHORTCUT, SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON, SIDEBAR_WIDTH_MOBILE, Getter, SidebarState (+3 more)

### Community 23 - "Event Log Statistics"
Cohesion: 0.20
Nodes (22): DurationSummary, an_empty_log_yields_zeroed_metrics_rather_than_nan(), duration_summary(), EventLogStats, frontend_mapping(), per_case(), rejects_a_mapping_with_no_case_id(), rejects_a_non_timestamp_timestamp_column() (+14 more)

### Community 24 - "Timeframe And Case Load"
Cohesion: 0.16
Nodes (6): RequestColumnMapping, Project, ResponseDayLoad, ResponseDistinctValues, ResponseDurationBin, Filter

### Community 25 - "Tauri Bundle Config"
Cohesion: 0.09
Nodes (22): icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, app, security, windows (+14 more)

### Community 26 - "Chart Container Primitives"
Cohesion: 0.12
Nodes (8): themeContents, ChartConfig, chartContextKey, ChartContextValue, ExtractSnippetParams, getPayloadConfigFromPayload(), THEMES, TooltipPayload

### Community 27 - "Project Records And Cards"
Cohesion: 0.14
Nodes (11): db, confirmDelete(), createdAt, deleteProjectFiles(), loadProjects(), projects, projectsLoaded, removeProject() (+3 more)

### Community 28 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): ./node_modules/**, ./src/service-worker.d.ts, ./src/service-worker.js, ./src/service-worker.ts, ./.svelte-kit/tsconfig.json, **/*.test.ts, compilerOptions, allowJs (+10 more)

### Community 29 - "Summary Comparison View"
Cohesion: 0.11
Nodes (15): outlierNote(), formatNumber(), allConstant, bars, beyond, boxes, categories, constant (+7 more)

### Community 30 - "shadcn Components Config"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+8 more)

### Community 33 - "Tauri Capability Permissions"
Cohesion: 0.14
Nodes (13): core:default, dialog:default, main, opener:default, sql:allow-execute, sql:allow-load, sql:allow-select, sql:default (+5 more)

### Community 35 - "App Icons And Branding"
Cohesion: 0.15
Nodes (13): shadcn-svelte Brand Mark, shadcn-svelte Brand Mark (Small Raster), App Icon 128x128 (Linux/macOS Bundle Size), App Icon 32x32 (Small Bundle Size), Kiara Desktop App Icon, Multi-Resolution Platform Icon Set, App Icon Square150x150Logo (Windows Store Tile), App Icon StoreLogo (Windows Store Listing) (+5 more)

### Community 37 - "Virtual List"
Cohesion: 0.36
Nodes (4): OVERSCAN, virtualRange, Window, windowRange()

### Community 39 - "Dev Dependencies"
Cohesion: 0.22
Nodes (9): devDependencies, bits-ui, @testing-library/svelte, @testing-library/user-event, tw-animate-css, bits-ui, @testing-library/svelte, @testing-library/user-event (+1 more)

### Community 42 - "Release Pipeline Workflows"
Cohesion: 0.36
Nodes (8): build-tauri Workflow Job, Cross-Platform Build Matrix, release:published Trigger, tauri-apps/tauri-action Bundling Step, bump-and-tag Workflow Job, Draft GitHub Release Creation, stable Branch Release Target, Three-File Version Sync

### Community 45 - "Database Client Bootstrap"
Cohesion: 0.53
Nodes (4): createTableSql(), initDb(), load(), ssr

## Knowledge Gaps
- **222 isolated node(s):** `$schema`, `css`, `baseColor`, `components`, `utils` (+217 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `delta` connect `Package Dependencies` to `Summary Comparison View`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `summarize()` (e.g. with `create_event_log()` and `slice_stats()`) actually correct?**
  _`summarize()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `css`, `baseColor` to the rest of the system?**
  _222 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Column Mapping Vocabulary` be split into smaller, more focused modules?**
  _Cohesion score 0.08295281582952815 - nodes in this community are weakly interconnected._
- **Should `Distribution Binning Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Upload Wizard Screens` be split into smaller, more focused modules?**
  _Cohesion score 0.05144230769230769 - nodes in this community are weakly interconnected._
- **Should `Attribute Filter Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.06019871420222092 - nodes in this community are weakly interconnected._