<script lang="ts">
  import ViewPlaceholder from "$lib/components/layout/view-placeholder.svelte";
  import Settings from "@lucide/svelte/icons/settings";
</script>

<main class="min-h-0 flex-1 overflow-auto">
  <ViewPlaceholder
    icon={Settings}
    title="Settings"
    description="Preferences for parsing, date formats, and local storage will live here."
  />
</main>
