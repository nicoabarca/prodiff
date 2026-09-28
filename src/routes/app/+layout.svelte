<script lang="ts">
  let { children } = $props();
</script>

<div class="h-screen overflow-hidden">
  <div class="flex h-full min-h-0 flex-col">
    {@render children()}
  </div>
</div>
